import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeArticle } from '../src/article.js'
import { createJobsFromTopics, proposeTopics } from '../src/topics.js'

test('proposeTopics drops titles that already exist', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-topics-'))
  try {
    await writeArticle(root, 'existing', {
      data: { title: '已有选题', slug: 'existing', status: 'published', description: '' },
      body: 'x',
    })
    const call = async () => ({
      text: JSON.stringify({
        topics: [
          { title: '已有选题', angle: '重复' },
          { title: '新选题一', angle: '角度一', reason: '理由', keywords: ['a'] },
          { title: '新选题二' },
        ],
      }),
    })
    const { topics } = await proposeTopics({}, { root, count: 5, call })
    assert.equal(topics.length, 2)
    assert.deepEqual(topics.map((topic) => topic.title), ['新选题一', '新选题二'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('proposeTopics rejects a non-JSON answer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-topics-'))
  try {
    await assert.rejects(
      proposeTopics({}, { root, call: async () => ({ text: 'sorry' }) }),
      /JSON/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('createJobsFromTopics creates queued jobs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-topics-'))
  try {
    const { jobs } = await createJobsFromTopics(root, [
      { title: 'A', angle: '写 A' },
      { title: 'B' },
    ])
    assert.equal(jobs.length, 2)
    assert.equal(jobs[0].title, 'A')
    assert.equal(jobs[0].brief, '写 A')
    assert.equal(jobs[1].brief, 'B')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
