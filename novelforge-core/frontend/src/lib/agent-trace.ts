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
  asset_enriched?: boolean;
  relationship_enriched?: boolean;
  quality_flags: string[];
  source_type?: string;
  diagnostic_seed?: boolean;
  needs_ai_repair?: boolean;
  low_confidence?: boolean;
  quality_warnings: string[];
};

export type AgentTraceSnippet = {
  id?: string;
  title?: string;
  mode?: string;
  preview?: string;
};

export type AgentCreativeDiagnostics = {
  usable: string[];
  missing: string[];
  missing_signals: string[];
  score?: number;
  summary?: string;
  relationship_creative_readiness?: string;
};

export type AgentRelationshipQualityReport = {
  total_relationships: number;
  tension_relationships: number;
  low_information_relationships: number;
  missing_plot_function_relationships: number;
  missing_signals: Record<string, number>;
  status?: string;
};

export type AgentRetrievalCoverage = {
  counts: {
    characters: number;
    relationships: number;
    world: number;
    chapter_snippets: number;
    low_confidence_assets: number;
    enriched_assets?: number;
  };
  issues: string[];
};

export type AgentRelationshipRepairSuggestion = {
  relationship_id?: string;
  title?: string;
  source?: string;
  target?: string;
  core?: string;
  current_state?: string;
  dependency?: string;
  misunderstanding?: string;
  debt?: string;
  conflict?: string;
  emotional_tension?: string;
  arc?: string;
  scene_potential: string[];
  writing_advice?: string;
  missing_signals: string[];
  usable_signals: string[];
  weak_spots?: string;
  enriched_relationship_draft?: Record<string, unknown>;
  queue_rank?: number;
  queue_score?: number;
  queue_reasons?: string[];
  queue_status?: 'pending' | 'saved' | 'updated' | 'skipped' | string;
  relationship_enriched?: boolean;
};

export type AgentTrace = {
  enabled: boolean;
  mode?: 'rule_planner' | 'model_tool_loop' | 'fallback' | 'disabled' | string;
  plan_summary: string;
  tool_calls: AgentToolCall[];
  used_assets: AgentTraceAsset[];
  chapter_snippets: AgentTraceSnippet[];
  retrieval_coverage?: AgentRetrievalCoverage;
  creative_diagnostics: Array<{
    id?: string;
    type?: string;
    title?: string;
    summary?: string;
    creative_diagnostics?: AgentCreativeDiagnostics;
  }>;
  relationship_quality_report?: AgentRelationshipQualityReport;
  relationship_repair_queue: AgentRelationshipRepairSuggestion[];
  relationship_repair_queue_report?: {
    before?: AgentRelationshipQualityReport;
    projected_after?: AgentRelationshipQualityReport;
    note?: string;
  };
  relationship_repair_suggestions: AgentRelationshipRepairSuggestion[];
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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function normalizeDiagnostics(value: unknown): AgentCreativeDiagnostics | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    usable: asStringArray(value.usable),
    missing: asStringArray(value.missing),
    missing_signals: asStringArray(value.missing_signals),
    score: asNumber(value.score),
    summary: asString(value.summary) || undefined,
    relationship_creative_readiness: asString(value.relationship_creative_readiness) || undefined,
  };
}

function normalizeMissingSignals(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.entries(value).reduce<Record<string, number>>((acc, [key, count]) => {
    const parsed = asNumber(count);
    if (key && typeof parsed === 'number') {
      acc[key] = parsed;
    }
    return acc;
  }, {});
}

function normalizeRelationshipQualityReport(value: unknown): AgentRelationshipQualityReport | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    total_relationships: asNumber(value.total_relationships) ?? 0,
    tension_relationships: asNumber(value.tension_relationships) ?? 0,
    low_information_relationships: asNumber(value.low_information_relationships) ?? 0,
    missing_plot_function_relationships: asNumber(value.missing_plot_function_relationships) ?? 0,
    missing_signals: normalizeMissingSignals(value.missing_signals),
    status: asString(value.status) || undefined,
  };
}

