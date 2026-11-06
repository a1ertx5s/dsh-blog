// 构建自检：basePath、内链与资源是否存在，可选线上探测。
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function walk(dir, out = []) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await walk(path, out)
    else if (entry.name.endsWith('.html')) out.push(path)
  }
  return out
}

function targetOf(docs, basePath, url) {
  const path = decodeURIComponent(url.slice(basePath.length).split(/[?#]/)[0])
  if (path === '') return join(docs, 'index.html')
  if (path.endsWith('/')) return join(docs, path, 'index.html')
  return join(docs, path)
}

export async function checkSite(root, site, { live = false, fetchImpl = globalThis.fetch } = {}) {
  const docs = join(root, site.deploy.dir)
  const issues = []

  if (!(await exists(join(docs, 'index.html')))) issues.push({ type: 'missing', target: 'index.html' })
  if (!(await exists(join(docs, '.nojekyll')))) issues.push({ type: 'missing', target: '.nojekyll' })

  const files = await walk(docs)
  for (const file of files) {
    const html = await readFile(file, 'utf8')
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const url = match[1]
      if (/^(https?:|mailto:|#|data:|javascript:)/.test(url)) continue
      if (!url.startsWith('/')) continue
      if (!url.startsWith(site.basePath)) {
        issues.push({ type: 'basePath', file: relative(docs, file), target: url })
        continue
      }
      if (!(await exists(targetOf(docs, site.basePath, url)))) {
        issues.push({ type: 'missing', file: relative(docs, file), target: url })
      }
    }
  }

  let online = null
  if (live && site.url) {
    try {
      const response = await fetchImpl(`${site.url}${site.basePath}`, { method: 'GET' })
      online = { ok: response.ok, status: response.status }
      if (!response.ok) issues.push({ type: 'online', target: String(response.status) })
    } catch (err) {
      online = { ok: false, error: err.message }
      issues.push({ type: 'online', target: err.message })
    }
  }

  return { ok: issues.length === 0, issues: issues.slice(0, 50), files: files.length, online }
}
