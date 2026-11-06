// 路由的纯函数部分：便于单测，不依赖 Cordis 上下文。
export function json(res, status, body) {
  if (res.headersSent) {
    res.end()
    return
  }
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

/** 只接受 /blog 与 /blog/...，其余返回 null；URL 规范化顺带挡掉 ../ 穿越。 */
export function requestPath(req, prefix) {
  let url
  try {
    url = new URL(req.url || '/', 'http://local')
  } catch {
    return null
  }
  const path = url.pathname
  if (path !== prefix && !path.startsWith(`${prefix}/`)) return null
  return path.slice(prefix.length).replace(/^\/+/, '')
}

/** 写操作只接受同源请求；没有 sec-fetch-site 的客户端（curl/测试）放行。 */
export function sameSite(req) {
  const site = req.headers['sec-fetch-site']
  return !site || site === 'same-origin' || site === 'none'
}

/** Web 服务不会替插件鉴权，这里统一走 Host 的请求拒绝器；拿不到一律拒绝。 */
export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return 403
  return connection.requestRejection({ headers: req.headers })
}
