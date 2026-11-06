import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeArticle } from '../src/article.js'
import { createSession, deleteSession, listSessions, readSession, sendMessage } from '../src/chat.js'

test('chat sessions persist and list by slug', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-chat-'))
  try {
    const a = await createSession(root, { slug: 'a' })
    await createSession(root, { slug: 'b' })
    assert.equal((await listSessions(root, { slug: 'a' })).length, 1)
    assert.equal((await listSessions(root)).length, 2)
    assert.equal((await readSession(root, a.id)).slug, 'a')
    assert.equal(await readSession(root, 'chat-nope'), null)
    await deleteSession(root, a.id)
    assert.equal(await readSession(root, a.id), null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('sendMessage appends user and assistant messages with context', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-chat-'))
  try {
    await writeArticle(root, 'post', {
      data: { title: '标题', slug: 'post', status: 'draft', description: '摘要' },
      body: '## 第一节\n\n正文\n',
    })
    const session = await createSession(root, { slug: 'post' })
    let prompt = ''
    const result = await sendMessage({}, {
      root,
      id: session.id,
      content: '改得具体些',
      call: async (ctx, options) => {
        prompt = options.user
        return { text: '建议：补一个例子。' }
      },
    })
    assert.equal(result.session.messages.length, 2)
    assert.match(prompt, /标题/)
    assert.match(prompt, /第一节/)
    assert.equal(result.session.messages[1].role, 'assistant')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('sendMessage records a readable error when the model fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-chat-'))
  try {
    const session = await createSession(root, {})
    const result = await sendMessage({}, {
      root,
      id: session.id,
      content: 'hi',
      call: async () => { throw new Error('boom') },
    })
    assert.equal(result.session.messages.length, 2)
    assert.equal(result.session.messages[1].error, true)
    assert.match(result.session.messages[1].content, /boom/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
