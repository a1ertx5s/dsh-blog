import React from 'react'
import { api } from './api.js'
import { t } from './i18n.js'
import { assembleSections, splitSections } from './sections.js'

const STATUSES = ['draft', 'review', 'published']
const STATUS_LABEL = { draft: '草稿', review: '待审', published: '已发布' }

function diffLines(before, after) {
  const a = String(before).split('\n')
  const b = String(after).split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1
    endB -= 1
  }
  const rows = []
  for (let index = 0; index < start; index += 1) rows.push({ type: 'same', text: a[index] })
  for (let index = start; index < endA; index += 1) rows.push({ type: 'del', text: a[index] })
  for (let index = start; index < endB; index += 1) rows.push({ type: 'add', text: b[index] })
  for (let index = endA; index < a.length; index += 1) rows.push({ type: 'same', text: a[index] })
  return rows
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
}

export function ArticleDetail({ slug, onSaved, focus = null }) {
  const [article, setArticle] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [tab, setTab] = React.useState('sections')
  const [title, setTitle] = React.useState('')
  const [status, setStatus] = React.useState('draft')
  const [tags, setTags] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [cover, setCover] = React.useState('')
  const [body, setBody] = React.useState('')
  const [version, setVersion] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [publishing, setPublishing] = React.useState(false)
  const [message, setMessage] = React.useState(null)
  const [conflict, setConflict] = React.useState(false)
  const [preview, setPreview] = React.useState('')
  const [uploading, setUploading] = React.useState(false)
  const [versions, setVersions] = React.useState([])
  const [selectedVersion, setSelectedVersion] = React.useState(null)
  const [diff, setDiff] = React.useState([])
  const [versionBusy, setVersionBusy] = React.useState(false)
  const [sections, setSections] = React.useState([])
  const [previewInfo, setPreviewInfo] = React.useState(null)
  const [previewPage, setPreviewPage] = React.useState('post')
  const [previewing, setPreviewing] = React.useState(false)
  const [publishingPreview, setPublishingPreview] = React.useState(false)
  const bodyRef = React.useRef(null)
  const pendingFocus = React.useRef(null)
  const fileRef = React.useRef(null)
  const coverRef = React.useRef(null)

  const applyArticle = React.useCallback((data) => {
    setArticle(data)
    setTitle(data.data.title || '')
    setStatus(data.data.status || 'draft')
    setTags((data.data.tags || []).join(', '))
    setDescription(data.data.description || '')
    setCover(data.data.cover || '')
    setBody(data.body || '')
    setSections(splitSections(data.body || ''))
    setVersion(data.version || '')
    setConflict(false)
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      applyArticle(await api(`/posts/${encodeURIComponent(slug)}`))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [slug, applyArticle])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    if (!focus?.heading) return
    pendingFocus.current = focus.heading
    if (tab !== 'source') setTab('source')
  }, [focus])

  React.useEffect(() => {
    if (tab !== 'source' || !pendingFocus.current) return
    const heading = pendingFocus.current
    pendingFocus.current = null
    const textarea = bodyRef.current
    const index = body.indexOf(`## ${heading}`)
    if (!textarea || index < 0) return
    textarea.focus()
    textarea.setSelectionRange(index, index + heading.length + 3)
    const line = body.slice(0, index).split('\n').length
    textarea.scrollTop = Math.max(0, (line - 3) * 22)
  }, [tab, body])

  React.useEffect(() => {
    if (tab !== 'versions') return
    api(`/posts/${encodeURIComponent(slug)}/versions`)
      .then((data) => setVersions(data.versions || []))
      .catch((err) => setMessage({ kind: 'error', text: err.message }))
  }, [tab, slug])

  React.useEffect(() => {
    if (tab !== 'preview') return undefined
    let alive = true
    const timer = setTimeout(async () => {
      try {
        const result = await api('/render', { method: 'POST', body: { markdown: body } })
        if (alive) setPreview(result.html.replaceAll('src="/images/', 'src="/blog/images/'))
      } catch (err) {
        if (alive) setPreview(`<p class="blog-error">${escapeHtml(err.message)}</p>`)
      }
    }, 300)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [tab, body])

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const saved = await api(`/posts/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        body: {
          data: {
            title,
            status,
            tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
            description,
            cover,
          },
          body,
          version,
        },
      })
      applyArticle(saved)
      setMessage({ kind: 'ok', text: t('已保存') })
      onSaved?.()
    } catch (err) {
      if (err.status === 409) {
        setConflict(true)
        setMessage({ kind: 'error', text: t('文章已被修改，请重新加载') })
      } else {
        setMessage({ kind: 'error', text: err.message })
      }
    } finally {
      setSaving(false)
    }
  }

  async function viewVersion(id) {
    setVersionBusy(true)
    try {
      const value = await api(`/posts/${encodeURIComponent(slug)}/versions/${encodeURIComponent(id)}`)
      setSelectedVersion(value)
      setDiff(diffLines(body, value.body))
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    } finally {
      setVersionBusy(false)
    }
  }

  async function restore() {
    if (!selectedVersion) return
    setVersionBusy(true)
    try {
      const result = await api(`/posts/${encodeURIComponent(slug)}/versions/${encodeURIComponent(selectedVersion.id)}/restore`, {
        method: 'POST',
        body: { version },
      })
      applyArticle(result.article)
      setMessage({ kind: 'ok', text: t('已恢复该版本') })
      setSelectedVersion(null)
      setDiff([])
      onSaved?.()
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    } finally {
      setVersionBusy(false)
    }
  }

  function applySections(next) {
    setSections(next)
    setBody(assembleSections(next))
  }

  function updateSection(index, patch) {
    applySections(sections.map((section, cursor) => (cursor === index ? { ...section, ...patch } : section)))
  }

  function addSection() {
    applySections([...sections, { heading: '新小节', text: '' }])
  }

  function removeSection(index) {
    const next = sections.filter((_, cursor) => cursor !== index)
    applySections(next.length ? next : [{ heading: null, text: '' }])
  }

  function moveSection(index, delta) {
    const target = index + delta
    if (target < 0 || target >= sections.length) return
    const next = [...sections]
    const [row] = next.splice(index, 1)
    next.splice(target, 0, row)
    applySections(next)
  }

  async function openPreview() {
    setPreviewing(true)
    setMessage(null)
    try {
      const result = await api('/preview', { method: 'POST', body: { slug } })
      setPreviewInfo(result)
      setPreviewPage('post')
      setTab('local')
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    } finally {
      setPreviewing(false)
    }
  }

  async function publishPreview() {
    setPublishingPreview(true)
    try {
      const result = await api(`/posts/${encodeURIComponent(slug)}/publish`, { method: 'POST' })
      applyArticle(result.article)
      setPreviewInfo(null)
      const deployError = result.deploy && !result.deploy.ok ? `；部署失败：${result.deploy.error}` : ''
      setMessage({ kind: deployError ? 'error' : 'ok', text: `${t('已发布并构建站点')}${deployError}` })
      onSaved?.()
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    } finally {
      setPublishingPreview(false)
    }
  }

  async function publish() {
    setPublishing(true)
    setMessage(null)
    try {
      const result = await api(`/posts/${encodeURIComponent(slug)}/publish`, { method: 'POST' })
      applyArticle(result.article)
      setMessage({ kind: 'ok', text: t('已发布并构建站点') })
      onSaved?.()
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    } finally {
      setPublishing(false)
    }
  }

  async function upload(file, target) {
    if (!file) return
    setUploading(true)
    try {
      const saved = await api('/upload', { method: 'POST', body: file, raw: true })
      if (target === 'cover') {
        setCover(saved.src)
        setMessage({ kind: 'ok', text: t('封面已更新') })
      } else {
        const alt = file.name.replace(/\.[^.]+$/, '')
        const snippet = `![${alt}](${saved.src})`
        const textarea = bodyRef.current
        if (!textarea) {
          setBody((prev) => `${prev}${prev.endsWith('\n') ? '' : '\n'}${snippet}\n`)
        } else {
          const start = textarea.selectionStart ?? body.length
          const next = `${body.slice(0, start)}${snippet}${body.slice(start)}`
          setBody(next)
          requestAnimationFrame(() => {
            textarea.focus()
            textarea.selectionStart = start + snippet.length
            textarea.selectionEnd = start + snippet.length
          })
        }
        setMessage({ kind: 'ok', text: t('图片已插入') })
      }
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    } finally {
      setUploading(false)
    }
  }

  if (loading) return <div className="blog-empty">{t('加载中…')}</div>
  if (error) {
    return (
      <div className="blog-empty">
        <p className="blog-error">{error}</p>
        <button type="button" className="blog-button" onClick={load}>{t('重试')}</button>
      </div>
    )
  }
  if (!article) return null

  const coverPreview = cover ? cover.replace(/^\/images\//, '/blog/images/') : ''

  return (
    <section className="blog-detail">
      <header className="blog-detail-head">
        <input
          className="blog-title-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('文章标题')}
        />
        <button type="button" className="blog-button is-primary" onClick={save} disabled={saving}>
          {saving ? t('保存中…') : t('保存')}
        </button>
        {status !== 'published' ? (
          <button type="button" className="blog-button" onClick={publish} disabled={publishing}>
            {publishing ? t('发布中…') : t('发布')}
          </button>
        ) : null}
        <button type="button" className="blog-button" onClick={openPreview} disabled={previewing}>
          {previewing ? t('构建中…') : t('本地预览')}
        </button>
        <a className="blog-button" href={`/blog/posts/${encodeURIComponent(slug)}/export`} download>{t('导出')}</a>
      </header>

      {message ? (
        <p className={message.kind === 'ok' ? 'blog-note is-ok' : 'blog-note is-error'}>
          {message.text}
          {conflict ? <button type="button" className="blog-link" onClick={load}>{t('重新加载')}</button> : null}
        </p>
      ) : null}

      <div className="blog-meta-grid">
        <label className="blog-field">
          <span>{t('状态')}</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABEL[value]}</option>)}
          </select>
        </label>
        <label className="blog-field">
          <span>slug</span>
          <input value={article.slug} readOnly />
        </label>
        <label className="blog-field">
          <span>{t('标签')}</span>
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="AI, 工程" />
        </label>
        <label className="blog-field">
          <span>{t('摘要')}</span>
          <input value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="blog-field blog-field-wide">
          <span>{t('封面')}</span>
          <span className="blog-cover-row">
            <input value={cover} onChange={(event) => setCover(event.target.value)} placeholder="/images/..." />
            <button type="button" className="blog-button" onClick={() => coverRef.current?.click()} disabled={uploading}>
              {t('上传')}
            </button>
          </span>
          {coverPreview ? <img className="blog-cover" src={coverPreview} alt="" /> : null}
        </label>
      </div>

      <div className="blog-editor">
        <div className="blog-editor-bar">
          <div className="blog-tabs">
            <button type="button" className={tab === 'sections' ? 'is-on' : ''} onClick={() => setTab('sections')}>{t('分节')}</button>
            <button type="button" className={tab === 'preview' ? 'is-on' : ''} onClick={() => setTab('preview')}>{t('预览')}</button>
            <button type="button" className={tab === 'source' ? 'is-on' : ''} onClick={() => setTab('source')}>{t('源码')}</button>
            <button type="button" className={tab === 'versions' ? 'is-on' : ''} onClick={() => setTab('versions')}>{t('版本')}</button>
            {previewInfo ? (
              <button type="button" className={tab === 'local' ? 'is-on' : ''} onClick={() => setTab('local')}>{t('站点预览')}</button>
            ) : null}
          </div>
          <button type="button" className="blog-button" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? t('上传中…') : t('插入图片')}
          </button>
        </div>
        {tab === 'sections' ? (
          <div className="blog-sections">
            {sections.map((section, index) => (
              <div className="blog-section" key={index}>
                <div className="blog-section-head">
                  {section.heading === null ? (
                    <span className="blog-section-intro">{t('开头')}</span>
                  ) : (
                    <input
                      value={section.heading}
                      onChange={(event) => updateSection(index, { heading: event.target.value })}
                      placeholder={t('小节标题')}
                    />
                  )}
                  <span className="blog-spacer" />
                  <button type="button" className="blog-link" onClick={() => moveSection(index, -1)} disabled={index === 0}>↑</button>
                  <button type="button" className="blog-link" onClick={() => moveSection(index, 1)} disabled={index === sections.length - 1}>↓</button>
                  <button type="button" className="blog-link" onClick={() => removeSection(index)}>{t('删除')}</button>
                </div>
                <textarea
                  value={section.text}
                  onChange={(event) => updateSection(index, { text: event.target.value })}
                  rows={Math.min(14, Math.max(4, section.text.split('\n').length + 1))}
                  spellCheck={false}
                />
              </div>
            ))}
            <button type="button" className="blog-button" onClick={addSection}>+ {t('添加小节')}</button>
          </div>
        ) : tab === 'preview' ? (
          <div className="blog-preview" dangerouslySetInnerHTML={{ __html: preview }} />
        ) : tab === 'source' ? (
          <textarea
            ref={bodyRef}
            className="blog-source"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            spellCheck={false}
          />
        ) : tab === 'local' && previewInfo ? (
          <div className="blog-local-inline">
            <div className="blog-local-toolbar">
              <div className="blog-tabs">
                <button type="button" className={previewPage === 'post' ? 'is-on' : ''} onClick={() => setPreviewPage('post')}>{t('文章')}</button>
                <button type="button" className={previewPage === 'home' ? 'is-on' : ''} onClick={() => setPreviewPage('home')}>{t('首页')}</button>
                <button type="button" className={previewPage === 'about' ? 'is-on' : ''} onClick={() => setPreviewPage('about')}>{t('关于')}</button>
              </div>
              <span className="blog-spacer" />
              <button type="button" className="blog-button is-primary" onClick={publishPreview} disabled={publishingPreview}>
                {publishingPreview ? t('发布中…') : t('发布')}
              </button>
            </div>
            <iframe
              className="blog-local-frame-inline"
              title={t('本地预览')}
              src={previewPage === 'home'
                ? previewInfo.basePath
                : previewPage === 'about'
                  ? `${previewInfo.basePath}about.html`
                  : `${previewInfo.basePath}posts/${encodeURIComponent(slug)}.html`}
            />
          </div>
        ) : (
          <div className="blog-versions">
            <div className="blog-version-list">
              {versions.length ? versions.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={selectedVersion?.id === item.id ? 'is-on' : ''}
                  onClick={() => viewVersion(item.id)}
                  disabled={versionBusy}
                >
                  {item.at} · {item.bytes}B
                </button>
              )) : <p className="blog-muted">{t('还没有历史版本')}</p>}
            </div>
            {selectedVersion ? (
              <div className="blog-diff">
                <div className="blog-diff-head">
                  <span>{selectedVersion.at}</span>
                  <button type="button" className="blog-button" onClick={restore} disabled={versionBusy}>
                    {t('恢复此版本')}
                  </button>
                </div>
                <pre>{diff.map((row, index) => (
                  <div key={index} className={`is-${row.type}`}>{row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' '}{row.text}</div>
                ))}</pre>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          upload(file, 'body')
        }}
      />
      <input
        ref={coverRef}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          upload(file, 'cover')
        }}
      />
    </section>
  )
}
