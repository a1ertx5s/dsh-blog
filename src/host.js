// dsh-blog host 半片：/blog/* 路由与鉴权。
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createArticle, listArticles, readArticle, writeArticle } from './article.js'
import { budgetStatus } from './budget.js'
import { costReport } from './cost.js'
import { buildSite, loadSite } from './build.js'
import { checkSite } from './check.js'
import { deploySite, readDeployStatus } from './deploy.js'
import { json, readBuffer, readJson, requestPath, requestRejection, sameSite } from './http.js'
import { MAX_IMAGE_BYTES, readImage, saveImage } from './images.js'
import { cancelJob, createJob, listJobs, readJob, recoverJobs, retryJob, updateJob } from './jobs.js'
import { isJobActive, startPipeline, startRejection } from './pipeline.js'
import { readQueue, startQueue } from './queue.js'
import { publishDue, startScheduler } from './schedule.js'
import { createJobsFromTopics, proposeTopics } from './topics.js'
import { exportMarkdown, importMarkdown } from './transfer.js'
import { buildPreview, readPreview } from './preview.js'
import { listVersions, readVersion, restoreVersion } from './versions.js'
import { runProbe, serviceStatus } from './probe.js'
import { renderMarkdown } from './render.js'
import { ensureBlogRoot, inspectBlogRoot, resolveBlogRoot } from './root.js'

export const name = 'dsh-blog'
export const inject = ['webServer', 'connection']

const PREFIX = '/blog'
const VERSION = '1.0.0'
const POST = /^posts\/([^/]+)$/
const PUBLISH = /^posts\/([^/]+)\/publish$/
const EXPORT = /^posts\/([^/]+)\/export$/
const PREVIEW = /^preview\/(pv-[a-z0-9-]+)(\/.*)?$/
const VERSIONS = /^posts\/([^/]+)\/versions(?:\/([^/]+))?(?:\/(restore))?$/

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

  if (method === 'POST' && path === 'preview') {
    const body = await readJson(req).catch(() => ({}))
    return json(res, 200, await buildPreview(root, { slug: body.slug }))
  }

  const previewMatch = PREVIEW.exec(path)
  if (previewMatch && method === 'GET') {
    const file = await readPreview(root, previewMatch[1], previewMatch[2] || '')
    if (!file) return json(res, 404, { error: '预览不存在' })
    res.writeHead(200, { 'content-type': file.type, 'cache-control': 'no-store' })
    return res.end(file.data)
  }

  if (method === 'POST' && path === 'start') {
    const body = await readJson(req)
    const brief = String(body.brief ?? '').trim()
    if (!brief) return json(res, 400, { error: 'brief 不能为空' })
    if (body.mode === 'blank') {
      const article = await createArticle(root, { title: brief.slice(0, 30) })
      return json(res, 201, { article })
    }
    const job = await createJob(root, { brief })
    startPipeline(ctx, { root, job })
    return json(res, 202, { job })
  }

  if (method === 'POST' && path === 'queue/run') {
    const body = await readJson(req).catch(() => ({}))
    const started = startQueue(ctx, { root, ids: body.ids })
    return json(res, started ? 202 : 409, { started })
  }

  if (method === 'GET' && path === 'queue') {
    return json(res, 200, await readQueue(root))
  }

  if (method === 'POST' && path === 'schedule/run') {
    return json(res, 200, await publishDue(ctx, { root }))
  }

  if (method === 'POST' && path === 'topics') {
    const body = await readJson(req).catch(() => ({}))
    return json(res, 200, await proposeTopics(ctx, { root, count: body.count, keywords: body.keywords }))
  }

  if (method === 'POST' && path === 'topics/jobs') {
    const body = await readJson(req).catch(() => ({}))
    return json(res, 201, await createJobsFromTopics(root, body.topics))
  }

  if (method === 'GET' && path === 'cost') {
    return json(res, 200, await costReport(root))
  }

  if (method === 'GET' && path === 'budget') {
    const status = await budgetStatus(root)
    const jobs = await listJobs(root)
    return json(res, 200, {
      ...status,
      jobs: jobs.map((job) => ({ id: job.id, title: job.title, status: job.status, usage: job.usage })),
    })
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
      const site = await loadSite(root)
      let published = false
      let deploy = null
      if (job.slug) {
        const article = await readArticle(root, job.slug)
        if (article) {
          const saved = await writeArticle(root, job.slug, {
            data: { ...article.data, status: site.deploy.autoPush ? 'published' : 'review' },
            body: article.body,
            version: article.version,
          })
          if (site.deploy.autoPush) {
            published = true
            try {
              await buildSite(root)
              deploy = await deploySite(root, {
                build: false,
                paths: ['content', 'docs'],
                message: `publish: ${saved.data.title}`,
              })
            } catch (err) {
              deploy = { ok: false, error: err.message }
            }
          }
        }
      }
      return json(res, 200, { ok: true, published, deploy })
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

  if (method === 'POST' && path === 'deploy') {
    try {
      return json(res, 200, await deploySite(root))
    } catch (err) {
      return json(res, err.status || 500, { error: err.message, result: err.result ?? null })
    }
  }

  if (method === 'GET' && path === 'deploy') {
    return json(res, 200, await readDeployStatus(root))
  }

  if (method === 'POST' && path === 'check') {
    const body = await readJson(req).catch(() => ({}))
    const site = await loadSite(root)
    return json(res, 200, await checkSite(root, site, { live: Boolean(body.live) }))
  }

  const exportMatch = EXPORT.exec(path)
  if (exportMatch && method === 'GET') {
    const slug = decodeURIComponent(exportMatch[1])
    const raw = await exportMarkdown(root, slug)
    res.writeHead(200, {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${encodeURIComponent(slug)}.md"`,
    })
    return res.end(raw)
  }

  if (method === 'POST' && path === 'import') {
    const body = await readJson(req)
    const article = await importMarkdown(root, body.markdown, { filename: body.filename })
    return json(res, 201, { article })
  }

  const versions = VERSIONS.exec(path)
  if (versions) {
    const slug = decodeURIComponent(versions[1])
    const id = versions[2] ? decodeURIComponent(versions[2]) : null
    if (!id && method === 'GET') {
      return json(res, 200, { versions: await listVersions(root, slug) })
    }
    if (id && method === 'GET') {
      const value = await readVersion(root, slug, id)
      return value ? json(res, 200, value) : json(res, 404, { error: '版本不存在' })
    }
    if (id && versions[3] === 'restore' && method === 'POST') {
      const body = await readJson(req).catch(() => ({}))
      const article = await restoreVersion(root, slug, id, { version: body.version })
      return json(res, 200, { article })
    }
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
    const site = await loadSite(root)
    const build = await buildSite(root)
    let deploy = null
    if (site.deploy.autoPush) {
      try {
        deploy = await deploySite(root, {
          build: false,
          paths: ['content', 'docs'],
          message: `publish: ${saved.data.title}`,
        })
      } catch (err) {
        deploy = { ok: false, error: err.message }
      }
    }
    return json(res, 200, { article: saved, build, deploy })
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
    ctx.effect(() => startScheduler(ctx, root))
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
