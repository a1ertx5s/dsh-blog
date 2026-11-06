// 队列：顺序跑 queued job，并发 1；状态写 .blog/queue.json。
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { listJobs } from './jobs.js'
import { runPipeline } from './pipeline.js'

let active = false

async function save(root, state) {
  await mkdir(join(root, '.blog'), { recursive: true })
  await writeFile(join(root, '.blog', 'queue.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

export async function readQueue(root) {
  try {
    return JSON.parse(await readFile(join(root, '.blog', 'queue.json'), 'utf8'))
  } catch {
    return { running: false, total: 0, current: null, results: [] }
  }
}

async function execute(ctx, { root, ids, deps, call, now = new Date() } = {}) {
  const all = await listJobs(root)
  const wanted = Array.isArray(ids) && ids.length ? new Set(ids) : null
  const targets = all
    .filter((job) => (wanted ? wanted.has(job.id) : true) && (job.status === 'queued' || job.status === 'failed'))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))

  const state = {
    running: true,
    startedAt: now.toISOString(),
    total: targets.length,
    current: null,
    paused: null,
    results: [],
  }
  await save(root, state)

  try {
    for (const job of targets) {
      state.current = { id: job.id, title: job.title || job.brief.slice(0, 40) }
      await save(root, state)
      try {
        await runPipeline(ctx, { root, job, deps, call })
        state.results.push({ id: job.id, ok: true })
      } catch (err) {
        state.results.push({ id: job.id, ok: false, error: err.message, code: err.code })
        if (err.code === 'BUDGET_EXCEEDED') {
          state.paused = 'budget'
          break
        }
      }
      await save(root, state)
    }
    return state
  } finally {
    state.running = false
    state.current = null
    state.finishedAt = new Date().toISOString()
    await save(root, state)
  }
}

export async function runQueue(ctx, options) {
  if (active) throw Object.assign(new Error('队列已在运行'), { status: 409, code: 'QUEUE_BUSY' })
  active = true
  try {
    return await execute(ctx, options)
  } finally {
    active = false
  }
}

export function startQueue(ctx, options) {
  if (active) return false
  active = true
  execute(ctx, options)
    .catch(() => {})
    .finally(() => { active = false })
  return true
}
