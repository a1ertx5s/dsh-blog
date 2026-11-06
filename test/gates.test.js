import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeArticle } from '../src/article.js'
import {
  checkCitations,
  checkDedupe,
  checkFacts,
  checkSeo,
  checkStyle,
  runGates,
  textLength,
} from '../src/gates.js'

const TITLE = '用 Agent 做内容工厂的完整实践'
const DESCRIPTION = '这是一段用于测试的摘要，长度需要落在五十到一百六十字之间，所以继续补充一些内容来满足这个要求，并且再多写几个字。'

const article = (overrides = {}) => ({
  data: { title: TITLE, description: DESCRIPTION, slug: 'agent-factory' },
  body: '## 为什么需要工厂\n\n2026 年的内容生产需要引用来源[1]，否则无法验证。\n',
  ...overrides,
})

test('textLength counts code points', () => {
  assert.equal(textLength('你好'), 2)
  assert.equal(textLength(''), 0)
})

test('checkCitations passes valid refs and flags out-of-range', () => {
  const ok = checkCitations(article(), [{ url: 'https://a.example' }])
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.detail.invalid, [])

  const bad = checkCitations(article({ body: '正文[3]\n' }), [{ url: 'https://a.example' }])
  assert.equal(bad.ok, false)
  assert.deepEqual(bad.detail.invalid, [3])
})

test('checkSeo evaluates title, description, slug and alt', () => {
  assert.equal(checkSeo(article()).ok, true)

  const short = checkSeo(article({ data: { ...article().data, title: '短' } }))
  assert.equal(short.ok, false)

  const noAlt = checkSeo(article({ body: '![](/images/x.png)\n' }))
  assert.equal(noAlt.ok, false)
})

test('checkDedupe compares against existing articles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-gates-'))
  try {
    await writeArticle(root, 'existing', {
      data: { title: TITLE, description: DESCRIPTION, slug: 'existing' },
      body: '旧文\n',
    })

    const duplicate = await checkDedupe(root, article())
    assert.equal(duplicate.ok, false)
    assert.equal(duplicate.detail.closest, 'existing')

    const fresh = await checkDedupe(root, article({
      data: { title: '一个完全不同的标题', description: '另一段完全不同的摘要，和旧文没有关系。', slug: 'other' },
    }))
    assert.equal(fresh.ok, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('checkStyle scores via the model and skips on failure', async () => {
  const high = await checkStyle({}, article(), '', async () => ({ text: '{"score":4,"issues":[]}' }))
  assert.equal(high.ok, true)

  const low = await checkStyle({}, article(), '', async () => ({ text: '{"score":2,"issues":["空泛"]}' }))
  assert.equal(low.ok, false)

  const failed = await checkStyle({}, article(), '', async () => { throw new Error('no model') })
  assert.equal(failed.skipped, true)
  assert.equal(failed.ok, true)
})

test('checkFacts skips without sources and flags unsupported claims', async () => {
  const skipped = await checkFacts({}, article(), [], async () => ({ text: '{}' }))
  assert.equal(skipped.skipped, true)

  const ok = await checkFacts({}, article(), [{ url: 'https://a.example' }], async () => ({
    text: '{"claims":[{"text":"2026 年","support":"supported"}]}',
  }))
  assert.equal(ok.ok, true)

  const bad = await checkFacts({}, article(), [{ url: 'https://a.example' }], async () => ({
    text: '{"claims":[{"text":"a","support":"unsupported"},{"text":"b","support":"unsupported"},{"text":"c","support":"unsupported"}]}',
  }))
  assert.equal(bad.ok, false)
})

test('runGates writes gates.json and computes pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-gates-'))
  try {
    const call = async (ctx, request) => ({
      text: request.system.includes('文字编辑') ? '{"score":4,"issues":[]}' : '{"claims":[]}',
    })
    const result = await runGates({}, {
      root,
      job: { id: `job-${'0'.repeat(8)}-0000-0000-0000-000000000000` },
      article: article(),
      sources: [{ url: 'https://a.example', title: 'A', excerpt: '2026 年' }],
      call,
    })
    assert.equal(result.passed, true)
    assert.equal(result.checks.length, 5)

    const saved = JSON.parse(await readFile(join(root, '.blog', 'runs', result.jobId, 'gates.json'), 'utf8'))
    assert.equal(saved.passed, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
