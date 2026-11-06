// 修改提案：解析、落盘、接受/放弃。
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readArticle, stringifyArticle, writeArticle } from './article.js'
import { writeVersion } from './draft.js'

const ID = /^p-[a-f0-9-]{36}$/

function proposalsDir(root) {
  return join(root, '.blog', 'proposals')
}

function proposalPath(root, id) {
  return join(proposalsDir(root), `${id}.json`)
}

async function writeProposal(root, proposal) {
  await mkdir(proposalsDir(root), { recursive: true })
  const file = proposalPath(root, proposal.id)
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, `${JSON.stringify(proposal, null, 2)}\n`, 'utf8')
  await rename(tmp, file)
  return proposal
}

export function parseProposal(text) {
  const raw = String(text || '')
  const match = /\{[\s\S]*\}/.exec(raw)
  if (match) {
    try {
      const data = JSON.parse(match[0])
      if (data?.proposal && typeof data.proposal.before === 'string' && typeof data.proposal.after === 'string') {
        return {
          reply: String(data.reply || '').trim(),
          proposal: {
            target: data.proposal.target && typeof data.proposal.target === 'object' ? data.proposal.target : {},
            before: data.proposal.before,
            after: data.proposal.after,
          },
        }
      }
    } catch {
      // 不是提案 JSON，按纯文本处理
    }
  }
  return { reply: raw, proposal: null }
}

export async function createProposal(root, {
  sessionId = null,
  slug = '',
  target = {},
  before = '',
  after = '',
} = {}) {
  if (!before || !after) throw Object.assign(new Error('提案缺少 before/after'), { status: 400 })
  const at = new Date().toISOString()
  return writeProposal(root, {
    schemaVersion: 1,
    id: `p-${randomUUID()}`,
    sessionId,
    slug,
    target,
    before,
    after,
    status: 'pending',
    createdAt: at,
    resolvedAt: null,
  })
}

export async function readProposal(root, id) {
  if (!ID.test(String(id))) return null
  try {
    return JSON.parse(await readFile(proposalPath(root, id), 'utf8'))
  } catch {
    return null
  }
}

async function updateStatus(root, proposal, status) {
  return writeProposal(root, { ...proposal, status, resolvedAt: new Date().toISOString() })
}

export async function applyProposal(root, id, { version } = {}) {
  const proposal = await readProposal(root, id)
  if (!proposal) throw Object.assign(new Error('提案不存在'), { status: 404 })
  if (proposal.status !== 'pending') throw Object.assign(new Error('提案已处理'), { status: 409 })

  const article = await readArticle(root, proposal.slug)
  if (!article) throw Object.assign(new Error('文章不存在'), { status: 404 })

  const index = article.body.indexOf(proposal.before)
  if (index < 0) {
    await updateStatus(root, proposal, 'stale')
    throw Object.assign(new Error('原文已变化，提案过期'), { status: 409 })
  }

  const body = `${article.body.slice(0, index)}${proposal.after}${article.body.slice(index + proposal.before.length)}`
  const saved = await writeArticle(root, proposal.slug, {
    data: article.data,
    body,
    version,
  })
  await writeVersion(root, proposal.slug, stringifyArticle({ data: article.data, body }))
  const accepted = await updateStatus(root, proposal, 'accepted')
  return { article: saved, proposal: accepted }
}

export async function rejectProposal(root, id) {
  const proposal = await readProposal(root, id)
  if (!proposal) throw Object.assign(new Error('提案不存在'), { status: 404 })
  if (proposal.status !== 'pending') return proposal
  return updateStatus(root, proposal, 'rejected')
}
