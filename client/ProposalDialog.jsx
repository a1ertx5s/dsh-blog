import React from 'react'
import { api } from './api.js'
import { t } from './i18n.js'

export function ProposalDialog({ proposal, onClose, onAccepted }) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  async function accept() {
    setBusy(true)
    setError('')
    try {
      const article = await api(`/posts/${encodeURIComponent(proposal.slug)}`)
      const result = await api(`/chat/proposals/${proposal.id}/accept`, {
        method: 'POST',
        body: { version: article.version },
      })
      onAccepted?.(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function reject() {
    setBusy(true)
    setError('')
    try {
      await api(`/chat/proposals/${proposal.id}/reject`, { method: 'POST' })
      onClose?.()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="blog-local-overlay" role="dialog" onClick={(event) => {
      if (event.target === event.currentTarget && !busy) onClose?.()
    }}>
      <div className="blog-proposal">
        <div className="blog-proposal-head">
          <strong>{t('修改提案')}</strong>
          {proposal.target?.heading ? <span className="blog-muted">{proposal.target.heading}</span> : null}
        </div>
        <div className="blog-proposal-body">
          <div className="blog-proposal-col">
            <div className="blog-proposal-label">{t('原有内容')}</div>
            <pre>{proposal.before}</pre>
          </div>
          <div className="blog-proposal-col">
            <div className="blog-proposal-label">{t('新内容')}</div>
            <pre className="is-new">{proposal.after}</pre>
          </div>
        </div>
        {error ? <p className="blog-note is-error">{error}</p> : null}
        <div className="blog-proposal-actions">
          <button type="button" className="blog-button" onClick={reject} disabled={busy}>{t('放弃')}</button>
          <button type="button" className="blog-button is-primary" onClick={accept} disabled={busy}>
            {busy ? t('处理中…') : t('接受并保存版本')}
          </button>
        </div>
      </div>
    </div>
  )
}
