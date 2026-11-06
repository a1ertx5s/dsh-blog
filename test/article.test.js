import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createArticle,
  formatDate,
  isSafeSlug,
  listArticles,
  normalizeArticleData,
  parseArticle,
  readArticle,
  slugify,
  stringifyArticle,
  uniqueSlug,
  writeArticle,
} from '../src/article.js'

test('parseArticle reads frontmatter and body', () => {
  const raw = '---\ntitle: 你好\nstatus: review\ntags: [AI, 工程]\n---\n\n正文第一段\n'
  const parsed = parseArticle(raw)
  assert.equal(parsed.data.title, '你好')
  assert.deepEqual(parsed.data.tags, ['AI', '工程'])
  assert.equal(parsed.body, '正文第一段\n')
  assert.equal(parsed.hasFrontmatter, true)
})

test('parseArticle accepts files without frontmatter', () => {
  const parsed = parseArticle('只有正文\n')
  assert.deepEqual(parsed.data, {})
  assert.equal(parsed.body, '只有正文\n')
  assert.equal(parsed.hasFrontmatter, false)
})

test('parseArticle reports invalid YAML', () => {
  assert.throws(() => parseArticle('---\ntitle: [\n---\nbody'), /frontmatter YAML/)
})

test('stringifyArticle keeps a stable field order and round-trips', () => {
  const text = stringifyArticle({
    data: { status: 'draft', title: '标题', tags: ['a'], extra: 1 },
    body: '正文\n',
  })
  assert.ok(text.startsWith('---\ntitle: 标题\n'))
  const parsed = parseArticle(text)
  assert.equal(parsed.data.title, '标题')
  assert.equal(parsed.data.extra, 1)
  assert.deepEqual(parsed.data.tags, ['a'])
  assert.equal(parsed.body, '正文\n')
})

test('slugify keeps unicode letters and collapses punctuation', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world')
  assert.equal(slugify('用 Agent 做内容工厂'), '用-agent-做内容工厂')
  assert.equal(slugify('!!!'), '')
  assert.equal(uniqueSlug('post', ['post', 'post-2']), 'post-3')
})

test('formatDate normalizes dates and rejects garbage', () => {
  assert.equal(formatDate('2026-11-06T10:00:00Z'), '2026-11-06')
  assert.equal(formatDate(new Date('2026-01-02T00:00:00Z')), '2026-01-02')
  assert.equal(formatDate('not-a-date'), '')
})

test('normalizeArticleData fills defaults', () => {
  const data = normalizeArticleData({ title: '标题' }, { now: new Date('2026-05-01T00:00:00Z') })
  assert.equal(data.slug, '标题')
  assert.equal(data.status, 'draft')
  assert.equal(data.date, '2026-05-01')
  assert.deepEqual(data.tags, [])
})

test('isSafeSlug blocks traversal', () => {
  assert.equal(isSafeSlug('hello-world'), true)
  assert.equal(isSafeSlug('中文-标题'), true)
  assert.equal(isSafeSlug('../secret'), false)
  assert.equal(isSafeSlug('a/b'), false)
  assert.equal(isSafeSlug('..'), false)
})

test('listArticles sorts by date and surfaces malformed files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-posts-'))
  const dir = join(root, 'content', 'posts')
  await mkdir(dir, { recursive: true })
  try {
    await writeFile(join(dir, 'a.md'), '---\ntitle: A\ndate: 2026-01-01\nstatus: draft\n---\nA\n')
    await writeFile(join(dir, 'b.md'), '---\ntitle: B\ndate: 2026-02-01\nstatus: published\n---\nB\n')
    await writeFile(join(dir, 'broken.md'), '---\ntitle: [\n---\n')
    await writeFile(join(dir, 'note.txt'), 'ignore me')

    const posts = await listArticles(root)
    assert.equal(posts.length, 3)
    assert.deepEqual(posts.map((post) => post.title), ['B', 'A', 'broken'])
    assert.ok(posts[2].error)
    assert.equal(posts[2].status, 'invalid')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('readArticle returns null for missing or unsafe slugs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-read-'))
  await mkdir(join(root, 'content', 'posts'), { recursive: true })
  try {
    assert.equal(await readArticle(root, 'missing'), null)
    assert.equal(await readArticle(root, '../secret'), null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('writeArticle creates a file and returns a version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-write-'))
  try {
    const written = await writeArticle(root, 'hello', { data: { title: 'Hello' }, body: '正文\n' })
    assert.equal(written.slug, 'hello')
    assert.ok(written.version)

    const read = await readArticle(root, 'hello')
    assert.equal(read.body, '正文\n')
    assert.equal(read.data.title, 'Hello')
    assert.equal(read.version, written.version)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('writeArticle rejects a stale version with 409', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-conflict-'))
  try {
    const first = await writeArticle(root, 'conflict', { data: { title: 'A' }, body: '1' })
    await new Promise((resolve) => setTimeout(resolve, 10))
    await writeArticle(root, 'conflict', { data: { title: 'B' }, body: '2' })

    await assert.rejects(
      writeArticle(root, 'conflict', { data: { title: 'C' }, body: '3', version: first.version }),
      (err) => err.status === 409,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('createArticle dedupes slugs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-create-'))
  try {
    const first = await createArticle(root, { title: '同一个 标题' })
    const second = await createArticle(root, { title: '同一个 标题' })
    assert.notEqual(first.slug, second.slug)

    const posts = await listArticles(root)
    assert.equal(posts.length, 2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

