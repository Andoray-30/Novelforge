import { describe, expect, it } from 'vitest';
import { resolveHomepageContentItemReopen } from '@/lib/homepage-reopen';
import type { ContentItem, ContentMetadata } from '@/types';

function metadataWith(overrides: Partial<ContentMetadata> = {}): ContentMetadata {
  return {
    id: 'asset-1',
    title: '默认资产',
    type: 'world',
    status: 'draft',
    author: 'tester',
    tags: [],
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
    extracted_data: { name: '默认资产', description: '默认描述' },
    stats: null,
    relations: null,
    ...overrides,
  };
}

describe('homepage content item reopen smoke', () => {
  it('routes chapter assets to the editor', () => {
    const result = resolveHomepageContentItemReopen(
      createItem({
        metadata: metadataWith({ id: 'chapter-1', type: 'chapter', title: '第一章' }),
      }),
      'novel-a',
    );

    expect(result).toEqual({ kind: 'route', href: '/editor?chapterId=chapter-1' });
  });

  it('routes character assets to character details', () => {
    const result = resolveHomepageContentItemReopen(
      createItem({
        metadata: metadataWith({ id: 'character-1', type: 'character', title: '主角' }),
      }),
      'novel-a',
    );

    expect(result).toEqual({ kind: 'route', href: '/characters/character-1' });
  });

  it('opens world, timeline, relationship, and outline assets in the artifact panel', () => {
    const cases = [
      { contentType: 'world', artifactType: 'world_setting' },
      { contentType: 'timeline', artifactType: 'timeline' },
      { contentType: 'relationship', artifactType: 'relationship' },
      { contentType: 'outline', artifactType: 'outline' },
    ] as const;

    for (const item of cases) {
      const result = resolveHomepageContentItemReopen(
        createItem({
          metadata: metadataWith({ id: `${item.contentType}-1`, type: item.contentType, title: `${item.contentType} asset` }),
        }),
        'novel-a',
      );

      expect(result.kind).toBe('artifact');
      if (result.kind === 'artifact') {
        expect(result.artifact.type).toBe(item.artifactType);
        expect(result.artifact.contentItemId).toBe(`${item.contentType}-1`);
      }
    }
  });

  it('blocks unassigned novel-scoped assets while a novel is selected', () => {
    const result = resolveHomepageContentItemReopen(
      createItem({
        metadata: metadataWith({ id: 'world-unassigned', type: 'world', parent_id: undefined }),
      }),
      'novel-a',
    );

    expect(result).toEqual({
      kind: 'error',
      message: '该资产尚未绑定到任何小说。请先在全部小说视图中确认或迁移归属后再编辑。',
    });
  });

  it('allows unassigned novel-scoped assets from the all-novel aggregate view', () => {
    const result = resolveHomepageContentItemReopen(
      createItem({
        metadata: metadataWith({ id: 'world-unassigned', type: 'world', parent_id: undefined }),
      }),
      null,
    );

    expect(result.kind).toBe('artifact');
    if (result.kind === 'artifact') {
      expect(result.artifact.contentItemId).toBe('world-unassigned');
    }
  });

  it('blocks cross-novel assets before opening them from the homepage', () => {
    const result = resolveHomepageContentItemReopen(
      createItem({
        metadata: metadataWith({ id: 'world-1', type: 'world', parent_id: 'novel-b' }),
      }),
      'novel-a',
    );

    expect(result).toEqual({
      kind: 'error',
      message: '该资产不属于当前小说，请先切换到对应小说后再查看。',
    });
  });
});
