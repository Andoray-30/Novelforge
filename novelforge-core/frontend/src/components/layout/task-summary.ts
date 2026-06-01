import {
  formatNovelImportStageSummary,
  parseNovelImportTaskResult,
} from '@/lib/task-events'
import { getModelHealthRankingReasonLabel } from '@/lib/model-route-summary'

export const REPAIR_PREVIEW_TASK_TYPES = new Set(['chapter_index_rerun', 'relationship_backfill', 'timeline_rebuild'])

export interface ChapterIndexRecoveryDetails {
  reused: string[]
  retryable: string[]
  runKey?: string
  previousRunKey?: string
}

export interface RepairPreviewWritebackDetails {
  relationshipNew: number
  relationshipDuplicates: number
  timelineNew: number
  timelineDuplicates: number
  applyTypes: string[]
  hasWritableAssets: boolean
}

export interface RepairBatchPreviewDetail {
  batchKey: string
  chapterCount: number
  chapterIds: string[]
  actionLabel: string
  errorTypeLabel: string
  modelLabel: string
  healthRankingLabel?: string
}

export interface RepairApplyWrittenAsset {
  id: string
  type: string
  title: string
}

const REPAIR_ACTION_LABELS: Record<string, string> = {
  shrink_chunk_and_extend_timeout: '缩短分段并延长超时',
  cooldown_and_lower_concurrency: '降并发并冷却',
  prefer_json_repair: 'JSON 修复优先',
  switch_model_after_empty_content: '空响应后切换模型',
  repair_role_rerun: '修复模型重跑',
}

const ERROR_TYPE_LABELS: Record<string, string> = {
  rate_limited: '请求限流',
  gateway_timeout: '网关超时',
  timeout: '请求超时',
  auth_failed: '鉴权失败',
  empty_content: '空响应',
  json_invalid: 'JSON 不合规',
  provider_unavailable: '供应商不可用',
  upstream_error: '上游错误',
  probe_not_suitable: '探测不合格',
}

function numberFromRecord(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item)) : []
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : []
}

