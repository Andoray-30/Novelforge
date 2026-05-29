import {
  formatNovelImportStageSummary,
  parseNovelImportTaskResult,
} from '@/lib/task-events'

export const REPAIR_PREVIEW_TASK_TYPES = new Set(['chapter_index_rerun', 'relationship_backfill', 'timeline_rebuild'])

export interface ChapterIndexRecoveryDetails {
  reused: string[]
  retryable: string[]
  runKey?: string
  previousRunKey?: string
}

function numberFromRecord(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : []
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
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
    ? `：${record.error_type.trim()}`
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

export function getTaskSummary(task: {
  type?: string
  status?: string
  message?: string
  result?: unknown
  error?: string | null
}) {
  if (REPAIR_PREVIEW_TASK_TYPES.has(task.type || '')) {
    const result = task.result && typeof task.result === 'object'
      ? (task.result as Record<string, unknown>)
      : {}
    const relationships = typeof result.relationships_count === 'number' ? result.relationships_count : 0
    const timeline = typeof result.timeline_count === 'number' ? result.timeline_count : 0
    const diff = result.repair_diff && typeof result.repair_diff === 'object'
      ? (result.repair_diff as Record<string, unknown>)
      : null
    const relationshipDiff = diff?.relationships && typeof diff.relationships === 'object'
      ? (diff.relationships as Record<string, unknown>)
      : null
    const timelineDiff = diff?.timeline && typeof diff.timeline === 'object'
      ? (diff.timeline as Record<string, unknown>)
      : null
    const diagnostics = result.analysis_diagnostics && typeof result.analysis_diagnostics === 'object'
      ? (result.analysis_diagnostics as Record<string, unknown>)
      : null
    const candidateCounts = result.candidate_counts && typeof result.candidate_counts === 'object'
      ? (result.candidate_counts as Record<string, unknown>)
      : diagnostics?.candidate_counts && typeof diagnostics.candidate_counts === 'object'
        ? (diagnostics.candidate_counts as Record<string, unknown>)
        : null
    const relationshipNew = numberFromRecord(relationshipDiff, 'new')
    const relationshipDuplicates = numberFromRecord(relationshipDiff, 'duplicates')
    const timelineNew = numberFromRecord(timelineDiff, 'new')
    const timelineDuplicates = numberFromRecord(timelineDiff, 'duplicates')
    const reusedChapters = numberFromRecord(candidateCounts, 'chapter_index_history_reused')
    const combinedIndices = numberFromRecord(candidateCounts, 'chapter_index_combined_indices')
    const recoverySummary = reusedChapters !== null || combinedIndices !== null
      ? `复用历史成功章 ${reusedChapters ?? 0} 章，合并索引 ${combinedIndices ?? 0} 章。`
      : null
    if (normalizeTaskStatus(task.status) === 'COMPLETED') {
      if (
        relationshipNew !== null ||
        relationshipDuplicates !== null ||
        timelineNew !== null ||
        timelineDuplicates !== null ||
        recoverySummary
      ) {
        return [
          '修复预览完成。',
          recoverySummary,
          `关系新增 ${relationshipNew ?? relationships} / 跳过 ${relationshipDuplicates ?? 0}`,
          `时间线新增 ${timelineNew ?? timeline} / 跳过 ${timelineDuplicates ?? 0}`,
        ].filter(Boolean).join(' ')
      }
      return [
        `修复预览完成：关系 ${relationships} 条，时间线 ${timeline} 条。`,
        recoverySummary,
      ].filter(Boolean).join(' ')
    }
    return task.message || '质量修复任务正在处理中...'
  }

  if ((task.type || '') === 'import_repair_apply') {
    const result = task.result && typeof task.result === 'object'
      ? (task.result as Record<string, unknown>)
      : {}
    const relationships = typeof result.relationships_count === 'number' ? result.relationships_count : 0
    const timeline = typeof result.timeline_count === 'number' ? result.timeline_count : 0
    return normalizeTaskStatus(task.status) === 'COMPLETED'
      ? `修复写回完成：关系 ${relationships} 条，时间线 ${timeline} 条。`
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
