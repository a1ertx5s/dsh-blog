import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportMarkdown, importMarkdown } from '../src/transfer.js'

test('importMarkdown keeps frontmatter and body', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-transfer-'))
  try {
    const article = await importMarkdown(root, `---
title: 导入的标题
description: 摘要
tags: [AI]
---

正文。
`, { filename: 'x.md' })
    assert.equal(article.data.title, '导入的标题')
    assert.deepEqual(article.data.tags, ['AI'])
    assert.equal(article.data.status, 'draft')
    const raw = await exportMarkdown(root, article.slug)
    assert.match(raw, /导入的标题/)
    assert.match(raw, /正文/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('importMarkdown falls back to the H1 title', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-transfer-'))
  try {
    const article = await importMarkdown(root, '# 只有标题\n\n内容\n')
    assert.equal(article.data.title, '只有标题')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('exportMarkdown rejects unknown slugs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-transfer-'))
  try {
    await assert.rejects(exportMarkdown(root, 'missing'), /不存在/)
    await assert.rejects(exportMarkdown(root, '../x'), /slug/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
