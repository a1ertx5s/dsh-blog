import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readSettings, writeSettings } from '../src/settings.js'

test('writeSettings normalizes basePath and budget', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-settings-'))
  try {
    const saved = await writeSettings(root, {
      title: '新标题',
      basePath: 'blog',
      budget: { perArticleTokens: 100, monthlyTokens: 0 },
      deploy: { autoPush: true },
    })
    assert.equal(saved.title, '新标题')
    assert.equal(saved.basePath, '/blog/')
    assert.equal(saved.budget.perArticleTokens, 100)
    assert.equal(saved.deploy.autoPush, true)
    assert.equal((await readSettings(root)).title, '新标题')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('writeSettings rejects bad url and negative budget', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-settings-'))
  try {
    await assert.rejects(writeSettings(root, { url: 'example.com' }), /http/)
    await assert.rejects(writeSettings(root, { budget: { monthlyTokens: -1 } }), /负/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
