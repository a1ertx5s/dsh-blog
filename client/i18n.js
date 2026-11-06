// 客户端文案与 locale 注册。新文案直接用中文当 key，英文在 v1.1 补齐。
const DICT = {
  zh: {
    title: '博客',
    heading: '博客工作台',
    lead: 'AI 长文工厂：选题进，文章出，人只管审批。',
    mounted: '面板已挂载',
    next: '服务探针已就绪，下一步是内容模型。',
    stage: 'M1-6',
    routeChecking: '正在检查路由…',
    routeOk: '路由已连通',
    routeFail: '路由未连通',
    probe: '运行探针',
    probing: '探针运行中…',
    probeModel: '模型',
    probeWeb: '联网',
    probeFailed: '探针失败',
    blogRoot: '博客目录',
    rootLoading: '读取中…',
    rootReady: '已初始化',
    rootMissing: '未初始化',
    gitOn: 'git 就绪',
    gitOff: '无 git',
    init: '初始化目录',
  },
  en: {
    title: 'Blog',
    heading: 'Blog desk',
    lead: 'An AI long-form factory: topics in, articles out, humans only approve.',
    mounted: 'Panel mounted',
    next: 'Service probes are in. Next: the content model.',
    stage: 'M1-6',
    routeChecking: 'Checking routes…',
    routeOk: 'Routes connected',
    routeFail: 'Routes unavailable',
    probe: 'Run probe',
    probing: 'Probing…',
    probeModel: 'Model',
    probeWeb: 'Web',
    probeFailed: 'Probe failed',
    blogRoot: 'Blog root',
    rootLoading: 'Reading…',
    rootReady: 'initialized',
    rootMissing: 'not initialized',
    gitOn: 'git ready',
    gitOff: 'no git',
    init: 'Initialize',
  },
}

let translate = (key) => DICT.zh[key] ?? key

export function t(key, params) {
  return translate(key, params)
}

export function registerLocale(ctx) {
  try {
    const releases = [
      ctx.locale.register('dsh-blog', 'zh', DICT.zh),
      ctx.locale.register('dsh-blog', 'en', DICT.en),
    ]
    const bound = ctx.locale.bind('dsh-blog')
    translate = (key, params) => {
      try {
        const value = bound(key, params)
        if (typeof value === 'string' && value !== key) return value
      } catch {}
      return DICT.zh[key] ?? key
    }
    return () => releases.forEach((release) => release())
  } catch {
    return () => {}
  }
}
