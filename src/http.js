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

/** 读原始二进制请求体，带大小上限。 */
export async function readBuffer(req, limit = 10 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw Object.assign(new Error('请求体太大'), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/** 读 JSON 请求体，带大小上限；错误带 status，交给路由统一返回。 */
export async function readJson(req, limit = 1_000_000) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw Object.assign(new Error('请求体太大'), { status: 413 })
    chunks.push(chunk)
  }
  if (!size) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('请求不是有效的 JSON'), { status: 400 })
  }
}
