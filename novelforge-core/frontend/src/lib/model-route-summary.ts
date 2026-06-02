import type { ModelProbeResult, ModelRouteDecision, NovelImportTaskResult } from '@/types';

export type ModelRouteProbeSummary = {
  model: string;
  available: boolean;
  score: number | null;
  latencyMs: number | null;
  errorType: string | null;
  error: string | null;
  nonEmptyChat: boolean;
  jsonCapable: boolean;
  extractionRich: boolean;
};

export type ModelHealthRankingSummary = {
  model: string;
  score: number | null;
  reason: string | null;
  reasonLabel: string | null;
  selectedCount: number;
  successfulAttempts: number;
  failedAttempts: number;
  probePassed: number;
  probeFailed: number;
  averageLatencyMs: number | null;
  latencyToleranceMs: number | null;
  latencyPenalty: number | null;
  errorCounts: Array<{ type: string; label: string; count: number }>;
};

export type ModelRouteSummary = {
  role: string;
  selectedModel: string;
  reason: string;
  reasonLabel: string;
  candidates: string[];
  originalCandidates: string[];
  candidateOrderSource: string | null;
  probeResults: ModelRouteProbeSummary[];
  healthRankings: ModelHealthRankingSummary[];
};

const ROUTE_REASON_LABELS: Record<string, string> = {
  probe_passed: '测速通过',
  probe_skipped: '未执行测速，使用候选模型',
  no_probe_passed_using_best_score: '无模型完全通过，使用最高分候选',
  all_candidates_in_cooldown: '候选模型均在冷却中',
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

const HEALTH_RANKING_REASON_LABELS: Record<string, string> = {
  positive_history: '历史成功率较高',
  negative_history: '近期失败较多',
  neutral_history: '历史表现中性',
  no_recent_health: '暂无近期健康记录',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function errorCountsToList(value: unknown): Array<{ type: string; label: string; count: number }> {
  const payload = asRecord(value);
  if (!payload) return [];
  return Object.entries(payload)
    .map(([type, rawCount]) => {
      const count = asNumber(rawCount);
      return count !== null && count > 0 ? { type, label: getModelErrorTypeLabel(type), count } : null;
    })
    .filter((item): item is { type: string; label: string; count: number } => item !== null)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function normalizeProbe(value: unknown): ModelRouteProbeSummary | null {
  const payload = asRecord(value) as ModelProbeResult | null;
  if (!payload) return null;
  const model = asString(payload.model);
  if (!model) return null;
  return {
    model,
    available: asBoolean(payload.available),
    score: asNumber(payload.score),
    latencyMs: asNumber(payload.latency_ms),
    errorType: asString(payload.error_type),
    error: asString(payload.error),
    nonEmptyChat: asBoolean(payload.non_empty_chat),
    jsonCapable: asBoolean(payload.json_capable),
    extractionRich: asBoolean(payload.extraction_rich),
  };
}

function normalizeHealthRanking(value: unknown): ModelHealthRankingSummary | null {
  const payload = asRecord(value);
  if (!payload) return null;
  const model = asString(payload.model);
  if (!model) return null;
  const reason = asString(payload.reason);
  return {
    model,
    score: asNumber(payload.score),
    reason,
    reasonLabel: getModelHealthRankingReasonLabel(reason),
    selectedCount: asNumber(payload.selected_count) ?? 0,
    successfulAttempts: asNumber(payload.successful_attempts) ?? 0,
    failedAttempts: asNumber(payload.failed_attempts) ?? 0,
    probePassed: asNumber(payload.probe_passed) ?? 0,
    probeFailed: asNumber(payload.probe_failed) ?? 0,
    averageLatencyMs: asNumber(payload.average_latency_ms),
    latencyToleranceMs: asNumber(payload.latency_tolerance_ms),
    latencyPenalty: asNumber(payload.latency_penalty),
    errorCounts: errorCountsToList(payload.error_counts),
  };
}

export function normalizeModelRoute(value: unknown): ModelRouteSummary | null {
  const payload = asRecord(value) as ModelRouteDecision | null;
  if (!payload) return null;

  const selectedModel = asString(payload.selected_model);
  if (!selectedModel) return null;

  const reason = asString(payload.reason) || 'unknown';
  const role = asString(payload.role) || 'unknown';
  const candidates = asStringArray(payload.candidates);
  const originalCandidates = asStringArray(payload.original_candidates);
  const candidateOrderSource = asString(payload.candidate_order_source);
  const probeResults = Array.isArray(payload.probe_results)
    ? payload.probe_results.map(normalizeProbe).filter((item): item is ModelRouteProbeSummary => item !== null)
    : [];
  const healthRankings = Array.isArray(payload.health_rankings)
    ? payload.health_rankings.map(normalizeHealthRanking).filter((item): item is ModelHealthRankingSummary => item !== null)
    : [];

  return {
    role,
    selectedModel,
    reason,
    reasonLabel: ROUTE_REASON_LABELS[reason] || reason,
    candidates,
    originalCandidates,
    candidateOrderSource,
    probeResults,
    healthRankings,
  };
}

export function getModelRouteSummary(result: NovelImportTaskResult | null | undefined): ModelRouteSummary | null {
  return normalizeModelRoute(result?.model_route || result?.analysis_diagnostics?.model_route);
}

export function getModelErrorTypeLabel(errorType: string | null | undefined): string {
  if (!errorType) return '未知错误';
  return ERROR_TYPE_LABELS[errorType] || errorType;
}

export function getModelHealthRankingReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return HEALTH_RANKING_REASON_LABELS[reason] || reason;
}

export function getModelProbeStatusLabel(probe: ModelRouteProbeSummary): string {
  if (probe.available && probe.nonEmptyChat && probe.jsonCapable && probe.extractionRich) {
    return '通过';
  }
  if (probe.errorType) {
    return getModelErrorTypeLabel(probe.errorType);
  }
  if (!probe.available) return '不可用';
  if (!probe.jsonCapable) return 'JSON 不合规';
  if (!probe.extractionRich) return '提取信号不足';
  return '需复核';
}
