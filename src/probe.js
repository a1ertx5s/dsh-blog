// 服务探针：确认宿主当前版本里模型与联网能力是否真的可用。
// 只读诊断，不写任何状态；失败返回 ok:false 而不是抛出。
import { randomUUID } from 'node:crypto'

const MODEL_TIMEOUT_MS = 30_000
const WEB_TIMEOUT_MS = 20_000
const WEB_HINT = 'Web 访问由 DSH 的 web search provider 提供；请到 设置 → 内置插件 → Web search 检查密钥与端点。'

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

export async function probeModel(ctx) {
  const info = modelInfo(ctx)
  if (!info) return { ok: false, error: '当前没有可用模型' }
  const llm = ctx.get('llm')
  if (typeof llm?.prepareCall !== 'function') return { ok: false, error: 'llm 服务不可用' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS)
  // 部分 provider 会把 sessionId 映射成路由头（例如 x-opencode-session）；
  // 没有它，即使是探针也会被拒。
  const sessionId = randomUUID()
  try {
    const call = await llm.prepareCall(
      { provider: info.provider, model: info.model, maxTokens: 16 },
      controller.signal,
      (controls) => controls,
    )
    let text = ''
    for await (const chunk of call.stream({
      ...call.config,
      sessionId,
      messages: [{ role: 'user', content: [{ type: 'text', text: '只回复 OK' }], source: { kind: 'dsh-blog-probe' } }],
      signal: controller.signal,
    })) {
      if (chunk.type === 'text-delta') text += chunk.text
      else if (chunk.type === 'finish' && ['error', 'aborted'].includes(chunk.reason?.kind)) {
        throw new Error(chunk.reason?.failure?.message || '模型调用失败')
      }
    }
    return { ok: true, model: info.label, text: text.trim().slice(0, 40) || '(空)' }
  } catch (err) {
    return { ok: false, error: err?.message || '模型调用失败' }
  } finally {
    clearTimeout(timer)
  }
}

export async function probeWeb(ctx, query = 'DeepSeek Harness') {
  const web = ctx.get('web')
  if (typeof web?.search !== 'function') return { ok: false, error: 'web 服务不可用' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WEB_TIMEOUT_MS)
  try {
    const result = await web.search({ query, maxResults: 3 }, controller.signal)
    const sources = Array.isArray(result?.sources) ? result.sources : []
    return {
      ok: true,
      count: sources.length,
      sample: sources.slice(0, 3).map((source) => ({
        title: source.title ?? '',
        url: source.url,
      })),
    }
  } catch (err) {
    return { ok: false, error: err?.message || '搜索失败', hint: WEB_HINT }
  } finally {
    clearTimeout(timer)
  }
}

export async function runProbe(ctx) {
  const [model, web] = await Promise.all([probeModel(ctx), probeWeb(ctx)])
  return { services: serviceStatus(ctx), model, web }
}
