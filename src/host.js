// dsh-blog host 半片：/blog/* 路由与鉴权。
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createArticle, listArticles, readArticle, writeArticle } from './article.js'
import { buildSite } from './build.js'
import { json, readBuffer, readJson, requestPath, requestRejection, sameSite } from './http.js'
import { MAX_IMAGE_BYTES, readImage, saveImage } from './images.js'
import { cancelJob, createJob, listJobs, readJob, recoverJobs, retryJob, updateJob } from './jobs.js'
import { isJobActive, startPipeline, startRejection } from './pipeline.js'
import { runProbe, serviceStatus } from './probe.js'
import { renderMarkdown } from './render.js'
import { ensureBlogRoot, inspectBlogRoot, resolveBlogRoot } from './root.js'

export const name = 'dsh-blog'
export const inject = ['webServer', 'connection']

const PREFIX = '/blog'
const VERSION = '0.1.0'
const POST = /^posts\/([^/]+)$/
const PUBLISH = /^posts\/([^/]+)\/publish$/

async function readRunFile(root, id, name) {
  try {
    return JSON.parse(await readFile(join(root, '.blog', 'runs', id, name), 'utf8'))
  } catch {
    return null
  }
}

async function readBuild(root) {
  try {
    return JSON.parse(await readFile(join(root, '.blog', 'build.json'), 'utf8'))
  } catch {
    return null
  }
}

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
      stage: 'M3-1',
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
    if (method === 'GET') {
      const jobs = await listJobs(root)
      return json(res, 200, { jobs: jobs.map((job) => ({ ...job, running: isJobActive(job.id) })) })
    }
    if (method === 'POST') return json(res, 201, await createJob(root, await readJson(req)))
  }

  const JOB = /^jobs\/([^/]+)(?:\/(cancel|retry|run|approve|reject|artifacts))?$/.exec(path)
  if (JOB) {
    const id = JOB[1]
    if (JOB[2] === 'cancel' && method === 'POST') return json(res, 200, await cancelJob(root, id))
    if (JOB[2] === 'retry' && method === 'POST') return json(res, 200, await retryJob(root, id))
    if (!JOB[2] && method === 'GET') {
      const job = await readJob(root, id)
      return job ? json(res, 200, { ...job, running: isJobActive(job.id) }) : json(res, 404, { error: 'job 不存在' })
    }

    if (JOB[2] === 'run' && method === 'POST') {
      const job = await readJob(root, id)
      if (!job) return json(res, 404, { error: 'job 不存在' })
      if (job.status !== 'queued' && job.status !== 'failed') {
        return json(res, 409, { error: `当前状态不能运行：${job.status}` })
      }
      const started = startPipeline(ctx, { root, job })
      return json(res, started ? 202 : 409, { started })
    }

    if (JOB[2] === 'approve' && method === 'POST') {
      const job = await readJob(root, id)
      if (!job) return json(res, 404, { error: 'job 不存在' })
      if (job.status !== 'review') return json(res, 409, { error: '只有待审的 job 能通过' })
      await updateJob(root, id, { status: 'approved', stage: 'review', note: 'approved' })
      if (job.slug) {
        const article = await readArticle(root, job.slug)
        if (article) {
          await writeArticle(root, job.slug, {
            data: { ...article.data, status: 'review' },
            body: article.body,
            version: article.version,
          })
        }
      }
      return json(res, 200, { ok: true })
    }

    if (JOB[2] === 'reject' && method === 'POST') {
      const body = await readJson(req)
      const comment = String(body.comment ?? '').trim()
      if (!comment) return json(res, 400, { error: '打回意见不能为空' })
      const job = await readJob(root, id)
      if (!job) return json(res, 404, { error: 'job 不存在' })
      if (job.status !== 'review') return json(res, 409, { error: '只有待审的 job 能打回' })
      await updateJob(root, id, { status: 'rejected', stage: 'review', note: 'rejected' })
      const started = startRejection(ctx, { root, job: { ...job, status: 'rejected' }, comment })
      return json(res, started ? 202 : 409, { started })
    }

    if (JOB[2] === 'artifacts' && method === 'GET') {
      const [sources, outline, gates] = await Promise.all([
        readRunFile(root, id, 'sources.json'),
        readRunFile(root, id, 'outline.json'),
        readRunFile(root, id, 'gates.json'),
      ])
      return json(res, 200, { sources, outline, gates })
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

  if (method === 'POST' && path === 'build') {
    return json(res, 200, await buildSite(root))
  }

  if (method === 'GET' && path === 'build') {
    return json(res, 200, await readBuild(root))
  }

  const publish = PUBLISH.exec(path)
  if (publish && method === 'POST') {
    let slug
    try {
      slug = decodeURIComponent(publish[1])
    } catch {
      return json(res, 400, { error: 'slug 无效' })
    }
    const article = await readArticle(root, slug)
    if (!article) return json(res, 404, { error: '文章不存在' })
    const saved = await writeArticle(root, slug, {
      data: { ...article.data, status: 'published' },
      body: article.body,
      version: article.version,
    })
    const build = await buildSite(root)
    return json(res, 200, { article: saved, build })
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
