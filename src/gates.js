// gates 阶段：引用对账、SEO、查重、风格、事实核查，输出 gates.json。
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { listArticles } from './article.js'
import { callModel } from './llm.js'

export function textLength(value) {
  return Array.from(String(value ?? '')).length
}

export function extractCitations(body) {
  return [...String(body).matchAll(/\[(\d{1,2})\]/g)].map((match) => Number(match[1]))
}

function parseJson(text) {
  const match = /{[\s\S]*}/.exec(String(text))
  if (!match) throw new Error('模型没有返回 JSON')
  return JSON.parse(match[0])
}

export function checkCitations(article, sources = []) {
  const body = String(article.body).split(/^## 参考/m)[0]
  const refs = extractCitations(body)
  const invalid = [...new Set(refs.filter((n) => n < 1 || n > sources.length))]
  const paragraphs = body.split(/\n{2,}/)
  const risky = paragraphs.filter((paragraph) => (
    /[0-9]/.test(paragraph)
    && !/\[\d+\]/.test(paragraph)
    && paragraph.length > 40
    && !paragraph.startsWith('##')
  ))
  return {
    id: 'citations',
    ok: invalid.length === 0 && risky.length <= 3,
    detail: {
      refs: [...new Set(refs)].sort((a, b) => a - b),
      invalid,
      uncitedParagraphs: risky.length,
    },
  }
}

export function checkSeo(article) {
  const data = article.data || {}
  const titleLength = textLength(data.title)
  const descriptionLength = textLength(data.description)
  const images = [...String(article.body || '').matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)]
  const missingAlt = images.filter((match) => !match[1].trim()).length

  const rules = [
    { name: 'title', ok: titleLength >= 10 && titleLength <= 60, detail: `${titleLength} 字` },
    { name: 'description', ok: descriptionLength >= 50 && descriptionLength <= 160, detail: `${descriptionLength} 字` },
    { name: 'slug', ok: /^[\p{Letter}\p{Number}_-]+$/u.test(String(data.slug || '')), detail: data.slug || '' },
    { name: 'imageAlt', ok: missingAlt === 0, detail: `${images.length} 张图，缺 alt ${missingAlt}` },
  ]

  return {
    id: 'seo',
    ok: rules.every((rule) => rule.ok),
    detail: rules,
  }
}

function bigrams(text) {
  const clean = String(text).toLowerCase().replace(/\s+/g, '')
  const set = new Set()
  for (let index = 0; index < clean.length - 1; index += 1) set.add(clean.slice(index, index + 2))
  return set
}

function similarity(a, b) {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const token of a) if (b.has(token)) shared += 1
  return shared / (a.size + b.size - shared)
}

export async function checkDedupe(root, article) {
  const current = bigrams(`${article.data?.title || ''}${article.data?.description || ''}`)
  const others = (await listArticles(root)).filter((post) => post.slug !== article.data?.slug)
  let max = 0
  let closest = null
  for (const post of others) {
    const score = similarity(current, bigrams(`${post.title}${post.description}`))
    if (score > max) {
      max = score
      closest = post
    }
  }
  return {
    id: 'duplicate',
    ok: max < 0.7,
    detail: { similarity: Number(max.toFixed(2)), closest: closest ? closest.slug : null },
  }
}

export async function checkStyle(ctx, article, editorial = '', call = callModel) {
  try {
    const result = await call(ctx, {
      system: `你是严格的文字编辑。按作者手册给这篇稿子打分，只输出 JSON：{"score":1-5,"issues":["..."]}。5 分是可直接发布。`,
      user: `作者手册：\n${editorial.slice(0, 3000)}\n\n正文：\n${String(article.body).slice(0, 6000)}`,
      maxTokens: 400,
    })
    const data = parseJson(result.text)
    const score = Number(data.score)
    return {
      id: 'style',
      ok: Number.isFinite(score) && score >= 3.5,
      detail: { score: Number.isFinite(score) ? score : null, issues: Array.isArray(data.issues) ? data.issues.slice(0, 5) : [] },
    }
  } catch (err) {
    return { id: 'style', ok: true, skipped: true, detail: err.message }
  }
}

export async function checkFacts(ctx, article, sources = [], call = callModel) {
  if (!sources.length) {
    return { id: 'facts', ok: true, skipped: true, detail: '没有来源，跳过事实核查' }
  }

  const claims = String(article.body)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph && !paragraph.startsWith('##') && (/\d/.test(paragraph) || /\[\d+\]/.test(paragraph)))
    .slice(0, 8)

  if (!claims.length) {
    return { id: 'facts', ok: true, skipped: true, detail: '没有可核查的事实句' }
  }

  try {
    const sourceText = sources.slice(0, 6)
      .map((source, index) => `[${index + 1}] ${source.title || ''} ${source.url}\n${String(source.excerpt || source.snippet || '').slice(0, 500)}`)
      .join('\n\n')
    const result = await call(ctx, {
      system: '你是事实核查员。逐条判断文稿中的事实句是否被来源支持，只输出 JSON：{"claims":[{"text":"...","support":"supported|unsupported|unsourced"}]}',
      user: `来源：\n${sourceText}\n\n待核查句子：\n${claims.map((claim, index) => `${index + 1}. ${claim}`).join('\n')}`,
      maxTokens: 800,
    })
    const data = parseJson(result.text)
    const rows = Array.isArray(data.claims) ? data.claims : []
    const unsupported = rows.filter((row) => row.support === 'unsupported')
    return {
      id: 'facts',
      ok: unsupported.length <= 2,
      detail: {
        checked: rows.length,
        unsupported: unsupported.slice(0, 5).map((row) => String(row.text || '').slice(0, 80)),
      },
    }
  } catch (err) {
    return { id: 'facts', ok: true, skipped: true, detail: err.message }
  }
}

async function writeGates(root, jobId, value) {
  const dir = join(root, '.blog', 'runs', jobId)
  await mkdir(dir, { recursive: true })
  const tmp = join(dir, `.gates.${process.pid}.${Date.now()}.tmp`)
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tmp, join(dir, 'gates.json'))
}

export async function runGates(ctx, {
  root,
  job,
  article,
  sources = [],
  editorial = '',
  call = callModel,
} = {}) {
  if (!article?.body || !article?.data) throw Object.assign(new Error('缺少稿件'), { status: 400 })

  const checks = [
    checkCitations(article, sources),
    checkSeo(article),
    await checkDedupe(root, article),
    await checkStyle(ctx, article, editorial, call),
    await checkFacts(ctx, article, sources, call),
  ]

  const passed = checks.every((check) => check.ok || check.skipped)
  const payload = {
    schemaVersion: 1,
    jobId: job?.id ?? null,
    slug: article.data.slug ?? null,
    passed,
    checks,
    at: new Date().toISOString(),
  }

  if (job?.id) await writeGates(root, job.id, payload)
  return payload
}
