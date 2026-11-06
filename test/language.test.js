import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { languageInstruction, siteLanguage } from '../src/language.js'

test('siteLanguage reads site.json and defaults to zh', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-lang-'))
  try {
    assert.equal(await siteLanguage(root), 'zh')
    await writeFile(join(root, 'site.json'), JSON.stringify({ lang: 'en-US' }))
    assert.equal(await siteLanguage(root), 'en')
    assert.match(languageInstruction('en'), /English/)
    assert.match(languageInstruction('zh'), /中文/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
