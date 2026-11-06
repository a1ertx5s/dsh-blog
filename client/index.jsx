// dsh-blog 浏览器半片：主面板与侧栏入口。
import React from 'react'
import css from './styles.css'

const DICT = {
  zh: {
    title: '博客',
    heading: '博客工作台',
    lead: 'AI 长文工厂：选题进，文章出，人只管审批。',
    mounted: '面板已挂载',
    next: '服务探针已就绪，下一步是内容模型。',
    stage: 'M0-5',
    routeChecking: '正在检查路由…',
    routeOk: '路由已连通',
    routeFail: '路由未连通',
    probe: '运行探针',
    probing: '探针运行中…',
    probeModel: '模型',
    probeWeb: '联网',
    probeFailed: '探针失败',
  },
  en: {
    title: 'Blog',
    heading: 'Blog desk',
    lead: 'An AI long-form factory: topics in, articles out, humans only approve.',
    mounted: 'Panel mounted',
    next: 'Service probes are in. Next: the content model.',
    stage: 'M0-5',
    routeChecking: 'Checking routes…',
    routeOk: 'Routes connected',
    routeFail: 'Routes unavailable',
    probe: 'Run probe',
    probing: 'Probing…',
    probeModel: 'Model',
    probeWeb: 'Web',
    probeFailed: 'Probe failed',
  },
}

let t = (key) => DICT.zh[key] ?? key

function registerLocale(ctx) {
  try {
    const releases = [
      ctx.locale.register('dsh-blog', 'zh', DICT.zh),
      ctx.locale.register('dsh-blog', 'en', DICT.en),
    ]
    const bound = ctx.locale.bind('dsh-blog')
    t = (key, params) => {
      try {
        const value = bound(key, params)
        if (typeof value === 'string' && value !== key) return value
      } catch {}
      return DICT.zh[key] ?? key
    }
    return () => releases.forEach((release) => release())
  } catch {
    // locale 不可用时退回中文，面板仍然可用。
    return () => {}
  }
}

function useRouteState() {
  const [route, setRoute] = React.useState({ status: 'loading' })
  React.useEffect(() => {
    let alive = true
    fetch('/blog/state', { headers: { accept: 'application/json' } })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!alive) return
        setRoute(res.ok ? { status: 'ok', body } : { status: 'error', code: res.status })
      })
      .catch((err) => {
        if (alive) setRoute({ status: 'error', message: err?.message || '' })
      })
    return () => { alive = false }
  }, [])
  return route
}

function useProbe() {
  const [probe, setProbe] = React.useState(null)
  const [busy, setBusy] = React.useState(false)

  const run = React.useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch('/blog/probe', { method: 'POST', headers: { accept: 'application/json' } })
      const body = await res.json().catch(() => ({}))
      setProbe({ ok: res.ok, code: res.status, body })
    } catch (err) {
      setProbe({ ok: false, error: err?.message || '请求失败' })
    } finally {
      setBusy(false)
    }
  }, [])

  return { probe, busy, run }
}

function probeLine(label, result) {
  if (!result) return `${label}: -`
  if (!result.ok) return `${label}: ${result.error || 'failed'}`
  const detail = typeof result.count === 'number' ? String(result.count) : (result.text || 'OK')
  return `${label}: ${detail}`
}

function PanelIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5.5 4.5h9L19 9v10.5H5.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8.5 9.5h4M8.5 13h6M8.5 16.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function BlogPanel() {
  const route = useRouteState()
  const { probe, busy, run } = useProbe()

  const routeClass = route.status === 'ok'
    ? 'blog-status is-ok'
    : route.status === 'error' ? 'blog-status is-error' : 'blog-status'
  const detail = route.code ? ` (${route.code})` : route.message ? ` (${route.message})` : ''
  const routeText = route.status === 'loading'
    ? t('routeChecking')
    : route.status === 'ok' ? t('routeOk') : `${t('routeFail')}${detail}`

  const probeText = probe
    ? [
        probe.ok ? probeLine(t('probeModel'), probe.body?.model) : `${t('probeFailed')}${probe.code ? ` (${probe.code})` : ''}`,
        probe.ok ? probeLine(t('probeWeb'), probe.body?.web) : (probe.error || probe.body?.error || ''),
      ].filter(Boolean).join('\n')
    : ''

  return (
    <div className="blog-root">
      <style>{css}</style>
      <header className="blog-head">
        <span className="blog-kicker">dsh-blog</span>
        <h1>{t('heading')}</h1>
        <p className="blog-lead">{t('lead')}</p>
      </header>
      <section className="blog-card">
        <span className="blog-badge">{t('stage')}</span>
        <h2>{t('mounted')}</h2>
        <p>{t('next')}</p>
        <p className={routeClass}>{routeText}</p>
        <div className="blog-probe">
          <button type="button" className="blog-button" onClick={run} disabled={busy}>
            {busy ? t('probing') : t('probe')}
          </button>
          {probeText ? <pre className="blog-probe-result">{probeText}</pre> : null}
        </div>
      </section>
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
