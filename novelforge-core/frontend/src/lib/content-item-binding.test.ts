import { describe, expect, it, vi } from 'vitest';
import { bindContentItemToNovel, buildBindContentItemToNovelRequest, isUnassignedNovelScopedContentItem } from '@/lib/content-item-binding';
import { contentService } from '@/lib/api';
import type { ContentItem, ContentMetadata } from '@/types';

vi.mock('@/lib/api', () => ({
  contentService: {
    update: vi.fn(async () => ({ success: true })),
  },
}));

function metadataWith(overrides: Partial<ContentMetadata> = {}): ContentMetadata {
  return {
    id: 'asset-1',
    title: '旧资产',
    type: 'world',
    status: 'draft',
    author: 'tester',
    tags: ['tag-a'],
    created_at: '2026-05-05T00:00:00.000Z',
    updated_at: '2026-05-05T00:00:00.000Z',
    version: 1,
    parent_id: undefined,
    children_ids: [],
    session_id: 'session-a',
    ...overrides,
  };
}

function createItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    metadata: metadataWith(),
    content: '旧内容',
    extracted_data: { name: '旧世界', description: '旧描述' },
    stats: { revisions: 1 },
    relations: { locations: ['北港'] },
    ...overrides,
  };
}

describe('content item binding', () => {
  it('detects unassigned novel-scoped assets', () => {
    expect(isUnassignedNovelScopedContentItem(createItem({ metadata: metadataWith({ type: 'world' }) }))).toBe(true);
    expect(isUnassignedNovelScopedContentItem(createItem({ metadata: metadataWith({ type: 'character' }) }))).toBe(true);
    expect(isUnassignedNovelScopedContentItem(createItem({ metadata: metadataWith({ type: 'outline' }) }))).toBe(false);
    expect(isUnassignedNovelScopedContentItem(createItem({ metadata: metadataWith({ type: 'novel' }) }))).toBe(false);
    expect(isUnassignedNovelScopedContentItem(createItem({ metadata: metadataWith({ type: 'world', parent_id: 'novel-a' }) }))).toBe(false);
  });

  it('builds an update request that binds an existing content item to a novel', () => {
    const request = buildBindContentItemToNovelRequest(createItem(), 'novel-a');

    expect(request.metadata.parent_id).toBe('novel-a');
    expect(request.metadata.session_id).toBe('session-a');
    expect(request.metadata.tags).toEqual(['tag-a']);
    expect(request.metadata.type).toBe('world');
    expect(request.metadata.title).toBe('旧世界');
    expect(request.content).toBe('旧描述');
    expect(request.extracted_data).toEqual({ name: '旧世界', description: '旧描述' });
    expect(request.stats).toEqual({ revisions: 1 });
    expect(request.relations).toEqual({ locations: ['北港'] });
  });

  it('updates the existing content item when binding it to a novel', async () => {
    const item = createItem();

    await bindContentItemToNovel(item, 'novel-a');

    expect(contentService.update).toHaveBeenCalledWith(
      'asset-1',
      expect.objectContaining({
        metadata: expect.objectContaining({ parent_id: 'novel-a' }),
      }),
    );
  });
});