function healthRankingLabel(route: Record<string, unknown> | undefined, selectedModel: string): string | undefined {
  if (!route) return undefined
  const rankings = asRecordArray(route.health_rankings)
  const ranking = rankings.find((item) => item.model === selectedModel) || rankings[0]
  if (!ranking) return undefined
  const score = numberFromRecord(ranking, 'score')
  const reason = typeof ranking.reason === 'string' ? getModelHealthRankingReasonLabel(ranking.reason) : null
  const success = numberFromRecord(ranking, 'successful_attempts') ?? 0
  const failed = numberFromRecord(ranking, 'failed_attempts') ?? 0
  const parts = [
    score !== null ? `健康分 ${score}` : null,
    reason,
    `成功 ${success}`,
    `失败 ${failed}`,
  ].filter((item): item is string => Boolean(item))
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function labelList(values: string[], labels: Record<string, string>, fallback: string): string {
  if (!values.length) return fallback
  return values.map((value) => labels[value] || value).join(' / ')
}

function chapterLabel(record: Record<string, unknown>, fallback = '未知章节'): string {
  const title = typeof record.chapter_title === 'string' && record.chapter_title.trim()
    ? record.chapter_title.trim()
    : typeof record.title === 'string' && record.title.trim()
      ? record.title.trim()
      : typeof record.chapter_id === 'string' && record.chapter_id.trim()
        ? record.chapter_id.trim()
        : typeof record.id === 'string' && record.id.trim()
          ? record.id.trim()
          : fallback
  const error = typeof record.error_type === 'string' && record.error_type.trim()
    ? `：${ERROR_TYPE_LABELS[record.error_type.trim()] || record.error_type.trim()}`
    : typeof record.error === 'string' && record.error.trim()
      ? `：${record.error.trim()}`
      : ''
  return `${title}${error}`
}

export function normalizeTaskStatus(status: unknown): string {
  return String(status || '').toUpperCase()
}

export function getChapterIndexRecoveryDetails(resultValue: unknown): ChapterIndexRecoveryDetails | null {
  const result = asRecord(resultValue)
  if (!result) return null

  const diagnostics = asRecord(result.analysis_diagnostics)
  const chapterIndices = asRecordArray(result.chapter_indices)
  const statusItems = asRecordArray(result.chapter_index_status).length > 0
    ? asRecordArray(result.chapter_index_status)
    : asRecordArray(diagnostics?.chapter_index_status)
  const reusedIds = asStringArray(diagnostics?.chapter_index_history_reused_chapters)
  const titleById = new Map<string, string>()

  for (const item of [...chapterIndices, ...statusItems]) {
    const id = typeof item.chapter_id === 'string' ? item.chapter_id : typeof item.id === 'string' ? item.id : ''
    const title = typeof item.chapter_title === 'string' ? item.chapter_title : typeof item.title === 'string' ? item.title : ''
    if (id && title) titleById.set(id, title)
  }

  const reused = reusedIds.map((id) => titleById.get(id) || id)
  const retryable = statusItems
    .filter((item) => item.needs_retry === true || item.status === 'failed')
    .map((item) => chapterLabel(item))

  if (reused.length === 0 && retryable.length === 0) {
    return null
  }

  return {
    reused,
    retryable,
    runKey: typeof diagnostics?.chapter_index_run_key === 'string' ? diagnostics.chapter_index_run_key : undefined,
    previousRunKey: typeof diagnostics?.chapter_index_history_run_key === 'string' ? diagnostics.chapter_index_history_run_key : undefined,
  }
}

export function getRepairPreviewWritebackDetails(resultValue: unknown): RepairPreviewWritebackDetails | null {
  const result = asRecord(resultValue)
  if (!result) return null

  const diff = asRecord(result.repair_diff)
  const relationshipDiff = asRecord(diff?.relationships)
  const timelineDiff = asRecord(diff?.timeline)
  const repairType = typeof result.repair_type === 'string' ? result.repair_type : ''
  const relationshipsCount = typeof result.relationships_count === 'number' ? result.relationships_count : 0
  const timelineCount = typeof result.timeline_count === 'number' ? result.timeline_count : 0

  const relationshipNew = numberFromRecord(relationshipDiff, 'new') ?? relationshipsCount
  const relationshipDuplicates = numberFromRecord(relationshipDiff, 'duplicates') ?? 0
  const timelineNew = numberFromRecord(timelineDiff, 'new') ?? timelineCount
  const timelineDuplicates = numberFromRecord(timelineDiff, 'duplicates') ?? 0

  const applyTypes = repairType === 'relationships'
    ? ['relationships']
    : repairType === 'timeline'
      ? ['timeline']
      : ['relationships', 'timeline']

  return {
    relationshipNew,
    relationshipDuplicates,
    timelineNew,
    timelineDuplicates,
    applyTypes,
    hasWritableAssets: relationshipNew + timelineNew > 0,
  }
}

export function getRepairPreviewBatchDetails(resultValue: unknown): RepairBatchPreviewDetail[] {
  const result = asRecord(resultValue)
  const diagnostics = asRecord(result?.analysis_diagnostics)
  const rawBatches = asRecordArray(result?.repair_strategy_batches).length > 0
    ? asRecordArray(result?.repair_strategy_batches)
    : asRecordArray(diagnostics?.repair_strategy_batches)
  const rawRouteBatches = asRecordArray(result?.model_route_batches).length > 0
    ? asRecordArray(result?.model_route_batches)
    : asRecordArray(diagnostics?.model_route_batches)
  const routeByBatch = new Map<string, Record<string, unknown>>()

  rawRouteBatches.forEach((item) => {
    const batchKey = typeof item.batch_key === 'string' ? item.batch_key.trim() : ''
    const modelRoute = asRecord(item.model_route)
    if (batchKey && modelRoute) routeByBatch.set(batchKey, modelRoute)
  })

  return rawBatches.map((item): RepairBatchPreviewDetail | null => {
    const strategy = asRecord(item.repair_strategy)
    const batchKey = typeof item.batch_key === 'string' && item.batch_key.trim()
      ? item.batch_key.trim()
      : typeof strategy?.batch_key === 'string' && strategy.batch_key.trim()
        ? strategy.batch_key.trim()
        : 'repair_batch'
    const chapterIds = asStringArray(item.chapter_ids).length > 0
      ? asStringArray(item.chapter_ids)
      : asStringArray(strategy?.chapter_ids)
    const actions = asStringArray(strategy?.actions)
    const errorTypes = asStringArray(strategy?.error_types)
    const route = routeByBatch.get(batchKey)
    const selectedModel = typeof route?.selected_model === 'string' && route.selected_model.trim()
      ? route.selected_model.trim()
      : typeof route?.model === 'string' && route.model.trim()
        ? route.model.trim()
        : '模型未记录'
    const explicitChapterCount = numberFromRecord(strategy, 'chapter_count')

    return {
      batchKey,
      chapterCount: explicitChapterCount ?? chapterIds.length,
      chapterIds,
      actionLabel: labelList(actions, REPAIR_ACTION_LABELS, '默认修复策略'),
      errorTypeLabel: labelList(errorTypes, ERROR_TYPE_LABELS, '未记录错误类型'),
      modelLabel: selectedModel,
      healthRankingLabel: healthRankingLabel(route, selectedModel),
    }
  }).filter((item): item is RepairBatchPreviewDetail => item !== null)
}

export function getRepairApplyWrittenAssets(resultValue: unknown): RepairApplyWrittenAsset[] {
  const result = asRecord(resultValue)
  const rawAssets = asRecordArray(result?.written_assets)
  return rawAssets
    .map((asset) => ({
      id: typeof asset.id === 'string' ? asset.id : '',
      type: typeof asset.type === 'string' ? asset.type : '',
      title: typeof asset.title === 'string' && asset.title.trim() ? asset.title.trim() : typeof asset.id === 'string' ? asset.id : '未命名修复资产',
    }))
    .filter((asset) => asset.id && asset.type)
}

export function getRepairApplyWrittenAssetHref(asset: RepairApplyWrittenAsset): string {
  const encodedId = encodeURIComponent(asset.id)
  if (asset.type === 'relationship' || asset.type === 'character') {
    return `/characters?assetId=${encodedId}`
  }
  if (asset.type === 'timeline' || asset.type === 'world') {
    return `/world?assetId=${encodedId}`
  }
  return '/analytics'
}

export function getTaskSummary(task: {
  type?: string
  status?: string
  message?: string
  result?: unknown
  error?: string | null
}) {
  if (REPAIR_PREVIEW_TASK_TYPES.has(task.type || '')) {
    const result = asRecord(task.result) ?? {}
    const relationships = typeof result.relationships_count === 'number' ? result.relationships_count : 0
    const timeline = typeof result.timeline_count === 'number' ? result.timeline_count : 0
    const diff = asRecord(result.repair_diff)
    const relationshipDiff = asRecord(diff?.relationships)
    const timelineDiff = asRecord(diff?.timeline)
    const diagnostics = asRecord(result.analysis_diagnostics)
    const candidateCounts = asRecord(result.candidate_counts) ?? asRecord(diagnostics?.candidate_counts)
    const relationshipNew = numberFromRecord(relationshipDiff, 'new')
    const relationshipDuplicates = numberFromRecord(relationshipDiff, 'duplicates')
    const timelineNew = numberFromRecord(timelineDiff, 'new')
    const timelineDuplicates = numberFromRecord(timelineDiff, 'duplicates')
    const reusedChapters = numberFromRecord(candidateCounts, 'chapter_index_history_reused')
    const combinedIndices = numberFromRecord(candidateCounts, 'chapter_index_combined_indices')
    const batchCount = numberFromRecord(candidateCounts, 'chapter_index_repair_batch_count')
    const recoverySummary = reusedChapters !== null || combinedIndices !== null
      ? `复用历史成功章 ${reusedChapters ?? 0} 章，合并索引 ${combinedIndices ?? 0} 章。`
      : null
    const batchSummary = batchCount !== null && batchCount > 1 ? `按错误类型拆成 ${batchCount} 批修复。` : null

    if (normalizeTaskStatus(task.status) === 'COMPLETED') {
      if (
        relationshipNew !== null ||
        relationshipDuplicates !== null ||
        timelineNew !== null ||
        timelineDuplicates !== null ||
        recoverySummary ||
        batchSummary
      ) {
        return [
          '修复预览完成。',
          recoverySummary,
          batchSummary,
          `关系新增 ${relationshipNew ?? relationships} / 跳过 ${relationshipDuplicates ?? 0}`,
          `时间线新增 ${timelineNew ?? timeline} / 跳过 ${timelineDuplicates ?? 0}`,
        ].filter(Boolean).join(' ')
      }
      return [
        `修复预览完成：关系 ${relationships} 条，时间线 ${timeline} 条。`,
        recoverySummary,
        batchSummary,
      ].filter(Boolean).join(' ')
    }
    return task.message || '质量修复任务正在处理中...'
  }

  if ((task.type || '') === 'import_repair_apply') {
    const result = asRecord(task.result) ?? {}
    const relationships = typeof result.relationships_count === 'number' ? result.relationships_count : 0
    const timeline = typeof result.timeline_count === 'number' ? result.timeline_count : 0
    const writtenAssets = getRepairApplyWrittenAssets(result)
    return normalizeTaskStatus(task.status) === 'COMPLETED'
      ? `修复写回完成：关系 ${relationships} 条，时间线 ${timeline} 条，新增修复资产 ${writtenAssets.length || relationships + timeline} 个。`
      : task.message || '修复写回正在处理中...'
  }

  if ((task.type || '') !== 'novel_import') {
    return task.error || task.message || '任务状态已更新'
  }

  const result = parseNovelImportTaskResult(task.result)
  const chaptersCount = result?.chapters_count ?? null
  const warning = result?.analysis_warning?.trim() || null
  const stageSummary = formatNovelImportStageSummary(result)

  if (normalizeTaskStatus(task.status) === 'COMPLETED') {
    const isPartial = result?.analysis_status && result.analysis_status !== 'completed'
    const base = isPartial
      ? '导入完成，但分析未完全完成。'
      : chaptersCount !== null
        ? `导入完成，已写入 ${chaptersCount} 个章节。`
        : '导入完成。'
    return [base, stageSummary, warning].filter(Boolean).join(' ')
  }

  if (normalizeTaskStatus(task.status) === 'FAILED') {
    return task.error || task.message || '导入任务失败。'
  }

  if (normalizeTaskStatus(task.status) === 'CANCELLED') {
    return '导入任务已取消。'
  }

  return task.message || '导入任务正在处理中...'
}
