// 预算：单篇/月度 token 上限，超限抛 BUDGET_EXCEEDED。
import { loadSite } from './build.js'
import { listJobs, readJob, updateJob } from './jobs.js'

export class BudgetError extends Error {
  constructor(message, { status = 402, code = 'BUDGET_EXCEEDED', detail = null } = {}) {
    super(message)
    this.name = 'BudgetError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}

export function usageTotal(usage) {
  return (Number(usage?.input) || 0) + (Number(usage?.output) || 0)
}

export function sameMonth(iso, now) {
  const date = new Date(iso)
  return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth()
}

export async function monthlyUsage(root, now = new Date()) {
  const jobs = await listJobs(root)
  return jobs
    .filter((job) => sameMonth(job.createdAt, now))
    .reduce((sum, job) => sum + usageTotal(job.usage), 0)
}

export async function budgetStatus(root, { job = null, now = new Date() } = {}) {
  const site = await loadSite(root)
  const budget = site.budget || { perArticleTokens: 0, monthlyTokens: 0 }
  const article = usageTotal(job?.usage)
  const month = await monthlyUsage(root, now)

  if (budget.perArticleTokens > 0 && article >= budget.perArticleTokens) {
    return { ok: false, scope: 'article', used: article, limit: budget.perArticleTokens, month, budget }
  }
  if (budget.monthlyTokens > 0 && month >= budget.monthlyTokens) {
    return { ok: false, scope: 'month', used: month, limit: budget.monthlyTokens, month, budget }
  }
  return { ok: true, scope: null, article, month, budget }
}

export async function assertBudget(root, { job = null, now = new Date() } = {}) {
  const status = await budgetStatus(root, { job, now })
  if (!status.ok) {
    const label = status.scope === 'article' ? '单篇预算' : '月度预算'
    throw new BudgetError(`${label}已用尽（${status.used}/${status.limit} tokens）`, { detail: status })
  }
  return status
}

export async function addUsage(root, id, usage) {
  const job = await readJob(root, id)
  if (!job) return null
  const current = job.usage || { input: 0, output: 0 }
  return updateJob(root, id, {
    usage: {
      input: (Number(current.input) || 0) + (Number(usage?.input) || 0),
      output: (Number(current.output) || 0) + (Number(usage?.output) || 0),
    },
  })
}
