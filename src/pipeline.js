// 生产流水线：research → outline → draft → gates（不过自动回炉一次）。
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readArticle } from './article.js'
import { addUsage, assertBudget } from './budget.js'
import { draftJob } from './draft.js'
import { runGates } from './gates.js'
import { readJob, updateJob } from './jobs.js'
import { callModel } from './llm.js'
import { outlineJob } from './outline.js'
import { researchJob } from './research.js'
import { reviseJob } from './revise.js'

const active = new Set()

export function isJobActive(id) {
  return active.has(id)
}

async function readEditorial(root) {
  try {
    return await readFile(join(root, 'editorial.md'), 'utf8')
  } catch {
    return ''
  }
}

async function readRun(root, jobId, name) {
  try {
    return JSON.parse(await readFile(join(root, '.blog', 'runs', jobId, name), 'utf8'))
  } catch {
    return null
  }
}

function failures(gates) {
  return (gates?.checks ?? [])
    .filter((check) => !check.ok && !check.skipped)
    .map((check) => check.id)
}

function autoComment(gates) {
  const ids = failures(gates)
  return `自动回炉：修复以下门禁问题：${ids.join('、') || '未知'}。保持原有结构和来源引用。`
}

export async function runPipeline(ctx, { root, job, call = callModel, deps = {} } = {}) {
  const researchStage = deps.research ?? researchJob
  const outlineStage = deps.outline ?? outlineJob
  const draftStage = deps.draft ?? draftJob
  const gatesStage = deps.gates ?? runGates
  const reviseStage = deps.revise ?? reviseJob

  await updateJob(root, job.id, { status: 'running', stage: 'research', error: null, note: 'start' })

  const trackedCall = async (trackedCtx, options) => {
    await assertBudget(root, { job: await readJob(root, job.id) })
    const result = await call(trackedCtx, options)
    await addUsage(root, job.id, result?.usage || {})
    await assertBudget(root, { job: await readJob(root, job.id) })
    return result
  }

  try {
    await assertBudget(root, { job: await readJob(root, job.id) })
    const researchPayload = await researchStage(ctx, { root, job, call: trackedCall })
    const sources = researchPayload.sources ?? []
    await updateJob(root, job.id, { stage: 'outline' })

    const outlinePayload = await outlineStage(ctx, { root, job, sources, call: trackedCall })
    const outline = outlinePayload.outline
    await updateJob(root, job.id, { stage: 'draft' })

    const draftPayload = await draftStage(ctx, { root, job, outline, sources, call: trackedCall })
    await updateJob(root, job.id, { stage: 'gates', slug: draftPayload.slug })

    const editorial = await readEditorial(root)
    let article = draftPayload.article
    let gatesPayload = await gatesStage(ctx, { root, job, article, sources, editorial, call: trackedCall })

    if (!gatesPayload.passed) {
      await updateJob(root, job.id, { stage: 'revise', note: 'auto-revise' })
      const revised = await reviseStage(ctx, {
        root,
        job,
        article,
        outline,
        sources,
        comment: autoComment(gatesPayload),
        call: trackedCall,
      })
      article = revised.article
      gatesPayload = revised.gates
    }

    await updateJob(root, job.id, {
      status: 'gated',
      stage: 'review',
      note: gatesPayload.passed ? 'gated' : 'review-needed',
    })
    await updateJob(root, job.id, { status: 'review', stage: 'review', note: 'awaiting-review' })

    return { sources, outline, article, gates: gatesPayload }
  } catch (err) {
    await updateJob(root, job.id, {
      status: 'failed',
      error: err?.message || '流水线失败',
      note: 'failed',
    }).catch(() => {})
    throw err
  }
}

export function startPipeline(ctx, { root, job, call, deps } = {}) {
  if (active.has(job.id)) return false
  active.add(job.id)
  runPipeline(ctx, { root, job, call, deps })
    .catch(() => {})
    .finally(() => active.delete(job.id))
  return true
}

export async function runRejection(ctx, { root, job, comment, call = callModel, deps = {} } = {}) {
  const reviseStage = deps.revise ?? reviseJob
  const article = await readArticle(root, job.slug)
  if (!article) throw Object.assign(new Error('文章不存在'), { status: 404 })
  if (!comment?.trim()) throw Object.assign(new Error('打回意见不能为空'), { status: 400 })

  const sourcesPayload = await readRun(root, job.id, 'sources.json')
  const outlinePayload = await readRun(root, job.id, 'outline.json')

  await updateJob(root, job.id, { status: 'running', stage: 'revise', error: null, note: 'rejected' })

  try {
    const revised = await reviseStage(ctx, {
      root,
      job,
      article,
      outline: outlinePayload?.outline,
      sources: sourcesPayload?.sources ?? [],
      comment,
      call,
    })
    await updateJob(root, job.id, { status: 'gated', stage: 'review', note: 'revised' })
    await updateJob(root, job.id, { status: 'review', stage: 'review', note: 'awaiting-review' })
    return revised
  } catch (err) {
    await updateJob(root, job.id, {
      status: 'failed',
      error: err?.message || '修订失败',
      note: 'revise-failed',
    }).catch(() => {})
    throw err
  }
}

export function startRejection(ctx, { root, job, comment, call, deps } = {}) {
  if (active.has(job.id)) return false
  active.add(job.id)
  runRejection(ctx, { root, job, comment, call, deps })
    .catch(() => {})
    .finally(() => active.delete(job.id))
  return true
}

