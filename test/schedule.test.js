import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeArticle } from '../src/article.js'
import { createJob, readJob, updateJob } from '../src/jobs.js'
import { publishDue } from '../src/schedule.js'

async function seed(root, publishAt) {
  await mkdir(join(root, 'content', 'posts'), { recursive: true })
  await writeFile(join(root, 'site.json'), JSON.stringify({
    title: '测试站', url: 'https://example.com', basePath: '/repo/', deploy: { dir: 'docs' },
  }))
  await writeArticle(root, 'scheduled', {
    data: {
      title: '定时文章',
      slug: 'scheduled',
      date: '2026-01-01',
      status: 'review',
      description: '摘要',
    },
    body: '正文。\n',
  })
  let job = await createJob(root, { brief: '定时', title: '定时文章', slug: 'scheduled', publishAt })
  await updateJob(root, job.id, { status: 'running' })
  await updateJob(root, job.id, { status: 'gated' })
  await updateJob(root, job.id, { status: 'review' })
  job = await updateJob(root, job.id, { status: 'approved' })
  return job
}

test('publishDue publishes approved jobs at their time', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-schedule-'))
  try {
    const job = await seed(root, '2026-01-01T00:00:00Z')
    const result = await publishDue({}, { root, now: new Date('2026-06-01T00:00:00Z') })
    assert.equal(result.published, 1)

    const saved = await readJob(root, job.id)
    assert.equal(saved.status, 'published')
    assert.equal(saved.publishedAt, '2026-06-01T00:00:00.000Z')

    const article = await readFile(join(root, 'content', 'posts', 'scheduled.md'), 'utf8')
    assert.match(article, /status: published/)
    const index = await readFile(join(root, 'docs', 'index.html'), 'utf8')
    assert.match(index, /定时文章/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('publishDue leaves future jobs alone', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-schedule-'))
  try {
    const job = await seed(root, '2026-12-01T00:00:00Z')
    const result = await publishDue({}, { root, now: new Date('2026-06-01T00:00:00Z') })
    assert.equal(result.due, 0)
    assert.equal((await readJob(root, job.id)).status, 'approved')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('createJob validates publishAt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-schedule-'))
  try {
    await assert.rejects(createJob(root, { brief: 'x', publishAt: 'not-a-date' }), /publishAt/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
