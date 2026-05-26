import { getContentAssetPayload, getContentAssetText } from '@/lib/content-contract';
import { resolveChapterDirectoryMetadata } from '@/lib/chapter-metadata';
import { getEditorChapterWorkflowState } from '@/lib/editor-chapter-workflow';
import type { ContentItem } from '@/types';

export type ProjectQualityStatus = 'ready' | 'needs_repair' | 'insufficient' | 'unknown';

export type ProjectQualitySection = {
  status: ProjectQualityStatus;
  issues: string[];
  actions: string[];
};

export type ProjectQualitySummary = {
  overall_status: ProjectQualityStatus;
  status_label: string;
  writing_ready: boolean;
  chapter: ProjectQualitySection & {
    total: number;
    imported_originals: number;
    ai_drafts: number;
    candidates: number;
    formal_body: number;
    formal_prologue: number;
    extra: number;
    archived: number;
    decorative_or_catalog: number;
    overlong_segments: number;
  };
  character: ProjectQualitySection & {
    total: number;
    writable: number;
    low_information: number;
  };
  relationship: ProjectQualitySection & {
    total: number;
    quality_status: 'usable' | 'thin' | 'empty';
    relationship_quality_report: {
      total_relationships: number;
      tension_relationships: number;
      low_information_relationships: number;
      missing_plot_function_relationships: number;
      missing_signals: Record<string, number>;
      status: 'usable' | 'thin' | 'empty';
    };
    usable: number;
    tension: number;
    low_information: number;
    enriched: number;
    needs_repair: number;
    top_missing_signals: string[];
  };
  world: ProjectQualitySection & {
    total: number;
    usable_signals: number;
    rules: number;
    images: number;
    costs: number;
    taboos: number;
    scene_potential: number;
  };
  structure: ProjectQualitySection & {
    outlines: number;
    timelines: number;
  };
  writing_readiness: ProjectQualitySection & {
    has_writable_character: boolean;
    has_usable_relationship: boolean;
    has_world_signal: boolean;
    has_chapter_source: boolean;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function hasText(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasText);
  if (value && typeof value === 'object') return Object.values(value).some(hasText);
  return false;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function statusLabel(status: ProjectQualityStatus): string {
  switch (status) {
    case 'ready':
      return '可写';
    case 'needs_repair':
      return '需要修复';
    case 'insufficient':
      return '资料不足';
    default:
      return '未知';
  }
}

function sectionStatus(blocking: boolean, repair: boolean, present: boolean): ProjectQualityStatus {
  if (!present) return 'insufficient';
  if (blocking) return 'insufficient';
  if (repair) return 'needs_repair';
  return 'ready';
}

function countWorldSignals(payload: Record<string, unknown>) {
  const rules = [
    payload.rules,
    payload.world_rules,
    payload.laws,
    payload.constraints,
  ].filter(hasText).length;
  const images = [
    payload.images,
    payload.imagery,
    payload.motifs,
    payload.symbols,
    payload.locations,
    payload.semantic_nodes,
  ].filter(hasText).length;
  const costs = [
    payload.costs,
    payload.price,
    payload.cost,
    payload.consequences,
    payload.tradeoffs,
  ].filter(hasText).length;
  const taboos = [
    payload.taboos,
    payload.forbidden,
    payload.prohibitions,
    payload.constraints,
  ].filter(hasText).length;
  const scenePotential = [
    payload.scene_potential,
    payload.scene_hooks,
    payload.conflicts,
    payload.core_conflicts,
  ].filter(hasText).length;
  return { rules, images, costs, taboos, scenePotential };
}

function countCharacterSignals(payload: Record<string, unknown>): number {
  return [
    payload.desires,
    payload.goals,
    payload.fears,
    payload.wounds,
    payload.conflicts,
    payload.action_pattern,
    payload.behavior_examples,
    payload.personality_tension,
    payload.character_arc,
    payload.speech_style,
    payload.voice,
    payload.example_dialogues,
  ].filter(hasText).length;
}

function countRelationshipSignals(payload: Record<string, unknown>): {
  tension: boolean;
  enriched: boolean;
  lowInformation: boolean;
  missingSignals: string[];
} {
  const qualityFlags = asStringArray(payload.quality_flags);
  const missingSignals = unique([
    ...asStringArray(payload.remaining_missing_signals),
    ...asStringArray(payload.missing_signals),
  ]);
  const tension = [
    payload.relationship_tension,
    payload.tension,
    payload.emotional_tension,
    payload.conflict,
    payload.debt,
    payload.dependency,
    payload.misunderstanding,
    payload.core,
    payload.arc,
    payload.scene_potential,
  ].some(hasText);
  const enriched = qualityFlags.includes('relationship_enriched')
    || asString(payload.repair_status) === 'confirmed'
    || asString(payload.source_type) === 'user_confirmed_repair';
  const description = [
    asString(payload.description),
    asString(payload.summary),
    asString(payload.core),
    asString(payload.current_state),
  ].filter(Boolean).join(' ');
  const lowInformation = !enriched && !tension && description.length < 80;
  return { tension, enriched, lowInformation, missingSignals };
}

export function buildProjectQualitySummary(assets: {
  chapters: ContentItem[];
  characters: ContentItem[];
  relationships: ContentItem[];
  worlds: ContentItem[];
  timelines: ContentItem[];
  outlines: ContentItem[];
}): ProjectQualitySummary {
  const chapterCounts = assets.chapters.reduce<{
    imported_originals: number;
    ai_drafts: number;
    candidates: number;
    formal_body: number;
    formal_prologue: number;
    extra: number;
    archived: number;
    decorative_or_catalog: number;
    overlong_segments: number;
  }>((acc, item) => {
    const metadata = resolveChapterDirectoryMetadata(item);
    const workflow = getEditorChapterWorkflowState(item);
    const text = getContentAssetText(item);
    if (metadata.sourceType === 'imported' || metadata.sourceType === 'system_split') acc.imported_originals += 1;
    if (metadata.saveDestination === 'ai_draft') acc.ai_drafts += 1;
    if (metadata.saveDestination === 'alternate_version') acc.candidates += 1;
    if (metadata.saveDestination === 'formal_body') acc.formal_body += 1;
    if (metadata.saveDestination === 'formal_prologue') acc.formal_prologue += 1;
    if (metadata.saveDestination === 'extra') acc.extra += 1;
    if (workflow.isArchived) acc.archived += 1;
    if (metadata.isDecorative || ['目录', '插图', '设定'].includes(metadata.chapterRole)) acc.decorative_or_catalog += 1;
    if (metadata.wordCount > 6000 || text.length > 12000) acc.overlong_segments += 1;
    return acc;
  }, {
    imported_originals: 0,
    ai_drafts: 0,
    candidates: 0,
    formal_body: 0,
    formal_prologue: 0,
    extra: 0,
    archived: 0,
    decorative_or_catalog: 0,
    overlong_segments: 0,
  });

  const characterStats = assets.characters.reduce<{ writable: number; lowInformation: number }>((acc, item) => {
    const payload = getContentAssetPayload(item);
    const signals = countCharacterSignals(payload);
    const description = [
      asString(payload.description),
      asString(payload.summary),
      item.content,
    ].filter(Boolean).join(' ');
    if (signals >= 2 || (signals >= 1 && description.length >= 80)) {
      acc.writable += 1;
    } else {
      acc.lowInformation += 1;
    }
    return acc;
  }, { writable: 0, lowInformation: 0 });

  const missingSignalCounts = new Map<string, number>();
  const relationshipStats = assets.relationships.reduce<{
    usable: number;
    tension: number;
    enriched: number;
    lowInformation: number;
  }>((acc, item) => {
    const payload = getContentAssetPayload(item);
    const signals = countRelationshipSignals(payload);
    if (signals.tension) acc.tension += 1;
    if (signals.enriched) acc.enriched += 1;
    if (signals.lowInformation) acc.lowInformation += 1;
    if (signals.tension || signals.enriched) acc.usable += 1;
    signals.missingSignals.forEach((signal) => {
      missingSignalCounts.set(signal, (missingSignalCounts.get(signal) ?? 0) + 1);
    });
    return acc;
  }, { usable: 0, tension: 0, enriched: 0, lowInformation: 0 });
  const relationshipNeedsRepair = Math.max(0, assets.relationships.length - relationshipStats.usable);
  const relationshipMissingSignals = Object.fromEntries(missingSignalCounts.entries());
  const relationshipQualityStatus: 'usable' | 'thin' | 'empty' = assets.relationships.length === 0
    ? 'empty'
    : relationshipStats.usable > 0
      ? 'usable'
      : 'thin';
  const topMissingSignals = Array.from(missingSignalCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([signal, count]) => `${signal} ×${count}`);

  const worldStats = assets.worlds.reduce<{
    rules: number;
    images: number;
    costs: number;
    taboos: number;
    scenePotential: number;
  }>((acc, item) => {
    const payload = getContentAssetPayload(item);
    const signals = countWorldSignals(payload);
    acc.rules += signals.rules;
    acc.images += signals.images;
    acc.costs += signals.costs;
    acc.taboos += signals.taboos;
    acc.scenePotential += signals.scenePotential;
    return acc;
  }, { rules: 0, images: 0, costs: 0, taboos: 0, scenePotential: 0 });
  const usableWorldSignals = worldStats.rules + worldStats.images + worldStats.costs + worldStats.taboos + worldStats.scenePotential;

  const hasChapterSource = chapterCounts.imported_originals > 0 || chapterCounts.formal_body > 0 || chapterCounts.formal_prologue > 0;
  const hasWritableCharacter = characterStats.writable > 0;
  const hasUsableRelationship = relationshipStats.usable > 0;
  const hasWorldSignal = usableWorldSignals > 0;
  const writingReady = hasChapterSource && hasWritableCharacter && hasUsableRelationship && hasWorldSignal;
  const hasAnyAsset = assets.chapters.length + assets.characters.length + assets.relationships.length + assets.worlds.length + assets.timelines.length + assets.outlines.length > 0;

  const chapterIssues = unique([
    !hasChapterSource ? '缺少导入原文或正式正文，AI 没有稳定章节来源。' : '',
    chapterCounts.overlong_segments > 0 ? `${chapterCounts.overlong_segments} 个章节/片段过长，建议在 editor 检查拆分。` : '',
    chapterCounts.decorative_or_catalog > 0 ? `${chapterCounts.decorative_or_catalog} 个目录/插图/设定类内容混入章节。` : '',
    chapterCounts.ai_drafts + chapterCounts.candidates > Math.max(4, chapterCounts.formal_body + chapterCounts.formal_prologue + 2) ? 'AI 草稿/候选偏多，容易污染创作判断。' : '',
  ]);
  const characterIssues = unique([
    assets.characters.length === 0 ? '缺少角色资产。' : '',
    characterStats.writable === 0 && assets.characters.length > 0 ? '角色缺少欲望、伤痕、恐惧或行动模式。' : '',
    characterStats.lowInformation > 0 ? `${characterStats.lowInformation} 个角色信息偏薄。` : '',
  ]);
  const relationshipIssues = unique([
    assets.relationships.length === 0 ? '缺少关系资产。' : '',
    relationshipStats.usable === 0 && assets.relationships.length > 0 ? '关系缺少冲突、依赖、误解或情绪张力。' : '',
    relationshipNeedsRepair > 0 ? `${relationshipNeedsRepair} 条关系仍待补强。` : '',
  ]);
  const worldIssues = unique([
    assets.worlds.length === 0 ? '缺少世界观资产。' : '',
    usableWorldSignals === 0 && assets.worlds.length > 0 ? '世界观缺少规则、意象、代价、禁忌或场景可用性。' : '',
  ]);
  const structureIssues = unique([
    assets.timelines.length === 0 ? '缺少时间线资产。' : '',
    assets.outlines.length === 0 ? '缺少大纲/小说根资产。' : '',
  ]);

  const readinessIssues = unique([
    !hasWritableCharacter ? '至少需要 1 个可写角色。' : '',
    !hasUsableRelationship ? '至少需要 1 条 usable/enriched 关系。' : '',
    !hasWorldSignal ? '至少需要 1 个世界观规则、意象、代价或禁忌。' : '',
    !hasChapterSource ? '至少需要 1 个导入章节或正式章节片段来源。' : '',
  ]);

  let overallStatus: ProjectQualityStatus = 'unknown';
  if (hasAnyAsset) {
    overallStatus = writingReady
      ? (chapterIssues.length || characterStats.lowInformation || relationshipNeedsRepair || worldIssues.length ? 'needs_repair' : 'ready')
      : 'insufficient';
  }

  return {
    overall_status: overallStatus,
    status_label: statusLabel(overallStatus),
    writing_ready: writingReady,
    chapter: {
      status: sectionStatus(!hasChapterSource, chapterIssues.length > 0, assets.chapters.length > 0),
      issues: chapterIssues,
      actions: unique([
        !hasChapterSource ? '先完成导入或把候选章节转为正式正文。' : '',
        chapterCounts.ai_drafts + chapterCounts.candidates > 0 ? '去 editor 归档候选或转为正式章节。' : '',
        chapterCounts.overlong_segments || chapterCounts.decorative_or_catalog ? '去 editor 用筛选检查导入原文和目录/装饰片段。' : '',
      ]),
      total: assets.chapters.length,
      ...chapterCounts,
    },
    character: {
      status: sectionStatus(characterStats.writable === 0, characterStats.lowInformation > 0, assets.characters.length > 0),
      issues: characterIssues,
      actions: unique([
        characterStats.writable === 0 ? '后续需要做角色补强，补欲望、伤痕、恐惧、行动模式和说话方式。' : '',
        characterStats.lowInformation > 0 ? '优先补强主角和高频配角，不要只保留姓名摘要。' : '',
      ]),
      total: assets.characters.length,
      writable: characterStats.writable,
      low_information: characterStats.lowInformation,
    },
    relationship: {
      status: sectionStatus(relationshipStats.usable === 0, relationshipNeedsRepair > 0 || relationshipStats.lowInformation > 0, assets.relationships.length > 0),
      issues: relationshipIssues,
      actions: unique([
        relationshipNeedsRepair > 0 ? '使用核心关系补强队列，把 thin 关系补成可写关系。' : '',
        topMissingSignals.length > 0 ? `优先补：${topMissingSignals.slice(0, 3).join('、')}。` : '',
      ]),
      total: assets.relationships.length,
      quality_status: relationshipQualityStatus,
      relationship_quality_report: {
        total_relationships: assets.relationships.length,
        tension_relationships: relationshipStats.tension,
        low_information_relationships: relationshipStats.lowInformation,
        missing_plot_function_relationships: relationshipNeedsRepair,
        missing_signals: relationshipMissingSignals,
        status: relationshipQualityStatus,
      },
      usable: relationshipStats.usable,
      tension: relationshipStats.tension,
      low_information: relationshipStats.lowInformation,
      enriched: relationshipStats.enriched,
      needs_repair: relationshipNeedsRepair,
      top_missing_signals: topMissingSignals,
    },
    world: {
      status: sectionStatus(usableWorldSignals === 0, worldIssues.length > 0, assets.worlds.length > 0),
      issues: worldIssues,
      actions: unique([
        usableWorldSignals === 0 ? '补世界规则、代价、禁忌和可写场景意象。' : '',
        assets.worlds.length > 0 ? '检查世界树，保留能直接进入场景的设定。' : '',
      ]),
      total: assets.worlds.length,
      usable_signals: usableWorldSignals,
      rules: worldStats.rules,
      images: worldStats.images,
      costs: worldStats.costs,
      taboos: worldStats.taboos,
      scene_potential: worldStats.scenePotential,
    },
    structure: {
      status: sectionStatus(false, structureIssues.length > 0, assets.timelines.length + assets.outlines.length > 0),
      issues: structureIssues,
      actions: unique([
        assets.timelines.length === 0 ? '导入质量稳定后补时间线，帮助 AI 维持因果顺序。' : '',
        assets.outlines.length === 0 ? '后续补小说根资产/大纲，让项目边界更清楚。' : '',
      ]),
      outlines: assets.outlines.length,
      timelines: assets.timelines.length,
    },
    writing_readiness: {
      status: writingReady ? 'ready' : hasAnyAsset ? 'insufficient' : 'unknown',
      issues: readinessIssues,
      actions: unique([
        !writingReady ? '先补齐：可写角色、usable 关系、世界观信号、章节片段来源。' : '',
        writingReady && overallStatus === 'needs_repair' ? '可以开始写作，但建议先处理最薄弱的关系和候选章节。' : '',
      ]),
      has_writable_character: hasWritableCharacter,
      has_usable_relationship: hasUsableRelationship,
      has_world_signal: hasWorldSignal,
      has_chapter_source: hasChapterSource,
    },
  };
}
