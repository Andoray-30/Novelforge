import { contentService } from '@/lib/api';
import type { AgentRelationshipRepairSuggestion } from '@/lib/agent-trace';
import type { ContentCreateRequest, ContentItem, ContentUpdateRequest } from '@/types';

function nowIso(): string {
  return new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim())));
}

function hasText(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return Array.isArray(value) && value.length > 0;
}

function signalResolved(signal: string, suggestion: AgentRelationshipRepairSuggestion, draft: Record<string, unknown>): boolean {
  const normalized = signal.toLowerCase();
  if (normalized.includes('依赖') || normalized.includes('dependency')) {
    return hasText(suggestion.dependency ?? draft.dependency);
  }
  if (normalized.includes('误解') || normalized.includes('misunderstanding')) {
    return hasText(suggestion.misunderstanding ?? draft.misunderstanding);
  }
  if (normalized.includes('亏欠') || normalized.includes('debt')) {
    return hasText(suggestion.debt ?? draft.debt);
  }
  if (normalized.includes('冲突') || normalized.includes('conflict')) {
    return hasText(suggestion.conflict ?? draft.conflict);
  }
  if (normalized.includes('情绪张力') || normalized.includes('emotional_tension')) {
    return hasText(suggestion.emotional_tension ?? draft.emotional_tension);
  }
  if (normalized.includes('剧情功能') || normalized.includes('plot_function')) {
    return hasText(suggestion.scene_potential) || hasText(suggestion.writing_advice ?? draft.writing_advice);
  }
  return hasText(suggestion.core ?? draft.core);
}

export function buildRelationshipRepairPayload(suggestion: AgentRelationshipRepairSuggestion, options: {
  repairStatus: 'draft' | 'confirmed';
  sourceType: 'ai_repaired' | 'user_confirmed_repair';
  original?: ContentItem | null;
}): Record<string, unknown> {
  const draft = asRecord(suggestion.enriched_relationship_draft);
  const existingData = asRecord(options.original?.extracted_data);
  const missingSignals = suggestion.missing_signals ?? [];
  const missingSignalsResolved = missingSignals.filter((signal) => signalResolved(signal, suggestion, draft));
  const remainingMissingSignals = missingSignals.filter((signal) => !missingSignalsResolved.includes(signal));
  return {
    ...existingData,
    ...draft,
    source: suggestion.source ?? draft.source ?? existingData.source,
    target: suggestion.target ?? draft.target ?? existingData.target,
    core: suggestion.core ?? draft.core,
    current_state: suggestion.current_state ?? draft.current_state,
    dependency: suggestion.dependency ?? draft.dependency,
    misunderstanding: suggestion.misunderstanding ?? draft.misunderstanding,
    debt: suggestion.debt ?? draft.debt,
    conflict: suggestion.conflict ?? draft.conflict,
    emotional_tension: suggestion.emotional_tension ?? draft.emotional_tension,
    arc: suggestion.arc ?? draft.arc,
    scene_potential: suggestion.scene_potential,
    writing_advice: suggestion.writing_advice ?? draft.writing_advice,
    source_type: options.sourceType,
    repair_from_relationship_id: suggestion.relationship_id,
    repair_status: options.repairStatus,
    repaired_at: nowIso(),
    quality_flags: uniqueStrings([
      ...((Array.isArray(existingData.quality_flags) ? existingData.quality_flags : []) as unknown[]),
      'relationship_enriched',
    ]),
    missing_signals_resolved: missingSignalsResolved,
    remaining_missing_signals: remainingMissingSignals,
  };
}

