import { contentService } from '@/lib/api';
import { getContentAssetTitle } from '@/lib/content-contract';
import {
  buildAnalyticsContentCreateRequest,
  getContentTypeFromAnalyticsArtifact,
  resolveRecentAssetOpen,
  type AnalyticsArtifactData,
} from '@/lib/analytics-assets';
import { upsertContentAsset } from '@/lib/content-upsert';
import type { ContentItem } from '@/types';

export type ContentItemArtifactData = AnalyticsArtifactData;

export type ContentItemReopenResult =
  | { kind: 'error'; message: string }
  | { kind: 'route'; href: string }
  | { kind: 'artifact'; artifact: ContentItemArtifactData; message: string };

export function resolveContentItemReopen(item: ContentItem, selectedNovelId: string | null): ContentItemReopenResult {
  return resolveRecentAssetOpen(item, selectedNovelId);
}

export async function saveReopenedContentItem(params: {
  items: ContentItem[];
  artifact: ContentItemArtifactData;
  updatedData: Record<string, unknown>;
}): Promise<{ ok: true; title: string; contentItemId?: string } | { ok: false; message: string }> {
  const original = params.artifact.contentItemId
    ? params.items.find((item) => item.metadata.id === params.artifact.contentItemId)
    : params.items.find(
        (item) =>
          item.metadata.type === getContentTypeFromAnalyticsArtifact(params.artifact.type) &&
          getContentAssetTitle(item) === params.artifact.title,
      );

  if (!original) {
    return { ok: false, message: '未找到对应资产，无法保存修改。' };
  }

  const updateRequest = buildAnalyticsContentCreateRequest(original, params.updatedData);
  if (params.artifact.contentItemId) {
    await contentService.update(params.artifact.contentItemId, updateRequest);
  } else {
    await upsertContentAsset(updateRequest);
  }

  return { ok: true, title: params.artifact.title, contentItemId: original.metadata.id };
}
