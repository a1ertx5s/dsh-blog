// 客户端唯一的 Host 请求入口。
export async function api(path, { method = 'GET', body, raw = false } = {}) {
  const init = { method, headers: { accept: 'application/json' } }
  if (body !== undefined) {
    if (raw) {
      init.body = body
      init.headers['content-type'] = body.type || 'application/octet-stream'
    } else {
      init.body = JSON.stringify(body)
      init.headers['content-type'] = 'application/json'
    }
  }

  const res = await fetch(`/blog${path}`, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(data.error || `请求失败 (${res.status})`)
    error.status = res.status
    error.data = data
    throw error
  }
  return data
}
