import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deploySite, readDeployStatus } from '../src/deploy.js'

async function root() {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-blog-deploy-'))
  await writeFile(join(dir, 'site.json'), JSON.stringify({
    title: '测试', url: 'https://example.com', basePath: '/repo/', deploy: { dir: 'docs' },
  }))
  return dir
}

test('deploySite commits and pushes changed docs', async () => {
  const dir = await root()
  try {
    const calls = []
    const run = async (cwd, args) => {
      calls.push(args.join(' '))
      if (args[0] === 'status') return { stdout: ' M docs/index.html\n' }
      if (args[0] === 'rev-parse') return { stdout: 'abc123\n' }
      return { stdout: '' }
    }
    const result = await deploySite(dir, { build: false, run, now: new Date('2026-01-01T00:00:00Z') })
    assert.equal(result.ok, true)
    assert.equal(result.commit, 'abc123')
    assert.equal(result.url, 'https://example.com/repo/')
    assert.ok(calls.includes('add -- docs'))
    assert.ok(calls.some((call) => call.includes('commit')))
    assert.ok(calls.includes('push'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('deploySite skips when there is nothing to commit', async () => {
  const dir = await root()
  try {
    const run = async () => ({ stdout: '' })
    const result = await deploySite(dir, { build: false, run })
    assert.equal(result.skipped, true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('deploySite rebases and retries once when push is rejected', async () => {
  const dir = await root()
  try {
    const calls = []
    let pushes = 0
    const run = async (cwd, args) => {
      calls.push(args[0])
      if (args[0] === 'status') return { stdout: 'M docs/index.html\n' }
      if (args[0] === 'rev-parse') return { stdout: 'def456\n' }
      if (args[0] === 'push') {
        pushes += 1
        if (pushes === 1) {
          const error = new Error('push rejected')
          error.stderr = '! [rejected] main -> main (non-fast-forward)'
          throw error
        }
      }
      return { stdout: '' }
    }
    const result = await deploySite(dir, { build: false, run })
    assert.equal(result.ok, true)
    assert.equal(pushes, 2)
    assert.ok(calls.includes('pull'))
    assert.match(result.warning, /rebase/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('deploySite records a failed status and throws', async () => {
  const dir = await root()
  try {
    const run = async (cwd, args) => {
      if (args[0] === 'status') return { stdout: 'M docs/index.html\n' }
      if (args[0] === 'add') {
        const error = new Error('git add failed')
        error.stderr = 'fatal: not a git repository'
        throw error
      }
      return { stdout: '' }
    }
    await assert.rejects(deploySite(dir, { build: false, run }), /not a git repository/)
    const status = await readDeployStatus(dir)
    assert.equal(status.ok, false)
    assert.match(status.error, /not a git repository/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
