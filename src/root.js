// blogRoot：内容仓库的解析、初始化与状态检查。
// 默认 $DSH_HOME/blog；DSH_BLOG_ROOT 覆盖，便于测试与多份内容。
import { execFile } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve as resolvePath } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export const SITE_FILE = 'site.json'
export const EDITORIAL_FILE = 'editorial.md'

export function dshHome(env = process.env) {
  return env.DSH_HOME || join(homedir(), '.dsh')
}

function expandHome(value) {
  if (value === '~') return homedir()
  if (value.startsWith('~/')) return join(homedir(), value.slice(2))
  return value
}

/** 优先级：显式设置 → DSH_BLOG_ROOT → $DSH_HOME/blog。 */
export function resolveBlogRoot(settingsRoot, env = process.env) {
  const explicit = typeof settingsRoot === 'string' ? settingsRoot.trim() : ''
  if (explicit) return resolvePath(expandHome(explicit))
  const fromEnv = typeof env.DSH_BLOG_ROOT === 'string' ? env.DSH_BLOG_ROOT.trim() : ''
  if (fromEnv) return resolvePath(expandHome(fromEnv))
  return resolvePath(join(dshHome(env), 'blog'))
}

export function defaultSite() {
  return {
    schemaVersion: 1,
    title: '我的博客',
    description: '',
    url: '',
    basePath: '/',
    author: '',
    lang: 'zh-CN',
    theme: 'paper',
    nav: [],
    deploy: { dir: 'docs', branch: 'main', autoPush: false },
  }
}

export const DEFAULT_EDITORIAL = `# 编辑部手册

这个文件会注入每一次生成。改这里，所有文章一起变。

## 定位

- 读者：
- 栏目：
- 不写的：

## 声音

- 语气：
- 结构：
- 长度：

## 禁区

- 不编造数据与引用
- 不写空泛的套话

## SEO

- 标题 10–60 字
- 摘要 50–160 字
`

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function writeIfMissing(path, content, created, name) {
  try {
    await writeFile(path, content, { flag: 'wx' })
    created.push(name)
    return true
  } catch (err) {
    if (err.code === 'EEXIST') return false
    throw err
  }
}

export async function inspectGit(root, exec = run) {
  try {
    const { stdout } = await exec('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root })
    return String(stdout).trim() === 'true'
  } catch {
    return false
  }
}

export async function inspectBlogRoot(root, { exec = run } = {}) {
  const rootExists = await exists(root)
  const initialized = rootExists && await exists(join(root, SITE_FILE))
  const git = rootExists ? await inspectGit(root, exec) : false
  let site = null
  if (initialized) {
    try {
      site = JSON.parse(await readFile(join(root, SITE_FILE), 'utf8'))
    } catch {
      site = null
    }
  }
  return { root, exists: rootExists, initialized, git, site }
}

/** 幂等：目录、site.json、editorial.md 缺什么补什么；没有 git 仓库时初始化。 */
export async function ensureBlogRoot(root, { exec = run } = {}) {
  const created = []
  await mkdir(join(root, 'content', 'posts'), { recursive: true })
  await mkdir(join(root, 'content', 'images'), { recursive: true })
  await mkdir(join(root, '.blog'), { recursive: true })

  await writeIfMissing(join(root, SITE_FILE), `${JSON.stringify(defaultSite(), null, 2)}\n`, created, SITE_FILE)
  await writeIfMissing(join(root, EDITORIAL_FILE), DEFAULT_EDITORIAL, created, EDITORIAL_FILE)

  let git = await inspectGit(root, exec)
  if (!git) {
    try {
      await exec('git', ['init', '-b', 'main'], { cwd: root })
      git = await inspectGit(root, exec)
      if (git) created.push('.git')
    } catch {
      git = false
    }
  }

  return { ...(await inspectBlogRoot(root, { exec })), created }
}

export function isInside(root, candidate) {
  const target = resolvePath(candidate)
  const base = resolvePath(root)
  return target === base || target.startsWith(`${base}/`)
}

export function absoluteRoot(root) {
  return isAbsolute(root) ? root : resolvePath(root)
}
