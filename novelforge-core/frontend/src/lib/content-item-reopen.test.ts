import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveReopenedContentItem, resolveContentItemReopen } from '@/lib/content-item-reopen';
import { contentService } from '@/lib/api';
import { upsertContentAsset } from '@/lib/content-upsert';
import type { ContentItem, ContentMetadata } from '@/types';

vi.mock('@/lib/api', () => ({
  contentService: {
    update: vi.fn(async () => ({ success: true })),
  },
}));

vi.mock('@/lib/content-upsert', () => ({
  upsertContentAsset: vi.fn(async () => 'saved-id'),
}));

function metadataWith(overrides: Partial<ContentMetadata> = {}): ContentMetadata {
  return {
    id: 'asset-1',
    title: '默认标题',
    type: 'world',
    status: 'draft',
    author: 'tester',
    tags: ['tag-a'],
    created_at: '2026-05-05T00:00:00.000Z',
    updated_at: '2026-05-05T00:00:00.000Z',
    version: 1,
    parent_id: 'novel-a',
    children_ids: [],
    session_id: 'session-a',
    ...overrides,
  };
}

function createItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    metadata: metadataWith(),
    content: '默认内容',
    extracted_data: { name: '雾港', description: '迷雾中的港口' },
    stats: null,
    relations: null,
    ...overrides,
  };
}

describe('content item reopen controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses routing rules for reopening content items', () => {
    const result = resolveContentItemReopen(
      createItem({
        metadata: metadataWith({ id: 'chapter-1', type: 'chapter', title: '第一章', parent_id: 'novel-a' }),
      }),
      'novel-a'
    );

    expect(result).toEqual({ kind: 'route', href: '/editor?chapterId=chapter-1' });
  });

  it('saves a matched reopened content item', async () => {
    const item = createItem({
      metadata: metadataWith({ type: 'world', title: '旧世界', parent_id: 'novel-a', session_id: 'session-a' }),
      extracted_data: { name: '旧世界', description: '旧描述' },
    });

    const result = await saveReopenedContentItem({
      items: [item],
      artifact: {
        type: 'world_setting',
        title: '旧世界',
        data: { name: '旧世界', description: '新描述' },
        contentItemId: 'asset-1',
      },
      updatedData: { name: '旧世界', description: '新描述' },
    });

    expect(result).toEqual({ ok: true, title: '旧世界', contentItemId: 'asset-1' });
    expect(contentService.update).toHaveBeenCalledWith(
      'asset-1',
      expect.objectContaining({
        metadata: expect.objectContaining({ title: '旧世界', type: 'world' }),
        extracted_data: { name: '旧世界', description: '新描述' },
      }),
    );
    expect(upsertContentAsset).not.toHaveBeenCalled();
  });

  it('saves by content item id before falling back to same-title matching', async () => {
    const first = createItem({
      metadata: metadataWith({ id: 'asset-old', type: 'world', title: '同名世界', parent_id: 'novel-a' }),
      extracted_data: { name: '同名世界', description: '旧版本' },
    });
    const second = createItem({
      metadata: metadataWith({ id: 'asset-new', type: 'world', title: '同名世界', parent_id: 'novel-a' }),
      extracted_data: { name: '同名世界', description: '新版本' },
    });

    const result = await saveReopenedContentItem({
      items: [first, second],
      artifact: {
        type: 'world_setting',
        title: '同名世界',
        data: { name: '同名世界', description: '目标修改' },
        contentItemId: 'asset-new',
      },
      updatedData: { name: '同名世界', description: '目标修改' },
    });

    expect(result).toEqual({ ok: true, title: '同名世界', contentItemId: 'asset-new' });
    expect(contentService.update).toHaveBeenCalledWith(
      'asset-new',
      expect.objectContaining({
        extracted_data: { name: '同名世界', description: '目标修改' },
      }),
    );
    expect(upsertContentAsset).not.toHaveBeenCalled();
  });

  it('falls back to upsert when saving legacy artifacts without a content item id', async () => {
    const item = createItem({
      metadata: metadataWith({ type: 'world', title: '旧世界', parent_id: 'novel-a', session_id: 'session-a' }),
      extracted_data: { name: '旧世界', description: '旧描述' },
    });

    const result = await saveReopenedContentItem({
      items: [item],
      artifact: {
        type: 'world_setting',
        title: '旧世界',
        data: { name: '旧世界', description: '新描述' },
      },
      updatedData: { name: '旧世界', description: '新描述' },
    });

    expect(result).toEqual({ ok: true, title: '旧世界', contentItemId: 'asset-1' });
    expect(upsertContentAsset).toHaveBeenCalledOnce();
  });

  it('returns a friendly error when no matching content item exists', async () => {
    const result = await saveReopenedContentItem({
      items: [],
      artifact: {
        type: 'relationship',
        title: '不存在的关系',
        data: { source: '甲', target: '乙' },
      },
      updatedData: { source: '甲', target: '乙' },
    });

    expect(result).toEqual({ ok: false, message: '未找到对应资产，无法保存修改。' });
  });
});
