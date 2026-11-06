// 静态站构建：已发布文章 → docs/（首页、文章、RSS、sitemap、404）。
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { listArticles, readArticle } from './article.js'
import { checkSite } from './check.js'
import { renderMarkdown } from './render.js'

export function normalizeBasePath(value) {
  let base = String(value || '/').trim()
  if (!base.startsWith('/')) base = `/${base}`
  if (!base.endsWith('/')) base = `${base}/`
  return base.replace(/\/{2,}/g, '/')
}

export function normalizeSite(raw = {}) {
  return {
    schemaVersion: 1,
    title: raw.title || '我的博客',
    description: raw.description || '',
    url: String(raw.url || '').replace(/\/+$/, ''),
    basePath: normalizeBasePath(raw.basePath || '/'),
    author: raw.author || '',
    lang: raw.lang || 'zh-CN',
    theme: raw.theme || 'paper',
    nav: Array.isArray(raw.nav) ? raw.nav.filter((item) => item?.label && item?.href) : [],
    budget: {
      perArticleTokens: Number(raw.budget?.perArticleTokens) || 0,
      monthlyTokens: Number(raw.budget?.monthlyTokens) || 0,
    },
    deploy: {
      dir: raw.deploy?.dir || 'docs',
      branch: raw.deploy?.branch || 'main',
      autoPush: Boolean(raw.deploy?.autoPush),
    },
  }
}

export function sitePath(site, path = '') {
  return `${site.basePath}${String(path).replace(/^\/+/, '')}`
}

export function absoluteUrl(site, path = '') {
  return `${site.url}${sitePath(site, path)}`
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]))
}

