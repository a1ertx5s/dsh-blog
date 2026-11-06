// 本地预览：构建到 .blog/preview/<id>/ 并提供只读静态访问。
import { randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { buildSite } from './build.js'

const ID = /^pv-[a-z0-9-]+$/

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
}

export function previewDir(root, id) {
  return join(root, '.blog', 'preview', id)
}

export async function buildPreview(root, { slug = '' } = {}) {
  const id = `pv-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`
  const dir = previewDir(root, id)
  await mkdir(dirname(dir), { recursive: true })
  const basePath = `/blog/preview/${id}/`
  const report = await buildSite(root, {
    outDir: dir,
    basePath,
    include: slug ? [slug] : [],
    writeReport: false,
  })
  return { id, basePath, at: report.at, articles: report.articles, warnings: report.warnings }
}

export async function readPreview(root, id, rel = '') {
  if (!ID.test(String(id))) return null
  const base = resolve(previewDir(root, id))
  const clean = String(rel || '').replace(/^\/+/, '')
  if (clean.includes('..') || clean.includes('\0')) return null
  const file = clean === '' || clean.endsWith('/')
    ? resolve(base, clean, 'index.html')
    : resolve(base, clean)
  if (file !== base && !file.startsWith(base + sep)) return null
  try {
    const data = await readFile(file)
    const ext = file.slice(file.lastIndexOf('.')).toLowerCase()
    return { data, type: MIME[ext] || 'application/octet-stream' }
  } catch {
    return null
  }
}
