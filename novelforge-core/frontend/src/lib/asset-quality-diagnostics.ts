import { getContentAssetPayload } from '@/lib/content-contract';
import type { ContentItem, ImportAnalysisDiagnostics, NovelImportAnalysisStatus } from '@/types';

export interface AssetQualityDiagnosticsResult {
  analysis_status: NovelImportAnalysisStatus;
  analysis_quality_issues: string[];
  analysis_diagnostics: ImportAnalysisDiagnostics;
  candidate_counts: Record<string, number>;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : [];
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

export function looksLikeMojibake(value: string): boolean {
  if (!value) return false;
  const text = decodeBasicEntities(value);
  if (text.includes(String.fromCharCode(0xfffd)) || text.includes('????')) return true;
  const suspiciousFragments = ['Ã', 'Â', 'ä¸', 'äº', 'è§', 'ç»', 'å°', 'é—', 'è¶', 'æ', 'ç©', '锟', '鐢', '绋', '璧'];
  return suspiciousFragments.some((fragment) => text.includes(fragment));
}

function getTitle(item: ContentItem): string {
  return decodeBasicEntities(asString(getContentAssetPayload(item).title) || item.metadata.title || '');
}

function getDescription(item: ContentItem, payload = getContentAssetPayload(item)): string {
  return asString(payload.description) || asString(payload.summary) || asString(payload.content) || item.content || '';
}

function getCharacterNames(items: ContentItem[]): Set<string> {
  const names = new Set<string>();
  items
    .filter((item) => item.metadata.type === 'character')
    .forEach((item) => {
      const payload = getContentAssetPayload(item);
      [getTitle(item), asString(payload.name), item.metadata.id, ...asStringArray(payload.aliases), ...asStringArray(payload.tags)].forEach((name) => {
        const normalized = normalizeName(name);
        if (normalized) names.add(normalized);
      });
    });
  return names;
}

function hasWorldFacts(payload: Record<string, unknown>): boolean {
  const keys = ['locations', 'cultures', 'rules', 'history', 'organizations', 'technologies', 'concepts', 'semantic_nodes'];
  return keys.some((key) => {
    const value = payload[key];
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
  });
}

function isDecorativeChapter(item: ContentItem): boolean {
  const payload = getContentAssetPayload(item);
  const title = getTitle(item);
  const content = item.content || asString(payload.content);
  if (payload.is_decorative === true) return true;
  if (/插图|illustration|cover|封面/i.test(title)) return true;
  const symbolCount = (content.match(/[◆◇※＊*=_\-—~]/g) || []).length;
  return content.trim().length > 0 && content.trim().length < 120 && symbolCount >= Math.max(8, content.trim().length * 0.35);
}

function isLowInformationCharacter(item: ContentItem): boolean {
  const payload = getContentAssetPayload(item);
  const description = getDescription(item, payload);
  const confidence = asString(payload.confidence).toLowerCase();
  const evidence = asStringArray(payload.evidence);
  const creativeSignals = [
    payload.goals,
    payload.desires,
    payload.fears,
    payload.wounds,
    payload.conflicts,
    payload.personality_tension,
    payload.character_arc,
  ].flatMap((value) => (Array.isArray(value) ? value : [value])).filter((value) => asString(value).length > 0);
  if (confidence === 'low') return true;
  return description.length < 80 && evidence.length < 2 && creativeSignals.length === 0;
}

function isWeakRelationship(item: ContentItem): boolean {
  const payload = getContentAssetPayload(item);
  const description = getDescription(item, payload);
  const evidence = asStringArray(payload.evidence);
  const evolution = asStringArray(payload.evolution);
  const tension = asString(payload.relationship_tension) || asString(payload.tension);
  const confidence = asString(payload.confidence).toLowerCase();
  if (confidence === 'low') return true;
  return description.length < 50 || (evidence.length === 0 && !tension && evolution.length === 0);
}

function hasTimelineMismatch(item: ContentItem): boolean {
  const payload = getContentAssetPayload(item);
  const title = asString(payload.title) || item.metadata.title;
  const description = getDescription(item, payload);
  const evidence = asStringArray(payload.evidence);
  const characters = asStringArray(payload.characters);
  const chapterReference = asString(payload.chapter_reference) || asString(payload.chapter_id);
  if (!description || description.length < 20) return true;
  if (title && description && normalizeName(title) === normalizeName(description)) return true;
  return evidence.length === 0 && characters.length === 0 && !chapterReference;
}

export function buildAssetQualityDiagnostics(items: ContentItem[]): AssetQualityDiagnosticsResult {
  const characters = items.filter((item) => item.metadata.type === 'character');
  const chapters = items.filter((item) => item.metadata.type === 'chapter');
  const relationships = items.filter((item) => item.metadata.type === 'relationship');
  const timelines = items.filter((item) => item.metadata.type === 'timeline');
  const worlds = items.filter((item) => item.metadata.type === 'world');
  const characterLookup = getCharacterNames(items);

  const suspectedMojibakeAssets = items
    .filter((item) => looksLikeMojibake(item.metadata.title) || looksLikeMojibake(getTitle(item)))
    .map((item) => ({ id: item.metadata.id, title: getTitle(item), type: item.metadata.type }));

  const decorativeChapters = chapters
    .filter(isDecorativeChapter)
    .map((item) => ({ id: item.metadata.id, title: getTitle(item), reason: '疑似插图、封面或符号分隔章节' }));

  const lowConfidenceCharacters = characters
    .filter(isLowInformationCharacter)
    .map((item) => ({ id: item.metadata.id, name: getTitle(item), description_preview: getDescription(item).slice(0, 80) }));

  const unresolvedRelationshipEdges: Array<Record<string, unknown>> = [];
  const weakRelationships = relationships
    .filter((item) => {
      const payload = getContentAssetPayload(item);
      const source = asString(payload.source);
      const target = asString(payload.target) || asString(payload.target_name);
      if (!source || !target || !characterLookup.has(normalizeName(source)) || !characterLookup.has(normalizeName(target))) {
        unresolvedRelationshipEdges.push({ id: item.metadata.id, title: getTitle(item), source, target });
      }
      return isWeakRelationship(item);
    })
    .map((item) => {
      const payload = getContentAssetPayload(item);
      return {
        id: item.metadata.id,
        title: getTitle(item),
        source: asString(payload.source),
        target: asString(payload.target) || asString(payload.target_name),
        description_preview: getDescription(item, payload).slice(0, 100),
      };
    });

  const timelineMismatchEvents = timelines
    .filter(hasTimelineMismatch)
    .map((item) => ({ id: item.metadata.id, title: getTitle(item), description_preview: getDescription(item).slice(0, 100) }));

  const weakWorldFacts = worlds
    .filter((item) => !hasWorldFacts(getContentAssetPayload(item)))
    .map((item) => ({ id: item.metadata.id, title: getTitle(item), reason: '世界观缺少地点、规则、历史、组织或概念分类' }));

  const diagnostics: ImportAnalysisDiagnostics = {
    suspected_mojibake_assets: suspectedMojibakeAssets,
    decorative_chapters: decorativeChapters,
    low_confidence_characters: lowConfidenceCharacters,
    unresolved_relationship_edges: unresolvedRelationshipEdges,
    relationship_unresolved_endpoints: unresolvedRelationshipEdges,
    weak_relationships: weakRelationships,
    timeline_mismatch_events: timelineMismatchEvents,
    weak_world_facts: weakWorldFacts,
  };

  const candidateCounts = {
    recovered_assets_total: items.length,
    recovered_chapters: chapters.length,
    recovered_characters: characters.length,
    recovered_relationships: relationships.length,
    recovered_timeline_events: timelines.length,
    recovered_world_assets: worlds.length,
    suspected_mojibake_assets: suspectedMojibakeAssets.length,
    decorative_chapters: decorativeChapters.length,
    low_information_characters: lowConfidenceCharacters.length,
    unresolved_relationship_edges: unresolvedRelationshipEdges.length,
    weak_relationships: weakRelationships.length,
    timeline_mismatch_events: timelineMismatchEvents.length,
    weak_world_facts: weakWorldFacts.length,
  };

  const issues: string[] = [];
  if (suspectedMojibakeAssets.length) issues.push(`发现 ${suspectedMojibakeAssets.length} 个疑似乱码资产标题`);
  if (decorativeChapters.length) issues.push(`发现 ${decorativeChapters.length} 个疑似装饰章节`);
  if (lowConfidenceCharacters.length) issues.push(`发现 ${lowConfidenceCharacters.length} 个低信息角色`);
  if (unresolvedRelationshipEdges.length) issues.push(`发现 ${unresolvedRelationshipEdges.length} 条关系端点未闭合`);
  if (weakRelationships.length) issues.push(`发现 ${weakRelationships.length} 条弱证据关系`);
  if (timelineMismatchEvents.length) issues.push(`发现 ${timelineMismatchEvents.length} 个时间线事件需要复核`);
  if (weakWorldFacts.length) issues.push(`发现 ${weakWorldFacts.length} 个世界观资产缺少结构化分类`);

  const hasHighRisk = suspectedMojibakeAssets.length > 0 || unresolvedRelationshipEdges.length > 0;
  const hasMediumRisk = lowConfidenceCharacters.length > 0 || weakRelationships.length > 0 || timelineMismatchEvents.length > 0 || weakWorldFacts.length > 0;

  return {
    analysis_status: hasHighRisk || hasMediumRisk ? 'low_quality' : 'completed',
    analysis_quality_issues: issues,
    analysis_diagnostics: diagnostics,
    candidate_counts: candidateCounts,
  };
}
