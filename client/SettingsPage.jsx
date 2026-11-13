import React from 'react'
import { api } from './api.js'
import { Diagnostics } from './Diagnostics.jsx'
import { t } from './i18n.js'

function Icon({ name }) {
  const common = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }
  if (name === 'globe') {
    return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" /></svg>
  }
  if (name === 'doc') {
    return <svg {...common}><path d="M6 3h8l4 4v14H6z" /><path d="M9 12h6M9 16h6" /></svg>
  }
  if (name === 'gear') {
    return <svg {...common}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" /></svg>
  }
  if (name === 'upload') {
    return <svg {...common}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 17v3h16v-3" /></svg>
  }
  if (name === 'spark') {
    return <svg {...common}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>
  }
  return <svg {...common}><path d="M3 12h4l2-5 4 10 2-5h6" /></svg>
}

const GROUPS = [
  {
    key: 'site',
    label: '站点',
    color: '#0a84ff',
    icon: 'globe',
    fields: [
      { key: 'title', label: '标题' },
      { key: 'description', label: '描述' },
      { key: 'author', label: '作者' },
      { key: 'lang', label: '语言' },
      { key: 'url', label: 'url', hint: 'https://user.github.io' },
      { key: 'basePath', label: 'basePath', hint: '项目页写 /repo/' },
    ],
  },
  {
    key: 'content',
    label: '内容',
    color: '#af52de',
    icon: 'doc',
    fields: [
      { key: 'editorial', label: '作者手册', readOnly: true, display: 'editorial.md' },
      { key: 'status', label: '默认状态', readOnly: true, display: 'draft' },
      { key: 'tags', label: '默认标签', readOnly: true, display: '—' },
    ],
  },
  {
    key: 'factory',
    label: '工厂',
    color: '#ff9500',
    icon: 'gear',
    fields: [
      { key: 'budget.perArticleTokens', label: '单篇预算', kind: 'number', suffix: 'tokens' },
      { key: 'budget.monthlyTokens', label: '月度预算', kind: 'number', suffix: 'tokens' },
      { key: 'concurrency', label: '队列并发', readOnly: true, display: '1' },
    ],
  },
  {
    key: 'publish',
    label: '发布',
    color: '#34c759',
    icon: 'upload',
    fields: [
      { key: 'deploy.dir', label: '部署目录' },
      { key: 'deploy.branch', label: '分支' },
      { key: 'deploy.autoPush', label: '自动推送', kind: 'switch' },
    ],
  },
  {
    key: 'model',
    label: '模型与搜索',
    color: '#5ac8fa',
    icon: 'spark',
    fields: [
      { key: 'model', label: '当前模型', readOnly: true, display: '跟随 the agent harness 默认模型' },
      { key: 'search', label: '搜索', readOnly: true, display: '跟随 the agent harness Web 服务' },
    ],
  },
  {
    key: 'diag',
    label: '诊断',
    color: '#8e8e93',
    icon: 'pulse',
    fields: [],
  },
]

function getPath(object, path) {
  return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), object)
}

function setPath(object, path, value) {
  const keys = path.split('.')
  const next = { ...object }
  let cursor = next
  keys.forEach((key, index) => {
    if (index === keys.length - 1) cursor[key] = value
    else {
      cursor[key] = { ...(cursor[key] || {}) }
      cursor = cursor[key]
    }
  })
  return next
}

function payload(form) {
  return {
    title: form.title,
    description: form.description,
    author: form.author,
    lang: form.lang,
    url: form.url,
    basePath: form.basePath,
    budget: {
      perArticleTokens: Number(form.budget?.perArticleTokens) || 0,
      monthlyTokens: Number(form.budget?.monthlyTokens) || 0,
    },
    deploy: {
      dir: form.deploy?.dir || 'docs',
      branch: form.deploy?.branch || 'main',
      autoPush: Boolean(form.deploy?.autoPush),
    },
  }
}

