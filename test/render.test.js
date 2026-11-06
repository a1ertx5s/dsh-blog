import test from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../src/render.js'

test('renderMarkdown renders headings, lists, code and tables', () => {
  const html = renderMarkdown('# 标题\n\n- a\n- b\n\n```js\nconst x = 1\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n')
  assert.match(html, /<h1>标题<\/h1>/)
  assert.match(html, /<ul>/)
  assert.match(html, /<pre><code class="language-js">/)
  assert.match(html, /<table>/)
})

test('renderMarkdown disables raw HTML', () => {
  const html = renderMarkdown('<script>alert(1)</script>')
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;/)
})

test('renderMarkdown strips dangerous URLs and event handlers', () => {
  const html = renderMarkdown('[x](javascript:alert(1))\n\n![a](javascript:alert(1))')
  assert.doesNotMatch(html, /href="javascript:/i)
  assert.doesNotMatch(html, /src="javascript:/i)
  assert.doesNotMatch(html, /onerror=/i)
})

test('renderMarkdown marks external links and lazy-loads images', () => {
  const html = renderMarkdown('[站点](https://example.com)\n\n![图](/images/a.png)')
  assert.match(html, /href="https:\/\/example.com"/)
  assert.match(html, /target="_blank"/)
  assert.match(html, /rel="noopener noreferrer"/)
  assert.match(html, /<img[^>]+src="\/images\/a.png"/)
  assert.match(html, /<img[^>]+loading="lazy"/)
})

test('renderMarkdown rejects non-strings and oversized input', () => {
  assert.throws(() => renderMarkdown(42), (err) => err.status === 400)
  assert.throws(() => renderMarkdown('x'.repeat(200_001)), (err) => err.status === 413)
})
