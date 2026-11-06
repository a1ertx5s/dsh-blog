// 文章：frontmatter 解析、序列化、slug 与索引。
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export const STATUSES = ['draft', 'review', 'published']
const FIELD_ORDER = ['title', 'slug', 'date', 'status', 'tags', 'description', 'cover']
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export function parseArticle(raw) {
  const text = String(raw).replace(/^\uFEFF/, '')
  const match = FRONTMATTER.exec(text)
  if (!match) return { data: {}, body: text, hasFrontmatter: false }
  let data
  try {
    data = parseYaml(match[1]) ?? {}
  } catch (err) {
    throw new Error(`frontmatter YAML 解析失败：${err.message}`)
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('frontmatter 必须是键值对象')
  }
  const body = text.slice(match[0].length).replace(/^\r?\n/, '')
  return { data, body, hasFrontmatter: true }
}

export function stringifyArticle({ data = {}, body = '' } = {}) {
  const ordered = {}
  for (const key of FIELD_ORDER) {
    if (data[key] !== undefined) ordered[key] = data[key]
  }
  for (const key of Object.keys(data)) {
    if (!FIELD_ORDER.includes(key) && data[key] !== undefined) ordered[key] = data[key]
  }
  const front = stringifyYaml(ordered, { lineWidth: 0 }).trimEnd()
  const content = String(body).replace(/^\n+/, '')
  return `---\n${front}\n---\n\n${content}`.replace(/\n*$/, '\n')
}

export function formatDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'string') {
    const match = /^\d{4}-\d{2}-\d{2}/.exec(value.trim())
    if (match) return match[0]
  }
  return ''
}

export function slugify(title) {
  return String(title ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function uniqueSlug(base, taken = []) {
  const root = base || 'post'
  if (!taken.includes(root)) return root
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${root}-${index}`
    if (!taken.includes(candidate)) return candidate
  }
  return `${root}-${Date.now()}`
}

export function normalizeArticleData(data = {}, { fallbackSlug = 'post', now = new Date() } = {}) {
  const out = { ...data }
  out.title = typeof data.title === 'string' ? data.title.trim() : ''
  const slugBase = typeof data.slug === 'string' && data.slug.trim()
    ? data.slug.trim()
    : slugify(out.title)
  out.slug = slugBase || fallbackSlug
  out.date = formatDate(data.date) || formatDate(now)
  out.status = STATUSES.includes(data.status) ? data.status : 'draft'
  out.tags = Array.isArray(data.tags)
    ? data.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : []
  out.description = typeof data.description === 'string' ? data.description.trim() : ''
  out.cover = typeof data.cover === 'string' ? data.cover.trim() : ''
  return out
}

export function isSafeSlug(slug) {
  return typeof slug === 'string'
    && slug.length > 0
    && slug !== '.'
    && slug !== '..'
    && /^[\p{Letter}\p{Number}_-]+$/u.test(slug)
}

export async function listArticles(root) {
  const dir = join(root, 'content', 'posts')
  let names
  try {
    names = await readdir(dir)
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }

  const posts = []
  for (const file of names) {
    if (!file.endsWith('.md')) continue
    const path = join(dir, file)
    try {
      const [raw, info] = await Promise.all([readFile(path, 'utf8'), stat(path)])
      const parsed = parseArticle(raw)
      const data = normalizeArticleData(parsed.data, { fallbackSlug: file.slice(0, -3) })
      posts.push({
        slug: data.slug,
        title: data.title || data.slug,
        date: data.date,
        status: data.status,
        tags: data.tags,
        description: data.description,
        cover: data.cover,
        file,
        mtime: info.mtimeMs,
        error: null,
      })
    } catch (err) {
      posts.push({
        slug: file.slice(0, -3),
        title: file.slice(0, -3),
        date: '',
        status: 'invalid',
        tags: [],
        description: '',
        cover: '',
        file,
        mtime: 0,
        error: err.message,
      })
    }
  }

  return posts.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.mtime - a.mtime)
}

export async function readArticle(root, slug) {
  if (!isSafeSlug(slug)) return null
  const file = join(root, 'content', 'posts', `${slug}.md`)
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
  const parsed = parseArticle(raw)
  const data = normalizeArticleData(parsed.data, { fallbackSlug: slug })
  const info = await stat(file)
  return { slug: data.slug, data, body: parsed.body, file, version: String(info.mtimeMs) }
}

/** 原子写：先写同目录临时文件，再 rename，避免读到半截。 */
export async function writeArticle(root, slug, { data = {}, body = '', version } = {}) {
  if (!isSafeSlug(slug)) throw Object.assign(new Error('slug 无效'), { status: 400 })
  const dir = join(root, 'content', 'posts')
  await mkdir(dir, { recursive: true })
  const file = join(dir, `${slug}.md`)

  if (version !== undefined && version !== null && version !== '') {
    const current = await stat(file).catch(() => null)
    if (!current) throw Object.assign(new Error('文章不存在'), { status: 404 })
    if (String(current.mtimeMs) !== String(version)) {
      throw Object.assign(new Error('文章已被修改，请刷新后重试'), { status: 409, version: String(current.mtimeMs) })
    }
  }

  const normalized = normalizeArticleData({ ...data, slug }, { fallbackSlug: slug })
  const text = stringifyArticle({ data: normalized, body })
  const tmp = join(dir, `.${slug}.${process.pid}.${Date.now()}.tmp`)
  await writeFile(tmp, text, 'utf8')
  await rename(tmp, file)
  const info = await stat(file)
  return { slug: normalized.slug, data: normalized, body, file, version: String(info.mtimeMs) }
}

export async function createArticle(root, { title, body = '', data = {} } = {}) {
  const name = typeof title === 'string' ? title.trim() : ''
  if (!name) throw Object.assign(new Error('标题不能为空'), { status: 400 })

  const existing = await listArticles(root)
  const taken = existing.map((post) => post.slug)
  const base = slugify(data.slug || name) || 'post'
  const slug = uniqueSlug(base, taken)

  const normalized = normalizeArticleData({
    ...data,
    title: name,
    slug,
    date: data.date || formatDate(new Date()),
    status: data.status || 'draft',
  }, { fallbackSlug: slug })

  return writeArticle(root, slug, { data: normalized, body })
}
