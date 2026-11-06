// draft 阶段：按大纲逐节写，拼装成完整 Markdown，落文章与版本。
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { stringifyArticle, listArticles, slugify, uniqueSlug, writeArticle } from './article.js'
import { callModel } from './llm.js'

export class DraftError extends Error {
  constructor(message, { code = 'DRAFT_ERROR' } = {}) {
    super(message)
    this.name = 'DraftError'
    this.code = code
  }
}

export function countWords(text) {
  const value = String(text ?? '')
  const cjk = (value.match(/[\u4e00-\u9fff]/g) || []).length
  const words = (value.match(/[A-Za-z0-9]+/g) || []).length
  return cjk + words
}

export function cleanSection(text, heading) {
  let value = String(text ?? '').trim()
  const pattern = new RegExp(`^#{1,3}\\s*${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n+`)
  value = value.replace(pattern, '')
  return value.trim()
}

export function sectionPrompt({ outline, section, index, sources = [], editorial = '', writtenTail = '' }) {
  const points = section.points?.length ? section.points.map((point) => `- ${point}`).join('\n') : '（按小节标题自由展开）'
  const sourceText = sources.slice(0, 5).map((source, sourceIndex) => {
    const excerpt = source.excerpt || source.snippet || ''
    return `[${sourceIndex + 1}] ${source.title || ''} ${source.url}${excerpt ? `\n${String(excerpt).slice(0, 400)}` : ''}`
  }).join('\n\n') || '（没有来源；不要编造具体数字、人名或引用）'

  const system = `你是资深技术作者，正在写一篇长文的其中一节。
只输出这一节的正文 Markdown，不要重复小节标题，不要写其它小节，不要写“总结”套话。
引用来源时在句末标 [n]，n 对应下面来源的编号；没有来源就不要标。
${editorial ? `\n作者手册：\n${editorial.slice(0, 4000)}` : ''}`

  const user = `全篇标题：${outline.title}
全篇摘要：${outline.description || ''}
全篇目标字数：${outline.targetWords || 2000}
本节是第 ${index + 1}/${outline.sections.length} 节：## ${section.heading}
本节要点：
${points}

${writtenTail ? `上一节结尾（只用于衔接，不要重复）：\n${writtenTail.slice(-600)}\n` : ''}
可用来源：
${sourceText}`

  return { system, user }
}

export function assembleDraft(outline, sections, sources = []) {
  const parts = sections.map((section) => {
    const body = String(section.text || '').trim()
    return `## ${section.heading}\n\n${body}`.trim()
  })

  if (sources.length) {
    const refs = sources.map((source, index) => {
      const label = source.title || source.url
      return `${index + 1}. [${label}](${source.url})`
    })
    parts.push(`## 参考\n\n${refs.join('\n')}`)
  }

  return `${parts.join('\n\n')}\n`
}

async function readEditorial(root) {
  try {
    return await readFile(join(root, 'editorial.md'), 'utf8')
  } catch {
    return ''
  }
}

async function pickSlug(root, job, outline) {
  if (job.slug) return job.slug
  const existing = await listArticles(root)
  const base = slugify(outline.title) || 'post'
  return uniqueSlug(base, existing.map((post) => post.slug))
}

export async function writeVersion(root, slug, text) {
  const dir = join(root, '.blog', 'versions', slug)
  await mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  await writeFile(join(dir, `${stamp}.md`), text, 'utf8')
}

export async function draftJob(ctx, {
  root,
  job,
  outline,
  sources = [],
  call = callModel,
  onSection,
  slug,
} = {}) {
  if (!outline?.sections?.length) throw new DraftError('缺少大纲，不能开始写')
  const editorial = await readEditorial(root)
  const written = []
  const sections = []

  for (const [index, section] of outline.sections.entries()) {
    const prompt = sectionPrompt({
      outline,
      section,
      index,
      sources,
      editorial,
      writtenTail: written.length ? written[written.length - 1] : '',
    })
    const result = await call(ctx, { ...prompt, maxTokens: 2400 })
    const text = cleanSection(result.text, section.heading)
    if (!text) throw new DraftError(`第 ${index + 1} 节没有产出内容`, { code: 'EMPTY_SECTION' })
    sections.push({ heading: section.heading, text })
    written.push(text)
    onSection?.(index, text)
  }

  const body = assembleDraft(outline, sections, sources)
  const finalSlug = slug || await pickSlug(root, job, outline)
  const data = {
    title: outline.title,
    slug: finalSlug,
    date: new Date().toISOString().slice(0, 10),
    status: 'draft',
    tags: outline.tags || [],
    description: outline.description || '',
    cover: '',
  }

  const article = await writeArticle(root, finalSlug, { data, body })
  await writeVersion(root, finalSlug, stringifyArticle({ data, body }))

  return {
    article,
    slug: finalSlug,
    body,
    words: countWords(body),
    targetWords: outline.targetWords || 2000,
    short: countWords(body) < (outline.targetWords || 2000) * 0.6,
  }
}
