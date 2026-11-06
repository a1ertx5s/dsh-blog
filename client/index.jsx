// dsh-blog 浏览器半片：起笔 / 落墨 / 阅卷 / 立规。
import React from 'react'
import css from './styles.css'
import { api } from './api.js'
import { ArticleDetail } from './ArticleDetail.jsx'
import { ArticleList } from './ArticleList.jsx'
import { Diagnostics } from './Diagnostics.jsx'
import { Pipeline } from './Pipeline.jsx'
import { StartPage } from './StartPage.jsx'
import { registerLocale, t } from './i18n.js'

function PanelIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5.5 4.5h9L19 9v10.5H5.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8.5 9.5h4M8.5 13h6M8.5 16.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

const TABS = [
  ['start', '起笔'],
  ['write', '落墨'],
  ['site', '阅卷'],
  ['settings', '立规'],
]

function BlogPanel({ target, onConsumed }) {
  const [view, setView] = React.useState('articles')
  const [posts, setPosts] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [selected, setSelected] = React.useState(null)
  const [creating, setCreating] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [job, setJob] = React.useState(null)
  const [chatOpen, setChatOpen] = React.useState(true)
  const [leftOpen, setLeftOpen] = React.useState(false)
  const [outline, setOutline] = React.useState([])
  const [focus, setFocus] = React.useState(null)
  const importRef = React.useRef(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api('/posts')
      setPosts(data.posts || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    if (!target) return
    if (target.topics) setView('factory')
    if (target.slug) {
      setView('articles')
      setSelected(target.slug)
    }
    if (target.jobId) {
      setView('articles')
      setJob({ id: target.jobId, status: 'queued' })
    }
    onConsumed?.()
  }, [target, onConsumed])

  React.useEffect(() => {
    if (!selected) {
      setOutline([])
      return undefined
    }
    let alive = true
    api(`/posts/${encodeURIComponent(selected)}`)
      .then((article) => {
        if (!alive) return
        const heads = String(article.body || '').match(/^##\s+(.+)$/gm) || []
        setOutline(heads.map((line) => line.replace(/^##\s+/, '').trim()))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [selected])

  React.useEffect(() => {
    if (!job?.id) return undefined
    let alive = true
    const tick = async () => {
      try {
        const next = await api(`/jobs/${job.id}`)
        if (!alive) return
        setJob(next)
        if (next.slug) {
          setSelected(next.slug)
          await load()
        }
        if (['review', 'approved', 'published', 'failed', 'cancelled'].includes(next.status) || next.slug) {
          setJob((prev) => ({ ...prev, done: true }))
        }
      } catch (err) {
        if (alive) setError(err.message)
      }
    }
    tick()
    const timer = setInterval(tick, 3000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [job?.id, load])

  async function create() {
    const title = newTitle.trim()
    if (!title) return
    setBusy(true)
    try {
      const article = await api('/posts', { method: 'POST', body: { title } })
      setCreating(false)
      setNewTitle('')
      await load()
      setSelected(article.slug)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function importFile(file) {
    if (!file) return
    setImporting(true)
    try {
      const markdown = await file.text()
      const result = await api('/import', { method: 'POST', body: { markdown, filename: file.name } })
      await load()
      setSelected(result.article.slug)
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  function closeCreate() {
    setCreating(false)
    setNewTitle('')
  }

  return (
    <section className="blog-page">
      <div className="blog-page-head">
        <h1>{t('落墨')}</h1>
        <div className="blog-page-actions">
          <button type="button" className="blog-button" onClick={() => setView('articles')} aria-pressed={view === 'articles'}>
            {t('文章')}
          </button>
          <button type="button" className="blog-button" onClick={() => setView('factory')} aria-pressed={view === 'factory'}>
            {t('生产')}
          </button>
          {view === 'articles' ? (
            <>
              <button type="button" className="blog-button blog-only-narrow" onClick={() => setLeftOpen((value) => !value)}>
                {t('目录')}
              </button>
              <button type="button" className="blog-button" onClick={() => setChatOpen((value) => !value)} aria-pressed={chatOpen}>
                {chatOpen ? t('收起 AI') : t('AI')}
              </button>
              <button type="button" className="blog-button" onClick={() => importRef.current?.click()} disabled={importing}>
                {importing ? t('导入中…') : t('导入')}
              </button>
              <button type="button" className="blog-button is-primary" onClick={() => setCreating(true)}>{t('新建')}</button>
            </>
          ) : null}
        </div>
      </div>

      <input
        ref={importRef}
        type="file"
        accept=".md,.markdown,text/markdown"
        hidden
        onChange={(event) => {
          importFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />

      {job && !job.done ? (
        <p className="blog-note">
          {t('正在生成')}：{job.title || job.brief || job.id} · {job.status}/{job.stage}
        </p>
      ) : null}
      {job?.error ? <p className="blog-note is-error">{job.error}</p> : null}

      {creating && view === 'articles' ? (
        <div className="blog-create">
          <input
            autoFocus
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') create()
              if (event.key === 'Escape') closeCreate()
            }}
            placeholder={t('文章标题')}
          />
          <button type="button" className="blog-button is-primary" onClick={create} disabled={busy}>
            {busy ? t('创建中…') : t('创建')}
          </button>
          <button type="button" className="blog-button" onClick={closeCreate}>{t('取消')}</button>
        </div>
      ) : null}

      {view === 'factory' ? (
        <Pipeline onOpenArticle={(slug) => { setView('articles'); setSelected(slug) }} />
      ) : (
        <div className={`blog-workspace is-three ${chatOpen ? '' : 'chat-closed'} ${leftOpen ? 'left-open' : ''}`}>
          <aside className="blog-rail-left">
            <ArticleList
              posts={posts}
              loading={loading}
              error={error}
              selected={selected}
              onSelect={(slug) => {
                setSelected(slug)
                setLeftOpen(false)
              }}
            />
            <nav className="blog-outline">
              <div className="blog-outline-head">{t('本文大纲')}</div>
              {outline.length ? outline.map((heading, index) => (
                <button
                  type="button"
                  className="blog-outline-item"
                  key={`${heading}-${index}`}
                  onClick={() => setFocus({ heading, at: Date.now() })}
                >
                  {heading}
                </button>
              )) : <p className="blog-muted">{t('还没有小节')}</p>}
            </nav>
          </aside>

          <main className="blog-main">
            {selected ? (
              <ArticleDetail key={selected} slug={selected} onSaved={load} focus={focus} />
            ) : (
              <div className="blog-empty">
                <p>{posts.length ? t('从左侧选一篇文章。') : t('还没有文章。回到起笔写一篇。')}</p>
              </div>
            )}
          </main>

          {chatOpen ? (
            <aside className="blog-rail-right">
              <div className="blog-chat">
                <div className="blog-chat-head">
                  <span>{t('AI 对话')}</span>
                  <button type="button" className="blog-link" onClick={() => setChatOpen(false)}>{t('收起')}</button>
                </div>
                <div className="blog-chat-body">
                  <p className="blog-muted">{t('AI 对话下一步接入。这里会显示消息与修改提案。')}</p>
                </div>
                <div className="blog-chat-input">
                  <textarea rows={3} disabled placeholder={t('下一步接入…')} />
                  <button type="button" className="blog-button" disabled>{t('发送')}</button>
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      )}
    </section>
  )
}

function Placeholder({ title, text }) {
  return (
    <section className="blog-page">
      <div className="blog-page-head"><h1>{title}</h1></div>
      <p className="blog-muted">{text}</p>
    </section>
  )
}

function BlogShell() {
  const [tab, setTab] = React.useState('start')
  const [target, setTarget] = React.useState(null)

  function started(next) {
    setTarget(next)
    setTab('write')
  }

  return (
    <div className="blog-root">
      <style>{css}</style>
      <header className="blog-head">
        <div className="blog-head-top">
          <span className="blog-kicker">dsh-blog</span>
          <nav className="blog-nav">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={tab === key ? 'is-on' : ''}
                onClick={() => setTab(key)}
              >
                {t(label)}
              </button>
            ))}
          </nav>
          <span className="blog-spacer" />
        </div>
      </header>

      {tab === 'start' ? <StartPage onStarted={started} /> : null}
      {tab === 'write' ? <BlogPanel target={target} onConsumed={() => setTarget(null)} /> : null}
      {tab === 'site' ? <Placeholder title={t('阅卷')} text={t('整站预览与发布历史，下一步接入。')} /> : null}
      {tab === 'settings' ? <Placeholder title={t('立规')} text={t('站点、部署与诊断，下一步接入。')} /> : null}
    </div>
  )
}

export const inject = ['slots', 'locale']

export function apply(ctx) {
  ctx.effect(() => registerLocale(ctx))

  ctx.slots.inject('main', () => ctx.slots.register(
    { name: 'main', key: 'blog' },
    BlogShell,
  ))

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: 'blog',
    order: 8,
    label: () => t('title'),
  }, PanelIcon))
}
