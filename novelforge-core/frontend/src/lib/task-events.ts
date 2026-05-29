import type {
  NovelImportAnalysisStageKey,
  NovelImportAnalysisStageStatus,
  NovelImportTaskResult,
} from '@/types'

export const TASK_COMPLETED_EVENT = 'novelforge:task-completed'
export const TASK_FAILED_EVENT = 'novelforge:task-failed'
export const TASK_CANCELLED_EVENT = 'novelforge:task-cancelled'

export type TaskLifecycleStatus = 'COMPLETED' | 'FAILED' | 'CANCELLED'

export interface NovelForgeTaskEventDetail {
  taskId: string
  taskType: string
  sessionId: string | null
  status: TaskLifecycleStatus
  message?: string | null
  error?: string | null
  result?: unknown
}

type TaskLifecycleInput = {
  id: string
  type: string
  status: TaskLifecycleStatus
  result?: unknown
  error?: string | null
  message?: string | null
  parameters?: Record<string, unknown> | null
}

export function extractTaskSessionId(task: {
  parameters?: Record<string, unknown> | null
  result?: unknown
}): string | null {
  const parameters =
    task.parameters && typeof task.parameters === 'object'
      ? task.parameters
      : null
  const result =
    task.result && typeof task.result === 'object'
      ? (task.result as Record<string, unknown>)
      : null

  const fromParameters =
    parameters && typeof parameters.session_id === 'string' && parameters.session_id
      ? parameters.session_id
      : null
  if (fromParameters) {
    return fromParameters
  }

  const fromResult =
    result && typeof result.session_id === 'string' && result.session_id
      ? result.session_id
      : null
  return fromResult
}

export function emitTaskLifecycleEvent(task: TaskLifecycleInput) {
  if (typeof window === 'undefined') {
    return
  }

  const detail: NovelForgeTaskEventDetail = {
    taskId: task.id,
    taskType: task.type,
    sessionId: extractTaskSessionId(task),
    status: task.status,
    message: task.message ?? null,
    error: task.error ?? null,
    result: task.result,
  }

  const eventName =
    task.status === 'COMPLETED'
      ? TASK_COMPLETED_EVENT
      : task.status === 'FAILED'
        ? TASK_FAILED_EVENT
        : TASK_CANCELLED_EVENT

  window.dispatchEvent(new CustomEvent<NovelForgeTaskEventDetail>(eventName, { detail }))
}

const NOVEL_IMPORT_STAGE_LABELS: Record<NovelImportAnalysisStageKey, string> = {
  chapter_index: '章节索引',
  characters: '角色',
  world_setting: '世界观',
  timeline_events: '时间线',
  relationships: '关系网',
}

const NOVEL_IMPORT_ANALYSIS_STATUSES = new Set(['completed', 'partial', 'low_quality', 'timed_out', 'failed'])
const NOVEL_IMPORT_STAGE_STATUSES = new Set(['completed', 'timed_out', 'failed'])

function parseCount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

function asRecordList(value: unknown): Array<Record<string, unknown>> | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    : undefined
}

function asEndpointList(value: unknown): Array<string | Record<string, unknown>> | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string | Record<string, unknown> => typeof item === 'string' || Boolean(item && typeof item === 'object'))
    : undefined
}

