import { resolveContentItemReopen } from '@/lib/content-item-reopen';
import type { ContentItem } from '@/types';

export function resolveHomepageContentItemReopen(item: ContentItem, selectedNovelId: string | null) {
  return resolveContentItemReopen(item, selectedNovelId);
}
