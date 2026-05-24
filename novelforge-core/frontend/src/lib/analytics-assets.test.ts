import { describe, expect, it } from 'vitest';
import { buildAnalyticsContentCreateRequest, resolveRecentAssetOpen } from '@/lib/analytics-assets';
import type { ContentItem, ContentMetadata } from '@/types';

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

describe('resolveRecentAssetOpen', () => {
  it('routes chapter assets to editor', () => {
    const result = resolveRecentAssetOpen(
      createItem({
        metadata: metadataWith({
          id: 'chapter-1',
          type: 'chapter',
          title: '第一章',
          parent_id: 'novel-a',
        }),
      }),
      'novel-a'
    );

    expect(result).toEqual({ kind: 'route', href: '/editor?chapterId=chapter-1' });
  });

  it('routes character assets to character detail', () => {
    const result = resolveRecentAssetOpen(
      createItem({
        metadata: metadataWith({
          id: 'character-1',
          type: 'character',
          title: '主角',
          parent_id: 'novel-a',
        }),
      }),
      'novel-a'
    );

    expect(result).toEqual({ kind: 'route', href: '/characters/character-1' });
  });

  it('blocks assets outside the selected novel', () => {
    const result = resolveRecentAssetOpen(
      createItem({
        metadata: metadataWith({
          id: 'world-1',
          type: 'world',
          parent_id: 'novel-b',
        }),
      }),
      'novel-a'
    );

    expect(result).toEqual({
      kind: 'error',
      message: '该资产不属于当前小说，请先切换到对应小说后再查看。',
    });
  });

  it('blocks unassigned novel-scoped assets while a novel is selected', () => {
    const result = resolveRecentAssetOpen(
      createItem({
        metadata: metadataWith({
          id: 'world-unassigned',
          type: 'world',
          parent_id: undefined,
        }),
      }),
      'novel-a'
    );

    expect(result).toEqual({
      kind: 'error',
      message: '该资产尚未绑定到任何小说。请先在全部小说视图中确认或迁移归属后再编辑。',
    });
  });

  it('allows unassigned novel-scoped assets in the all-novel aggregate view', () => {
    const result = resolveRecentAssetOpen(
      createItem({
        metadata: metadataWith({
          id: 'world-unassigned',
          type: 'world',
          parent_id: undefined,
        }),
      }),
      null
    );

    expect(result.kind).toBe('artifact');
    if (result.kind !== 'artifact') {
      throw new Error('Expected artifact result');
    }
    expect(result.artifact.contentItemId).toBe('world-unassigned');
  });

  it('allows unassigned outline assets while a novel is selected', () => {
    const result = resolveRecentAssetOpen(
      createItem({
        metadata: metadataWith({
          id: 'outline-unassigned',
          type: 'outline',
          parent_id: undefined,
        }),
      }),
      'novel-a'
    );

    expect(result.kind).toBe('artifact');
    if (result.kind !== 'artifact') {
      throw new Error('Expected artifact result');
    }
    expect(result.artifact.type).toBe('outline');
  });

  it('opens world-style assets in the artifact panel', () => {
    const result = resolveRecentAssetOpen(
      createItem({
        metadata: metadataWith({
          id: 'world-2',
          type: 'world',
          title: '雾港设定',
          parent_id: 'novel-a',
        }),
        extracted_data: { name: '雾港', description: '迷雾中的港口' },
      }),
      'novel-a'
    );

    expect(result.kind).toBe('artifact');
    if (result.kind !== 'artifact') {
      throw new Error('Expected artifact result');
    }
    expect(result.artifact.type).toBe('world_setting');
    expect(result.artifact.title).toBe('雾港');
    expect(result.message).toBe('已打开「雾港」进行查看或编辑。');
  });
});

describe('buildAnalyticsContentCreateRequest', () => {
  it('preserves content metadata and prefers structured description text', () => {
    const item = createItem({
      metadata: metadataWith({
        type: 'world',
        title: '旧标题',
        parent_id: 'novel-a',
        session_id: 'session-a',
      }),
      content: '旧内容',
      extracted_data: { name: '旧世界' },
      stats: { revisions: 2 },
      relations: { regions: ['北港'] },
    });

    const request = buildAnalyticsContentCreateRequest(item, {
      name: '新世界',
      description: '新的世界描述',
    });

    expect(request.metadata.title).toBe('新世界');
    expect(request.metadata.parent_id).toBe('novel-a');
    expect(request.metadata.session_id).toBe('session-a');
    expect(request.content).toBe('新的世界描述');
    expect(request.extracted_data).toEqual({
      name: '新世界',
      description: '新的世界描述',
    });
    expect(request.stats).toEqual({ revisions: 2 });
    expect(request.relations).toEqual({ regions: ['北港'] });
  });
});
