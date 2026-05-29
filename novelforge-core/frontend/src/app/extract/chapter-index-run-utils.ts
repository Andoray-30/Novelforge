import type { ChapterIndexRun } from '@/types';

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
    const errorType = statusItem.error_type ? ` / ${String(statusItem.error_type)}` : '';
    return `${title}：${status}${errorType}`;
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