export function SettingsPage() {
  const [form, setForm] = React.useState({})
  const [group, setGroup] = React.useState('site')
  const [detail, setDetail] = React.useState(null)
  const [draft, setDraft] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState(null)

  React.useEffect(() => {
    api('/settings')
      .then((settings) => setForm(settings))
      .catch((err) => setMessage({ kind: 'error', text: err.message }))
  }, [])

  const activeGroup = GROUPS.find((item) => item.key === group) || GROUPS[0]
  const visible = GROUPS.filter((item) => item.label.includes(query.trim()))

  async function save(next) {
    setBusy(true)
    try {
      const saved = await api('/settings', { method: 'PUT', body: payload(next) })
      setForm(saved)
      setMessage({ kind: 'ok', text: t('已保存') })
      return true
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
      return false
    } finally {
      setBusy(false)
    }
  }

  function openDetail(field) {
    if (field.kind === 'switch') {
      const next = setPath(form, field.key, !getPath(form, field.key))
      setForm(next)
      save(next)
      return
    }
    setDetail(field)
    setDraft(String(getPath(form, field.key) ?? field.display ?? ''))
    setMessage(null)
  }

  async function commit() {
    if (!detail) return
    const value = detail.kind === 'number' ? Number(draft) || 0 : draft
    const next = setPath(form, detail.key, value)
    const ok = await save(next)
    if (ok) setDetail(null)
  }

  function selectGroup(key) {
    setGroup(key)
    setDetail(null)
    setMessage(null)
  }

  const title = detail ? detail.label : activeGroup.label

  return (
    <section className="set-wrap">
      <aside className="set-side">
        <input
          className="set-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('搜索')}
          aria-label={t('搜索')}
        />
        <button type="button" className="set-account" onClick={() => selectGroup('site')}>
          <span className="set-account-avatar">G</span>
          <span className="set-account-text">
            <strong>{form.title || t('我的博客')}</strong>
            <em>{t('未连接 GitHub')}</em>
          </span>
        </button>
        <nav className="set-nav">
          {visible.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`set-nav-item${group === item.key ? ' is-on' : ''}`}
              onClick={() => selectGroup(item.key)}
            >
              <span className="set-nav-icon" style={{ background: item.color }}>
                <Icon name={item.icon} />
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="set-main">
        <div className="set-navbar">
          <div className="set-backpill">
            <button type="button" onClick={() => setDetail(null)} disabled={!detail} aria-label={t('返回')}>‹</button>
            <span className="set-backpill-line" />
            <button type="button" disabled aria-label={t('前进')}>›</button>
          </div>
          <h2 className="set-title">{title}</h2>
        </div>

        {message ? (
          <p className={message.kind === 'ok' ? 'set-message is-ok' : 'set-message is-error'}>{message.text}</p>
        ) : null}

        {activeGroup.key === 'diag' ? (
          <Diagnostics />
        ) : detail ? (
          <div className="set-detail">
            <label className="set-detail-label" htmlFor="set-detail-input">{detail.label}</label>
            {detail.readOnly ? (
              <p className="set-detail-readonly">{draft || '—'}</p>
            ) : (
              <input
                id="set-detail-input"
                className="set-detail-input"
                type={detail.kind === 'number' ? 'number' : 'text'}
                min={detail.kind === 'number' ? 0 : undefined}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') commit() }}
                placeholder={detail.hint}
                autoFocus
              />
            )}
            {detail.hint ? <p className="set-detail-hint">{detail.hint}</p> : null}
            {!detail.readOnly ? (
              <div className="set-detail-actions">
                <button type="button" className="blog-button is-primary" onClick={commit} disabled={busy}>
                  {busy ? t('保存中…') : t('完成')}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="set-card">
            {activeGroup.fields.map((field) => {
              const value = field.readOnly ? field.display : getPath(form, field.key)
              return (
                <button key={field.key} type="button" className="set-row" onClick={() => openDetail(field)}>
                  <span className="set-row-icon" style={{ background: activeGroup.color }}>
                    <Icon name={activeGroup.icon} />
                  </span>
                  <span className="set-row-label">{field.label}</span>
                  {field.kind === 'switch' ? (
                    <span className={`set-switch${value ? ' is-on' : ''}`} aria-hidden="true"><span /></span>
                  ) : (
                    <span className="set-row-value">{value === '' || value == null ? '—' : String(value)}</span>
                  )}
                  <span className="set-row-chevron">›</span>
                </button>
              )
            })}
          </div>
        )}
      </main>
    </section>
  )
}
