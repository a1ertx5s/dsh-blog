// research 阶段：生成检索词、搜索、抓取摘录，落 sources.json。
import { lookup } from 'node:dns/promises'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import { join } from 'node:path'
import { callModel } from './llm.js'

export class ResearchError extends Error {
  constructor(message, { code = 'RESEARCH_ERROR' } = {}) {
    super(message)
    this.name = 'ResearchError'
    this.code = code
  }
}

const MAX_EXCERPT = 1200

function isPrivateAddress(address) {
  if (address === '::1' || address === '::') return true
  const lower = address.toLowerCase()
  if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true
  let v4 = lower.startsWith('::ffff:') ? lower.slice(7) : lower
  const mapped = /^([\da-f]{1,4}):([\da-f]{1,4})$/.exec(v4)
  if (mapped) {
    const high = parseInt(mapped[1], 16)
    const low = parseInt(mapped[2], 16)
    v4 = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
  }
  if (isIP(v4) !== 4) return false
  const [a, b] = v4.split('.').map(Number)
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
}

/** 搜索结果里可能夹带内网地址；抓取前先挡掉。 */
export async function assertPublicUrl(raw) {
  const url = new URL(raw)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ResearchError('只支持 http/https 链接', { code: 'BAD_URL' })
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new ResearchError('不能抓取本机地址', { code: 'SSRF' })
  }
  const records = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  if (records.some((record) => isPrivateAddress(record.address))) {
    throw new ResearchError('不能抓取内网地址', { code: 'SSRF' })
  }
  return url
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function stripHtml(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (all, name) => ENTITIES[name.toLowerCase()] ?? all)
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function uniqueQueries(list) {
  const seen = new Set()
  const out = []
  for (const item of list) {
    const query = String(item ?? '').trim()
    if (!query || seen.has(query)) continue
    seen.add(query)
    out.push(query.slice(0, 80))
  }
  return out
}

export function fallbackQueries(job) {
  const title = String(job.title || '').trim()
  const brief = String(job.brief || '').trim()
  const base = title || brief.split(/[。！？\n]/)[0] || '技术博客'
  return uniqueQueries([base, `${base} 教程`, `${base} 实践`]).slice(0, 3)
}

export function parseQueries(text) {
  const match = /{[\s\S]*}/.exec(String(text))
  if (!match) return []
  try {
    const data = JSON.parse(match[0])
    return uniqueQueries(Array.isArray(data.queries) ? data.queries : []).slice(0, 3)
  } catch {
    return []
  }
}

export async function buildQueries(ctx, job, { call = callModel } = {}) {
  try {
    const result = await call(ctx, {
      system: '你是内容研究员。根据主题给出 3 个互补的中文检索词，只输出 JSON：{"queries":["...","...","..."]}',
      user: `主题：${job.title || '（未定）'}\nbrief：${job.brief || ''}`,
      maxTokens: 300,
    })
    const queries = parseQueries(result.text)
    if (queries.length) return queries
  } catch {
    // 模型不可用时退回规则检索词。
  }
  return fallbackQueries(job)
}

export async function searchSources(ctx, queries, { maxSources = 6, perQuery = 4, signal } = {}) {
  const web = ctx.get('web')
  if (typeof web?.search !== 'function') {
    throw new ResearchError('web 服务不可用', { code: 'WEB_UNAVAILABLE' })
  }

  const sources = []
  const errors = []
  const seen = new Set()

  for (const query of queries) {
    try {
      const result = await web.search({ query, maxResults: perQuery }, signal)
      for (const source of result?.sources ?? []) {
        if (sources.length >= maxSources) break
        if (!source?.url || seen.has(source.url)) continue
        seen.add(source.url)
        sources.push({
          url: source.url,
          title: source.title ?? '',
          snippet: source.snippet ?? '',
        })
      }
    } catch (err) {
      errors.push({ query, error: err?.message || '搜索失败' })
    }
  }

  return { sources, errors }
}

export async function enrichSources(ctx, sources, { max = 3, signal } = {}) {
  const web = ctx.get('web')
  if (typeof web?.fetch !== 'function') return sources

  for (const source of sources.slice(0, max)) {
    try {
      await assertPublicUrl(source.url)
      const result = await web.fetch({ url: source.url }, signal)
      if (result?.statusCode >= 200 && result.statusCode < 300) {
        const content = result.body?.content ?? ''
        const text = result.body?.kind === 'html' ? stripHtml(content) : String(content)
        source.excerpt = text.slice(0, MAX_EXCERPT)
      }
    } catch (err) {
      source.fetchError = err?.message || '抓取失败'
    }
  }

  return sources
}

async function writeJson(root, jobId, name, value) {
  const dir = join(root, '.blog', 'runs', jobId)
  await mkdir(dir, { recursive: true })
  const tmp = join(dir, `.${name}.${process.pid}.${Date.now()}.tmp`)
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tmp, join(dir, name))
}

export async function researchJob(ctx, { root, job, call, enrich = true, signal } = {}) {
  const queries = await buildQueries(ctx, job, { call })
  let sources = []
  let errors = []

  try {
    const found = await searchSources(ctx, queries, { signal })
    sources = found.sources
    errors = found.errors
    if (enrich) await enrichSources(ctx, sources, { signal })
  } catch (err) {
    errors = [{ query: null, error: err?.message || '搜索失败' }]
  }

  const payload = {
    schemaVersion: 1,
    jobId: job.id,
    title: job.title || '',
    brief: job.brief || '',
    queries,
    sources,
    errors,
    degraded: sources.length === 0,
    at: new Date().toISOString(),
  }

  await writeJson(root, job.id, 'sources.json', payload)
  return payload
}
