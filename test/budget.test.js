import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addUsage, budgetStatus, monthlyUsage, usageTotal } from '../src/budget.js'
import { createJob } from '../src/jobs.js'

async function rootWith(budget) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-budget-'))
  await writeFile(join(root, 'site.json'), JSON.stringify({ title: 'T', deploy: { dir: 'docs' }, budget }))
  return root
}

test('usageTotal and addUsage accumulate tokens', async () => {
  const root = await rootWith({ perArticleTokens: 100 })
  try {
    const job = await createJob(root, { brief: 'x' })
    assert.equal(usageTotal({ input: 2, output: 3 }), 5)
    await addUsage(root, job.id, { input: 2, output: 3 })
    await addUsage(root, job.id, { input: 1, output: 4 })
    const month = await monthlyUsage(root)
    assert.equal(month, 10)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('budgetStatus enforces per-article and monthly limits', async () => {
  const root = await rootWith({ perArticleTokens: 10, monthlyTokens: 20 })
  try {
    const a = await createJob(root, { brief: 'a' })
    const b = await createJob(root, { brief: 'b' })
    await addUsage(root, a.id, { input: 6, output: 6 })
    const perArticle = await budgetStatus(root, { job: { usage: { input: 6, output: 6 } } })
    assert.equal(perArticle.ok, false)
    assert.equal(perArticle.scope, 'article')

    await addUsage(root, b.id, { input: 5, output: 5 })
    const month = await budgetStatus(root)
    assert.equal(month.ok, false)
    assert.equal(month.scope, 'month')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
