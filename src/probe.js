// 服务探针：确认宿主当前版本里模型与联网能力是否真的可用。
// 只读诊断，不写任何状态；失败返回 ok:false 而不是抛出。
import { callModel, modelInfo, serviceStatus } from './llm.js'
import { searchWeb } from './search.js'

export { modelInfo, serviceStatus }

const MODEL_TIMEOUT_MS = 30_000
const WEB_TIMEOUT_MS = 20_000
const WEB_HINT = 'Web 访问由 DSH 的 web search provider 提供；请到 设置 → 内置插件 → Web search 检查密钥与端点。'

export async function probeModel(ctx) {
  try {
    const result = await callModel(ctx, {
      user: '只回复 OK',
      maxTokens: 256,
      timeoutMs: MODEL_TIMEOUT_MS,
    })
    return {
      ok: true,
      provider: result.provider,
      model: result.model,
      text: result.text.trim().slice(0, 40),
      finish: result.finish,
      usage: result.usage,
    }
  } catch (err) {
    const info = modelInfo(ctx)
    return {
      ok: false,
      error: err?.message || '模型调用失败',
      code: err?.code,
      provider: info?.provider,
      model: info?.label,
      details: err?.details,
    }
  }
}

export async function probeWeb(ctx, query = 'DeepSeek Harness') {
  const web = ctx.get('web')
  if (typeof web?.search !== 'function') return { ok: false, error: 'web 服务不可用' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WEB_TIMEOUT_MS)
  try {
    const result = await searchWeb(ctx, { query, maxResults: 3 }, controller.signal)
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
