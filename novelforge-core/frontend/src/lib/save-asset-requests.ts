import { contentService } from '@/lib/api';
import {
  estimateChapterWordCount,
  getChapterSaveDestinationFlags,
  inferChapterRoleFromTitle,
  normalizeChapterSaveDestination,
  type ChapterSaveDestination,
} from '@/lib/chapter-save-destinations';
import { buildContentCreateRequest } from '@/lib/content-contract';
import { upsertContentAsset } from '@/lib/content-upsert';
import type { SaveAssetRequest } from '@/lib/chat-parser';
import type { ContentItem, ContentType } from '@/types';

export function getSaveAssetRequestId(request: SaveAssetRequest): string | undefined {
  if (request.type === 'chapter' && !shouldUpdateExistingChapter(request)) {
    return undefined;
  }

  if (typeof request.id === 'string' && request.id.trim().length > 0) {
    return request.id.trim();
  }

  const id = request.data.id ?? request.data.contentItemId ?? request.data.content_item_id;
  return typeof id === 'string' && id.trim().length > 0 ? id.trim() : undefined;
}

export function applyChapterSaveDestinationToRequest(
  request: SaveAssetRequest,
  destination: ChapterSaveDestination,
): SaveAssetRequest {
  if (request.type !== 'chapter') {
    return request;
  }

  const normalizedDestination = normalizeChapterSaveDestination(destination);
  const nextData = { ...request.data };
  nextData.save_destination = normalizedDestination;

  if (normalizedDestination === 'update_existing') {
    nextData.should_replace_existing = true;
    return {
      ...request,
      save_destination: normalizedDestination,
      should_replace_existing: true,
      data: nextData,
    };
  }

  delete nextData.id;
  delete nextData.contentItemId;
  delete nextData.content_item_id;
  nextData.should_replace_existing = false;

  const { id: _id, ...requestWithoutId } = request;
  return {
    ...requestWithoutId,
    save_destination: normalizedDestination,
    should_replace_existing: false,
    data: nextData,
  };
}

export function buildSaveAssetContentRequest(params: {
  request: SaveAssetRequest;
  sessionId?: string;
  parentId?: string;
  existingItem?: ContentItem | null;
}) {
  const existing = params.existingItem;
  const contentType = requestTypeToContentType(params.request.type);
  const data = contentType === 'chapter'
    ? buildChapterSaveData(params.request, existing)
    : params.request.data;

  return buildContentCreateRequest({
    type: contentType,
    title: params.request.title,
    data,
    content: typeof data.description === 'string'
      ? data.description
      : typeof data.content === 'string'
        ? data.content
        : existing?.content,
    sessionId: existing?.metadata.session_id ?? params.sessionId,
    parentId: existing?.metadata.parent_id ?? params.parentId,
    status: existing?.metadata.status ?? 'draft',
    author: existing?.metadata.author,
    tags: buildSaveAssetTags(params.request, data, existing),
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

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function shouldUpdateExistingChapter(request: SaveAssetRequest): boolean {
  const explicitDestination = normalizeChapterSaveDestination(
    request.save_destination ?? asString(request.data.save_destination),
    'ai_draft',
  );
  return explicitDestination === 'update_existing'
    || request.should_replace_existing === true
    || request.data.should_replace_existing === true;
}

function resolveChapterSaveDestination(
  request: SaveAssetRequest,
  existingItem?: ContentItem | null,
): ChapterSaveDestination {
  const explicit = request.save_destination ?? asString(request.data.save_destination);
  const shouldReplace = request.should_replace_existing ?? asBoolean(request.data.should_replace_existing);
  if (!explicit && (shouldReplace || existingItem || getSaveAssetRequestId(request))) {
    return 'update_existing';
  }
  return normalizeChapterSaveDestination(explicit);
}

function buildChapterSaveData(request: SaveAssetRequest, existingItem?: ContentItem | null): Record<string, unknown> {
  const existingPayload = existingItem?.extracted_data && typeof existingItem.extracted_data === 'object'
    ? existingItem.extracted_data as Record<string, unknown>
    : {};
  const content = asString(request.data.content)
    ?? asString(request.data.description)
    ?? existingItem?.content
    ?? '';
  const title = asString(request.data.chapter_title)
    ?? asString(request.data.title)
    ?? request.title;
  const destination = resolveChapterSaveDestination(request, existingItem);
  const chapterRole = request.chapter_role
    ?? asString(request.data.chapter_role)
    ?? inferChapterRoleFromTitle(title, destination);
  const wordCount = estimateChapterWordCount(content);
  const qualityFlags = Array.from(new Set([
    ...asStringArray(existingPayload.quality_flags),
    ...asStringArray(request.data.quality_flags),
    ...getChapterSaveDestinationFlags(destination),
    ...(wordCount > 0 && wordCount < 80 ? ['short_chapter'] : []),
  ]));

  const data: Record<string, unknown> = {
    ...existingPayload,
    ...request.data,
    title,
    chapter_title: title,
    display_title: asString(request.data.display_title) ?? title,
    original_title: asString(request.data.original_title) ?? asString(existingPayload.original_title) ?? title,
    content,
    source_type: 'ai_generated',
    source: asString(request.data.source) ?? 'ai_save_asset',
    generated_by_ai: true,
    save_destination: destination,
    should_replace_existing: request.should_replace_existing ?? asBoolean(request.data.should_replace_existing) ?? destination === 'update_existing',
    chapter_role: chapterRole,
    volume_index: asNumber(request.data.volume_index) ?? asNumber(existingPayload.volume_index) ?? 1,
    chapter_index: asNumber(request.data.chapter_index) ?? asNumber(existingPayload.chapter_index),
    segment_index: asNumber(request.data.segment_index) ?? asNumber(existingPayload.segment_index) ?? 0,
    is_decorative: false,
    word_count: wordCount,
    quality_flags: qualityFlags,
  };

  if (destination !== 'update_existing') {
    delete data.id;
    delete data.contentItemId;
    delete data.content_item_id;
  }

  return data;
}

function buildSaveAssetTags(
  request: SaveAssetRequest,
  data: Record<string, unknown>,
  existingItem?: ContentItem | null,
): string[] {
  const existingTags = existingItem?.metadata.tags;
  if (request.type !== 'chapter') {
    return existingTags ?? ['ai-suggested'];
  }

  return Array.from(new Set([
    ...(existingTags ?? []),
    'ai-suggested',
    'ai-generated',
    asString(data.save_destination),
  ].filter((item): item is string => Boolean(item))));
}
