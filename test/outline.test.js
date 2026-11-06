import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  normalizeOutline,
  outlineJob,
  outlinePrompt,
  parseOutline,
} from '../src/outline.js'

const VALID = {
  title: '用 Agent 做内容工厂',
  description: '把选题、研究、写作、门禁做成流水线。',
  tags: ['AI', '工程'],
  sections: [
    { heading: '为什么需要工厂', points: ['同质化', '成本'] },
    { heading: '五个工位', points: ['选题', '研究', '初稿'] },
    { heading: '质量门禁', points: ['引用', '查重'] },
    { heading: '发布与复盘', points: ['Pages', '规则'] },
  ],
  targetWords: 2400,
}

test('normalizeOutline accepts a valid outline', () => {
  const outline = normalizeOutline(VALID)
  assert.equal(outline.title, VALID.title)
  assert.equal(outline.sections.length, 4)
  assert.equal(outline.targetWords, 2400)
})

test('normalizeOutline rejects missing titles and short outlines', () => {
  assert.throws(() => normalizeOutline({ ...VALID, title: '' }), /标题/)
  assert.throws(() => normalizeOutline({ ...VALID, sections: VALID.sections.slice(0, 2) }), /至少/)
})

test('normalizeOutline clamps word counts and tags', () => {
  const outline = normalizeOutline({
    ...VALID,
    targetWords: 99999,
    tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
  })
  assert.equal(outline.targetWords, 4000)
  assert.equal(outline.tags.length, 8)
})

test('parseOutline extracts JSON from surrounding text', () => {
  const outline = parseOutline(`好的，这是大纲：\n${JSON.stringify(VALID)}\n`)
  assert.equal(outline.title, VALID.title)
  assert.throws(() => parseOutline('no json here'), /JSON/)
})

test('outlinePrompt includes sources', () => {
  const prompt = outlinePrompt({ brief: '写 Agent', title: 'Agent' }, [
    { url: 'https://a.example', title: 'A', snippet: 'snippet' },
  ])
  assert.match(prompt.user, /https:\/\/a\.example/)
  assert.match(prompt.system, /sections/)
})

test('outlineJob retries invalid JSON once and writes the file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-outline-'))
  try {
    let calls = 0
    const job = { id: `job-${'0'.repeat(8)}-0000-0000-0000-000000000000`, brief: 'B', title: 'T' }
    const result = await outlineJob({}, {
      root,
      job,
      call: async () => {
        calls += 1
        if (calls === 1) return { text: 'not json' }
        return { text: JSON.stringify(VALID) }
      },
    })
    assert.equal(calls, 2)
    assert.equal(result.outline.title, VALID.title)

    const saved = JSON.parse(await readFile(join(root, '.blog', 'runs', job.id, 'outline.json'), 'utf8'))
    assert.equal(saved.outline.sections.length, 4)
    assert.equal(saved.attempts, 2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('outlineJob fails after two invalid attempts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-outline-'))
  try {
    const job = { id: `job-${'1'.repeat(8)}-1111-1111-1111-111111111111`, brief: 'B' }
    await assert.rejects(
      outlineJob({}, { root, job, call: async () => ({ text: 'still not json' }) }),
      /JSON/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
