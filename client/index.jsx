// dsh-blog 浏览器半片：主面板与侧栏入口。
import React from 'react'
import css from './styles.css'

const DICT = {
  zh: {
    title: '博客',
    heading: '博客工作台',
    lead: 'AI 长文工厂：选题进，文章出，人只管审批。',
    mounted: '面板已挂载',
    next: '下一步接入路由、内容模型与生产流水线。',
    stage: 'M0-3',
  },
  en: {
    title: 'Blog',
    heading: 'Blog desk',
    lead: 'An AI long-form factory: topics in, articles out, humans only approve.',
    mounted: 'Panel mounted',
    next: 'Next: routes, content model and the production pipeline.',
    stage: 'M0-3',
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

function PanelIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5.5 4.5h9L19 9v10.5H5.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8.5 9.5h4M8.5 13h6M8.5 16.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function BlogPanel() {
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
