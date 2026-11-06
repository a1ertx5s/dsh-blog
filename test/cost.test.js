import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addUsage } from '../src/budget.js'
import { costReport } from '../src/cost.js'
import { createJob } from '../src/jobs.js'

test('costReport aggregates tokens per job', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-cost-'))
  try {
    const a = await createJob(root, { brief: 'A', title: 'A' })
    const b = await createJob(root, { brief: 'B', title: 'B' })
    await addUsage(root, a.id, { input: 10, output: 20 })
    await addUsage(root, b.id, { input: 1, output: 2 })
    const report = await costReport(root)
    assert.equal(report.total, 33)
    assert.equal(report.jobs[0].id, a.id)
    assert.equal(report.jobs[0].tokens, 30)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