export function parseNovelImportTaskResult(result: unknown): NovelImportTaskResult | null {
  if (!result || typeof result !== 'object') {
    return null
  }

  const payload = result as Record<string, unknown>
  const analysisStatus =
    typeof payload.analysis_status === 'string' && NOVEL_IMPORT_ANALYSIS_STATUSES.has(payload.analysis_status)
      ? payload.analysis_status
      : undefined
  const stageResultsRaw =
    payload.analysis_stage_results && typeof payload.analysis_stage_results === 'object'
      ? (payload.analysis_stage_results as Record<string, unknown>)
      : null

  const analysisStageResults: NovelImportTaskResult['analysis_stage_results'] = {}
  ;(['chapter_index', 'characters', 'world_setting', 'timeline_events', 'relationships'] as const).forEach((key) => {
    const value = stageResultsRaw?.[key]
    if (typeof value === 'string' && NOVEL_IMPORT_STAGE_STATUSES.has(value)) {
      analysisStageResults[key] = value as NovelImportAnalysisStageStatus
    }
  })

  const diagnostics =
    payload.analysis_diagnostics && typeof payload.analysis_diagnostics === 'object'
      ? payload.analysis_diagnostics as NovelImportTaskResult['analysis_diagnostics']
      : undefined
  const candidateCounts =
    payload.candidate_counts && typeof payload.candidate_counts === 'object'
      ? payload.candidate_counts as Record<string, number>
      : diagnostics?.candidate_counts

  return {
    session_id: typeof payload.session_id === 'string' ? payload.session_id : undefined,
    parent_id: typeof payload.parent_id === 'string' ? payload.parent_id : undefined,
    book_title: typeof payload.book_title === 'string' ? payload.book_title : undefined,
    chapters_count: parseCount(payload.chapters_count),
    chapter_ids: Array.isArray(payload.chapter_ids) ? payload.chapter_ids.filter((item): item is string => typeof item === 'string') : undefined,
    chapter_titles: Array.isArray(payload.chapter_titles) ? payload.chapter_titles.filter((item): item is string => typeof item === 'string') : undefined,
    characters_count: parseCount(payload.characters_count),
    world_count: parseCount(payload.world_count),
    relationships_count: parseCount(payload.relationships_count),
    timeline_count: parseCount(payload.timeline_count),
    analysis_status: analysisStatus as NovelImportTaskResult['analysis_status'],
    analysis_warning: typeof payload.analysis_warning === 'string' ? payload.analysis_warning : null,
    analysis_stage_results: Object.keys(analysisStageResults).length > 0 ? analysisStageResults : undefined,
    analysis_quality_issues: Array.isArray(payload.analysis_quality_issues)
      ? payload.analysis_quality_issues.filter((item): item is string => typeof item === 'string')
      : undefined,
    analysis_diagnostics: diagnostics,
    candidate_counts: candidateCounts,
    failed_chapters: asRecordList(payload.failed_chapters) ?? diagnostics?.failed_chapters,
    chapter_index_attempts: asRecordList(payload.chapter_index_attempts) ?? diagnostics?.chapter_index_attempts,
    chapter_index_status: asRecordList(payload.chapter_index_status) ?? diagnostics?.chapter_index_status,
    relationship_unresolved_endpoints: asEndpointList(payload.relationship_unresolved_endpoints) ?? diagnostics?.relationship_unresolved_endpoints,
    relationship_unresolved_details: asRecordList(payload.relationship_unresolved_details) ?? diagnostics?.relationship_unresolved_details,
    relationship_endpoint_resolution: asRecordList(payload.relationship_endpoint_resolution) ?? diagnostics?.relationship_endpoint_resolution,
    relationship_low_confidence_resolved_endpoints:
      asRecordList(payload.relationship_low_confidence_resolved_endpoints) ?? diagnostics?.relationship_low_confidence_resolved_endpoints,
    timeline_mismatch_events: asRecordList(payload.timeline_mismatch_events) ?? diagnostics?.timeline_mismatch_events,
  }
}

export function getNovelImportStageLabel(stage: NovelImportAnalysisStageKey): string {
  return NOVEL_IMPORT_STAGE_LABELS[stage]
}

export function formatNovelImportStageSummary(result: NovelImportTaskResult | null): string | null {
  const entries = result?.analysis_stage_results
    ? (Object.entries(result.analysis_stage_results) as Array<[NovelImportAnalysisStageKey, NovelImportAnalysisStageStatus]>)
    : []

  if (entries.length === 0) {
    return null
  }

  return entries
    .map(([stage, status]) => `${getNovelImportStageLabel(stage)}:${status === 'completed' ? '完成' : status === 'timed_out' ? '超时' : '失败'}`)
    .join(' · ')
}
