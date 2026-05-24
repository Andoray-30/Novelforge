import { contentService } from '@/lib/api';
import type { ContentCreateRequest, ContentItem } from '@/types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function buildIdentity(type: string, title: string, payload: Record<string, unknown>): string {
  switch (type) {
    case 'character':
      return `character:${asString(payload.name) ?? title}`;
    case 'world':
      return `world:${asString(payload.name) ?? title}`;
    case 'outline':
    case 'novel':
      return `outline:${asString(payload.title) ?? title}`;
    case 'chapter':
      return `chapter:${asString(payload.chapter_id) ?? asString(payload.chapter_title) ?? title}`;
    case 'timeline':
      return `timeline:${asString(payload.title) ?? title}:${asString(payload.absolute_time) ?? asString(payload.relative_time) ?? ''}`;
    case 'relationship':
      return `relationship:${asString(payload.source) ?? ''}:${asString(payload.target) ?? asString(payload.target_name) ?? ''}:${asString(payload.relationship_type) ?? asString(payload.relationship) ?? ''}`;
    default:
      return `${type}:${title}`;
  }
}

function matchesRequest(item: ContentItem, request: ContentCreateRequest): boolean {
  if (item.metadata.type !== request.metadata.type || item.metadata.session_id !== request.metadata.session_id) {
    return false;
  }

  const requestParentId = request.metadata.parent_id;
  if ((requestParentId || item.metadata.parent_id) && item.metadata.parent_id !== requestParentId) {
    return false;
  }

  const requestPayload = asRecord(request.extracted_data) ?? {};
  const itemPayload = asRecord(item.extracted_data) ?? {};

  return buildIdentity(request.metadata.type, request.metadata.title, requestPayload) === buildIdentity(item.metadata.type, item.metadata.title, itemPayload);
}

function mergeUpdateRequest(match: ContentItem, request: ContentCreateRequest): ContentCreateRequest {
  return {
    ...request,
    metadata: {
      ...request.metadata,
      status: request.metadata.status ?? match.metadata.status,
      author: request.metadata.author ?? match.metadata.author,
      tags: request.metadata.tags ?? match.metadata.tags,
      parent_id: request.metadata.parent_id ?? match.metadata.parent_id,
      children_ids: request.metadata.children_ids ?? match.metadata.children_ids,
      session_id: request.metadata.session_id ?? match.metadata.session_id,
    },
  };
}

export async function findMatchingContentItem(request: ContentCreateRequest): Promise<ContentItem | null> {
  const existing = await contentService.searchContent({
    query: request.metadata.title,
    content_type: request.metadata.type,
    session_id: request.metadata.session_id,
    limit: 50,
  });

  return existing.items.find((item) => matchesRequest(item, request)) ?? null;
}

export async function upsertContentAsset(request: ContentCreateRequest): Promise<string> {
  const match = await findMatchingContentItem(request);

  if (match) {
    await contentService.update(match.metadata.id, mergeUpdateRequest(match, request));
    return match.metadata.id;
  }

  const created = await contentService.create(request);
  return created.content_id;
}
