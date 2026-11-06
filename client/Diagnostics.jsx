import React from 'react'
import { api } from './api.js'
import { t } from './i18n.js'

function probeLine(label, result) {
  if (!result) return `${label}: -`
  if (!result.ok) return `${label}: ${result.error || 'failed'}`
  const detail = typeof result.count === 'number' ? String(result.count) : (result.text || 'OK')
  return `${label}: ${detail}`
}

export function Diagnostics() {
  const [state, setState] = React.useState(null)
  const [root, setRoot] = React.useState(null)
  const [probe, setProbe] = React.useState(null)
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    Promise.all([api('/state'), api('/root')])
      .then(([nextState, nextRoot]) => {
        if (!alive) return
        setState(nextState)
        setRoot(nextRoot)
      })
      .catch((err) => { if (alive) setError(err.message) })
    return () => { alive = false }
  }, [])

  async function init() {
    setBusy(true)
    try {
      setRoot(await api('/root/init', { method: 'POST' }))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function runProbe() {
    setBusy(true)
    try {
      setProbe(await api('/probe', { method: 'POST' }))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const probeText = probe
    ? [
        probeLine(t('probeModel'), probe.model),
        probeLine(t('probeWeb'), probe.web),
      ].join('\n')
    : ''

  return (
    <section className="blog-diagnostics">
      {error ? <p className="blog-note is-error">{error}</p> : null}

      <div className="blog-diag-card">
        <h3>{t('路由与目录')}</h3>
        <p>{t('路由')}: {state ? `${t('已连通')} · ${state.stage}` : t('读取中…')}</p>
        <p>{t('博客目录')}: {root?.root || '—'}</p>
        <p>
          {root?.initialized ? t('已初始化') : t('未初始化')}
          {' · '}
          {root?.git ? t('git 就绪') : t('无 git')}
        </p>
        {root && !root.initialized ? (
          <button type="button" className="blog-button" onClick={init} disabled={busy}>{t('初始化目录')}</button>
        ) : null}
      </div>

      <div className="blog-diag-card">
        <h3>{t('模型与联网')}</h3>
        <button type="button" className="blog-button" onClick={runProbe} disabled={busy}>
          {busy ? t('探针运行中…') : t('运行探针')}
        </button>
        {probeText ? <pre className="blog-probe-result">{probeText}</pre> : null}
      </div>
    </section>
  )
}
