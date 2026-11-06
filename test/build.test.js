import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildSite,
  normalizeBasePath,
  rewriteLinks,
  sitePath,
} from '../src/build.js'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

async function seed(root) {
  await mkdir(join(root, 'content', 'posts'), { recursive: true })
  await mkdir(join(root, 'content', 'images'), { recursive: true })
  await writeFile(join(root, 'site.json'), JSON.stringify({
    title: '测试博客',
    description: '一个测试站',
    url: 'https://example.com',
    basePath: '/repo/',
    nav: [{ label: '关于', href: '/about.html' }],
    deploy: { dir: 'docs' },
  }))
  await writeFile(join(root, 'content', 'posts', 'hello.md'), `---
title: 你好
slug: hello
date: 2026-01-01
status: published
description: 这是一篇摘要
tags: [AI, 工程]
---

正文。

![图](/images/a.png)

[内链](/posts/hello.html)
`)
  await writeFile(join(root, 'content', 'posts', 'draft.md'), `---
title: 草稿
slug: draft
date: 2026-02-01
status: draft
---

还没有发布。
`)
  await writeFile(join(root, 'content', 'images', 'a.png'), PNG)
  await writeFile(join(root, 'content', 'about.md'), '# 关于我\n')
}

test('normalizeBasePath always yields leading and trailing slashes', () => {
  assert.equal(normalizeBasePath('repo'), '/repo/')
  assert.equal(normalizeBasePath('/repo'), '/repo/')
  assert.equal(normalizeBasePath('/'), '/')
  assert.equal(normalizeBasePath(''), '/')
})

test('rewriteLinks prefixes internal paths and the home link', () => {
  assert.equal(rewriteLinks('<img src="/images/a.png">', '/repo/'), '<img src="/repo/images/a.png">')
  assert.equal(rewriteLinks('<a href="/posts/x.html">x</a>', '/repo/'), '<a href="/repo/posts/x.html">x</a>')
  assert.equal(rewriteLinks('<a href="/">home</a>', '/repo/'), '<a href="/repo/">home</a>')
  assert.equal(rewriteLinks('<a href="https://a.example">a</a>', '/repo/'), '<a href="https://a.example">a</a>')
})

test('sitePath joins the base path', () => {
  assert.equal(sitePath({ basePath: '/repo/' }, 'posts/x.html'), '/repo/posts/x.html')
  assert.equal(sitePath({ basePath: '/repo/' }), '/repo/')
})

test('buildSite writes published pages, assets and feeds', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-build-'))
  try {
    await seed(root)
    const report = await buildSite(root, { now: new Date('2026-05-01T00:00:00Z') })
    assert.equal(report.articles, 1)
    assert.equal(report.dir, 'docs')

    const index = await readFile(join(root, 'docs', 'index.html'), 'utf8')
    assert.match(index, /测试博客/)
    assert.match(index, /你好/)
    assert.doesNotMatch(index, /草稿/)

    const post = await readFile(join(root, 'docs', 'posts', 'hello.html'), 'utf8')
    assert.match(post, /\/repo\/images\/a\.png/)
    assert.match(post, /\/repo\/posts\/hello\.html/)
    assert.match(post, /https:\/\/example\.com\/repo\/posts\/hello\.html/)

    const rss = await readFile(join(root, 'docs', 'rss.xml'), 'utf8')
    assert.match(rss, /https:\/\/example\.com\/repo\/posts\/hello\.html/)
    assert.match(rss, /你好/)

    const sitemap = await readFile(join(root, 'docs', 'sitemap.xml'), 'utf8')
    assert.match(sitemap, /https:\/\/example\.com\/repo\/posts\/hello\.html/)

    assert.ok((await stat(join(root, 'docs', '.nojekyll'))).isFile())
    assert.ok((await stat(join(root, 'docs', 'images', 'a.png'))).isFile())
    assert.ok((await stat(join(root, 'docs', '404.html'))).isFile())
    assert.ok((await stat(join(root, 'docs', 'about.html'))).isFile())

    const saved = JSON.parse(await readFile(join(root, '.blog', 'build.json'), 'utf8'))
    assert.equal(saved.ok, true)
    assert.equal(saved.articles, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('buildSite replaces the previous docs directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-build-'))
  try {
    await seed(root)
    await buildSite(root)
    await writeFile(join(root, 'site.json'), JSON.stringify({
      title: '新标题', url: 'https://example.com', basePath: '/repo/', deploy: { dir: 'docs' },
    }))
    await buildSite(root)
    const index = await readFile(join(root, 'docs', 'index.html'), 'utf8')
    assert.match(index, /新标题/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('buildSite warns and renders an empty index without published posts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-build-'))
  try {
    await mkdir(join(root, 'content', 'posts'), { recursive: true })
    await writeFile(join(root, 'site.json'), JSON.stringify({ title: '空站', deploy: { dir: 'docs' } }))
    const report = await buildSite(root)
    assert.equal(report.articles, 0)
    assert.ok(report.warnings.some((warning) => warning.includes('site.url')))
    const index = await readFile(join(root, 'docs', 'index.html'), 'utf8')
    assert.match(index, /还没有发布文章/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
