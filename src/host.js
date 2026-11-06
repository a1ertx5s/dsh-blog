// dsh-blog host 半片：/blog/* 路由与鉴权。
import { json, requestPath, requestRejection, sameSite } from './http.js'

export const name = 'dsh-blog'
export const inject = ['webServer', 'connection']

const PREFIX = '/blog'
const VERSION = '0.1.0'

async function handle(ctx, req, res) {
  const rejection = requestRejection(ctx, req)
  if (rejection) return json(res, rejection, { error: '未授权' })
  if (!sameSite(req)) return json(res, 403, { error: '拒绝跨站请求' })

  const path = requestPath(req, PREFIX)
  if (path === null) return json(res, 404, { error: '接口不存在' })

  if (req.method === 'GET' && path === 'state') {
    return json(res, 200, { ok: true, plugin: name, version: VERSION, stage: 'M0-4' })
  }

  return json(res, 404, { error: '接口不存在' })
}

export default {
  inject,
  apply(ctx) {
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: PREFIX,
      handler: async (req, res) => {
        try {
          await handle(ctx, req, res)
        } catch (err) {
          if (res.headersSent) return res.end()
          json(res, 500, { error: err?.message || '服务器错误' })
        }
      },
    }), 'dsh-blog: /blog routes')
  },
}
