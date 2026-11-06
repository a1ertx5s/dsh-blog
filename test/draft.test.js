import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assembleDraft,
  cleanSection,
  countWords,
  draftJob,
  sectionPrompt,
} from '../src/draft.js'

const OUTLINE = {
  title: '用 Agent 做内容工厂',
  description: '把生产流程做成流水线。',
  tags: ['AI'],
  sections: [
    { heading: '为什么需要工厂', points: ['同质化', '成本'] },
    { heading: '质量门禁', points: ['引用', '查重'] },
  ],
  targetWords: 1200,
}

test('countWords counts CJK characters and latin words', () => {
  assert.equal(countWords('你好 world'), 3)
  assert.equal(countWords(''), 0)
})

test('cleanSection removes a repeated heading', () => {
  assert.equal(cleanSection('## 为什么需要工厂\n\n正文', '为什么需要工厂'), '正文')
  assert.equal(cleanSection('正文', '标题'), '正文')
})

test('sectionPrompt includes heading, points, sources and editorial', () => {
  const prompt = sectionPrompt({
    outline: OUTLINE,
    section: OUTLINE.sections[0],
    index: 0,
    sources: [{ url: 'https://a.example', title: 'A', snippet: 's' }],
    editorial: '不要写套话',
  })
  assert.match(prompt.user, /为什么需要工厂/)
  assert.match(prompt.user, /同质化/)
  assert.match(prompt.user, /https:\/\/a\.example/)
  assert.match(prompt.system, /不要写套话/)
})

test('assembleDraft appends references', () => {
  const body = assembleDraft(OUTLINE, [{ heading: 'A', text: 'a' }], [
    { url: 'https://a.example', title: 'A' },
  ])
  assert.match(body, /## A/)
  assert.match(body, /## 参考/)
  assert.match(body, /\[A\]\(https:\/\/a\.example\)/)
})

test('draftJob writes article and version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-draft-'))
  await mkdir(join(root, 'content', 'posts'), { recursive: true })
  try {
    let calls = 0
    const result = await draftJob({}, {
      root,
      job: { id: 'job-x', brief: 'B', title: 'T' },
      outline: OUTLINE,
      sources: [{ url: 'https://a.example', title: 'A', excerpt: '摘录' }],
      call: async () => {
        calls += 1
        return { text: `第 ${calls} 节正文。` }
      },
    })

    assert.equal(calls, 2)
    assert.equal(result.slug, '用-agent-做内容工厂')
    assert.match(result.body, /## 为什么需要工厂/)
    assert.match(result.body, /第 1 节正文/)
    assert.match(result.body, /## 参考/)

    const article = await readFile(join(root, 'content', 'posts', `${result.slug}.md`), 'utf8')
    assert.match(article, /title: 用 Agent 做内容工厂/)

    const versions = await readdir(join(root, '.blog', 'versions', result.slug))
    assert.equal(versions.length, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('draftJob refuses an empty outline', async () => {
  await assert.rejects(
    draftJob({}, { root: '/tmp', job: {}, outline: { sections: [] }, call: async () => ({ text: 'x' }) }),
    /大纲/,
  )
})
