import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertPublicUrl,
  buildQueries,
  fallbackQueries,
  parseQueries,
  researchJob,
  searchSources,
  stripHtml,
} from '../src/research.js'

const ctxWithWeb = (web) => ({ get: (key) => (key === 'web' ? web : undefined) })

test('stripHtml removes scripts and tags and decodes entities', () => {
  const text = stripHtml('<p>Hello <strong>world</strong></p><script>alert(1)</script><p>A&nbsp;&amp;&nbsp;B</p>')
  assert.equal(text, 'Hello world\nA & B')
})

test('assertPublicUrl blocks local and private targets', async () => {
  await assert.rejects(assertPublicUrl('file:///etc/passwd'), /http/)
  await assert.rejects(assertPublicUrl('http://localhost/x'), /本机/)
  await assert.rejects(assertPublicUrl('http://127.0.0.1/x'), /内网/)
  await assert.rejects(assertPublicUrl('http://10.0.0.1/x'), /内网/)
  await assert.rejects(assertPublicUrl('http://192.168.1.1/x'), /内网/)
})

test('parseQueries extracts and dedupes JSON queries', () => {
  assert.deepEqual(
    parseQueries('{"queries":["a","b","a","c","d"]}'),
    ['a', 'b', 'c'],
  )
  assert.deepEqual(parseQueries('not json'), [])
})

test('fallbackQueries uses title or brief', () => {
  assert.deepEqual(fallbackQueries({ title: 'Agent', brief: 'x' }), ['Agent', 'Agent 教程', 'Agent 实践'])
  assert.ok(fallbackQueries({ brief: '第一句。第二句' })[0].includes('第一句'))
})

test('buildQueries uses the model and falls back on failure', async () => {
  const ok = await buildQueries({}, { title: 'T', brief: 'B' }, {
    call: async () => ({ text: '{"queries":["q1","q2","q1"]}' }),
  })
  assert.deepEqual(ok, ['q1', 'q2'])

  const fallback = await buildQueries({}, { title: 'T', brief: 'B' }, {
    call: async () => { throw new Error('no model') },
  })
  assert.deepEqual(fallback, ['T', 'T 教程', 'T 实践'])
})

test('searchSources dedupes, caps and records per-query errors', async () => {
  const ctx = ctxWithWeb({
    async search({ query }) {
      if (query === 'bad') throw new Error('search failed')
      return {
        sources: [
          { url: 'https://a.example', title: 'A' },
          { url: 'https://b.example' },
          { url: 'https://a.example', title: 'dup' },
        ],
      }
    },
  })

  const { sources, errors } = await searchSources(ctx, ['good', 'bad'], { maxSources: 2 })
  assert.equal(sources.length, 2)
  assert.equal(sources[0].url, 'https://a.example')
  assert.equal(errors.length, 1)
  assert.equal(errors[0].query, 'bad')
})

test('researchJob writes sources.json and degrades without web', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-research-'))
  try {
    const ctx = ctxWithWeb({
      async search() {
        return { sources: [{ url: 'https://a.example', title: 'A', snippet: 's' }] }
      },
    })

    const job = { id: `job-${'0'.repeat(8)}-0000-0000-0000-000000000000`, title: 'T', brief: 'B' }
    const result = await researchJob(ctx, {
      root,
      job,
      enrich: false,
      call: async () => ({ text: '{"queries":["q1"]}' }),
    })
    assert.equal(result.sources.length, 1)
    assert.equal(result.degraded, false)

    const saved = JSON.parse(await readFile(join(root, '.blog', 'runs', job.id, 'sources.json'), 'utf8'))
    assert.equal(saved.queries[0], 'q1')
    assert.equal(saved.sources[0].url, 'https://a.example')

    const degraded = await researchJob(ctxWithWeb(null), {
      root,
      job: { ...job, id: `job-${'1'.repeat(8)}-1111-1111-1111-111111111111` },
      enrich: false,
      call: async () => ({ text: '{"queries":["q1"]}' }),
    })
    assert.equal(degraded.sources.length, 0)
    assert.equal(degraded.degraded, true)
    assert.ok(degraded.errors.length > 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
