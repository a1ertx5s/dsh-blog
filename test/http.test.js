import test from 'node:test'
import assert from 'node:assert/strict'
import { json, readBuffer, readJson, requestPath, requestRejection, sameSite } from '../src/http.js'

test('requestPath matches the prefix boundary only', () => {
  assert.equal(requestPath({ url: '/blog/state' }, '/blog'), 'state')
  assert.equal(requestPath({ url: '/blog' }, '/blog'), '')
  assert.equal(requestPath({ url: '/blog/' }, '/blog'), '')
  assert.equal(requestPath({ url: '/blogger' }, '/blog'), null)
  assert.equal(requestPath({ url: '/other' }, '/blog'), null)
})

test('requestPath normalizes away traversal attempts', () => {
  assert.equal(requestPath({ url: '/blog/../secret' }, '/blog'), null)
  assert.equal(requestPath({ url: '/blog/%2e%2e/secret' }, '/blog'), null)
})

test('sameSite accepts same-origin and header-less clients', () => {
  assert.equal(sameSite({ headers: {} }), true)
  assert.equal(sameSite({ headers: { 'sec-fetch-site': 'same-origin' } }), true)
  assert.equal(sameSite({ headers: { 'sec-fetch-site': 'none' } }), true)
  assert.equal(sameSite({ headers: { 'sec-fetch-site': 'cross-site' } }), false)
})

test('requestRejection fails closed without a connection service', () => {
  assert.equal(requestRejection({ get: () => undefined }, { headers: {} }), 403)
  assert.equal(requestRejection({ get: () => ({}) }, { headers: {} }), 403)
})

test('requestRejection delegates to the host connection service', () => {
  const ctx = { get: () => ({ requestRejection: () => 401 }) }
  assert.equal(requestRejection(ctx, { headers: {} }), 401)
  const ok = { get: () => ({ requestRejection: () => undefined }) }
  assert.equal(requestRejection(ok, { headers: {} }), undefined)
})

test('json writes status, headers and body once', () => {
  const res = {
    headersSent: false,
    statusCode: 0,
    headers: {},
    setHeader(key, value) { this.headers[key] = value },
    end(body) { this.body = body; this.headersSent = true },
  }
  json(res, 200, { ok: true })
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(res.headers['cache-control'], 'no-store')
  assert.equal(res.body, '{"ok":true}')
})

const body = (...chunks) => (async function* stream() {
  for (const chunk of chunks) yield Buffer.from(chunk)
})()

test('readJson parses JSON and tolerates an empty body', async () => {
  assert.deepEqual(await readJson(body('{"ok":1}')), { ok: 1 })
  assert.deepEqual(await readJson(body()), {})
})

test('readJson rejects malformed and oversized bodies', async () => {
  await assert.rejects(readJson(body('{')), (err) => err.status === 400)
  await assert.rejects(readJson(body('12345'), 3), (err) => err.status === 413)
})

test('readBuffer concatenates chunks and enforces the limit', async () => {
  const buffer = await readBuffer(body('ab', 'cd'))
  assert.equal(buffer.toString(), 'abcd')
  await assert.rejects(readBuffer(body('12345'), 3), (err) => err.status === 413)
})
