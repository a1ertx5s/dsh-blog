// site.json 读写与校验。
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { normalizeBasePath, normalizeSite } from './build.js'

const TEXT_FIELDS = ['title', 'description', 'url', 'author', 'lang', 'theme']

async function readRaw(root) {
  try {
    return JSON.parse(await readFile(join(root, 'site.json'), 'utf8'))
  } catch {
    return {}
  }
}

export async function readSettings(root) {
  return normalizeSite(await readRaw(root))
}

export async function writeSettings(root, patch = {}) {
  const current = await readRaw(root)
  const next = { ...current }

  for (const field of TEXT_FIELDS) {
    if (patch[field] !== undefined) next[field] = String(patch[field] ?? '').trim()
  }
  if (next.title === '') next.title = '我的博客'
  if (patch.basePath !== undefined) next.basePath = normalizeBasePath(patch.basePath)

  if (patch.url !== undefined) {
    const url = String(patch.url || '').trim().replace(/\/+$/, '')
    if (url && !/^https?:\/\//.test(url)) {
      throw Object.assign(new Error('url 必须是 http(s) 地址'), { status: 400 })
    }
    next.url = url
  }

  if (patch.nav !== undefined) {
    next.nav = Array.isArray(patch.nav)
      ? patch.nav.filter((item) => item && item.label && item.href).slice(0, 10)
      : []
  }

  if (patch.budget !== undefined) {
    const budget = patch.budget || {}
    const perArticle = Number(budget.perArticleTokens) || 0
    const monthly = Number(budget.monthlyTokens) || 0
    if (perArticle < 0 || monthly < 0) throw Object.assign(new Error('预算不能为负'), { status: 400 })
    next.budget = { perArticleTokens: perArticle, monthlyTokens: monthly }
  }

  if (patch.deploy !== undefined) {
    const deploy = patch.deploy || {}
    next.deploy = {
      ...(current.deploy || {}),
      ...(deploy.dir !== undefined ? { dir: String(deploy.dir || 'docs') } : {}),
      ...(deploy.branch !== undefined ? { branch: String(deploy.branch || 'main') } : {}),
      ...(deploy.autoPush !== undefined ? { autoPush: Boolean(deploy.autoPush) } : {}),
    }
  }

  await mkdir(root, { recursive: true })
  const file = join(root, 'site.json')
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  await rename(tmp, file)
  return normalizeSite(next)
}
