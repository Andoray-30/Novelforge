import type { ParsedArtifact } from '@/lib/chat-parser';
import { isUnassignedNovelScopedContentItem } from '@/lib/content-item-binding';
import { getContentAssetPayload, getContentAssetTitle } from '@/lib/content-contract';
import type { ContentCreateRequest, ContentItem, ContentType } from '@/types';

export type AnalyticsArtifactData = {
  type: ParsedArtifact['type'];
  title: string;
  data: Record<string, unknown>;
  contentItemId?: string;
};

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function getAnalyticsArtifactPanelType(contentType: ContentType): ParsedArtifact['type'] {
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

export function buildAnalyticsArtifactData(item: ContentItem): AnalyticsArtifactData {
  const payload = getContentAssetPayload(item);
  const data = Object.keys(payload).length > 0 ? payload : { content: item.content || '' };
  return {
    type: getAnalyticsArtifactPanelType(item.metadata.type),
    title: getContentAssetTitle(item, payload),
    data,
    contentItemId: item.metadata.id,
  };
}

export function getContentTypeFromAnalyticsArtifact(type: ParsedArtifact['type']): ContentType {
  switch (type) {
    case 'character_card':
      return 'character';
    case 'world_setting':
      return 'world';
    case 'timeline':
      return 'timeline';
    case 'relationship':
      return 'relationship';
    case 'chapter':
      return 'chapter';
    case 'outline':
      return 'outline';
    default:
      return 'character';
  }
}

export function getAnalyticsArtifactTitleFromData(item: ContentItem, data: Record<string, unknown>) {
  return readString(data.chapter_title) ?? readString(data.name) ?? readString(data.title) ?? item.metadata.title;
}

export function buildAnalyticsContentCreateRequest(item: ContentItem, data: Record<string, unknown>): ContentCreateRequest {
  return {
    metadata: {
      title: getAnalyticsArtifactTitleFromData(item, data),
      type: item.metadata.type,
      status: item.metadata.status,
      author: item.metadata.author,
      tags: item.metadata.tags,
      parent_id: item.metadata.parent_id,
      children_ids: item.metadata.children_ids,
      session_id: item.metadata.session_id,
    },
    content:
      typeof data.content === 'string'
        ? data.content
        : typeof data.description === 'string'
          ? data.description
          : typeof data.summary === 'string'
            ? data.summary
            : item.content,
    extracted_data: data,
    stats: item.stats ?? null,
    relations: item.relations ?? null,
  };
}

export type OpenRecentAssetResult =
  | { kind: 'error'; message: string }
  | { kind: 'route'; href: string }
  | { kind: 'artifact'; artifact: AnalyticsArtifactData; message: string };

export function resolveRecentAssetOpen(item: ContentItem, selectedNovelId: string | null): OpenRecentAssetResult {
  if (selectedNovelId && item.metadata.parent_id && item.metadata.parent_id !== selectedNovelId) {
    return {
      kind: 'error',
      message: '该资产不属于当前小说，请先切换到对应小说后再查看。',
    };
  }

  if (selectedNovelId && isUnassignedNovelScopedContentItem(item)) {
    return {
      kind: 'error',
      message: '该资产尚未绑定到任何小说。请先在全部小说视图中确认或迁移归属后再编辑。',
    };
  }

  if (item.metadata.type === 'chapter') {
    return { kind: 'route', href: `/editor?chapterId=${item.metadata.id}` };
  }

  if (item.metadata.type === 'character') {
    return { kind: 'route', href: `/characters/${item.metadata.id}` };
  }

  return {
    kind: 'artifact',
    artifact: buildAnalyticsArtifactData(item),
    message: `已打开「${getContentAssetTitle(item)}」进行查看或编辑。`,
  };
}
