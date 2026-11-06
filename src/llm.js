// 统一的模型调用层：选 DSH 当前模型、带 sessionId、流式、超时、一次重试、usage。
import { randomUUID } from 'node:crypto'

const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_MAX_TOKENS = 2048

export class LlmCallError extends Error {
  constructor(message, { code = 'LLM_ERROR', status, details, cause } = {}) {
    super(message, cause ? { cause } : undefined)
    this.name = 'LlmCallError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export function modelInfo(ctx) {
  try {
    const selection = ctx.get('agentDefaultModel')?.currentSelection()
    const llm = ctx.get('llm')
    if (!llm || !selection?.provider || !selection?.model) return null
    return { provider: selection.provider, model: selection.model, label: selection.model }
  } catch {
    return null
  }
}

export function serviceStatus(ctx) {
  const model = modelInfo(ctx)
  const web = ctx.get('web')
  return {
    model: model ? { provider: model.provider, model: model.model } : null,
    llm: typeof ctx.get('llm')?.prepareCall === 'function',
    web: Boolean(web && typeof web.search === 'function' && typeof web.fetch === 'function'),
  }
}

export function normalizeUsage(usage) {
  if (!usage) return { input: 0, output: 0 }
  return {
    input: Number(usage.inputTokens) || 0,
    output: Number(usage.outputTokens) || 0,
  }
}

function isRetryable(err) {
  if (!err || err.code === 'TIMEOUT' || err.code === 'EMPTY_RESPONSE' || err.code === 'ABORTED') return false
  if (err.status === 429) return true
  if (typeof err.status === 'number' && err.status >= 500 && err.status < 600) return true
  return /ECONNRESET|ETIMEDOUT|fetch failed|socket hang up|network/i.test(String(err.message || ''))
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new LlmCallError('已取消', { code: 'ABORTED' }))
    }
    if (signal?.aborted) return onAbort()
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function callModel(ctx, {
  sessionId = randomUUID(),
  system,
  user,
  maxTokens = DEFAULT_MAX_TOKENS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = 1,
  retryDelayMs = 800,
  signal: externalSignal,
  onText,
} = {}) {
  const prompt = typeof user === 'string' ? user.trim() : ''
  if (!prompt) throw new LlmCallError('prompt 不能为空', { code: 'BAD_PROMPT' })

  const info = modelInfo(ctx)
  if (!info) throw new LlmCallError('当前没有可用模型', { code: 'NO_MODEL' })
  const llm = ctx.get('llm')
  if (typeof llm?.prepareCall !== 'function') throw new LlmCallError('llm 服务不可用', { code: 'NO_LLM' })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const signal = externalSignal ? AbortSignal.any([externalSignal, controller.signal]) : controller.signal

  const attempt = async () => {
    const call = await llm.prepareCall(
      { provider: info.provider, model: info.model, maxTokens },
      signal,
      (controls, model) => {
        const effort = model?.reasoning?.efforts?.[0]?.id
        return effort === undefined ? controls : { ...controls, reasoningEffort: effort }
      },
    )

    let output = ''
    let finish = null
    let usage = null
    const chunks = new Set()

    for await (const chunk of call.stream({
      ...call.config,
      sessionId,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }], source: { kind: 'dsh-blog' } }],
      signal,
    })) {
      chunks.add(chunk.type)
      if (chunk.type === 'text-delta') {
        output += chunk.text
        onText?.(chunk.text)
      } else if (chunk.type === 'block-end' && chunk.block?.type === 'text' && !output) {
        output = chunk.block.text
      } else if (chunk.type === 'usage') {
        usage = chunk.usage
      } else if (chunk.type === 'finish') {
        finish = chunk.reason ?? null
        if (finish && ['error', 'aborted'].includes(finish.kind)) {
          throw new LlmCallError(finish.failure?.message || '模型调用失败', {
            code: finish.kind === 'aborted' ? 'ABORTED' : 'PROVIDER_ERROR',
            status: finish.failure?.status,
            details: { finish, usage, chunks: [...chunks] },
          })
        }
      }
    }

    if (!output.trim()) {
      throw new LlmCallError(`模型返回空文本（finish: ${finish?.kind ?? 'unknown'}）`, {
        code: 'EMPTY_RESPONSE',
        details: { finish, usage, chunks: [...chunks] },
      })
    }

    return {
      text: output,
      finish: finish?.kind ?? null,
      usage: normalizeUsage(usage),
      provider: info.provider,
      model: info.label,
      sessionId,
    }
  }

  try {
    for (let index = 0; ; index += 1) {
      try {
        return await attempt()
      } catch (err) {
        if (signal.aborted) {
          const timedOut = controller.signal.aborted
          throw new LlmCallError(timedOut ? '模型调用超时' : '已取消', {
            code: timedOut ? 'TIMEOUT' : 'ABORTED',
          })
        }
        if (index >= retries || !isRetryable(err)) throw err
        await delay(retryDelayMs * (index + 1), signal)
      }
    }
  } finally {
    clearTimeout(timer)
  }
}
