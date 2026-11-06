// 文章版本：列出、读取、恢复。
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArticle, stringifyArticle, writeArticle } from './article.js'
import { writeVersion } from './draft.js'

const VERSION_ID = /^[0-9TZ.-]+\.md$/

function versionsDir(root, slug) {
  return join(root, '.blog', 'versions', slug)
}

export async function listVersions(root, slug) {
  let names
  try {
    names = await readdir(versionsDir(root, slug))
  } catch {
    return []
  }

  const rows = []
  for (const name of names.filter((entry) => VERSION_ID.test(entry))) {
    try {
      const raw = await readFile(join(versionsDir(root, slug), name), 'utf8')
      const parsed = parseArticle(raw)
      rows.push({
        id: name,
        at: name.replace(/\.md$/, ''),
        title: parsed.data?.title || '',
        bytes: Buffer.byteLength(raw),
      })
    } catch {
      // 跳过损坏的版本文件
    }
  }
  return rows.sort((a, b) => b.id.localeCompare(a.id))
}

export async function readVersion(root, slug, id) {
  if (!VERSION_ID.test(String(id))) return null
  try {
    const raw = await readFile(join(versionsDir(root, slug), id), 'utf8')
    const parsed = parseArticle(raw)
    return { id, data: parsed.data, body: parsed.body, raw }
  } catch {
    return null
  }
}

export async function restoreVersion(root, slug, id, { version } = {}) {
  const source = await readVersion(root, slug, id)
  if (!source) throw Object.assign(new Error('版本不存在'), { status: 404 })
  const data = { ...source.data, slug, status: 'draft' }
  const saved = await writeArticle(root, slug, { data, body: source.body, version })
  await writeVersion(root, slug, stringifyArticle({ data, body: source.body }))
  return saved
}