function escapeXml(value) {
  return String(value ?? '').replace(/[<>&"']/g, (ch) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  }[ch]))
}

function postHref(site, slug) {
  return sitePath(site, `posts/${encodeURIComponent(slug)}.html`)
}

function navHref(site, href) {
  if (/^(https?:|#|mailto:)/.test(href)) return href
  return sitePath(site, href)
}

/** 正文里的根相对链接补上 basePath，项目页 /repo/ 才不会 404。 */
export function rewriteLinks(html, basePath) {
  return String(html)
    .replace(/href="\/"/g, `href="${basePath}"`)
    .replace(/(src|href)="\/(?!\/)([^"]*)"/g, (_, attr, rest) => {
      const prefix = basePath.replace(/^\/|\/$/g, '')
      if (prefix && (rest === `${prefix}/` || rest.startsWith(`${prefix}/`))) {
        return `${attr}="/${rest}"`
      }
      if (rest.startsWith('images/') || rest.startsWith('posts/') || rest.startsWith('assets/')) {
        return `${attr}="${basePath}${rest}"`
      }
      return `${attr}="/${rest}"`
    })
}

function layout(site, { title, description, canonical, body, type = 'website' }) {
  const pageTitle = title && title !== site.title ? `${title} · ${site.title}` : site.title
  const nav = site.nav.length
    ? `<nav class="site-nav">${site.nav.map((item) => `<a href="${escapeHtml(navHref(site, item.href))}">${escapeHtml(item.label)}</a>`).join('')}</nav>`
    : ''
  return `<!doctype html>
<html lang="${escapeHtml(site.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(description)}">
${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : ''}
<link rel="stylesheet" href="${sitePath(site, 'assets/site.css')}">
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(site.title)}" href="${sitePath(site, 'rss.xml')}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${escapeHtml(pageTitle)}">
<meta property="og:description" content="${escapeHtml(description)}">
${canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}">` : ''}
</head>
<body>
<header class="site-header">
<a class="site-brand" href="${sitePath(site)}">${escapeHtml(site.title)}</a>
${nav}
</header>
<main class="site-main">
${body}
</main>
<footer class="site-footer">
<p>${escapeHtml(site.title)}${site.author ? ` · ${escapeHtml(site.author)}` : ''}</p>
</footer>
</body>
</html>
`
}

function indexBody(site, posts) {
  if (!posts.length) return '<p class="empty">还没有发布文章。</p>'
  return posts.map((post) => `<article class="post-card">
<h2><a href="${postHref(site, post.slug)}">${escapeHtml(post.title)}</a></h2>
<p class="post-meta">${escapeHtml(post.date)}${post.tags?.length ? ` · ${post.tags.map(escapeHtml).join(' / ')}` : ''}</p>
${post.description ? `<p class="post-summary">${escapeHtml(post.description)}</p>` : ''}
</article>`).join('\n')
}

function postBody(site, article, html) {
  const data = article.data
  return `<article class="post">
<header class="post-header">
<p class="post-meta">${escapeHtml(data.date)}</p>
<h1>${escapeHtml(data.title)}</h1>
${data.tags?.length ? `<p class="post-tags">${data.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</p>` : ''}
</header>
<div class="prose">${html}</div>
<p class="post-back"><a href="${sitePath(site)}">← 返回首页</a></p>
</article>`
}

function rfc822(date) {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return new Date().toUTCString()
  return parsed.toUTCString()
}

export function rssXml(site, posts) {
  const items = posts.slice(0, 20).map((post) => {
    const url = absoluteUrl(site, `posts/${encodeURIComponent(post.slug)}.html`)
    return `<item>
<title>${escapeXml(post.title)}</title>
<link>${escapeXml(url)}</link>
<guid>${escapeXml(url)}</guid>
<pubDate>${rfc822(post.date)}</pubDate>
<description>${escapeXml(post.description || '')}</description>
</item>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${escapeXml(site.title)}</title>
<link>${escapeXml(absoluteUrl(site))}</link>
<description>${escapeXml(site.description)}</description>
<language>${escapeXml(site.lang)}</language>
${items}
</channel>
</rss>
`
}

export function sitemapXml(site, posts) {
  const urls = [
    { loc: absoluteUrl(site), lastmod: posts[0]?.date },
    ...posts.map((post) => ({ loc: absoluteUrl(site, `posts/${encodeURIComponent(post.slug)}.html`), lastmod: post.date })),
  ].map((entry) => `<url><loc>${escapeXml(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : ''}</url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}

const CSS = `:root{color-scheme:light dark;--bg:#fff;--fg:#1f2328;--muted:#59636e;--border:#d8dee4;--card:#f6f8fa;--accent:#0969da}
@media(prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#9198a1;--border:#30363d;--card:#161b22;--accent:#58a6ff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.85 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.site-header{max-width:760px;margin:0 auto;padding:28px 24px 8px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.site-brand{font-weight:600;font-size:17px;color:var(--fg)}
.site-nav{display:flex;gap:16px;font-size:14px}
.site-main{max-width:760px;margin:0 auto;padding:16px 24px 64px}
.site-footer{max-width:760px;margin:0 auto;padding:24px;border-top:1px solid var(--border);color:var(--muted);font-size:13px}
.home-title{font-size:28px;margin:0 0 8px}\n.post-card{padding:20px 0;border-bottom:1px solid var(--border)}
.post-card h2{margin:0 0 6px;font-size:20px}
.post-card h2 a{color:var(--fg)}
.post-meta{margin:0;color:var(--muted);font-size:13px}
.post-summary{margin:8px 0 0;color:var(--muted)}
.post-header{margin-bottom:28px}
.post-header h1{margin:6px 0 10px;font-size:32px;line-height:1.3}
.post-tags{display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--muted)}
.post-tags span{border:1px solid var(--border);border-radius:999px;padding:0 8px}
.prose h1,.prose h2,.prose h3{line-height:1.35;margin:1.4em 0 .6em}
.prose h1{font-size:26px}.prose h2{font-size:21px}.prose h3{font-size:17px}
.prose p{margin:0 0 1em}
.prose ul,.prose ol{padding-left:1.4em;margin:0 0 1em}
.prose blockquote{margin:0 0 1em;padding-left:14px;border-left:3px solid var(--border);color:var(--muted)}
.prose pre{background:var(--card);padding:14px 16px;border-radius:8px;overflow:auto}
.prose code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em}
.prose img{max-width:100%;border-radius:8px}
.prose table{border-collapse:collapse;width:100%;margin:0 0 1em}
.prose th,.prose td{border:1px solid var(--border);padding:8px 10px;text-align:left}
.post-back{margin-top:40px;font-size:14px}
.empty{color:var(--muted)}
.not-found{padding:60px 0;text-align:center}
@media(max-width:640px){.site-header,.site-main,.site-footer{padding-left:18px;padding-right:18px}.post-header h1{font-size:26px}}
hr{border:0;border-top:1px solid var(--border);margin:2em 0}
figure{margin:1.4em 0}
figcaption{color:var(--muted);font-size:13px;text-align:center;margin-top:6px}
.prose a{text-decoration:underline;text-underline-offset:2px}
@media print{.site-header,.site-footer,.post-back{display:none}body{color:#000;background:#fff}}
`

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function loadSite(root) {
  try {
    return normalizeSite(JSON.parse(await readFile(join(root, 'site.json'), 'utf8')))
  } catch {
    return normalizeSite({})
  }
}

export async function buildSite(root, {
  now = new Date(),
  outDir = null,
  basePath = null,
  include = [],
  writeReport = true,
} = {}) {
  const site = await loadSite(root)
  if (basePath) site.basePath = normalizeBasePath(basePath)
  const warnings = []
  if (!site.url) warnings.push('site.url 为空：RSS 与 sitemap 使用相对链接，部分阅读器无法识别')

  const extra = new Set(include)
  const listed = (await listArticles(root)).filter((post) => post.status === 'published' || extra.has(post.slug))
  const articles = []
  for (const post of listed) {
    const article = await readArticle(root, post.slug)
    if (!article) {
      warnings.push(`读取失败：${post.slug}`)
      continue
    }
    articles.push({ ...post, ...article })
  }

  const target = outDir || join(root, site.deploy.dir)
  await mkdir(dirname(target), { recursive: true })
  const temp = join(root, '.blog', `build-${process.pid}-${now.getTime()}`)
  await rm(temp, { recursive: true, force: true })
  await mkdir(join(temp, 'posts'), { recursive: true })
  await mkdir(join(temp, 'assets'), { recursive: true })

  const files = []
  const write = async (path, content) => {
    const file = join(temp, path)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, content)
    files.push(path)
  }

  const cards = articles.map((article) => ({
    slug: article.slug,
    title: article.data.title,
    date: article.data.date,
    description: article.data.description,
    tags: article.data.tags,
  }))

  await write('index.html', layout(site, {
    title: site.title,
    description: site.description,
    canonical: absoluteUrl(site),
    body: `<h1 class="home-title">${escapeHtml(site.title)}</h1>\n${site.description ? `<p class="empty">${escapeHtml(site.description)}</p>` : ''}\n${indexBody(site, cards)}`,
  }))

  for (const article of articles) {
    const html = rewriteLinks(renderMarkdown(article.body), site.basePath)
    await write(`posts/${article.slug}.html`, layout(site, {
      title: article.data.title,
      description: article.data.description || site.description,
      canonical: absoluteUrl(site, `posts/${encodeURIComponent(article.slug)}.html`),
      type: 'article',
      body: postBody(site, article, html),
    }))
  }

  const aboutPath = join(root, 'content', 'about.md')
  const aboutSource = await exists(aboutPath) ? await readFile(aboutPath, 'utf8') : '这里还没有关于页。'
  await write('about.html', layout(site, {
    title: '关于',
    description: site.description,
    canonical: absoluteUrl(site, 'about.html'),
    body: `<article class="post"><div class="prose">${rewriteLinks(renderMarkdown(aboutSource), site.basePath)}</div></article>`,
  }))

  await write('404.html', layout(site, {
    title: '页面不存在',
    description: '404',
    body: '<div class="not-found"><h1>404</h1><p>这一页不存在。</p><p><a href="' + sitePath(site) + '">回首页</a></p></div>',
  }))

  await write('assets/site.css', CSS)
  await write('rss.xml', rssXml(site, cards))
  await write('sitemap.xml', sitemapXml(site, cards))
  await write('.nojekyll', '')

  const images = join(root, 'content', 'images')
  if (await exists(images)) {
    await cp(images, join(temp, 'images'), { recursive: true })
    files.push('images/')
  }

  const backup = `${target}.old-${process.pid}-${now.getTime()}`
  const hadTarget = await exists(target)
  if (hadTarget) await rename(target, backup)
  try {
    await rename(temp, target)
  } catch (err) {
    if (hadTarget) await rename(backup, target)
    throw err
  }
  if (hadTarget) await rm(backup, { recursive: true, force: true })

  let checks = null
  if (!outDir) {
    checks = await checkSite(root, site)
    if (!checks.ok) warnings.push(`自检发现 ${checks.issues.length} 个问题`)
  }

  const report = {
    schemaVersion: 1,
    at: now.toISOString(),
    ok: true,
    dir: outDir ? target : site.deploy.dir,
    articles: articles.length,
    files,
    warnings,
    checks,
    site: { title: site.title, url: site.url, basePath: site.basePath },
  }
  if (writeReport) {
    await mkdir(join(root, '.blog'), { recursive: true })
    await writeFile(join(root, '.blog', 'build.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }
  return report
}
