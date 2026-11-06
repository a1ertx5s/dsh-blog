import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  cancelJob,
  canTransition,
  createJob,
  listJobs,
  readJob,
  recoverJobs,
  retryJob,
  updateJob,
} from '../src/jobs.js'

test('createJob validates the brief and persists the job', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-jobs-'))
  try {
    await assert.rejects(createJob(root, { brief: '  ' }), (err) => err.status === 400)

    const job = await createJob(root, { brief: '写一篇关于 Agent 的长文', title: 'Agent' })
    assert.match(job.id, /^job-[a-f0-9-]{36}$/)
    assert.equal(job.status, 'queued')
    assert.equal(job.stage, 'research')

    const read = await readJob(root, job.id)
    assert.equal(read.brief, '写一篇关于 Agent 的长文')
    assert.equal((await listJobs(root)).length, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('job transitions follow the whitelist', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-jobs-'))
  try {
    const job = await createJob(root, { brief: 'x' })
    await updateJob(root, job.id, { status: 'running' })
    await updateJob(root, job.id, { status: 'gated' })
    await updateJob(root, job.id, { status: 'review' })
    await updateJob(root, job.id, { status: 'approved' })
    const published = await updateJob(root, job.id, { status: 'published' })
    assert.equal(published.status, 'published')
    assert.ok(published.history.length >= 6)

    await assert.rejects(
      updateJob(root, job.id, { status: 'running' }),
      (err) => err.status === 409,
    )
    assert.equal(canTransition('queued', 'published'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('cancel and retry recover from failed states', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-jobs-'))
  try {
    const job = await createJob(root, { brief: 'x' })
    await updateJob(root, job.id, { status: 'running' })
    await updateJob(root, job.id, { status: 'failed', error: 'boom' })

    const retried = await retryJob(root, job.id)
    assert.equal(retried.status, 'queued')
    assert.equal(retried.stage, 'research')
    assert.equal(retried.error, null)

    const cancelled = await cancelJob(root, job.id)
    assert.equal(cancelled.status, 'cancelled')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('recoverJobs marks leftover running jobs as interrupted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-jobs-'))
  try {
    const job = await createJob(root, { brief: 'x' })
    await updateJob(root, job.id, { status: 'running' })

    assert.equal(await recoverJobs(root), 1)
    const read = await readJob(root, job.id)
    assert.equal(read.status, 'failed')
    assert.match(read.error, /中断/)
    assert.equal(await recoverJobs(root), 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
