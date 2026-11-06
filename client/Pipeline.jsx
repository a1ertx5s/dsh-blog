import React from 'react'
import { api } from './api.js'
import { t } from './i18n.js'

const STATUS = {
  queued: '排队',
  running: '运行中',
  gated: '待审',
  review: '待审',
  approved: '已通过',
  rejected: '已打回',
  published: '已发布',
  failed: '失败',
  cancelled: '已取消',
}

const STAGE = {
  research: '研究',
  outline: '大纲',
  draft: '初稿',
  gates: '门禁',
  revise: '修订',
  review: '待审',
  publish: '发布',
}

function Artifacts({ data }) {
  const sources = data.sources?.sources ?? []
  const sections = data.outline?.outline?.sections ?? []
  const gates = data.gates
  const failed = (gates?.checks ?? []).filter((check) => !check.ok && !check.skipped)
  return (
    <div className="blog-artifacts">
      <p>
        {t('来源')}：{sources.length}
        {' · '}
        {t('大纲')}：{sections.length} {t('节')}
        {' · '}
        {t('门禁')}：{gates ? (gates.passed ? t('通过') : t('未通过')) : t('未生成')}
      </p>
      {failed.length ? <p className="blog-error">{t('未过')}：{failed.map((check) => check.id).join('、')}</p> : null}
      {sources.length ? (
        <ul>
          {sources.slice(0, 5).map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function Pipeline({ onOpenArticle }) {
  const [jobs, setJobs] = React.useState([])
  const [brief, setBrief] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState('')
  const [artifacts, setArtifacts] = React.useState({})
  const [rejecting, setRejecting] = React.useState(null)
  const [comment, setComment] = React.useState('')

  const load = React.useCallback(async () => {
    try {
      const data = await api('/jobs')
      setJobs(data.jobs || [])
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    if (!jobs.some((job) => job.status === 'running')) return undefined
    const timer = setInterval(load, 2000)
    return () => clearInterval(timer)
  }, [jobs, load])

  async function create() {
    const text = brief.trim()
    if (!text) return
    setBusy('create')
    try {
      await api('/jobs', { method: 'POST', body: { brief: text, title: title.trim() } })
      setBrief('')
      setTitle('')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function run(id) {
    setBusy(id)
    try {
      await api(`/jobs/${id}/run`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function approve(id) {
    setBusy(id)
    try {
      await api(`/jobs/${id}/approve`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function reject(id) {
    if (!comment.trim()) return
    setBusy(id)
    try {
      await api(`/jobs/${id}/reject`, { method: 'POST', body: { comment: comment.trim() } })
      setRejecting(null)
      setComment('')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function showArtifacts(id) {
    try {
      const data = await api(`/jobs/${id}/artifacts`)
      setArtifacts((prev) => ({ ...prev, [id]: data }))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="blog-pipeline">
      {error ? <p className="blog-note is-error">{error}</p> : null}

      <div className="blog-job-create">
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('标题（可选）')} />
        <textarea
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          placeholder={t('这篇要写什么？给一句 brief，越具体越好。')}
          rows={3}
        />
        <button type="button" className="blog-button is-primary" onClick={create} disabled={busy === 'create'}>
          {busy === 'create' ? t('创建中…') : t('开始生产')}
        </button>
      </div>

      {loading ? <p className="blog-muted">{t('加载中…')}</p> : null}
      {!loading && jobs.length === 0 ? <p className="blog-muted">{t('还没有生产任务。')}</p> : null}

      {jobs.map((job) => (
        <article className="blog-job" key={job.id}>
          <div className="blog-job-head">
            <strong>{job.title || job.brief.slice(0, 40)}</strong>
            <span className={`blog-chip is-${job.status}`}>{STATUS[job.status] ?? job.status}</span>
            <span className="blog-job-stage">{STAGE[job.stage] ?? job.stage}</span>
          </div>
          <p className="blog-job-brief">{job.brief}</p>
          {job.error ? <p className="blog-error">{job.error}</p> : null}

          <div className="blog-job-actions">
            {['queued', 'failed'].includes(job.status) ? (
              <button type="button" className="blog-button" onClick={() => run(job.id)} disabled={busy === job.id}>
                {t('运行')}
              </button>
            ) : null}
            {job.status === 'review' ? (
              <button type="button" className="blog-button is-primary" onClick={() => approve(job.id)} disabled={busy === job.id}>
                {t('通过')}
              </button>
            ) : null}
            {job.status === 'review' ? (
              <button type="button" className="blog-button" onClick={() => { setRejecting(job.id); setComment('') }}>
                {t('打回')}
              </button>
            ) : null}
            {job.slug && ['review', 'approved', 'published'].includes(job.status) ? (
              <button type="button" className="blog-button" onClick={() => onOpenArticle?.(job.slug)}>
                {t('打开文章')}
              </button>
            ) : null}
            <button type="button" className="blog-button" onClick={() => showArtifacts(job.id)}>
              {t('产物')}
            </button>
          </div>

          {rejecting === job.id ? (
            <div className="blog-reject">
              <input
                autoFocus
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={t('哪里不行？给一句具体意见')}
              />
              <button type="button" className="blog-button" onClick={() => reject(job.id)} disabled={busy === job.id}>
                {t('提交打回')}
              </button>
            </div>
          ) : null}

          {artifacts[job.id] ? <Artifacts data={artifacts[job.id]} /> : null}
        </article>
      ))}
    </section>
  )
}
