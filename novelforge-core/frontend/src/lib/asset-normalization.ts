import { getContentAssetPayload } from '@/lib/content-contract';
import type { Character, ContentItem, NetworkEdge } from '@/types';

type RelationshipType = NetworkEdge['relationship_type'];

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));
}

function key(value: string): string {
  return value.trim().toLowerCase();
}

export function decodeAssetTitle(value: string): string {
  const textarea = typeof document !== 'undefined' ? document.createElement('textarea') : null;
  if (textarea) {
    textarea.innerHTML = value;
    return textarea.value.trim();
  }
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

export function normalizeRelationshipType(value: unknown): RelationshipType {
  const raw = asString(value).replace(/^RelationshipType\./i, '').toLowerCase();
  switch (raw) {
    case 'friend':
    case 'friendship':
      return 'friendship';
    case 'lover':
    case 'romantic':
      return 'romantic';
    case 'enemy':
    case 'rival':
    case 'conflict':
      return 'conflict';
    case 'mentor':
    case 'mentorship':
      return 'mentorship';
    case 'colleague':
    case 'professional':
      return 'professional';
    case 'ally':
    case 'alliance':
      return 'alliance';
    case 'family':
      return 'family';
    default:
      return 'other';
  }
}

export function buildCharacterLookup(characters: Character[]): Map<string, Character> {
  const lookup = new Map<string, Character>();
  characters.forEach((character) => {
    [character.name, character.id, ...(character.aliases ?? []), ...(character.tags ?? [])].forEach((candidate) => {
      const normalized = key(candidate);
      if (normalized && !lookup.has(normalized)) {
        lookup.set(normalized, character);
      }
    });
  });
  return lookup;
}

function relationshipConfidence(current?: string, next?: string) {
  if (current === 'high' || next === 'high') return 'high';
  if (current === 'medium' || next === 'medium') return 'medium';
  return current || next;
}

export function resolveRelationshipEdges(characters: Character[], relationshipItems: ContentItem[]): NetworkEdge[] {
  const lookup = buildCharacterLookup(characters);
  const merged = new Map<string, NetworkEdge>();

  relationshipItems.forEach((item) => {
    const payload = getContentAssetPayload(item);
    const sourceName = asString(payload.source);
    const targetName = asString(payload.target) || asString(payload.target_name);
    if (!sourceName || !targetName) return;

    const source = lookup.get(key(sourceName));
    const target = lookup.get(key(targetName));
    if (!source || !target || source.id === target.id) return;

    const relationshipType = normalizeRelationshipType(payload.relationship_type || payload.relationship);
    const pairKey = [source.id, target.id].sort().join('::');
    const evidence = asStringArray(payload.evidence);
    const evolution = asStringArray(payload.evolution);
    const description = asString(payload.description);
    const relationshipTension = asString(payload.relationship_tension) || asString(payload.tension);
    const confidence = asString(payload.confidence);
    const detail = {
      asset_id: item.metadata.id,
      title: decodeAssetTitle(item.metadata.title),
      source: sourceName,
      target: targetName,
      relationship_type: relationshipType,
      description,
      relationship_tension: relationshipTension || undefined,
      evolution,
      evidence,
      confidence: confidence || undefined,
    };
    const existing = merged.get(pairKey);

    if (!existing) {
      merged.set(pairKey, {
        source: source.id,
        target: target.id,
        source_name: source.name,
        target_name: target.name,
        relationship_type: relationshipType,
        relationship_types: [relationshipType],
        label: relationshipType,
        description,
        relationship_tension: relationshipTension || undefined,
        evolution: unique([...evolution, relationshipTension]).slice(0, 8),
        strength: Math.max(3, Math.min(10, evidence.length + 4)),
        status: 'active',
        evidence,
        confidence: confidence || undefined,
        relationship_details: [detail],
      });
      return;
    }

    const relationshipTypes = unique([...(existing.relationship_types ?? [existing.relationship_type]), relationshipType]);
    existing.relationship_types = relationshipTypes;
    existing.relationship_type = relationshipTypes[0] as RelationshipType;
    existing.label = relationshipTypes.join(' / ');
    existing.description = unique([existing.description, description]).join('\n');
    existing.evidence = unique([...(existing.evidence ?? []), ...evidence]).slice(0, 8);
    existing.evolution = unique([...(existing.evolution ?? []), ...evolution, relationshipTension]).slice(0, 8);
    existing.relationship_tension = existing.relationship_tension || relationshipTension || undefined;
    existing.relationship_details = [...(existing.relationship_details ?? []), detail];
    existing.confidence = relationshipConfidence(existing.confidence, confidence);
    existing.strength = Math.max(existing.strength, Math.max(3, Math.min(10, (existing.evidence?.length ?? 0) + 4)));
  });

  return Array.from(merged.values());
}
