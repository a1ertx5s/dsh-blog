// revise 阶段：按打回意见生成新版本，保留旧版本并重跑门禁。
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { stringifyArticle, writeArticle } from './article.js'
import { writeVersion } from './draft.js'
import { runGates } from './gates.js'
import { callModel } from './llm.js'
import { languageInstruction, siteLanguage } from './language.js'

export class ReviseError extends Error {
  constructor(message, { code = 'REVISE_ERROR' } = {}) {
    super(message)
    this.name = 'ReviseError'
    this.code = code
  }
}

function stripFence(text) {
  let value = String(text ?? '').trim()
  const fenced = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i.exec(value)
  if (fenced) value = fenced[1]
  return value.trim()
}

async function readEditorial(root) {
  try {
    return await readFile(join(root, 'editorial.md'), 'utf8')
  } catch {
    return ''
  }
}

export async function reviseJob(ctx, {
  root,
  job,
  article,
  outline,
  sources = [],
  comment,
  call = callModel,
  gatesRunner = runGates,
} = {}) {
  const note = String(comment ?? '').trim()
  if (!note) throw new ReviseError('打回意见不能为空')
  if (!article?.body || !article?.data?.slug) throw new ReviseError('缺少可修改的稿件')

  const editorial = await readEditorial(root)
  const outlineText = outline?.sections?.length
    ? outline.sections.map((section) => `- ${section.heading}`).join('\n')
    : '（没有大纲，按原稿结构）'

  const result = await call(ctx, {
    system: `你是资深编辑。根据打回意见修改这篇长文。
只输出修改后的完整 Markdown 正文，不要输出解释、不要包代码块。
保留原有小节标题（除非意见要求调整），不要删掉有来源支撑的事实。
${languageInstruction(await siteLanguage(root))}`,
    user: `打回意见：\n${note}\n\n大纲：\n${outlineText}\n\n作者手册：\n${editorial.slice(0, 3000)}\n\n原稿：\n${article.body}`,
    maxTokens: 5000,
  })

  const body = stripFence(result.text)
  if (!body) throw new ReviseError('修改后没有正文', { code: 'EMPTY_REVISION' })

  const data = { ...article.data, status: 'draft' }
  const updated = await writeArticle(root, article.data.slug, {
    data,
    body,
    version: article.version,
  })
  await writeVersion(root, updated.slug, stringifyArticle({ data, body }))

  const gates = await gatesRunner(ctx, {
    root,
    job,
    article: updated,
    sources,
    editorial,
    call,
  })

  return { article: updated, gates, comment: note }
}
