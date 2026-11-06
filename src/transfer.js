// 导入/导出 Markdown。
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createArticle, isSafeSlug, parseArticle } from './article.js'

export async function importMarkdown(root, raw, { filename = '' } = {}) {
  const text = String(raw || '')
  if (!text.trim()) throw Object.assign(new Error('内容为空'), { status: 400 })
  const parsed = parseArticle(text)
  const data = parsed.data || {}
  const heading = /^#\s+(.+)$/m.exec(parsed.body)?.[1]?.trim()
  const fallback = String(filename || '').replace(/\.md$/i, '').trim()
  const title = String(data.title || heading || fallback || '导入文章').trim()
  return createArticle(root, {
    title,
    body: parsed.body,
    data: { ...data, title },
  })
}

export async function exportMarkdown(root, slug) {
  if (!isSafeSlug(String(slug))) throw Object.assign(new Error('slug 无效'), { status: 400 })
  try {
    return await readFile(join(root, 'content', 'posts', `${slug}.md`), 'utf8')
  } catch {
    throw Object.assign(new Error('文章不存在'), { status: 404 })
  }
}
