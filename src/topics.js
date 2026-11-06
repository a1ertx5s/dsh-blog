// 选题提案：基于栏目、历史与关键词生成候选，去重后建 job。
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { listArticles } from './article.js'
import { createJob } from './jobs.js'
import { callModel } from './llm.js'

function parseJson(text) {
  const match = /{[\s\S]*}/.exec(String(text))
  if (!match) throw Object.assign(new Error('模型没有返回 JSON'), { code: 'BAD_TOPICS' })
  return JSON.parse(match[0])
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[\s\p{P}]+/gu, '')
}

function bigrams(value) {
  const clean = normalize(value)
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

async function readEditorial(root) {
  try {
    return await readFile(join(root, 'editorial.md'), 'utf8')
  } catch {
    return ''
  }
}

export async function proposeTopics(ctx, {
  root,
  count = 6,
  keywords = [],
  call = callModel,
} = {}) {
  const limit = Math.min(10, Math.max(3, Number(count) || 6))
  const posts = await listArticles(root)
  const history = posts.slice(0, 40).map((post) => `- ${post.title}`).join('\n')
  const editorial = await readEditorial(root)
  const keywordText = Array.isArray(keywords) ? keywords.join('、') : String(keywords || '')

  const result = await call(ctx, {
    system: `你是中文长文博客的选题编辑。给出可写成 2000–4000 字、有观点、有事实支撑的选题。
只输出 JSON：{"topics":[{"title":"...","angle":"一句话角度","reason":"为什么值得写","keywords":["..."]}]}`,
    user: `栏目/关键词：${keywordText || '不限，按作者手册'}\n\n作者手册：\n${editorial.slice(0, 2000)}\n\n历史文章：\n${history || '（无）'}\n\n请给 ${limit} 个选题。`,
    maxTokens: 1600,
  })

  const data = parseJson(result.text)
  const rows = Array.isArray(data.topics) ? data.topics : []
  const existing = posts.map((post) => bigrams(post.title))
  const seen = []

  const topics = []
  for (const row of rows) {
    const title = String(row?.title || '').trim()
    if (!title) continue
    const titleBigrams = bigrams(title)
    if (existing.some((set) => similarity(titleBigrams, set) >= 0.6)) continue
    if (seen.some((set) => similarity(titleBigrams, set) >= 0.6)) continue
    seen.push(titleBigrams)
    topics.push({
      title,
      angle: String(row.angle || '').trim(),
      reason: String(row.reason || '').trim(),
      keywords: Array.isArray(row.keywords) ? row.keywords.map(String).slice(0, 6) : [],
    })
    if (topics.length >= limit) break
  }

  return { topics }
}

export async function createJobsFromTopics(root, topics = []) {
  const rows = Array.isArray(topics) ? topics.slice(0, 10) : []
  const jobs = []
  for (const topic of rows) {
    const title = String(topic?.title || '').trim()
    if (!title) continue
    jobs.push(await createJob(root, {
      title,
      brief: String(topic.angle || topic.reason || title).trim(),
    }))
  }
  return { jobs }
}
