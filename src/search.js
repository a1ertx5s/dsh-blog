// 让搜索/抓取复用当前 DSH 账号会话：provider 只有在“发起 Session 走 deepseek-account”时才用账号 token。
// 插件路由本身没有 Session，所以这里把调用放进一个活跃的账号 Session 的 initiator 边界里。
function accountAgent(ctx) {
  try {
    const agents = ctx.get('agents')
    if (typeof agents?.list !== 'function' || typeof agents?.withInitiator !== 'function') return null
    return agents.list().find((agent) => {
      try {
        return agent?.session?.requestContext?.()?.provider === 'deepseek-account'
      } catch {
        return false
      }
    }) ?? null
  } catch {
    return null
  }
}

function withAccount(ctx, operation) {
  const agents = ctx.get('agents')
  const agent = accountAgent(ctx)
  if (!agent) return operation()
  try {
    return agents.withInitiator(agent, operation)
  } catch {
    return operation()
  }
}

export function searchWeb(ctx, request, signal) {
  const web = ctx.get('web')
  if (typeof web?.search !== 'function') {
    throw Object.assign(new Error('web 服务不可用'), { code: 'WEB_UNAVAILABLE' })
  }
  return withAccount(ctx, () => web.search(request, signal))
}

export function fetchWeb(ctx, request, signal) {
  const web = ctx.get('web')
  if (typeof web?.fetch !== 'function') {
    throw Object.assign(new Error('web fetch 不可用'), { code: 'WEB_UNAVAILABLE' })
  }
  return withAccount(ctx, () => web.fetch(request, signal))
}
