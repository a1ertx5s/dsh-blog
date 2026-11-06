// AI 对话：会话持久化 + 消息调用。
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readArticle } from './article.js'
import { languageInstruction, siteLanguage } from './language.js'
import { callModel } from './llm.js'

const ID = /^chat-[a-f0-9-]{36}$/

function chatDir(root) {
  return join(root, '.blog', 'chat')
}

function sessionPath(root, id) {
  return join(chatDir(root), `${id}.json`)
}

export function isChatId(id) {
  return ID.test(String(id))
}

async function writeSession(root, session) {
  const dir = chatDir(root)
  await mkdir(dir, { recursive: true })
  const file = sessionPath(root, session.id)
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, `${JSON.stringify(session, null, 2)}\n`, 'utf8')
  await rename(tmp, file)
  return session
}

export async function createSession(root, { slug = '' } = {}) {
  const at = new Date().toISOString()
  return writeSession(root, {
    schemaVersion: 1,
    id: `chat-${randomUUID()}`,
    sessionId: randomUUID(),
    slug: String(slug || ''),
    title: '',
    messages: [],
    createdAt: at,
    updatedAt: at,
  })
}

export async function readSession(root, id) {
  if (!isChatId(id)) return null
  try {
    return JSON.parse(await readFile(sessionPath(root, id), 'utf8'))
  } catch {
    return null
  }
}

export async function listSessions(root, { slug } = {}) {
  let names
  try {
    names = await readdir(chatDir(root))
  } catch {
    return []
  }
  const rows = []
  for (const name of names.filter((entry) => ID.test(entry.replace(/\.json$/, '')))) {
    try {
      const session = JSON.parse(await readFile(join(chatDir(root), name), 'utf8'))
      if (slug !== undefined && session.slug !== slug) continue
      rows.push({
        id: session.id,
        slug: session.slug,
        title: session.title,
        updatedAt: session.updatedAt,
        messages: session.messages?.length || 0,
      })
    } catch {
      // 跳过损坏会话
    }
  }
  return rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

export async function deleteSession(root, id) {
  const session = await readSession(root, id)
  if (!session) return null
  const { rm } = await import('node:fs/promises')
  await rm(sessionPath(root, id), { force: true })
  return { ok: true, id }
}

async function contextFor(root, session, selection) {
  const article = session.slug ? await readArticle(root, session.slug) : null
  const headings = article ? (String(article.body).match(/^##\s+.+$/gm) || []).slice(0, 20).join('\n') : ''
  const recent = session.messages.slice(-10).map((message) => `${message.role}: ${message.content}`).join('\n')
  const lang = await siteLanguage(root)
  return {
    lang,
    user: [
      article ? `文章：${article.data.title}` : '（未绑定文章）',
      article?.data?.description ? `摘要：${article.data.description}` : '',
      headings ? `大纲：\n${headings}` : '',
      selection ? `选中文本：\n${String(selection).slice(0, 2000)}` : '',
      recent ? `最近对话：\n${recent}` : '',
      `用户：${session.pending}`,
    ].filter(Boolean).join('\n\n'),
  }
}

export async function sendMessage(ctx, {
  root,
  id,
  content,
  selection = '',
  call = callModel,
} = {}) {
  const text = String(content ?? '').trim()
  if (!text) throw Object.assign(new Error('消息不能为空'), { status: 400 })
  const session = await readSession(root, id)
  if (!session) throw Object.assign(new Error('会话不存在'), { status: 404 })

  const at = new Date().toISOString()
  session.messages.push({ role: 'user', content: text, at })
  session.pending = text
  session.updatedAt = at

  const context = await contextFor(root, session, selection)
  let reply
  try {
    const result = await call(ctx, {
      system: `你是博客写作助手。基于文章上下文回答问题、给修改建议。
不要直接声称已经修改文件；给出建议或改写文本即可。
${languageInstruction(context.lang)}`,
      user: context.user,
      maxTokens: 1200,
      sessionId: session.sessionId,
    })
    reply = String(result.text || '').trim()
  } catch (err) {
    session.messages.push({
      role: 'assistant',
      content: `（模型调用失败：${err.message}）`,
      at: new Date().toISOString(),
      error: true,
    })
    delete session.pending
    await writeSession(root, session)
    return { session }
  }

  if (!reply) reply = '（没有返回内容）'
  session.messages.push({ role: 'assistant', content: reply, at: new Date().toISOString() })
  delete session.pending
  session.updatedAt = new Date().toISOString()
  await writeSession(root, session)
  return { session }
}
