// dsh-blog 浏览器半片：主面板与侧栏入口。
import React from 'react'
import css from './styles.css'
import { api } from './api.js'
import { ArticleDetail } from './ArticleDetail.jsx'
import { ArticleList } from './ArticleList.jsx'
import { Diagnostics } from './Diagnostics.jsx'
import { Pipeline } from './Pipeline.jsx'
import { registerLocale, t } from './i18n.js'

function PanelIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5.5 4.5h9L19 9v10.5H5.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8.5 9.5h4M8.5 13h6M8.5 16.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function BlogPanel() {
  const [view, setView] = React.useState('posts')
  const [posts, setPosts] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [selected, setSelected] = React.useState(null)
  const [creating, setCreating] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState('')
  const [busy, setBusy] = React.useState(false)

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

  function closeCreate() {
    setCreating(false)
    setNewTitle('')
  }

  return (
    <div className="blog-root">
      <style>{css}</style>
      <header className="blog-head">
        <div className="blog-head-top">
          <span className="blog-kicker">dsh-blog</span>
          <nav className="blog-nav">
            <button type="button" className={view === 'posts' ? 'is-on' : ''} onClick={() => setView('posts')}>{t('文章')}</button>
            <button type="button" className={view === 'pipeline' ? 'is-on' : ''} onClick={() => setView('pipeline')}>{t('生产')}</button>
            <button type="button" className={view === 'status' ? 'is-on' : ''} onClick={() => setView('status')}>{t('状态')}</button>
          </nav>
          <span className="blog-spacer" />
          {view === 'posts' ? <button type="button" className="blog-button is-primary" onClick={() => setCreating(true)}>{t('新建')}</button> : null}
        </div>
        <h1>{t('heading')}</h1>
        <p className="blog-lead">{t('lead')}</p>
      </header>

      {creating && view === 'posts' ? (
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

      {view === 'pipeline' ? (
        <Pipeline onOpenArticle={(slug) => { setSelected(slug); setView('posts') }} />
      ) : view === 'status' ? <Diagnostics /> : (
        <div className="blog-workspace">
          <ArticleList
            posts={posts}
            loading={loading}
            error={error}
            selected={selected}
            onSelect={setSelected}
          />
          <main className="blog-main">
            {selected ? (
              <ArticleDetail key={selected} slug={selected} onSaved={load} />
            ) : (
              <div className="blog-empty">
                <p>{posts.length ? t('从左侧选一篇文章。') : t('还没有文章。先新建一篇，或去生产页跑一篇。')}</p>
                {!posts.length ? (
                  <div className="blog-job-actions">
                    <button type="button" className="blog-button is-primary" onClick={() => setCreating(true)}>{t('新建文章')}</button>
                    <button type="button" className="blog-button" onClick={() => setView('pipeline')}>{t('去生产')}</button>
                  </div>
                ) : null}
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  )
}

export const inject = ['slots', 'locale']

export function apply(ctx) {
  ctx.effect(() => registerLocale(ctx))

  ctx.slots.inject('main', () => ctx.slots.register(
    { name: 'main', key: 'blog' },
    BlogPanel,
  ))

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: 'blog',
    order: 8,
    label: () => t('title'),
  }, PanelIcon))
}
