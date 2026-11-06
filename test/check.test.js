import test from 'node:test'
import assert from 'node:assert/strict'
import { appendFile, mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildSite, loadSite } from '../src/build.js'
import { checkSite } from '../src/check.js'

async function seed(root) {
  await mkdir(join(root, 'content', 'posts'), { recursive: true })
  await writeFile(join(root, 'site.json'), JSON.stringify({
    title: '测试站', url: 'https://example.com', basePath: '/repo/', deploy: { dir: 'docs' },
  }))
  await writeFile(join(root, 'content', 'posts', 'a.md'), `---
title: A
slug: a
date: 2026-01-01
status: published
---

正文。
`)
  await buildSite(root)
}

test('checkSite passes a clean build', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-check-'))
  try {
    await seed(root)
    const site = await loadSite(root)
    const result = await checkSite(root, site)
    assert.equal(result.ok, true, JSON.stringify(result.issues))
    assert.ok(result.files >= 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('checkSite reports missing targets and basePath mismatches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-check-'))
  try {
    await seed(root)
    await appendFile(join(root, 'docs', 'index.html'), '<a href="/repo/nope.html">x</a><a href="/wrong.html">y</a>')
    const site = await loadSite(root)
    const result = await checkSite(root, site)
    assert.equal(result.ok, false)
    assert.ok(result.issues.some((issue) => issue.type === 'missing' && issue.target === '/repo/nope.html'))
    assert.ok(result.issues.some((issue) => issue.type === 'basePath' && issue.target === '/wrong.html'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('checkSite reports a missing .nojekyll', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-check-'))
  try {
    await seed(root)
    await unlink(join(root, 'docs', '.nojekyll'))
    const site = await loadSite(root)
    const result = await checkSite(root, site)
    assert.ok(result.issues.some((issue) => issue.type === 'missing' && issue.target === '.nojekyll'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('checkSite can probe the live URL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-check-'))
  try {
    await seed(root)
    const site = await loadSite(root)
    const good = await checkSite(root, site, { live: true, fetchImpl: async () => ({ ok: true, status: 200 }) })
    assert.equal(good.online.ok, true)

    const bad = await checkSite(root, site, { live: true, fetchImpl: async () => ({ ok: false, status: 404 }) })
    assert.equal(bad.online.status, 404)
    assert.ok(bad.issues.some((issue) => issue.type === 'online'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
