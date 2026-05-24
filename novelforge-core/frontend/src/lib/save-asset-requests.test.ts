import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contentService } from '@/lib/api';
import { upsertContentAsset } from '@/lib/content-upsert';
import { buildSaveAssetContentRequest, getSaveAssetRequestId, saveAssetRequestToContent } from '@/lib/save-asset-requests';
import type { ContentItem, ContentMetadata } from '@/types';

vi.mock('@/lib/api', () => ({
  contentService: {
    getById: vi.fn(),
    update: vi.fn(async () => ({ success: true })),
  },
}));

vi.mock('@/lib/content-upsert', () => ({
  upsertContentAsset: vi.fn(async () => 'created-id'),
}));

function metadataWith(overrides: Partial<ContentMetadata> = {}): ContentMetadata {
  return {
    id: 'world-1',
    title: '旧世界',
    type: 'world',
    status: 'draft',
    author: 'tester',
    tags: ['old-tag'],
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
    content: '旧描述',
    extracted_data: { name: '旧世界', description: '旧描述' },
    stats: { revisions: 1 },
    relations: { locations: ['北港'] },
    ...overrides,
  };
}

describe('save asset requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves ids from top-level id or structured data', () => {
    expect(getSaveAssetRequestId({ type: 'world', title: 'A', id: 'asset-1', data: {} })).toBe('asset-1');
    expect(getSaveAssetRequestId({ type: 'world', title: 'A', data: { contentItemId: 'asset-2' } })).toBe('asset-2');
    expect(getSaveAssetRequestId({ type: 'world', title: 'A', data: { content_item_id: 'asset-3' } })).toBe('asset-3');
  });

  it('builds an update request preserving existing metadata', () => {
    const request = buildSaveAssetContentRequest({
      request: {
        type: 'world',
        title: '新世界',
        data: { name: '新世界', description: '新描述' },
      },
      sessionId: 'session-b',
      parentId: 'novel-b',
      existingItem: createItem(),
    });

    expect(request.metadata.session_id).toBe('session-a');
    expect(request.metadata.parent_id).toBe('novel-a');
    expect(request.metadata.tags).toEqual(['world', 'project-session-a', 'old-tag']);
    expect(request.content).toBe('新描述');
    expect(request.extracted_data).toEqual({ name: '新世界', description: '新描述' });
    expect(request.relations).toEqual({ locations: ['北港'] });
  });

  it('updates existing content when the save request includes an id', async () => {
    vi.mocked(contentService.getById).mockResolvedValueOnce(createItem());

    const result = await saveAssetRequestToContent({
      request: {
        type: 'world',
        title: '新世界',
        id: 'world-1',
        data: { name: '新世界', description: '新描述' },
      },
      sessionId: 'session-b',
      parentId: 'novel-b',
    });

    expect(result).toEqual({ contentId: 'world-1', updatedExisting: true });
    expect(contentService.update).toHaveBeenCalledWith('world-1', expect.objectContaining({ content: '新描述' }));
    expect(upsertContentAsset).not.toHaveBeenCalled();
  });

  it('upserts new content when the save request has no id', async () => {
    const result = await saveAssetRequestToContent({
      request: {
        type: 'character',
        title: '阿岚',
        data: { name: '阿岚', description: '守灯人' },
      },
      sessionId: 'session-a',
      parentId: 'novel-a',
    });

    expect(result).toEqual({ contentId: 'created-id', updatedExisting: false });
    expect(upsertContentAsset).toHaveBeenCalledOnce();
    expect(contentService.update).not.toHaveBeenCalled();
  });

  it('builds chapter writeback from a prologue save request', () => {
    const request = buildSaveAssetContentRequest({
      request: {
        type: 'chapter',
        title: '序章',
        data: {
          title: '序章',
          chapter_title: '序章',
          content: '月光落在旧城的天台上，她第一次听见时间回潮。',
          characters: ['辉夜'],
          locations: ['旧城天台'],
        },
      },
      sessionId: 'session-a',
      parentId: 'novel-a',
    });

    expect(request.metadata.type).toBe('chapter');
    expect(request.metadata.title).toBe('序章');
    expect(request.metadata.session_id).toBe('session-a');
    expect(request.metadata.parent_id).toBe('novel-a');
    expect(request.metadata.tags).toEqual(['chapter', 'project-session-a', 'ai-suggested']);
    expect(request.content).toBe('月光落在旧城的天台上，她第一次听见时间回潮。');
    expect(request.extracted_data).toEqual({
      title: '序章',
      chapter_title: '序章',
      content: '月光落在旧城的天台上，她第一次听见时间回潮。',
      characters: ['辉夜'],
      locations: ['旧城天台'],
    });
    expect(request.relations).toEqual({
      characters: ['辉夜'],
      locations: ['旧城天台'],
      worlds: [],
    });
  });
});
