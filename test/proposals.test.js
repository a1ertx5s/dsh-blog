import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readArticle, writeArticle } from '../src/article.js'
import {
  applyProposal,
  createProposal,
  parseProposal,
  readProposal,
  rejectProposal,
} from '../src/proposals.js'

test('parseProposal accepts JSON and falls back to text', () => {
  const json = parseProposal('{"reply":"改好了","proposal":{"before":"原文","after":"新文"}}')
  assert.equal(json.reply, '改好了')
  assert.equal(json.proposal.after, '新文')
  assert.equal(parseProposal('只是建议').proposal, null)
  assert.equal(parseProposal('```json\n{"reply":"x"}\n```').proposal, null)
})

test('applyProposal replaces the matched text and keeps a version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-proposal-'))
  try {
    const article = await writeArticle(root, 'p', {
      data: { title: 'P', slug: 'p', status: 'draft', description: '' },
      body: '开头\n\n原文段落\n',
    })
    const proposal = await createProposal(root, { slug: 'p', before: '原文段落', after: '改写段落' })
    const result = await applyProposal(root, proposal.id, { version: article.version })
    assert.match(result.article.body, /改写段落/)
    assert.equal(result.proposal.status, 'accepted')
    assert.equal((await readArticle(root, 'p')).body.includes('原文段落'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('applyProposal marks stale when the original text is gone', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-proposal-'))
  try {
    await writeArticle(root, 'p', {
      data: { title: 'P', slug: 'p', status: 'draft', description: '' },
      body: '完全不同的内容\n',
    })
    const proposal = await createProposal(root, { slug: 'p', before: '原文段落', after: '改写' })
    await assert.rejects(applyProposal(root, proposal.id, {}), /过期/)
    assert.equal((await readProposal(root, proposal.id)).status, 'stale')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejectProposal leaves the article unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-proposal-'))
  try {
    await writeArticle(root, 'p', {
      data: { title: 'P', slug: 'p', status: 'draft', description: '' },
      body: '原文\n',
    })
    const proposal = await createProposal(root, { slug: 'p', before: '原文', after: '新文' })
    const rejected = await rejectProposal(root, proposal.id)
    assert.equal(rejected.status, 'rejected')
    assert.match((await readArticle(root, 'p')).body, /原文/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
