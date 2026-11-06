import React from 'react'
import { api } from './api.js'
import { t } from './i18n.js'

export function SitePage() {
  const [settings, setSettings] = React.useState(null)
  const [preview, setPreview] = React.useState(null)
  const [deploy, setDeploy] = React.useState(null)
  const [check, setCheck] = React.useState(null)
  const [busy, setBusy] = React.useState('')
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    Promise.all([api('/settings'), api('/deploy').catch(() => null)])
      .then(([nextSettings, nextDeploy]) => {
        setSettings(nextSettings)
        setDeploy(nextDeploy)
      })
      .catch((err) => setError(err.message))
  }, [])

  async function build() {
    setBusy('build')
    setError('')
    try {
      const result = await api('/preview', { method: 'POST', body: { slug: '' } })
      setPreview(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function publish() {
    setBusy('deploy')
    setError('')
    try {
      setDeploy(await api('/deploy', { method: 'POST' }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function runCheck() {
    setBusy('check')
    setError('')
    try {
      setCheck(await api('/check', { method: 'POST', body: { live: false } }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const online = settings ? `${settings.url || ''}${settings.basePath || '/'}` : ''

  return (
    <section className="blog-page">
      <div className="blog-page-head">
        <h1>{t('阅卷')}</h1>
        <div className="blog-page-actions">
          <button type="button" className="blog-button" onClick={build} disabled={Boolean(busy)}>
            {busy === 'build' ? t('构建中…') : t('构建预览')}
          </button>
          <button type="button" className="blog-button is-primary" onClick={publish} disabled={Boolean(busy)}>
            {busy === 'deploy' ? t('部署中…') : t('发布')}
          </button>
          <button type="button" className="blog-button" onClick={runCheck} disabled={Boolean(busy)}>
            {busy === 'check' ? t('自检中…') : t('自检')}
          </button>
          {online ? <a className="blog-button" href={online} target="_blank" rel="noreferrer">{t('打开线上')}</a> : null}
        </div>
      </div>

      {error ? <p className="blog-note is-error">{error}</p> : null}
      {deploy ? (
        <p className={deploy.ok ? 'blog-note is-ok' : 'blog-note is-error'}>
          {deploy.ok
            ? `${deploy.skipped ? t('没有变更') : t('已部署')}${deploy.commit ? ` · ${deploy.commit}` : ''}${deploy.url ? ` · ${deploy.url}` : ''}`
            : (deploy.error || t('部署失败'))}
        </p>
      ) : null}
      {check ? (
        <p className={check.ok ? 'blog-note is-ok' : 'blog-note is-error'}>
          {check.ok ? t('自检通过') : `${check.issues.length} ${t('个问题')}`}
        </p>
      ) : null}

      <div className="blog-site-frame">
        {preview ? (
          <iframe title={t('站点预览')} src={preview.basePath} />
        ) : (
          <p className="blog-muted">{t('点「构建预览」查看当前站点。')}</p>
        )}
      </div>
    </section>
  )
}
