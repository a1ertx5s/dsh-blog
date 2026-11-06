// 写作语言：跟随 site.json 的 lang。
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export function languageOf(site = {}) {
  return String(site.lang || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh'
}

export function languageInstruction(lang) {
  return lang === 'en' ? 'Write the article in English.' : '用中文写作。'
}

export async function siteLanguage(root) {
  try {
    return languageOf(JSON.parse(await readFile(join(root, 'site.json'), 'utf8')))
  } catch {
    return 'zh'
  }
}
