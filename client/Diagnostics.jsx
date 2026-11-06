import React from 'react'
import { api } from './api.js'
import { t } from './i18n.js'

function probeLine(label, result) {
  if (!result) return `${label}: -`
  if (!result.ok) return `${label}: ${result.error || 'failed'}${result.hint ? `\n${result.hint}` : ''}`
  if (typeof result.count === 'number') return `${label}: ${result.count}`
  const who = result.provider ? ` · ${result.provider}/${result.model}` : ''
  const finish = result.finish ? ` (${result.finish})` : ''
  return `${label}: ${result.text || 'OK'}${who}${finish}`
}

export function Diagnostics() {
  const [state, setState] = React.useState(null)
  const [root, setRoot] = React.useState(null)
  const [probe, setProbe] = React.useState(null)
  const [build, setBuild] = React.useState(null)
  const [deploy, setDeploy] = React.useState(null)
  const [check, setCheck] = React.useState(null)
  const [budget, setBudget] = React.useState(null)
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    Promise.all([api('/state'), api('/root'), api('/build').catch(() => null), api('/deploy').catch(() => null), api('/budget').catch(() => null)])
      .then(([nextState, nextRoot, nextBuild, nextDeploy, nextBudget]) => {
        if (!alive) return
        setState(nextState)
        setRoot(nextRoot)
        setBuild(nextBuild)
        setDeploy(nextDeploy)
        setBudget(nextBudget)
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

  async function buildSite() {
    setBusy(true)
    try {
      setBuild(await api('/build', { method: 'POST' }))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function deployNow() {
    setBusy(true)
    try {
      const result = await api('/deploy', { method: 'POST' })
      setDeploy(result)
      setBuild(result.build || build)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function runCheck() {
    setBusy(true)
    try {
      setCheck(await api('/check', { method: 'POST', body: { live: false } }))
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
        <h3>{t('站点构建')}</h3>
        <button type="button" className="blog-button" onClick={buildSite} disabled={busy}>
          {busy ? t('构建中…') : t('构建站点')}
        </button>
        {build ? <p>{t('已发布文章')}: {build.articles} · {build.at}</p> : null}
        {build?.warnings?.length ? <p className="blog-error">{build.warnings.join('；')}</p> : null}
        <button type="button" className="blog-button" onClick={deployNow} disabled={busy}>
          {busy ? t('部署中…') : t('构建并部署')}
        </button>
        {deploy ? (
          <p className={deploy.ok ? 'blog-note is-ok' : 'blog-note is-error'}>
            {deploy.ok
              ? `${deploy.skipped ? t('没有变更') : t('已部署')}${deploy.commit ? ` · ${deploy.commit}` : ''}${deploy.url ? ` · ${deploy.url}` : ''}`
              : (deploy.error || t('部署失败'))}
          </p>
        ) : null}
        {deploy?.warning ? <p className="blog-note">{deploy.warning}</p> : null}
      </div>

      <div className="blog-diag-card">
        <h3>{t('预算')}</h3>
        {budget ? (
          <>
            <p>{t('本月 tokens')}: {budget.month}{budget.budget?.monthlyTokens ? ` / ${budget.budget.monthlyTokens} (${budget.ok ? t('正常') : t('已超限')})` : ''}</p>
            <p>{t('单篇上限')}: {budget.budget?.perArticleTokens || t('不限')}</p>
          </>
        ) : <p>{t('读取中…')}</p>}
      </div>

      <div className="blog-diag-card">
        <h3>{t('站点自检')}</h3>
        <button type="button" className="blog-button" onClick={runCheck} disabled={busy}>
          {busy ? t('自检中…') : t('运行自检')}
        </button>
        {check ? (
          <p className={check.ok ? 'blog-note is-ok' : 'blog-note is-error'}>
            {check.ok ? t('通过') : `${check.issues.length} ${t('个问题')}`}
          </p>
        ) : null}
        {check?.issues?.length ? (
          <ul className="blog-check-list">
            {check.issues.slice(0, 5).map((issue, index) => (
              <li key={index}>{issue.type}: {issue.target}</li>
            ))}
          </ul>
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
