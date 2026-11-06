// dsh-blog host 半片：/blog/* 路由与鉴权。
import { createArticle, listArticles, readArticle, writeArticle } from './article.js'
import { json, readBuffer, readJson, requestPath, requestRejection, sameSite } from './http.js'
import { MAX_IMAGE_BYTES, readImage, saveImage } from './images.js'
import { cancelJob, createJob, listJobs, readJob, recoverJobs, retryJob } from './jobs.js'
import { runProbe, serviceStatus } from './probe.js'
import { renderMarkdown } from './render.js'
import { ensureBlogRoot, inspectBlogRoot, resolveBlogRoot } from './root.js'

export const name = 'dsh-blog'
export const inject = ['webServer', 'connection']

const PREFIX = '/blog'
const VERSION = '0.1.0'
const POST = /^posts\/([^/]+)$/

async function handle(ctx, req, res, root) {
  const rejection = requestRejection(ctx, req)
  if (rejection) return json(res, rejection, { error: '未授权' })
  if (!sameSite(req)) return json(res, 403, { error: '拒绝跨站请求' })

  const path = requestPath(req, PREFIX)
  if (path === null) return json(res, 404, { error: '接口不存在' })
  const method = req.method || 'GET'

  if (method === 'GET' && path === 'state') {
    return json(res, 200, {
      ok: true,
      plugin: name,
      version: VERSION,
      stage: 'M2-5',
      services: serviceStatus(ctx),
    })
  }

  if (method === 'GET' && path === 'root') return json(res, 200, await inspectBlogRoot(root))
  if (method === 'POST' && path === 'root/init') return json(res, 200, await ensureBlogRoot(root))
  if (method === 'POST' && path === 'probe') return json(res, 200, await runProbe(ctx))

  if (method === 'POST' && path === 'render') {
    const { markdown } = await readJson(req)
    return json(res, 200, { html: renderMarkdown(markdown) })
  }

  if (method === 'POST' && path === 'upload') {
    const buffer = await readBuffer(req, MAX_IMAGE_BYTES)
    return json(res, 201, await saveImage(root, buffer))
  }

  if (path === 'jobs') {
    if (method === 'GET') return json(res, 200, { jobs: await listJobs(root) })
    if (method === 'POST') return json(res, 201, await createJob(root, await readJson(req)))
  }

  const JOB = /^jobs\/([^/]+)(?:\/(cancel|retry))?$/.exec(path)
  if (JOB) {
    const id = JOB[1]
    if (JOB[2] === 'cancel' && method === 'POST') return json(res, 200, await cancelJob(root, id))
    if (JOB[2] === 'retry' && method === 'POST') return json(res, 200, await retryJob(root, id))
    if (!JOB[2] && method === 'GET') {
      const job = await readJob(root, id)
      return job ? json(res, 200, job) : json(res, 404, { error: 'job 不存在' })
    }
  }

  const IMAGE = /^images\/([^/]+)$/.exec(path)
  if (method === 'GET' && IMAGE) {
    let name
    try {
      name = decodeURIComponent(IMAGE[1])
    } catch {
      return json(res, 400, { error: '图片名无效' })
    }
    const found = await readImage(root, name)
    if (!found) return json(res, 404, { error: '图片不存在' })
    res.statusCode = 200
    res.setHeader('content-type', found.mime)
    res.setHeader('cache-control', 'private, max-age=31536000, immutable')
    res.end(found.buffer)
    return
  }

  if (path === 'posts') {
    if (method === 'GET') return json(res, 200, { posts: await listArticles(root) })
    if (method === 'POST') return json(res, 201, await createArticle(root, await readJson(req)))
  }

  const match = POST.exec(path)
  if (match) {
    let slug
    try {
      slug = decodeURIComponent(match[1])
    } catch {
      return json(res, 400, { error: 'slug 无效' })
    }

    if (method === 'GET') {
      const article = await readArticle(root, slug)
      return article ? json(res, 200, article) : json(res, 404, { error: '文章不存在' })
    }

    if (method === 'PUT') return json(res, 200, await writeArticle(root, slug, await readJson(req)))
  }

  return json(res, 404, { error: '接口不存在' })
}

export default {
  inject,
  apply(ctx) {
    const root = resolveBlogRoot()
    recoverJobs(root).catch(() => {})
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: PREFIX,
      handler: async (req, res) => {
        try {
          await handle(ctx, req, res, root)
        } catch (err) {
          if (res.headersSent) return res.end()
          json(res, err?.status || 500, {
            error: err?.message || '服务器错误',
            ...(err?.version ? { version: err.version } : {}),
          })
        }
      },
    }), 'dsh-blog: /blog routes')
  },
}
