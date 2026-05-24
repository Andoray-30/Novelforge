import { contentService } from '@/lib/api';
import { buildContentCreateRequest } from '@/lib/content-contract';
import { upsertContentAsset } from '@/lib/content-upsert';
import type { SaveAssetRequest } from '@/lib/chat-parser';
import type { ContentItem, ContentType } from '@/types';

export function getSaveAssetRequestId(request: SaveAssetRequest): string | undefined {
  if (typeof request.id === 'string' && request.id.trim().length > 0) {
    return request.id.trim();
  }

  const id = request.data.id ?? request.data.contentItemId ?? request.data.content_item_id;
  return typeof id === 'string' && id.trim().length > 0 ? id.trim() : undefined;
}

export function buildSaveAssetContentRequest(params: {
  request: SaveAssetRequest;
  sessionId?: string;
  parentId?: string;
  existingItem?: ContentItem | null;
}) {
  const existing = params.existingItem;
  return buildContentCreateRequest({
    type: requestTypeToContentType(params.request.type),
    title: params.request.title,
    data: params.request.data,
    content: typeof params.request.data.description === 'string'
      ? params.request.data.description
      : typeof params.request.data.content === 'string'
        ? params.request.data.content
        : existing?.content,
    sessionId: existing?.metadata.session_id ?? params.sessionId,
    parentId: existing?.metadata.parent_id ?? params.parentId,
    status: existing?.metadata.status ?? 'draft',
    author: existing?.metadata.author,
    tags: existing?.metadata.tags ?? ['ai-suggested'],
    childrenIds: existing?.metadata.children_ids,
    relations: existing?.relations ?? null,
  });
}

export async function saveAssetRequestToContent(params: {
  request: SaveAssetRequest;
  sessionId?: string;
  parentId?: string;
}): Promise<{ contentId?: string; updatedExisting: boolean }> {
  const existingId = getSaveAssetRequestId(params.request);

  if (existingId) {
    const existingItem = await contentService.getById(existingId).catch(() => null);
    await contentService.update(
      existingId,
      buildSaveAssetContentRequest({
        request: params.request,
        sessionId: params.sessionId,
        parentId: params.parentId,
        existingItem,
      }),
    );
    return { contentId: existingId, updatedExisting: true };
  }

  const contentId = await upsertContentAsset(buildSaveAssetContentRequest({
    request: params.request,
    sessionId: params.sessionId,
    parentId: params.parentId,
  }));
  return { contentId, updatedExisting: false };
}

function requestTypeToContentType(type: string): ContentType {
  switch (type) {
    case 'character':
    case 'world':
    case 'timeline':
    case 'relationship':
    case 'outline':
    case 'chapter':
      return type;
    default:
      return 'outline';
  }
}