function normalizeRelationshipRepairSuggestion(value: unknown): AgentRelationshipRepairSuggestion | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const enrichedDraft = isRecord(value.enriched_relationship_draft) ? value.enriched_relationship_draft : undefined;
  const suggestion: AgentRelationshipRepairSuggestion = {
    relationship_id: asString(value.relationship_id) || undefined,
    title: asString(value.title) || undefined,
    source: asString(value.source) || undefined,
    target: asString(value.target) || undefined,
    core: asString(value.core) || undefined,
    current_state: asString(value.current_state) || undefined,
    dependency: asString(value.dependency) || undefined,
    misunderstanding: asString(value.misunderstanding) || undefined,
    debt: asString(value.debt) || undefined,
    conflict: asString(value.conflict) || undefined,
    emotional_tension: asString(value.emotional_tension) || undefined,
    arc: asString(value.arc) || undefined,
    scene_potential: asStringArray(value.scene_potential),
    writing_advice: asString(value.writing_advice) || undefined,
    missing_signals: asStringArray(value.missing_signals),
    usable_signals: asStringArray(value.usable_signals),
    weak_spots: asString(value.weak_spots) || undefined,
    enriched_relationship_draft: enrichedDraft,
    queue_rank: asNumber(value.queue_rank),
    queue_score: asNumber(value.queue_score),
    queue_reasons: asStringArray(value.queue_reasons),
    queue_status: asString(value.queue_status) || undefined,
    relationship_enriched: asBoolean(value.relationship_enriched),
  };
  return suggestion.title || suggestion.source || suggestion.target || suggestion.core ? suggestion : undefined;
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
        asset_enriched: asBoolean(item.asset_enriched),
        relationship_enriched: asBoolean(item.relationship_enriched),
        quality_flags: asStringArray(item.quality_flags),
        source_type: asString(item.source_type) || undefined,
        diagnostic_seed: asBoolean(item.diagnostic_seed),
        needs_ai_repair: asBoolean(item.needs_ai_repair),
        low_confidence: asBoolean(item.low_confidence),
        quality_warnings: asStringArray(item.quality_warnings),
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

  const retrievalCoverage = isRecord(value.retrieval_coverage) ? {
    counts: isRecord(value.retrieval_coverage.counts) ? {
      characters: asNumber(value.retrieval_coverage.counts.characters) ?? 0,
      relationships: asNumber(value.retrieval_coverage.counts.relationships) ?? 0,
      world: asNumber(value.retrieval_coverage.counts.world) ?? 0,
      chapter_snippets: asNumber(value.retrieval_coverage.counts.chapter_snippets) ?? 0,
      low_confidence_assets: asNumber(value.retrieval_coverage.counts.low_confidence_assets) ?? 0,
      enriched_assets: asNumber(value.retrieval_coverage.counts.enriched_assets),
    } : { characters: 0, relationships: 0, world: 0, chapter_snippets: 0, low_confidence_assets: 0, enriched_assets: 0 },
    issues: asStringArray(value.retrieval_coverage.issues),
  } : undefined;

  const creativeDiagnostics = Array.isArray(value.creative_diagnostics)
    ? value.creative_diagnostics.filter(isRecord).map((item) => ({
        id: asString(item.id) || undefined,
        type: asString(item.type) || undefined,
        title: asString(item.title) || undefined,
        summary: asString(item.summary) || undefined,
        creative_diagnostics: normalizeDiagnostics(item.creative_diagnostics),
      })).filter((item) => item.id || item.title || item.summary)
    : [];

  const relationshipRepairSuggestions = Array.isArray(value.relationship_repair_suggestions)
    ? value.relationship_repair_suggestions
        .map(normalizeRelationshipRepairSuggestion)
        .filter((item): item is AgentRelationshipRepairSuggestion => Boolean(item))
    : [];
  const relationshipRepairQueue = Array.isArray(value.relationship_repair_queue)
    ? value.relationship_repair_queue
        .map(normalizeRelationshipRepairSuggestion)
        .filter((item): item is AgentRelationshipRepairSuggestion => Boolean(item))
    : [];
  const relationshipRepairQueueReport = isRecord(value.relationship_repair_queue_report) ? {
    before: normalizeRelationshipQualityReport(value.relationship_repair_queue_report.before),
    projected_after: normalizeRelationshipQualityReport(value.relationship_repair_queue_report.projected_after),
    note: asString(value.relationship_repair_queue_report.note) || undefined,
  } : undefined;

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
    retrieval_coverage: retrievalCoverage,
    creative_diagnostics: creativeDiagnostics,
    relationship_quality_report: normalizeRelationshipQualityReport(value.relationship_quality_report),
    relationship_repair_queue: relationshipRepairQueue,
    relationship_repair_queue_report: relationshipRepairQueueReport,
    relationship_repair_suggestions: relationshipRepairSuggestions,
    degraded: asBoolean(value.degraded),
    fallback_reason: asString(value.fallback_reason) || undefined,
    stopped_reason: asString(value.stopped_reason) || undefined,
    max_tool_calls: asNumber(value.max_tool_calls),
  };
}
