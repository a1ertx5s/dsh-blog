import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeArticle } from '../src/article.js'
import { reviseJob } from '../src/revise.js'

async function seed(root) {
  return writeArticle(root, 'agent-factory', {
    data: {
      title: '用 Agent 做内容工厂的完整实践',
      slug: 'agent-factory',
      description: '这是一段用于测试的摘要，长度需要落在五十到一百六十字之间，所以继续补充一些内容来满足这个要求，并且再多写几个字。',
      status: 'draft',
    },
    body: '## 第一节\n\n原稿内容[1]。\n',
  })
}

test('reviseJob rewrites, versions and reruns gates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-revise-'))
  try {
    const article = await seed(root)
    let gateCalls = 0
    const result = await reviseJob({}, {
      root,
      job: { id: 'job-x' },
      article,
      outline: { sections: [{ heading: '第一节' }] },
      sources: [{ url: 'https://a.example' }],
      comment: '第二节太弱，补个例子',
      call: async () => ({ text: '## 第一节\n\n修改后的内容[1]，补了例子。\n' }),
      gatesRunner: async () => {
        gateCalls += 1
        return { passed: true, checks: [] }
      },
    })

    assert.equal(gateCalls, 1)
    assert.match(result.article.body, /修改后的内容/)
    assert.equal(result.gates.passed, true)

    const saved = await readFile(join(root, 'content', 'posts', 'agent-factory.md'), 'utf8')
    assert.match(saved, /修改后的内容/)

    const versions = await readdir(join(root, '.blog', 'versions', 'agent-factory'))
    assert.equal(versions.length, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reviseJob requires a comment', async () => {
  await assert.rejects(
    reviseJob({}, { root: '/tmp', job: {}, article: { data: { slug: 'x' }, body: 'x' }, comment: '  ' }),
    /打回意见/,
  )
})

test('reviseJob rejects an empty rewrite', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-revise-'))
  try {
    const article = await seed(root)
    await assert.rejects(
      reviseJob({}, {
        root,
        job: { id: 'job-x' },
        article,
        comment: '改',
        call: async () => ({ text: '' }),
        gatesRunner: async () => ({ passed: true }),
      }),
      /没有正文/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