function relationshipRepairContent(suggestion: AgentRelationshipRepairSuggestion): string {
  return [
    suggestion.core,
    suggestion.current_state ? `当前状态：${suggestion.current_state}` : '',
    suggestion.dependency ? `依赖：${suggestion.dependency}` : '',
    suggestion.misunderstanding ? `误解：${suggestion.misunderstanding}` : '',
    suggestion.debt ? `亏欠：${suggestion.debt}` : '',
    suggestion.conflict ? `冲突：${suggestion.conflict}` : '',
    suggestion.emotional_tension ? `情绪张力：${suggestion.emotional_tension}` : '',
    suggestion.arc ? `关系变化：${suggestion.arc}` : '',
    suggestion.scene_potential.length > 0 ? `可写场景：${suggestion.scene_potential.join('；')}` : '',
    suggestion.writing_advice ? `写作建议：${suggestion.writing_advice}` : '',
  ].filter(Boolean).join('\n');
}

export function buildRelationshipRepairDraftRequest(suggestion: AgentRelationshipRepairSuggestion, params: {
  sessionId: string;
  parentId?: string;
}): ContentCreateRequest {
  const data = buildRelationshipRepairPayload(suggestion, {
    repairStatus: 'draft',
    sourceType: 'ai_repaired',
  });
  return {
    metadata: {
      title: suggestion.title ? `补强草稿：${suggestion.title}` : '关系补强草稿',
      type: 'relationship',
      status: 'draft',
      tags: ['relationship_enriched', 'repair-draft'],
      parent_id: params.parentId,
      session_id: params.sessionId,
    },
    content: relationshipRepairContent(suggestion),
    extracted_data: data,
    relations: {
      source: suggestion.source ? [suggestion.source] : [],
      target: suggestion.target ? [suggestion.target] : [],
    },
  };
}

export async function saveRelationshipRepairDraft(params: {
  suggestion: AgentRelationshipRepairSuggestion;
  sessionId: string;
  parentId?: string;
}): Promise<{ contentId: string }> {
  const result = await contentService.create(buildRelationshipRepairDraftRequest(params.suggestion, params));
  return { contentId: result.content_id };
}

export function buildRelationshipRepairUpdateRequest(original: ContentItem, suggestion: AgentRelationshipRepairSuggestion): ContentUpdateRequest {
  const data = buildRelationshipRepairPayload(suggestion, {
    repairStatus: 'confirmed',
    sourceType: 'user_confirmed_repair',
    original,
  });
  data.previous_snapshot = {
    old_title: original.metadata.title,
    old_content: original.content,
    old_extracted_data: original.extracted_data ?? null,
    old_updated_at: original.metadata.updated_at,
    repaired_at: data.repaired_at,
  };
  return {
    metadata: {
      title: original.metadata.title,
      type: 'relationship',
      status: original.metadata.status,
      author: original.metadata.author,
      tags: uniqueStrings([...(original.metadata.tags ?? []), 'relationship_enriched', 'repair-confirmed']),
      parent_id: original.metadata.parent_id,
      children_ids: original.metadata.children_ids,
      session_id: original.metadata.session_id,
    },
    content: relationshipRepairContent(suggestion) || original.content,
    extracted_data: data,
    stats: original.stats ?? null,
    relations: {
      ...(original.relations ?? {}),
      source: suggestion.source ? [suggestion.source] : original.relations?.source ?? [],
      target: suggestion.target ? [suggestion.target] : original.relations?.target ?? [],
    },
  };
}

export async function updateRelationshipWithRepair(params: {
  suggestion: AgentRelationshipRepairSuggestion;
  sessionId: string;
  parentId?: string;
}): Promise<{ contentId: string }> {
  const relationshipId = params.suggestion.relationship_id;
  if (!relationshipId) {
    throw new Error('缺少原关系资产 ID，无法更新原关系资产');
  }
  const original = await contentService.getById(relationshipId);
  if (original.metadata.session_id && original.metadata.session_id !== params.sessionId) {
    throw new Error('关系资产不属于当前项目，已阻止跨项目写回');
  }
  if (params.parentId && original.metadata.parent_id && original.metadata.parent_id !== params.parentId) {
    throw new Error('关系资产不属于当前小说，已阻止跨小说写回');
  }
  await contentService.update(relationshipId, buildRelationshipRepairUpdateRequest(original, params.suggestion));
  return { contentId: relationshipId };
}
