import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_EDITORIAL, ensureBlogRoot, inspectBlogRoot, resolveBlogRoot } from '../src/root.js'

function fakeGit() {
  let initialized = false
  const calls = []
  const exec = async (cmd, args) => {
    calls.push([cmd, ...args].join(' '))
    if (args[0] === 'rev-parse') {
      if (!initialized) throw new Error('not a git repository')
      return { stdout: 'true\n', stderr: '' }
    }
    if (args[0] === 'init') {
      initialized = true
      return { stdout: '', stderr: '' }
    }
    throw new Error(`unexpected git call: ${args.join(' ')}`)
  }
  return { exec, calls }
}

test('resolveBlogRoot prefers explicit, then env, then DSH_HOME', () => {
  const env = { DSH_HOME: '/tmp/dsh-home', DSH_BLOG_ROOT: '/tmp/from-env' }
  assert.equal(resolveBlogRoot(' /tmp/explicit ', env), '/tmp/explicit')
  assert.equal(resolveBlogRoot('', env), '/tmp/from-env')
  assert.equal(resolveBlogRoot(undefined, { DSH_HOME: '/tmp/dsh-home' }), '/tmp/dsh-home/blog')
})

test('resolveBlogRoot expands ~', () => {
  const root = resolveBlogRoot('~/blog-test', {})
  assert.ok(root.endsWith('/blog-test'))
  assert.ok(!root.startsWith('~'))
})

test('ensureBlogRoot creates the layout, site.json and editorial.md', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-root-'))
  const { exec } = fakeGit()
  try {
    const status = await ensureBlogRoot(root, { exec })
    assert.equal(status.initialized, true)
    assert.equal(status.git, true)
    assert.ok(status.created.includes('site.json'))
    assert.ok(status.created.includes('editorial.md'))

    const site = JSON.parse(await readFile(join(root, 'site.json'), 'utf8'))
    assert.equal(site.schemaVersion, 1)
    assert.equal(site.deploy.dir, 'docs')
    assert.equal(await readFile(join(root, 'editorial.md'), 'utf8'), DEFAULT_EDITORIAL)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('ensureBlogRoot is idempotent and never overwrites user files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-root-'))
  const { exec } = fakeGit()
  try {
    await ensureBlogRoot(root, { exec })
    const sitePath = join(root, 'site.json')
    const site = JSON.parse(await readFile(sitePath, 'utf8'))
    site.title = '我的博客名'
    await writeFile(sitePath, JSON.stringify(site, null, 2))

    const second = await ensureBlogRoot(root, { exec })
    assert.deepEqual(second.created, [])
    const after = JSON.parse(await readFile(sitePath, 'utf8'))
    assert.equal(after.title, '我的博客名')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('inspectBlogRoot reports a missing directory without throwing', async () => {
  const root = join(tmpdir(), `dsh-blog-missing-${Date.now()}`)
  const status = await inspectBlogRoot(root, { exec: fakeGit().exec })
  assert.equal(status.exists, false)
  assert.equal(status.initialized, false)
  assert.equal(status.git, false)
})
