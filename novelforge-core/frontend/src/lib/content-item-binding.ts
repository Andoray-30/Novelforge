import { contentService } from '@/lib/api';
import { buildAnalyticsContentCreateRequest } from '@/lib/analytics-assets';
import type { ContentCreateRequest, ContentItem } from '@/types';

export function isUnassignedNovelScopedContentItem(item: ContentItem): boolean {
  return Boolean(!item.metadata.parent_id && item.metadata.type !== 'novel' && item.metadata.type !== 'outline');
}

export function buildBindContentItemToNovelRequest(item: ContentItem, novelId: string): ContentCreateRequest {
  const request = buildAnalyticsContentCreateRequest(item, item.extracted_data ?? {});

  return {
    ...request,
    metadata: {
      ...request.metadata,
      parent_id: novelId,
    },
  };
}

export async function bindContentItemToNovel(item: ContentItem, novelId: string): Promise<void> {
  await contentService.update(item.metadata.id, buildBindContentItemToNovelRequest(item, novelId));
}
