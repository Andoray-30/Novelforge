import type { ModelProbeResult, ModelRouteDecision, NovelImportTaskResult, ProfileRankingItem, SelectedProfileMetrics } from '@/types';

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
  profileOrderSource: string | null;
  profileRankings: ProfileRankingItem[];
  profileConfidence: string | null;
  profileWarnings: string[];
  selectedProfileHint: string | null;
  selectedProfileMetrics: SelectedProfileMetrics | null;
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

function normalizeProfileRanking(value: unknown): ProfileRankingItem | null {
  const payload = asRecord(value);
  if (!payload) return null;
  const model = asString(payload.model);
  const score = asNumber(payload.score);
  const reason = asString(payload.reason);
  const originalIndex = asNumber(payload.original_index);
  const confidenceLevel = asString(payload.confidence_level);
  if (!model || score === null || !reason || originalIndex === null || !confidenceLevel) return null;
  return {
    model,
    score,
    reason,
    original_index: originalIndex,
    confidence_level: confidenceLevel,
    success_rate: asNumber(payload.success_rate) ?? undefined,
    p95_latency_ms: asNumber(payload.p95_latency_ms) ?? undefined,
    timeout_rate: asNumber(payload.timeout_rate) ?? undefined,
    json_invalid_rate: asNumber(payload.json_invalid_rate) ?? undefined,
    repair_salvage_rate: asNumber(payload.repair_salvage_rate) ?? undefined,
    retry_salvage_rate: asNumber(payload.retry_salvage_rate) ?? undefined,
    recommendation_hint: asString(payload.recommendation_hint) ?? undefined,
    hint_flags: asStringArray(payload.hint_flags),
  };
}

function normalizeSelectedProfileMetrics(value: unknown): SelectedProfileMetrics | null {
  const payload = asRecord(value);
  if (!payload) return null;
  return {
    success_rate: asNumber(payload.success_rate) ?? undefined,
    p95_latency_ms: asNumber(payload.p95_latency_ms) ?? undefined,
    timeout_rate: asNumber(payload.timeout_rate) ?? undefined,
    repair_salvage_rate: asNumber(payload.repair_salvage_rate) ?? undefined,
    confidence_level: asString(payload.confidence_level) ?? undefined,
    recommendation_hint: asString(payload.recommendation_hint) ?? undefined,
  };
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
  const profileOrderSource = asString(payload.profile_order_source);
  const profileRankings = Array.isArray(payload.profile_rankings)
    ? payload.profile_rankings.map(normalizeProfileRanking).filter((item): item is ProfileRankingItem => item !== null)
    : [];
  const profileConfidence = asString(payload.profile_confidence);
  const profileWarnings = asStringArray(payload.profile_warnings);
  const selectedProfileHint = asString(payload.selected_profile_hint);
  const selectedProfileMetrics = normalizeSelectedProfileMetrics(payload.selected_profile_metrics);
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
    profileOrderSource,
    profileRankings,
    profileConfidence,
    profileWarnings,
    selectedProfileHint,
    selectedProfileMetrics,
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

export function formatProfileConfidence(confidence: string | undefined): string {
  switch (confidence) {
    case 'high': return '高可信';
    case 'medium': return '中可信';
    case 'low': return '低可信';
    default: return confidence || '未知';
  }
}

export function formatProfileWarning(warning: string): string {
  switch (warning) {
    case 'fallback_to_global': return '当前会话无画像，已回退到全局画像';
    case 'session_scope_missing_session_id': return '缺少 session_id，无法读取会话画像';
    case 'invalid_profile_scope_fallback': return '画像作用域配置无效，已安全回退';
    case 'profile_lookup_failed': return '读取画像失败，已回退默认逻辑';
    default: return warning || '未知画像警告';
  }
}

export function formatProfileHint(hint: string | undefined): string {
  switch (hint) {
    case 'good_for_extractor_fast': return '适合快速提取';
    case 'needs_schema_repair': return '建议搭配格式修复';
    case 'unstable_format': return '输出格式不稳定';
    case 'high_timeout_risk': return '超时风险较高';
    case 'high_latency': return '延迟偏高';
    case 'insufficient_data': return '数据不足';
    case 'avoid_for_long_context': return '不建议用于长上下文';
    case 'ok': return '表现正常';
    default: return hint || '';
  }
}

export function formatProfileRankingReason(reason: string): string {
  const parts = reason.split(',');
  return parts.map((part) => {
    switch (part.trim()) {
      case 'high_success_rate': return '高成功率';
      case 'high_latency': return '延迟偏高';
      case 'high_timeout_rate': return '超时率高';
      case 'repairable_format': return '可修复格式';
      case 'high_repair_salvage': return '修复挽救率高';
      case 'needs_schema_repair': return '需格式修复';
      case 'low_confidence': return '低可信度';
      case 'no_profile': return '无画像数据';
      case 'neutral': return '中性';
      default: return part.trim();
    }
  }).join('，');
}

export function formatRate(value: number | undefined): string {
  if (value === undefined || value === null) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

export function formatLatencyMs(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '-';
  return `${Math.round(ms)}ms`;
}

export function buildProfileRouteSummary(modelRoute: ModelRouteDecision | null | undefined): string | null {
  if (!modelRoute?.profile_rankings?.length && !modelRoute?.selected_profile_metrics) {
    return null;
  }
  const parts: string[] = [];
  if (modelRoute.profile_confidence) {
    parts.push(`画像可信度：${formatProfileConfidence(modelRoute.profile_confidence)}`);
  }
  if (modelRoute.selected_profile_hint) {
    parts.push(`画像建议：${formatProfileHint(modelRoute.selected_profile_hint)}`);
  }
  if (modelRoute.profile_warnings?.length) {
    parts.push(`警告：${modelRoute.profile_warnings.map(formatProfileWarning).join('；')}`);
  }
  return parts.join(' | ') || null;
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
