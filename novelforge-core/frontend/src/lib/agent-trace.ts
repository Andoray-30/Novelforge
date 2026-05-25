export type AgentToolCall = {
  name: string;
  status: string;
  summary: string;
  item_count?: number;
  step?: number;
  continue_reason?: string;
};

export type AgentTraceAsset = {
  id?: string;
  type?: string;
  title?: string;
};

export type AgentTraceSnippet = {
  id?: string;
  title?: string;
  mode?: string;
  preview?: string;
};

export type AgentTrace = {
  enabled: boolean;
  mode?: 'rule_planner' | 'model_tool_loop' | 'fallback' | 'disabled' | string;
  plan_summary: string;
  tool_calls: AgentToolCall[];
  used_assets: AgentTraceAsset[];
  chapter_snippets: AgentTraceSnippet[];
  degraded: boolean;
  fallback_reason?: string;
  stopped_reason?: string;
  max_tool_calls?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asBoolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function normalizeAgentTrace(value: unknown): AgentTrace | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const toolCalls = Array.isArray(value.tool_calls)
    ? value.tool_calls.filter(isRecord).map((item) => ({
        name: asString(item.name),
        status: asString(item.status) || 'unknown',
        summary: asString(item.summary),
        item_count: asNumber(item.item_count),
        step: asNumber(item.step),
        continue_reason: asString(item.continue_reason) || undefined,
      })).filter((item) => item.name || item.summary)
    : [];

  const usedAssets = Array.isArray(value.used_assets)
    ? value.used_assets.filter(isRecord).map((item) => ({
        id: asString(item.id) || undefined,
        type: asString(item.type) || undefined,
        title: asString(item.title) || undefined,
      })).filter((item) => item.id || item.title)
    : [];

  const chapterSnippets = Array.isArray(value.chapter_snippets)
    ? value.chapter_snippets.filter(isRecord).map((item) => ({
        id: asString(item.id) || undefined,
        title: asString(item.title) || undefined,
        mode: asString(item.mode) || undefined,
        preview: asString(item.preview) || undefined,
      })).filter((item) => item.id || item.title || item.preview)
    : [];

  const planSummary = asString(value.plan_summary);
  if (!planSummary && toolCalls.length === 0 && usedAssets.length === 0 && chapterSnippets.length === 0) {
    return undefined;
  }

  return {
    enabled: asBoolean(value.enabled),
    mode: asString(value.mode) || undefined,
    plan_summary: planSummary,
    tool_calls: toolCalls,
    used_assets: usedAssets,
    chapter_snippets: chapterSnippets,
    degraded: asBoolean(value.degraded),
    fallback_reason: asString(value.fallback_reason) || undefined,
    stopped_reason: asString(value.stopped_reason) || undefined,
    max_tool_calls: asNumber(value.max_tool_calls),
  };
}
