import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchWeb, searchWeb } from '../src/search.js'

function ctxWith({ agents, web }) {
  return { get: (key) => (key === 'agents' ? agents : key === 'web' ? web : undefined) }
}

const accountAgent = {
  session: { requestContext: () => ({ provider: 'deepseek-account' }) },
}

test('searchWeb runs inside a deepseek-account initiator boundary', async () => {
  let used = false
  const agents = {
    list: () => [accountAgent],
    withInitiator(agent, operation) {
      used = true
      assert.equal(agent, accountAgent)
      return operation()
    },
  }
  const web = { search: async (request) => ({ query: request.query }) }

  const result = await searchWeb(ctxWith({ agents, web }), { query: 'q' })
  assert.equal(used, true)
  assert.equal(result.query, 'q')
})

test('searchWeb falls back when no account session is live', async () => {
  const web = { search: async () => ({ sources: [] }) }
  const ctx = ctxWith({
    agents: { list: () => [{ session: { requestContext: () => ({ provider: 'other' }) } }], withInitiator() { throw new Error('should not run') } },
    web,
  })
  assert.deepEqual(await searchWeb(ctx, { query: 'q' }), { sources: [] })
})

test('fetchWeb also reuses the account boundary', async () => {
  let used = false
  const agents = {
    list: () => [accountAgent],
    withInitiator(agent, operation) { used = true; return operation() },
  }
  const web = { fetch: async (request) => ({ url: request.url }) }
  const result = await fetchWeb(ctxWith({ agents, web }), { url: 'https://a.example' })
  assert.equal(used, true)
  assert.equal(result.url, 'https://a.example')
})

test('searchWeb fails closed without the web service', () => {
  assert.throws(() => searchWeb(ctxWith({}), { query: 'q' }), /web/)
})
