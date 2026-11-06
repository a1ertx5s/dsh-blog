import test from 'node:test'
import assert from 'node:assert/strict'
import { modelInfo, probeModel, probeWeb, serviceStatus } from '../src/probe.js'

const fakeCtx = (services) => ({ get: (key) => services[key] })

test('modelInfo reads the current selection and llm service', () => {
  const ctx = fakeCtx({
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: { prepareCall() {} },
  })
  assert.deepEqual(modelInfo(ctx), { provider: 'p', model: 'm', label: 'm' })
})

test('modelInfo is null without a selection or llm', () => {
  assert.equal(modelInfo(fakeCtx({})), null)
  assert.equal(modelInfo(fakeCtx({ agentDefaultModel: { currentSelection: () => ({}) }, llm: {} })), null)
})

test('serviceStatus reports availability without calling anything', () => {
  const status = serviceStatus(fakeCtx({
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: { prepareCall() {} },
    web: { search() {}, fetch() {} },
  }))
  assert.deepEqual(status, { model: { provider: 'p', model: 'm' }, llm: true, web: true })

  assert.deepEqual(serviceStatus(fakeCtx({})), { model: null, llm: false, web: false })
})

test('probeModel degrades without a model', async () => {
  const result = await probeModel(fakeCtx({}))
  assert.equal(result.ok, false)
  assert.match(result.error, /模型/)
})

test('probeModel streams text through prepareCall with a session id', async () => {
  let seen = null
  const ctx = fakeCtx({
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: {
      async prepareCall() {
        return {
          config: {},
          async *stream(options) {
            seen = options
            yield { type: 'text-delta', text: 'OK' }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
        }
      },
    },
  })
  const result = await probeModel(ctx)
  assert.equal(result.ok, true)
  assert.equal(result.model, 'm')
  assert.equal(result.provider, 'p')
  assert.equal(result.text, 'OK')
  assert.equal(result.finish, 'stop')
  assert.equal(typeof seen.sessionId, 'string')
  assert.ok(seen.sessionId.length > 10)
})

test('probeModel reports empty text with the finish reason', async () => {
  const ctx = fakeCtx({
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: {
      async prepareCall() {
        return {
          config: {},
          async *stream() {
            yield { type: 'finish', reason: { kind: 'max-tokens' } }
          },
        }
      },
    },
  })
  const result = await probeModel(ctx)
  assert.equal(result.ok, false)
  assert.match(result.error, /空文本/)
  assert.match(result.error, /max-tokens/)
})

test('probeWeb degrades without the web service', async () => {
  const result = await probeWeb(fakeCtx({}))
  assert.equal(result.ok, false)
  assert.match(result.error, /web/)
})

test('probeWeb failure points at the DSH web search settings', async () => {
  const ctx = fakeCtx({
    web: {
      async search() { throw new Error('401 Authentication Fails') },
      fetch() {},
    },
  })
  const result = await probeWeb(ctx)
  assert.equal(result.ok, false)
  assert.match(result.error, /401/)
  assert.match(result.hint, /Web search/)
})

test('probeWeb summarizes sources', async () => {
  const ctx = fakeCtx({
    web: {
      async search() {
        return {
          sources: [
            { url: 'https://a.example', title: 'A' },
            { url: 'https://b.example' },
          ],
          truncated: false,
        }
      },
      fetch() {},
    },
  })
  const result = await probeWeb(ctx)
  assert.equal(result.ok, true)
  assert.equal(result.count, 2)
  assert.deepEqual(result.sample, [
    { title: 'A', url: 'https://a.example' },
    { title: '', url: 'https://b.example' },
  ])
})
