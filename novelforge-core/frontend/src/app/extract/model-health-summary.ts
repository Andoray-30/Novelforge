import type { ChapterIndexRun } from '@/types';
import { getModelErrorTypeLabel, normalizeModelRoute, type ModelRouteProbeSummary } from '@/lib/model-route-summary';

export interface ModelHealthErrorCount {
  type: string;
  label: string;
  count: number;
}

export interface ModelHealthSummaryItem {
  model: string;
  selectedCount: number;
  probeCount: number;
  probePassed: number;
  probeFailed: number;
  attemptCount: number;
  successfulAttempts: number;
  failedAttempts: number;
  averageLatencyMs: number | null;
  errorCounts: ModelHealthErrorCount[];
  lastRole: string | null;
  lastReasonLabel: string | null;
}

interface MutableModelHealthSummary {
  model: string;
  selectedCount: number;
  probeCount: number;
  probePassed: number;
  probeFailed: number;
  attemptCount: number;
  successfulAttempts: number;
  failedAttempts: number;
  latencyTotal: number;
  latencySamples: number;
  errorCounts: Map<string, number>;
  lastRole: string | null;
  lastReasonLabel: string | null;
}

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

function ensureModel(store: Map<string, MutableModelHealthSummary>, model: string): MutableModelHealthSummary {
  const existing = store.get(model);
  if (existing) return existing;
  const created: MutableModelHealthSummary = {
    model,
    selectedCount: 0,
    probeCount: 0,
    probePassed: 0,
    probeFailed: 0,
    attemptCount: 0,
    successfulAttempts: 0,
    failedAttempts: 0,
    latencyTotal: 0,
    latencySamples: 0,
    errorCounts: new Map(),
    lastRole: null,
    lastReasonLabel: null,
  };
  store.set(model, created);
  return created;
}

function addLatency(summary: MutableModelHealthSummary, latencyMs: number | null): void {
  if (latencyMs === null || latencyMs < 0) return;
  summary.latencyTotal += latencyMs;
  summary.latencySamples += 1;
}

function addError(summary: MutableModelHealthSummary, errorType: string | null): void {
  const normalized = errorType && errorType.trim().length > 0 ? errorType.trim() : 'unknown_error';
  summary.errorCounts.set(normalized, (summary.errorCounts.get(normalized) ?? 0) + 1);
}

function probePassed(probe: ModelRouteProbeSummary): boolean {
  return probe.available && probe.nonEmptyChat && probe.jsonCapable && probe.extractionRich;
}

function attemptSucceeded(status: string | null, errorType: string | null): boolean {
  if (errorType) return false;
  return status === 'success' || status === 'completed';
}

function attemptFailed(status: string | null, errorType: string | null): boolean {
  if (errorType) return true;
  if (!status) return false;
  return status !== 'success' && status !== 'completed';
}

function errorCountsToList(errorCounts: Map<string, number>): ModelHealthErrorCount[] {
  return Array.from(errorCounts.entries())
    .map(([type, count]) => ({ type, label: getModelErrorTypeLabel(type), count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function buildRecentModelHealthSummary(runs: ChapterIndexRun[]): ModelHealthSummaryItem[] {
  const store = new Map<string, MutableModelHealthSummary>();

  runs.forEach((run) => {
    const batchRoutePayloads = (run.model_route_batches || [])
      .map((item) => asRecord(item)?.model_route)
      .filter((item) => item !== undefined);
    const routePayloads = batchRoutePayloads.length > 0 ? batchRoutePayloads : [run.model_route];

    routePayloads.forEach((routePayload) => {
      const route = normalizeModelRoute(routePayload);
      if (!route) return;
      const selected = ensureModel(store, route.selectedModel);
      selected.selectedCount += 1;
      selected.lastRole = route.role;
      selected.lastReasonLabel = route.reasonLabel;

      route.probeResults.forEach((probe) => {
        const summary = ensureModel(store, probe.model);
        summary.probeCount += 1;
        addLatency(summary, probe.latencyMs);
        if (probePassed(probe)) {
          summary.probePassed += 1;
        } else {
          summary.probeFailed += 1;
          addError(summary, probe.errorType || 'probe_not_suitable');
        }
      });
    });

    run.chapter_index_attempts.forEach((attempt) => {
      const payload = asRecord(attempt);
      if (!payload) return;
      const model = asString(payload.model_used) || asString(payload.model) || asString(payload.selected_model);
      if (!model) return;
      const summary = ensureModel(store, model);
      const status = asString(payload.status)?.toLowerCase() ?? null;
      const errorType = asString(payload.error_type);
      const latencyMs = asNumber(payload.latency_ms) ?? asNumber(payload.latencyMs);
      summary.attemptCount += 1;
      addLatency(summary, latencyMs);
      if (attemptSucceeded(status, errorType)) summary.successfulAttempts += 1;
      if (attemptFailed(status, errorType)) {
        summary.failedAttempts += 1;
        addError(summary, errorType || status || 'unknown_error');
      }
    });
  });

  return Array.from(store.values())
    .map((item) => ({
      model: item.model,
      selectedCount: item.selectedCount,
      probeCount: item.probeCount,
      probePassed: item.probePassed,
      probeFailed: item.probeFailed,
      attemptCount: item.attemptCount,
      successfulAttempts: item.successfulAttempts,
      failedAttempts: item.failedAttempts,
      averageLatencyMs: item.latencySamples > 0 ? Math.round(item.latencyTotal / item.latencySamples) : null,
      errorCounts: errorCountsToList(item.errorCounts),
      lastRole: item.lastRole,
      lastReasonLabel: item.lastReasonLabel,
    }))
    .sort((left, right) => (
      right.selectedCount - left.selectedCount ||
      right.attemptCount - left.attemptCount ||
      right.probeCount - left.probeCount ||
      left.model.localeCompare(right.model)
    ));
}
