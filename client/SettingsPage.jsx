import React from 'react'
import { api } from './api.js'
import { Diagnostics } from './Diagnostics.jsx'
import { t } from './i18n.js'

const EMPTY = {
  title: '',
  description: '',
  url: '',
  basePath: '/',
  author: '',
  lang: 'zh-CN',
  budget: { perArticleTokens: 0, monthlyTokens: 0 },
  deploy: { dir: 'docs', branch: 'main', autoPush: false },
}

export function SettingsPage() {
  const [form, setForm] = React.useState(EMPTY)
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState(null)

  React.useEffect(() => {
    api('/settings')
      .then((settings) => setForm({ ...EMPTY, ...settings, budget: { ...EMPTY.budget, ...settings.budget }, deploy: { ...EMPTY.deploy, ...settings.deploy } }))
      .catch((err) => setMessage({ kind: 'error', text: err.message }))
  }, [])

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      const saved = await api('/settings', {
        method: 'PUT',
        body: {
          title: form.title,
          description: form.description,
          url: form.url,
          basePath: form.basePath,
          author: form.author,
          lang: form.lang,
          budget: {
            perArticleTokens: Number(form.budget?.perArticleTokens) || 0,
            monthlyTokens: Number(form.budget?.monthlyTokens) || 0,
          },
          deploy: {
            dir: form.deploy?.dir || 'docs',
            branch: form.deploy?.branch || 'main',
            autoPush: Boolean(form.deploy?.autoPush),
          },
        },
      })
      setForm({ ...saved, budget: { ...EMPTY.budget, ...saved.budget }, deploy: { ...EMPTY.deploy, ...saved.deploy } })
      setMessage({ kind: 'ok', text: t('已保存') })
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="blog-page">
      <div className="blog-page-head">
        <h1>{t('立规')}</h1>
        <div className="blog-page-actions">
          <button type="button" className="blog-button is-primary" onClick={save} disabled={busy}>
            {busy ? t('保存中…') : t('保存')}
          </button>
        </div>
      </div>

      {message ? <p className={message.kind === 'ok' ? 'blog-note is-ok' : 'blog-note is-error'}>{message.text}</p> : null}

      <div className="blog-form">
        <label className="blog-field"><span>{t('标题')}</span><input value={form.title} onChange={(event) => set('title', event.target.value)} /></label>
        <label className="blog-field"><span>{t('描述')}</span><input value={form.description} onChange={(event) => set('description', event.target.value)} /></label>
        <label className="blog-field"><span>{t('作者')}</span><input value={form.author} onChange={(event) => set('author', event.target.value)} /></label>
        <label className="blog-field"><span>{t('语言')}</span><input value={form.lang} onChange={(event) => set('lang', event.target.value)} /></label>
        <label className="blog-field"><span>url</span><input value={form.url} onChange={(event) => set('url', event.target.value)} placeholder="https://user.github.io" /></label>
        <label className="blog-field"><span>basePath</span><input value={form.basePath} onChange={(event) => set('basePath', event.target.value)} placeholder="/repo/" /></label>
        <label className="blog-field"><span>{t('单篇预算 tokens')}</span><input type="number" min="0" value={form.budget?.perArticleTokens ?? 0} onChange={(event) => setForm((prev) => ({ ...prev, budget: { ...prev.budget, perArticleTokens: event.target.value } }))} /></label>
        <label className="blog-field"><span>{t('月度预算 tokens')}</span><input type="number" min="0" value={form.budget?.monthlyTokens ?? 0} onChange={(event) => setForm((prev) => ({ ...prev, budget: { ...prev.budget, monthlyTokens: event.target.value } }))} /></label>
        <label className="blog-field"><span>autoPush</span><input type="checkbox" checked={Boolean(form.deploy?.autoPush)} onChange={(event) => setForm((prev) => ({ ...prev, deploy: { ...prev.deploy, autoPush: event.target.checked } }))} /></label>
      </div>

      <Diagnostics />
    </section>
  )
}
