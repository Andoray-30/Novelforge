import type {
  ExtractionAttempt,
  ExtractionAttemptStatus,
  ExtractionAttemptSummary,
  ExtractionRecoveryStatus,
  RetryJob,
  RetryJobStatus,
  RetryQueueSummary,
} from '@/types';

export const ATTEMPT_STATUS_LABELS: Record<ExtractionAttemptStatus, string> = {
  pending: '等待中',
  running: '执行中',
  success: '成功',
  failed: '失败',
  deadline_exceeded: '超时',
  skipped: '已跳过',
};

export const RETRY_JOB_STATUS_LABELS: Record<RetryJobStatus, string> = {
  pending: '待重试',
  waiting: '等待窗口',
  running: '重试中',
  success: '已恢复',
  failed: '重试失败',
  exhausted: '已耗尽',
  cancelled: '已取消',
};

export const RECOVERY_STATUS_LABELS: Record<ExtractionRecoveryStatus, string> = {
  no_data: '暂无 Attempt 记录',
  success: '全部成功',
  partial: '部分可恢复',
  partial_exhausted: '部分已耗尽',
  failed: '整体失败',
};

export type RecoveryTone = 'success' | 'warning' | 'danger' | 'empty';

export function getRecoveryTone(
  summary: ExtractionAttemptSummary | null,
  retryQueue?: RetryQueueSummary | null,
): RecoveryTone {
  if (!summary || summary.total_attempts === 0) return 'empty';
  if (summary.overall_status === 'success') return 'success';
  if (summary.overall_status === 'partial_exhausted') return 'danger';
  if (summary.overall_status === 'failed') return 'danger';
  if (retryQueue && retryQueue.stats.exhausted_count > 0) return 'danger';
  if (summary.partial_recoverable) return 'warning';
  return 'empty';
}

export function getRetryableAttempts(attempts: ExtractionAttempt[]): ExtractionAttempt[] {
  return attempts.filter(
    (a) => a.needs_retry || a.status === 'failed' || a.status === 'deadline_exceeded',
  );
}

export function formatAttemptErrorLabel(errorType: string | null | undefined): string {
  if (!errorType) return '未知错误';
  const labels: Record<string, string> = {
    rate_limited: '频率限制 (429)',
    gateway_timeout: '网关超时 (504)',
    timeout: '请求超时',
    provider_unavailable: '服务不可用',
    empty_content: '空内容',
    json_invalid: 'JSON 解析失败',
    auth_failed: '认证失败',
  };
  return labels[errorType] || errorType;
}

export function buildRecoverySummaryCards(
  summary: ExtractionAttemptSummary,
  retryQueue?: RetryQueueSummary | null,
) {
  return [
    { label: '总尝试', value: summary.total_attempts, tone: 'empty' as RecoveryTone },
    { label: '成功', value: summary.success_count, tone: 'success' as RecoveryTone },
    { label: '失败', value: summary.failed_count, tone: summary.failed_count > 0 ? 'danger' as RecoveryTone : 'empty' as RecoveryTone },
    { label: '超时', value: summary.deadline_exceeded_count, tone: summary.deadline_exceeded_count > 0 ? 'warning' as RecoveryTone : 'empty' as RecoveryTone },
    { label: '需重试', value: summary.chapters_needing_retry, tone: summary.chapters_needing_retry > 0 ? 'warning' as RecoveryTone : 'empty' as RecoveryTone },
    { label: '本地修复', value: summary.repair_local_count, tone: 'empty' as RecoveryTone },
    { label: '模型修复', value: summary.repair_model_count, tone: 'empty' as RecoveryTone },
    { label: '修复失败', value: summary.repair_failed_count, tone: summary.repair_failed_count > 0 ? 'danger' as RecoveryTone : 'empty' as RecoveryTone },
    ...(retryQueue ? [
      { label: '待重试', value: retryQueue.stats.pending_count, tone: retryQueue.stats.pending_count > 0 ? 'warning' as RecoveryTone : 'empty' as RecoveryTone },
      { label: '已耗尽', value: retryQueue.stats.exhausted_count, tone: retryQueue.stats.exhausted_count > 0 ? 'danger' as RecoveryTone : 'empty' as RecoveryTone },
    ] : []),
  ];
}
