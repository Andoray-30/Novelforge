import type { ModelRouteDecision, ModelProbeResult, NovelImportTaskResult } from '@/types';

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

export type ModelRouteSummary = {
  role: string;
  selectedModel: string;
  reason: string;
  reasonLabel: string;
  candidates: string[];
  probeResults: ModelRouteProbeSummary[];
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
  auth_failed: '鉴权失败',
  empty_content: '空响应',
  json_invalid: 'JSON 不合规',
  provider_unavailable: '供应商不可用',
  upstream_error: '上游错误',
  probe_not_suitable: '探测不合格',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function normalizeProbe(value: unknown): ModelRouteProbeSummary | null {
  const payload = asRecord(value);
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

export function normalizeModelRoute(value: unknown): ModelRouteSummary | null {
  const payload = asRecord(value) as ModelRouteDecision | null;
  if (!payload) return null;

  const selectedModel = asString(payload.selected_model);
  if (!selectedModel) return null;

  const reason = asString(payload.reason) || 'unknown';
  const role = asString(payload.role) || 'unknown';
  const candidates = asStringArray(payload.candidates);
  const probeResults = Array.isArray(payload.probe_results)
    ? payload.probe_results.map(normalizeProbe).filter((item): item is ModelRouteProbeSummary => item !== null)
    : [];

  return {
    role,
    selectedModel,
    reason,
    reasonLabel: ROUTE_REASON_LABELS[reason] || reason,
    candidates,
    probeResults,
  };
}

export function getModelRouteSummary(result: NovelImportTaskResult | null | undefined): ModelRouteSummary | null {
  return normalizeModelRoute(result?.model_route || result?.analysis_diagnostics?.model_route);
}

export function getModelProbeStatusLabel(probe: ModelRouteProbeSummary): string {
  if (probe.available && probe.nonEmptyChat && probe.jsonCapable && probe.extractionRich) {
    return '通过';
  }
  if (probe.errorType) {
    return ERROR_TYPE_LABELS[probe.errorType] || probe.errorType;
  }
  if (!probe.available) return '不可用';
  if (!probe.jsonCapable) return 'JSON 不合规';
  if (!probe.extractionRich) return '提取信号不足';
  return '需复核';
}
