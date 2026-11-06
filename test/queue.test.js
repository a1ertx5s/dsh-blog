import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJob, readJob } from '../src/jobs.js'
import { readQueue, runQueue } from '../src/queue.js'

const article = { data: { slug: 'a', title: 'A', status: 'draft' }, body: '正文\n' }

function deps(overrides = {}) {
  return {
    research: async (ctx, { job }) => {
      if (job.brief.includes('bad')) throw new Error('search down')
      return { sources: [] }
    },
    outline: async () => ({ outline: { title: 'T', sections: [{ heading: 'A' }] } }),
    draft: async () => ({ slug: 'a', article }),
    gates: async () => ({ passed: true, checks: [] }),
    ...overrides,
  }
}

test('runQueue runs queued jobs in order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-queue-'))
  try {
    const a = await createJob(root, { brief: '第一篇' })
    const b = await createJob(root, { brief: '第二篇' })
    const state = await runQueue({}, { root, deps: deps() })
    assert.equal(state.total, 2)
    assert.deepEqual(state.results.map((row) => row.ok), [true, true])
    assert.equal((await readJob(root, a.id)).status, 'review')
    assert.equal((await readJob(root, b.id)).status, 'review')

    const saved = await readQueue(root)
    assert.equal(saved.running, false)
    assert.equal(saved.results.length, 2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runQueue keeps going after one failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-queue-'))
  try {
    const bad = await createJob(root, { brief: 'bad one' })
    const good = await createJob(root, { brief: 'good one' })
    const state = await runQueue({}, { root, deps: deps() })
    const results = new Map(state.results.map((row) => [row.id, row.ok]))
    assert.equal(results.get(bad.id), false)
    assert.equal(results.get(good.id), true)
    assert.equal((await readJob(root, bad.id)).status, 'failed')
    assert.equal((await readJob(root, good.id)).status, 'review')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runQueue honors an explicit id list', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-queue-'))
  try {
    const a = await createJob(root, { brief: 'A' })
    const b = await createJob(root, { brief: 'B' })
    const state = await runQueue({}, { root, ids: [b.id], deps: deps() })
    assert.equal(state.total, 1)
    assert.equal((await readJob(root, a.id)).status, 'queued')
    assert.equal((await readJob(root, b.id)).status, 'review')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
