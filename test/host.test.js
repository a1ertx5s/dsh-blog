import test from 'node:test'
import assert from 'node:assert/strict'
import plugin, { name } from '../src/host.js'

test('host half exports a plugin named dsh-blog', () => {
  assert.equal(name, 'dsh-blog')
  assert.equal(typeof plugin.apply, 'function')
})
