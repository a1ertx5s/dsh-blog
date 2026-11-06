// 成本看板：按 job 与本月聚合 token。
import { sameMonth, usageTotal } from './budget.js'
import { listJobs } from './jobs.js'

export async function costReport(root, now = new Date()) {
  const jobs = await listJobs(root)
  const rows = jobs.map((job) => ({
    id: job.id,
    title: job.title || job.brief.slice(0, 40),
    status: job.status,
    tokens: usageTotal(job.usage),
    usage: job.usage || { input: 0, output: 0 },
    createdAt: job.createdAt,
  })).sort((a, b) => b.tokens - a.tokens)

  return {
    total: rows.reduce((sum, row) => sum + row.tokens, 0),
    month: rows.filter((row) => sameMonth(row.createdAt, now)).reduce((sum, row) => sum + row.tokens, 0),
    jobs: rows,
  }
}
