// Markdown → 安全 HTML：禁用原生 HTML，白名单清洗，外链补 target/rel。
import MarkdownIt from 'markdown-it'
import sanitizeHtml from 'sanitize-html'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: false })

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr', 'strong', 'em', 'del', 's',
  'code', 'pre', 'blockquote',
  'ul', 'ol', 'li',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
]

const OPTIONS = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'loading', 'width', 'height'],
    code: ['class'],
    th: ['align'],
    td: ['align'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  transformTags: {
    a(tagName, attribs) {
      if (!attribs.href) return { tagName, attribs }
      const external = /^https?:\/\//i.test(attribs.href)
      return {
        tagName,
        attribs: external ? { ...attribs, target: '_blank', rel: 'noopener noreferrer' } : attribs,
      }
    },
    img(tagName, attribs) {
      return { tagName, attribs: { ...attribs, loading: attribs.loading || 'lazy' } }
    },
  },
}

export function renderMarkdown(source) {
  if (typeof source !== 'string') {
    throw Object.assign(new Error('markdown 必须是字符串'), { status: 400 })
  }
  if (source.length > 200_000) {
    throw Object.assign(new Error('正文太长'), { status: 413 })
  }
  return sanitizeHtml(md.render(source), OPTIONS)
}
