import React from 'react'
import { api } from './api.js'
import { t } from './i18n.js'

function PenIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20l4.2-1 9.6-9.6a2.1 2.1 0 0 0-3-3L5.2 16 4 20z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M13.8 6.2l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function StartPage({ onStarted }) {
  const [brief, setBrief] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const inputRef = React.useRef(null)

  React.useEffect(() => {
    const element = inputRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`
  }, [brief])

  React.useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function submit() {
    const text = brief.trim()
    if (!text || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await api('/start', { method: 'POST', body: { brief: text, mode: 'produce' } })
      setBrief('')
      onStarted?.({ jobId: result.job.id })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="start-canvas">
      <div className="start-inner">
        <h1 className="start-title">{t('今天写点什么？')}</h1>
        <div className="start-composer">
          <span className="start-composer__icon"><PenIcon /></span>
          <textarea
            ref={inputRef}
            className="start-input"
            rows={1}
            value={brief}
            aria-label={t('写一句 brief')}
            placeholder={t('写一句 brief，Enter 开始…')}
            onChange={(event) => setBrief(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                submit()
              }
            }}
            disabled={busy}
          />
          <button
            type="button"
            className="start-send"
            onClick={submit}
            disabled={busy || !brief.trim()}
            aria-label={t('开始写作')}
          >
            {busy ? '…' : '↵'}
          </button>
        </div>
        {error ? <p className="start-error">{error}</p> : null}
      </div>
    </section>
  )
}
