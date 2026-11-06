// 部署：build → git add/commit/push，失败保留状态可重试。
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { buildSite, loadSite } from './build.js'

const execFileAsync = promisify(execFile)

let deploying = false

export class DeployError extends Error {
  constructor(message, { code = 'DEPLOY_ERROR', status = 500, result = null } = {}) {
    super(message)
    this.name = 'DeployError'
    this.code = code
    this.status = status
    this.result = result
  }
}

async function runGit(root, args) {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd: root,
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  return { stdout, stderr }
}

function messageOf(err) {
  const text = String(err?.stderr || err?.stdout || err?.message || err)
  return text.trim().split('\n').slice(-4).join('\n')
}

async function saveStatus(root, value) {
  await mkdir(join(root, '.blog'), { recursive: true })
  await writeFile(join(root, '.blog', 'deploy.json'), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export async function readDeployStatus(root) {
  try {
    return JSON.parse(await readFile(join(root, '.blog', 'deploy.json'), 'utf8'))
  } catch {
    return null
  }
}

export async function deploySite(root, {
  build = true,
  paths = ['docs'],
  message,
  run = runGit,
  now = new Date(),
} = {}) {
  if (deploying) throw new DeployError('已有部署在进行', { code: 'DEPLOY_BUSY', status: 409 })

  deploying = true
  const targets = Array.isArray(paths) && paths.length ? paths : ['docs']
  let report = null

  try {
    const site = await loadSite(root)
    if (build) report = await buildSite(root)

    const status = await run(root, ['status', '--porcelain', '--', ...targets])
    if (!status.stdout.trim()) {
      const result = {
        ok: true,
        skipped: true,
        reason: '没有变更',
        build: report,
        at: now.toISOString(),
      }
      await saveStatus(root, result)
      return result
    }

    await run(root, ['add', '--', ...targets])
    await run(root, ['-c', 'user.name=dsh-blog', '-c', 'user.email=blog@localhost', 'commit', '-m', message || `chore(site): build ${report?.articles ?? 0} posts`])
    const commit = (await run(root, ['rev-parse', '--short', 'HEAD'])).stdout.trim()

    let warning = null
    try {
      await run(root, ['push'])
    } catch (err) {
      const text = messageOf(err)
      if (/no upstream branch|has no upstream/i.test(text)) {
        await run(root, ['push', '-u', 'origin', 'HEAD'])
      } else {
        warning = '推送失败，rebase 后重试一次'
        await run(root, ['pull', '--rebase'])
        await run(root, ['push'])
      }
    }

    const result = {
      ok: true,
      skipped: false,
      commit,
      pushed: true,
      warning,
      url: `${site.url}${site.basePath}`,
      build: report,
      at: now.toISOString(),
    }
    await saveStatus(root, result)
    return result
  } catch (err) {
    const result = {
      ok: false,
      error: messageOf(err),
      build: report,
      at: now.toISOString(),
    }
    await saveStatus(root, result).catch(() => {})
    throw new DeployError(result.error || '部署失败', { result })
  } finally {
    deploying = false
  }
}
