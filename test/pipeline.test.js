import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeArticle } from '../src/article.js'
import { createJob, readJob, updateJob } from '../src/jobs.js'
import { runPipeline, runRejection } from '../src/pipeline.js'

async function seededJob(root) {
  const job = await createJob(root, { brief: '写一篇 Agent 长文', title: 'Agent' })
  return job
}

const article = { data: { slug: 'agent', title: 'Agent 长文', status: 'draft' }, body: '正文\n' }

test('runPipeline walks stages and lands in review', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-pipeline-'))
  try {
    const job = await seededJob(root)
    const result = await runPipeline({}, {
      root,
      job,
      deps: {
        research: async () => ({ sources: [{ url: 'https://a.example' }] }),
        outline: async () => ({ outline: { title: 'T', sections: [{ heading: 'A' }] } }),
        draft: async () => ({ slug: 'agent', article }),
        gates: async () => ({ passed: true, checks: [] }),
      },
    })
    assert.equal(result.gates.passed, true)

    const saved = await readJob(root, job.id)
    assert.equal(saved.status, 'review')
    assert.equal(saved.stage, 'review')
    assert.equal(saved.slug, 'agent')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runPipeline auto-revises once when gates fail', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-pipeline-'))
  try {
    const job = await seededJob(root)
    let revised = 0
    await runPipeline({}, {
      root,
      job,
      deps: {
        research: async () => ({ sources: [] }),
        outline: async () => ({ outline: { title: 'T', sections: [{ heading: 'A' }] } }),
        draft: async () => ({ slug: 'agent', article }),
        gates: async () => ({ passed: false, checks: [{ id: 'citations', ok: false }] }),
        revise: async () => {
          revised += 1
          return { article, gates: { passed: true, checks: [] } }
        },
      },
    })
    assert.equal(revised, 1)
    assert.equal((await readJob(root, job.id)).status, 'review')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runPipeline marks the job failed on errors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-pipeline-'))
  try {
    const job = await seededJob(root)
    await assert.rejects(
      runPipeline({}, {
        root,
        job,
        deps: {
          research: async () => { throw new Error('search down') },
        },
      }),
      /search down/,
    )
    const saved = await readJob(root, job.id)
    assert.equal(saved.status, 'failed')
    assert.match(saved.error, /search down/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runRejection revises a rejected job back to review', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-pipeline-'))
  try {
    await writeArticle(root, 'agent', { data: article.data, body: article.body })
    let job = await seededJob(root)
    await updateJob(root, job.id, { status: 'running' })
    await updateJob(root, job.id, { status: 'gated' })
    await updateJob(root, job.id, { status: 'review' })
    job = await updateJob(root, job.id, { status: 'rejected', slug: 'agent' })

    const result = await runRejection({}, {
      root,
      job,
      comment: '补充例子',
      deps: {
        revise: async () => ({ article, gates: { passed: true, checks: [] } }),
      },
    })
    assert.equal(result.gates.passed, true)
    assert.equal((await readJob(root, job.id)).status, 'review')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
