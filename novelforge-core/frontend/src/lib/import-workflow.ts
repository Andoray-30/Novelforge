import type { NovelImportTaskResult } from '@/types';
import {
  formatNovelImportStageSummary,
  parseNovelImportTaskResult,
  type NovelForgeTaskEventDetail,
} from './task-events';

export interface NovelImportCompletionAction {
  result: NovelImportTaskResult | null;
  targetSessionId: string | null;
  focusedNovelId: string | null;
  shouldSwitchSession: boolean;
  shouldFocusNovel: boolean;
  notification: string;
}

function formatImportedAssetCounts(result: NovelImportTaskResult | null): string {
  const counts: string[] = [];

  if (typeof result?.chapters_count === 'number') {
    counts.push(`${result.chapters_count} 章`);
  }
  if (typeof result?.characters_count === 'number') {
    counts.push(`${result.characters_count} 角色`);
  }
  if (typeof result?.relationships_count === 'number') {
    counts.push(`${result.relationships_count} 关系`);
  }
  if (typeof result?.timeline_count === 'number') {
    counts.push(`${result.timeline_count} 时间线`);
  }
  if (typeof result?.world_count === 'number') {
    counts.push(`${result.world_count} 世界观`);
  }

  return counts.join(' / ');
}

export function buildNovelImportCompletionNotification(result: NovelImportTaskResult | null): string {
  const title = result?.book_title?.trim();
  const counts = formatImportedAssetCounts(result);
  const stageSummary = formatNovelImportStageSummary(result);
  const warning = result?.analysis_warning?.trim();
  const isLowQuality = result?.analysis_status && result.analysis_status !== 'completed';

  const base = `${title ? `《${title}》` : '小说'}导入完成`;
  const quality = isLowQuality ? `，质量状态：${result?.analysis_status}` : '';
  const details = [counts, stageSummary, warning].filter(Boolean).join('。');

  return details ? `${base}${quality}。${details}` : `${base}${quality}`;
}

export function resolveNovelImportCompletionAction(
  detail: NovelForgeTaskEventDetail,
  currentSessionId: string | null,
): NovelImportCompletionAction | null {
  if (detail.taskType !== 'novel_import') {
    return null;
  }

  const result = parseNovelImportTaskResult(detail.result);
  const targetSessionId = result?.session_id || detail.sessionId || null;
  const focusedNovelId = result?.parent_id || null;

  return {
    result,
    targetSessionId,
    focusedNovelId,
    shouldSwitchSession: Boolean(targetSessionId && targetSessionId !== currentSessionId),
    shouldFocusNovel: Boolean(focusedNovelId),
    notification: buildNovelImportCompletionNotification(result),
  };
}
