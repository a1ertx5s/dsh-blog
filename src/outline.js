// outline 阶段：把 brief + 来源压成可执行的大纲，强制结构校验。
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { callModel } from './llm.js'
import { languageInstruction, siteLanguage } from './language.js'

export class OutlineError extends Error {
  constructor(message, { code = 'OUTLINE_ERROR' } = {}) {
    super(message)
    this.name = 'OutlineError'
    this.code = code
  }
}

const MIN_SECTIONS = 4
const MAX_SECTIONS = 8

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function normalizeOutline(data) {
  const title = text(data?.title, 80)
  if (!title) throw new OutlineError('大纲缺少标题', { code: 'BAD_TITLE' })

  const description = text(data?.description, 200)
  const tags = Array.isArray(data?.tags)
    ? data.tags.map((tag) => text(tag, 20)).filter(Boolean).slice(0, 8)
    : []

  const sections = (Array.isArray(data?.sections) ? data.sections : [])
    .map((section) => ({
      heading: text(section?.heading, 60),
      points: Array.isArray(section?.points)
        ? section.points.map((point) => text(point, 120)).filter(Boolean).slice(0, 6)
        : [],
    }))
    .filter((section) => section.heading)
    .slice(0, MAX_SECTIONS)

  if (sections.length < MIN_SECTIONS) {
    throw new OutlineError(`大纲至少需要 ${MIN_SECTIONS} 个小节，现在只有 ${sections.length} 个`, { code: 'TOO_FEW_SECTIONS' })
  }

  const words = Number(data?.targetWords)
  const targetWords = Number.isFinite(words) ? Math.max(800, Math.min(4000, Math.round(words))) : 2000

  return { title, description, tags, sections, targetWords }
}

export function parseOutline(text) {
  const match = /{[\s\S]*}/.exec(String(text))
  if (!match) throw new OutlineError('模型没有返回 JSON', { code: 'BAD_JSON' })
  let data
  try {
    data = JSON.parse(match[0])
  } catch {
    throw new OutlineError('大纲 JSON 解析失败', { code: 'BAD_JSON' })
  }
  return normalizeOutline(data)
}

export function outlinePrompt(job, sources = []) {
  const sourceText = sources.slice(0, 5).map((source, index) => {
    const excerpt = source.excerpt || source.snippet || ''
    const label = source.title ? `${source.title} (${source.url})` : source.url
    return `[${index + 1}] ${label}${excerpt ? ` — ${String(excerpt).slice(0, 200)}` : ''}`
  }).join('\n') || '（没有来源，按 brief 写）'

  return {
    system: `你是资深长文编辑。根据 brief 和来源，给出可执行的大纲。
只输出一个 JSON 对象，不要解释：
{"title":"标题，具体、有钩子，不超过 40 字","description":"摘要，50–160 字","tags":["标签1","标签2"],"sections":[{"heading":"小标题","points":["本节要讲的 2–4 个要点"]}],"targetWords":2000}
要求：
- sections 4 到 8 个，按逻辑递进，不要空洞的“总结”“结语”
- 每个 points 2–4 条，写具体内容，不写“介绍背景”这种空话
- 有来源时，优先使用来源里的具体事实`,
    user: `brief：${job.brief || ''}\n标题候选：${job.title || '（未定）'}\n\n来源：\n${sourceText}`,
  }
}

async function writeJson(root, jobId, value) {
  const dir = join(root, '.blog', 'runs', jobId)
  await mkdir(dir, { recursive: true })
  const tmp = join(dir, `.outline.${process.pid}.${Date.now()}.tmp`)
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tmp, join(dir, 'outline.json'))
}

export async function outlineJob(ctx, { root, job, sources = [], call = callModel } = {}) {
  const prompt = outlinePrompt(job, sources)
  prompt.system += `\n${languageInstruction(await siteLanguage(root))}`
  let lastError = null

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await call(ctx, { ...prompt, maxTokens: 900 })
    try {
      const outline = parseOutline(result.text)
      const payload = { schemaVersion: 1, jobId: job.id, outline, attempts: attempt, at: new Date().toISOString() }
      await writeJson(root, job.id, payload)
      return payload
    } catch (err) {
      lastError = err
      if (!(err instanceof OutlineError)) throw err
    }
  }

  throw lastError ?? new OutlineError('大纲生成失败')
}
