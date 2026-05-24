import type { ParsedArtifact } from '@/lib/chat-parser';
import type { ContentCreateRequest, ContentItem, ContentStatus, ContentType } from '@/types';

type ArtifactPanelType = ParsedArtifact['type'];

const ARTIFACT_TYPE_TO_CONTENT_TYPE: Record<ArtifactPanelType, ContentType> = {
  character_card: 'character',
  world_setting: 'world',
  timeline: 'timeline',
  relationship: 'relationship',
  outline: 'outline',
  chapter: 'chapter',
};

const ACTION_TO_CONTENT_TYPE: Record<string, ContentType> = {
  record_character: 'character',
  update_character: 'character',
  record_world: 'world',
  record_outline: 'outline',
  record_timeline: 'timeline',
  record_relationship: 'relationship',
  write_chapter: 'chapter',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function asNamedArray(value: unknown, keys: string[]): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return asString(item);
      }

      if (!item || typeof item !== 'object') {
        return undefined;
      }

      const record = item as Record<string, unknown>;
      for (const key of keys) {
        const candidate = asString(record[key]);
        if (candidate) {
          return candidate;
        }
      }

      return undefined;
    })
    .filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function asRecordStringKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  return Object.keys(value)
    .map((item) => asString(item))
    .filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)));
}

export function getContentAssetPayload(item: ContentItem): Record<string, unknown> {
  return asRecord(item.extracted_data) ?? {};
}

export function getContentAssetText(item: ContentItem, payload: Record<string, unknown> = getContentAssetPayload(item)): string {
  return asString(payload.content) ?? asString(payload.description) ?? asString(payload.summary) ?? item.content ?? '';
}

export function getContentAssetTitle(item: ContentItem, payload: Record<string, unknown> = getContentAssetPayload(item)): string {
  return asString(payload.chapter_title) ?? asString(payload.name) ?? asString(payload.title) ?? item.metadata.title;
}

export function getArtifactContentType(artifact: Pick<ParsedArtifact, 'type' | 'toolCall'>): ContentType {
  const action = artifact.toolCall?.action;
  if (action && ACTION_TO_CONTENT_TYPE[action]) {
    return ACTION_TO_CONTENT_TYPE[action];
  }
  return ARTIFACT_TYPE_TO_CONTENT_TYPE[artifact.type];
}

export function getArtifactPanelType(contentType: ContentType): ArtifactPanelType {
  switch (contentType) {
    case 'character':
      return 'character_card';
    case 'world':
      return 'world_setting';
    case 'timeline':
      return 'timeline';
    case 'relationship':
      return 'relationship';
    case 'chapter':
      return 'chapter';
    case 'outline':
    case 'novel':
      return 'outline';
    default:
      return 'character_card';
  }
}

function buildRelations(contentType: ContentType, data: Record<string, unknown>): Record<string, string[]> | null {
  if (contentType === 'character') {
    const relations = {
      characters: uniqueStrings([
        ...asNamedArray(data.relationships, ['target_name', 'target', 'name', 'character']),
        ...asRecordStringKeys(data.relationships),
        ...asStringArray(data.related_characters),
      ]),
    };
    return Object.values(relations).some((items) => items.length > 0) ? relations : null;
  }

  if (contentType === 'chapter') {
    const relations = {
      characters: uniqueStrings([
        ...asStringArray(data.characters),
        ...asNamedArray(data.character_mentions, ['name', 'character', 'target_name']),
      ]),
      locations: uniqueStrings([
        ...asStringArray(data.locations),
        ...asNamedArray(data.location_mentions, ['name', 'location', 'target_name']),
      ]),
      worlds: uniqueStrings([
        asString(data.world_name),
        asString(data.world),
      ]),
    };
    return Object.values(relations).some((items) => items.length > 0) ? relations : null;
  }

  if (contentType === 'outline' || contentType === 'novel') {
    const relations = {
      characters: uniqueStrings([
        ...asNamedArray(data.characterRoles, ['name']),
        ...asNamedArray(data.characters, ['name', 'target_name']),
      ]),
      worlds: uniqueStrings([
        asString(data.world_name),
        asString(data.world),
        asString(data.setting_name),
      ]),
    };
    return Object.values(relations).some((items) => items.length > 0) ? relations : null;
  }

  if (contentType === 'timeline') {
    const relations = {
      characters: asStringArray(data.characters),
      locations: asStringArray(data.locations),
    };
    return Object.values(relations).some((items) => items.length > 0) ? relations : null;
  }

  if (contentType === 'relationship') {
    const source = asString(data.source);
    const target = asString(data.target) ?? asString(data.target_name);
    const relations = {
      source: source ? [source] : [],
      target: target ? [target] : [],
    };
    return Object.values(relations).some((items) => items.length > 0) ? relations : null;
  }

  return null;
}

function resolveAssetTitle(contentType: ContentType, data: Record<string, unknown>, fallbackTitle: string): string {
  if (contentType === 'relationship') {
    const source = asString(data.source);
    const target = asString(data.target) ?? asString(data.target_name);
    const relationshipType = asString(data.relationship_type) ?? asString(data.relationship);
    if (source && target && relationshipType) {
      return `${source} -> ${target} (${relationshipType})`;
    }
    if (source && target) {
      return `${source} -> ${target}`;
    }
  }

  return asString(data.chapter_title) ?? asString(data.name) ?? asString(data.title) ?? fallbackTitle;
}

function resolveAssetContent(data: Record<string, unknown>): string {
  return asString(data.content) ?? asString(data.description) ?? asString(data.summary) ?? JSON.stringify(data, null, 2);
}

export function buildContentCreateRequest(params: {
  type: ContentType;
  title: string;
  data?: Record<string, unknown>;
  content?: string;
  sessionId?: string;
  status?: ContentStatus;
  author?: string;
  tags?: string[];
  parentId?: string;
  childrenIds?: string[];
  relations?: Record<string, string[]> | null;
}): ContentCreateRequest {
  const data = params.data ?? {};
  const tags = uniqueStrings([
    params.type,
    params.sessionId ? `project-${params.sessionId}` : undefined,
    ...(params.tags ?? []),
    ...asStringArray(data.tags),
  ]);

  return {
    metadata: {
      title: params.title,
      type: params.type,
      status: params.status,
      author: params.author,
      tags,
      parent_id: params.parentId ?? asString(data.parent_id),
      children_ids: params.childrenIds ?? asStringArray(data.children_ids),
      session_id: params.sessionId,
    },
    content: params.content ?? resolveAssetContent(data),
    extracted_data: Object.keys(data).length > 0 ? data : null,
    relations: params.relations ?? buildRelations(params.type, data),
  };
}

export function buildContentCreateRequestFromArtifact(params: {
  artifact: ParsedArtifact;
  data?: Record<string, unknown>;
  sessionId?: string;
  parentId?: string;
}): ContentCreateRequest {
  const data = params.data ?? params.artifact.data;
  const contentType = getArtifactContentType(params.artifact);
  return buildContentCreateRequest({
    type: contentType,
    title: resolveAssetTitle(contentType, data, params.artifact.title),
    data,
    content: resolveAssetContent(data),
    sessionId: params.sessionId,
    parentId: params.parentId,
    tags: ['ai-generated'],
  });
}
