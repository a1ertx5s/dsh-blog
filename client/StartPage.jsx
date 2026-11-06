import React from 'react'
import { api } from './api.js'
import { t } from './i18n.js'

export function StartPage({ onStarted }) {
  const [brief, setBrief] = React.useState('')
  const [busy, setBusy] = React.useState('')
  const [error, setError] = React.useState('')
  const [posts, setPosts] = React.useState([])

  React.useEffect(() => {
    api('/posts').then((data) => setPosts(data.posts || [])).catch(() => {})
  }, [])

  const review = posts.filter((post) => post.status === 'review').length
  const published = posts.filter((post) => post.status === 'published').length

  async function go(mode) {
    const text = brief.trim()
    if (!text) return
    setBusy(mode)
    setError('')
    try {
      const result = await api('/start', { method: 'POST', body: { brief: text, mode } })
      setBrief('')
      if (mode === 'blank') onStarted?.({ slug: result.article.slug })
      else onStarted?.({ jobId: result.job.id })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="blog-start">
      <div className="blog-start-inner">
        <h1>{t('今天写点什么？')}</h1>
        <textarea
          autoFocus
          className="blog-start-input"
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              go('produce')
            }
          }}
          placeholder={t('写一句 brief，越具体越好。Enter 开始，Shift+Enter 换行。')}
          rows={4}
        />
        <div className="blog-start-actions">
          <button type="button" className="blog-button is-primary" onClick={() => go('produce')} disabled={Boolean(busy) || !brief.trim()}>
            {busy === 'produce' ? t('开始中…') : t('开始写作')}
          </button>
          <button type="button" className="blog-button" onClick={() => go('blank')} disabled={Boolean(busy)}>
            {t('仅新建空白稿')}
          </button>
          <button type="button" className="blog-button" onClick={() => onStarted?.({ topics: true })}>
            {t('从选题开始')}
          </button>
        </div>
        {error ? <p className="blog-note is-error">{error}</p> : null}
        <div className="blog-start-recent">
          <span>{t('最近')}：{posts[0]?.title || '—'}</span>
          <span>{t('待审')} {review}</span>
          <span>{t('已发布')} {published}</span>
        </div>
      </div>
    </section>
  )
}
