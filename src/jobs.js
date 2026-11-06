// Job：一篇稿子的生产任务，状态机 + 原子持久化。
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const JOB_STATUSES = [
  'queued', 'running', 'gated', 'review',
  'approved', 'rejected', 'published', 'failed', 'cancelled',
]

export const JOB_STAGES = ['research', 'outline', 'draft', 'gates', 'revise', 'publish']

const TRANSITIONS = {
  queued: ['running', 'cancelled'],
  running: ['gated', 'failed', 'cancelled'],
  gated: ['review', 'failed', 'cancelled'],
  review: ['approved', 'rejected', 'cancelled'],
  rejected: ['running', 'cancelled'],
  approved: ['published', 'failed'],
  failed: ['queued', 'running', 'cancelled'],
  published: [],
  cancelled: [],
}

const ID = /^job-[a-f0-9-]{36}$/

export function isJobId(id) {
  return typeof id === 'string' && ID.test(id)
}

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to))
}

export function jobsDir(root) {
  return join(root, '.blog', 'jobs')
}

function jobPath(root, id) {
  return join(jobsDir(root), `${id}.json`)
}

export async function writeJob(root, job) {
  const dir = jobsDir(root)
  await mkdir(dir, { recursive: true })
  const file = jobPath(root, job.id)
  const tmp = join(dir, `.${job.id}.${process.pid}.${Date.now()}.tmp`)
  await writeFile(tmp, `${JSON.stringify(job, null, 2)}\n`, 'utf8')
  await rename(tmp, file)
  return job
}

export async function readJob(root, id) {
  if (!isJobId(id)) return null
  try {
    return JSON.parse(await readFile(jobPath(root, id), 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

export async function listJobs(root) {
  const dir = jobsDir(root)
  let names
  try {
    names = await readdir(dir)
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
  const jobs = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    try {
      jobs.push(JSON.parse(await readFile(join(dir, name), 'utf8')))
    } catch {
      // 坏文件跳过，不影响其它任务。
    }
  }
  return jobs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
}

export async function createJob(root, { brief, title = '', slug = '' } = {}) {
  const text = typeof brief === 'string' ? brief.trim() : ''
  if (!text) throw Object.assign(new Error('brief 不能为空'), { status: 400 })
  const at = new Date().toISOString()
  const job = {
    id: `job-${randomUUID()}`,
    brief: text,
    title: typeof title === 'string' ? title.trim() : '',
    slug: typeof slug === 'string' ? slug.trim() : '',
    status: 'queued',
    stage: 'research',
    attempts: {},
    usage: { input: 0, output: 0 },
    error: null,
    createdAt: at,
    updatedAt: at,
    history: [{ at, status: 'queued', stage: 'research', note: null }],
  }
  return writeJob(root, job)
}

export async function updateJob(root, id, patch = {}) {
  const current = await readJob(root, id)
  if (!current) throw Object.assign(new Error('job 不存在'), { status: 404 })

  if (patch.status && !JOB_STATUSES.includes(patch.status)) {
    throw Object.assign(new Error('状态无效'), { status: 400 })
  }
  if (patch.status && patch.status !== current.status && !canTransition(current.status, patch.status)) {
    throw Object.assign(new Error(`不能从 ${current.status} 转到 ${patch.status}`), { status: 409 })
  }
  if (patch.stage && !JOB_STAGES.includes(patch.stage)) {
    throw Object.assign(new Error('阶段无效'), { status: 400 })
  }

  const at = new Date().toISOString()
  const next = { ...current, ...patch, updatedAt: at }
  delete next.note

  if (next.status !== current.status || next.stage !== current.stage || patch.note) {
    next.history = [...(current.history || []), {
      at,
      status: next.status,
      stage: next.stage,
      note: patch.note ?? null,
    }]
  }

  return writeJob(root, next)
}

export async function cancelJob(root, id) {
  return updateJob(root, id, { status: 'cancelled', error: null, note: 'cancelled' })
}

export async function retryJob(root, id) {
  return updateJob(root, id, {
    status: 'queued',
    stage: 'research',
    error: null,
    note: 'retry',
  })
}

/** Host 重启后，残留的 running 不可能还在跑；标成中断，允许重试。 */
export async function recoverJobs(root) {
  const jobs = await listJobs(root)
  let count = 0
  for (const job of jobs) {
    if (job.status !== 'running') continue
    await updateJob(root, job.id, {
      status: 'failed',
      error: '上次运行被中断，可以重试',
      note: 'recover',
    })
    count += 1
  }
  return count
}
