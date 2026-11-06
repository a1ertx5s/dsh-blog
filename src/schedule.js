// 定时发布：到点的 approved job 自动置为 published 并构建；启动时补跑一次。
import { readArticle, writeArticle } from './article.js'
import { buildSite, loadSite } from './build.js'
import { deploySite } from './deploy.js'
import { listJobs, updateJob } from './jobs.js'

export async function publishDue(ctx, { root, now = new Date() } = {}) {
  const jobs = await listJobs(root)
  const due = jobs.filter((job) => (
    job.status === 'approved'
    && job.slug
    && job.publishAt
    && new Date(job.publishAt).getTime() <= now.getTime()
  ))

  const results = []
  for (const job of due) {
    try {
      const article = await readArticle(root, job.slug)
      if (!article) {
        results.push({ id: job.id, ok: false, error: '文章不存在' })
        continue
      }
      const saved = await writeArticle(root, job.slug, {
        data: { ...article.data, status: 'published' },
        body: article.body,
        version: article.version,
      })
      const build = await buildSite(root)
      const site = await loadSite(root)
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
      await updateJob(root, job.id, {
        status: 'published',
        stage: 'publish',
        error: null,
        note: 'scheduled',
        publishedAt: now.toISOString(),
      })
      results.push({ id: job.id, ok: true, slug: job.slug, build, deploy })
    } catch (err) {
      results.push({ id: job.id, ok: false, error: err.message })
    }
  }

  return { checked: jobs.length, due: due.length, published: results.filter((row) => row.ok).length, results }
}

export function startScheduler(ctx, root, { intervalMs = 60000 } = {}) {
  let stopped = false
  let busy = false

  const tick = async () => {
    if (stopped || busy) return
    busy = true
    try {
      await publishDue(ctx, { root })
    } catch {
      // 定时任务失败不打断 Host
    } finally {
      busy = false
    }
  }

  tick()
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()

  return () => {
    stopped = true
    clearInterval(timer)
  }
}
