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

test('probeModel streams text through prepareCall', async () => {
  const ctx = fakeCtx({
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: {
      async prepareCall() {
        return {
          config: {},
          async *stream() {
            yield { type: 'text-delta', text: 'OK' }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
        }
      },
    },
  })
  const result = await probeModel(ctx)
  assert.deepEqual(result, { ok: true, model: 'm', text: 'OK' })
})

test('probeWeb degrades without the web service', async () => {
  const result = await probeWeb(fakeCtx({}))
  assert.equal(result.ok, false)
  assert.match(result.error, /web/)
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
