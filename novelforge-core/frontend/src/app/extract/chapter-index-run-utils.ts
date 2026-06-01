import type { ChapterIndexRun } from '@/types';

export interface ChapterIndexRepairBatchSummary {
  batchKey: string;
  chapterCount: number;
  chapterIds: string[];
  actionLabel: string;
  errorTypeLabel: string;
  modelLabel: string;
}

const REPAIR_ACTION_LABELS: Record<string, string> = {
  shrink_chunk_and_extend_timeout: '缩短分段并延长超时',
  cooldown_and_lower_concurrency: '降并发并冷却',
  prefer_json_repair: 'JSON 修复优先',
  switch_model_after_empty_content: '空响应后切换模型',
  repair_role_rerun: '修复模型重跑',
};

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
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function labelList(values: string[], labels: Record<string, string>, fallback: string): string {
  if (!values.length) return fallback;
  return values.map((value) => labels[value] || value).join(' / ');
}

export function getRunTimestampLabel(value?: string): string {
  if (!value) return '时间未知';
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return value;
  return timestamp.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getChapterStatusPreview(run: ChapterIndexRun): string[] {
  return run.chapter_index_status.slice(0, 5).map((statusItem) => {
    const title = String(statusItem.chapter_title || statusItem.chapter_id || '未命名章节');
    const status = String(statusItem.status || 'unknown');
    const errorType = statusItem.error_type ? ` / ${ERROR_TYPE_LABELS[String(statusItem.error_type)] || String(statusItem.error_type)}` : '';
    return `${title}: ${status}${errorType}`;
  });
}

export function getRetryableChapterIndexRunStatuses(run: ChapterIndexRun): Array<Record<string, unknown>> {
  const retryable = run.chapter_index_status.filter((item): item is Record<string, unknown> => {
    if (!item || typeof item !== 'object') return false;
    return item.needs_retry === true || item.status === 'failed';
  });
  const source = retryable.length
    ? retryable
    : run.chapter_index_attempts.filter((item): item is Record<string, unknown> => {
      if (!item || typeof item !== 'object') return false;
      return item.status === 'failed';
    });

  const seen = new Set<string>();
  const result: Array<Record<string, unknown>> = [];
  source.forEach((item) => {
    const chapterId = typeof item.chapter_id === 'string' ? item.chapter_id.trim() : '';
    if (!chapterId || seen.has(chapterId)) return;
    seen.add(chapterId);
    result.push(item);
  });
  return result;
}

export function buildChapterIndexRunRerunPayload(run: ChapterIndexRun): Record<string, unknown> {
  const retryableStatus = getRetryableChapterIndexRunStatuses(run);
  const chapterIds = retryableStatus
    .map((item) => item.chapter_id || item.id)
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);

  return {
    chapter_index_run_key: run.run_key,
    chapter_index_status: retryableStatus,
    failed_chapters: retryableStatus,
    analysis_diagnostics: {
      chapter_index_run_key: run.run_key,
      chapter_index_status: retryableStatus,
      failed_chapters: retryableStatus,
    },
    chapter_ids: Array.from(new Set(chapterIds)),
  };
}

export function getRepairBatchSummaries(run: ChapterIndexRun): ChapterIndexRepairBatchSummary[] {
  const routeByBatch = new Map<string, Record<string, unknown>>();
  (run.model_route_batches || []).forEach((item) => {
    const payload = asRecord(item);
    const batchKey = asString(payload?.batch_key);
    const modelRoute = asRecord(payload?.model_route);
    if (batchKey && modelRoute) routeByBatch.set(batchKey, modelRoute);
  });

  return (run.repair_strategy_batches || [])
    .map((item): ChapterIndexRepairBatchSummary | null => {
      const payload = asRecord(item);
      if (!payload) return null;
      const repairStrategy = asRecord(payload.repair_strategy);
      const batchKey = asString(payload.batch_key) || asString(repairStrategy?.batch_key) || 'repair_batch';
      const chapterIds = asStringArray(payload.chapter_ids).length
        ? asStringArray(payload.chapter_ids)
        : asStringArray(repairStrategy?.chapter_ids);
      const actions = asStringArray(repairStrategy?.actions);
      const errorTypes = asStringArray(repairStrategy?.error_types);
      const chapterCount = Number(repairStrategy?.chapter_count) || chapterIds.length;
      const route = routeByBatch.get(batchKey);
      const modelLabel = asString(route?.selected_model) || asString(route?.model) || '模型未记录';

      return {
        batchKey,
        chapterCount,
        chapterIds,
        actionLabel: labelList(actions, REPAIR_ACTION_LABELS, '默认修复策略'),
        errorTypeLabel: labelList(errorTypes, ERROR_TYPE_LABELS, '未记录错误类型'),
        modelLabel,
      };
    })
    .filter((item): item is ChapterIndexRepairBatchSummary => item !== null);
}
