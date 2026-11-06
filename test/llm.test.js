import test from 'node:test'
import assert from 'node:assert/strict'
import { callModel, LlmCallError, modelInfo, normalizeUsage, serviceStatus } from '../src/llm.js'

const fakeCtx = (services) => ({ get: (key) => services[key] })

const baseCtx = (stream, overrides = {}) => fakeCtx({
  agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
  llm: {
    async prepareCall() {
      return { config: {}, stream }
    },
  },
  ...overrides,
})

test('modelInfo reads the current selection and llm service', () => {
  const ctx = fakeCtx({
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: { prepareCall() {} },
  })
  assert.deepEqual(modelInfo(ctx), { provider: 'p', model: 'm', label: 'm' })
  assert.equal(modelInfo(fakeCtx({})), null)
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

test('normalizeUsage maps provider counters', () => {
  assert.deepEqual(normalizeUsage({ inputTokens: 10, outputTokens: 20 }), { input: 10, output: 20 })
  assert.deepEqual(normalizeUsage(null), { input: 0, output: 0 })
})

test('callModel streams text, usage and a stable session id', async () => {
  let seen = null
  const ctx = baseCtx(async function* stream(options) {
    seen = options
    yield { type: 'text-delta', text: 'OK' }
    yield { type: 'usage', usage: { inputTokens: 3, outputTokens: 2 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })

  const result = await callModel(ctx, { user: '只回复 OK', system: '你是助手' })
  assert.equal(result.text, 'OK')
  assert.deepEqual(result.usage, { input: 3, output: 2 })
  assert.equal(result.finish, 'stop')
  assert.equal(result.provider, 'p')
  assert.equal(typeof result.sessionId, 'string')
  assert.equal(seen.sessionId, result.sessionId)
  assert.equal(seen.system, '你是助手')
})

test('callModel rejects empty output', async () => {
  const ctx = baseCtx(async function* stream() {
    yield { type: 'finish', reason: { kind: 'max-tokens' } }
  })
  await assert.rejects(
    callModel(ctx, { user: 'x' }),
    (err) => err instanceof LlmCallError && err.code === 'EMPTY_RESPONSE',
  )
})

test('callModel surfaces provider failures', async () => {
  const ctx = baseCtx(async function* stream() {
    yield { type: 'finish', reason: { kind: 'error', failure: { message: 'boom', status: 400 } } }
  })
  await assert.rejects(
    callModel(ctx, { user: 'x', retries: 0 }),
    (err) => err.code === 'PROVIDER_ERROR' && err.status === 400,
  )
})

test('callModel retries once on a transient failure', async () => {
  let calls = 0
  const ctx = fakeCtx({
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: {
      async prepareCall() {
        calls += 1
        const current = calls
        return {
          config: {},
          async *stream() {
            if (current === 1) {
              const error = new Error('rate limited')
              error.status = 429
              throw error
            }
            yield { type: 'text-delta', text: 'OK' }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
        }
      },
    },
  })
  const result = await callModel(ctx, { user: 'x', retryDelayMs: 1 })
  assert.equal(result.text, 'OK')
  assert.equal(calls, 2)
})

test('callModel times out', async () => {
  const ctx = baseCtx(async function* stream({ signal }) {
    await new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    })
  })
  await assert.rejects(
    callModel(ctx, { user: 'x', timeoutMs: 20, retries: 0 }),
    (err) => err.code === 'TIMEOUT',
  )
})

test('callModel fails closed without a model', async () => {
  await assert.rejects(
    callModel(fakeCtx({}), { user: 'x' }),
    (err) => err.code === 'NO_MODEL',
  )
})
