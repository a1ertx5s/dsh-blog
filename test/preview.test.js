import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPreview, readPreview } from '../src/preview.js'

async function seed(root) {
  await mkdir(join(root, 'content', 'posts'), { recursive: true })
  await writeFile(join(root, 'site.json'), JSON.stringify({
    title: '测试站', url: 'https://example.com', basePath: '/repo/', deploy: { dir: 'docs' },
  }))
  await writeFile(join(root, 'content', 'posts', 'draft.md'), `---
title: 草稿文章
slug: draft
date: 2026-01-01
status: draft
---

预览也要包含。
`)
}

test('buildPreview includes drafts and rewrites basePath', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-preview-'))
  try {
    await seed(root)
    const result = await buildPreview(root, { slug: 'draft' })
    assert.match(result.basePath, /^\/blog\/preview\/pv-/)
    const html = await readFile(join(root, '.blog', 'preview', result.id, 'posts', 'draft.html'), 'utf8')
    assert.match(html, /草稿文章/)
    assert.match(html, new RegExp(result.basePath.replace(/[/.]/g, '\\$&')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('readPreview serves files and rejects traversal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-preview-'))
  try {
    await seed(root)
    const result = await buildPreview(root, { slug: 'draft' })
    const page = await readPreview(root, result.id, 'posts/draft.html')
    assert.ok(page)
    assert.match(page.type, /text\/html/)
    const encoded = await readPreview(root, result.id, `/posts/${encodeURIComponent('draft')}.html`)
    assert.ok(encoded)
    assert.equal(await readPreview(root, result.id, '../site.json'), null)
    assert.equal(await readPreview(root, '../x', 'a'), null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
