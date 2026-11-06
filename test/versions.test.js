import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringifyArticle, writeArticle } from '../src/article.js'
import { writeVersion } from '../src/draft.js'
import { listVersions, readVersion, restoreVersion } from '../src/versions.js'

async function seed(root) {
  const article = await writeArticle(root, 'v', {
    data: { title: '版本', slug: 'v', status: 'draft', description: 'd' },
    body: '第一版\n',
  })
  await writeVersion(root, 'v', stringifyArticle({
    data: { title: '版本', slug: 'v', status: 'draft', description: 'd' },
    body: '第二版\n',
  }))
  return article
}

test('listVersions and readVersion expose saved snapshots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-versions-'))
  try {
    const article = await seed(root)
    const list = await listVersions(root, 'v')
    assert.equal(list.length, 1)
    const version = await readVersion(root, 'v', list[0].id)
    assert.equal(version.body.trim(), '第二版')
    assert.equal(await readVersion(root, 'v', '../x'), null)
    assert.equal(article.slug, 'v')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('restoreVersion writes the old body and keeps a new snapshot', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-versions-'))
  try {
    const article = await seed(root)
    const list = await listVersions(root, 'v')
    const restored = await restoreVersion(root, 'v', list[0].id, { version: article.version })
    assert.equal(restored.body.trim(), '第二版')
    assert.equal(restored.data.status, 'draft')
    const after = await listVersions(root, 'v')
    assert.equal(after.length, 2)
    await assert.rejects(restoreVersion(root, 'v', 'missing.md', {}), /版本不存在/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
