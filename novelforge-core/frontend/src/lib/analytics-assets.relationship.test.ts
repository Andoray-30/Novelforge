import { describe, expect, it } from 'vitest';
import { resolveRecentAssetOpen } from '@/lib/analytics-assets';
import type { ContentItem, ContentMetadata } from '@/types';

function metadataWith(overrides: Partial<ContentMetadata> = {}): ContentMetadata {
  return {
    id: 'relationship-asset',
    title: '默认关系',
    type: 'relationship',
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

function createRelationshipItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    metadata: metadataWith(),
    content: '共同调查异象',
    extracted_data: {
      source: '林舟',
      target: '沈月',
      relationship_type: 'alliance',
      description: '共同调查异象',
    },
    stats: null,
    relations: null,
    ...overrides,
  };
}

describe('relationship reopen routing', () => {
  it('opens relationship assets in the artifact panel within the selected novel', () => {
    const result = resolveRecentAssetOpen(
      createRelationshipItem({
        metadata: metadataWith({
          id: 'relationship-1',
          title: '林舟与沈月',
          parent_id: 'novel-a',
        }),
      }),
      'novel-a'
    );

    expect(result.kind).toBe('artifact');
    if (result.kind !== 'artifact') {
      throw new Error('Expected artifact result');
    }
    expect(result.artifact.type).toBe('relationship');
    expect(result.artifact.title).toBe('林舟与沈月');
  });

  it('blocks relationship assets outside the selected novel', () => {
    const result = resolveRecentAssetOpen(
      createRelationshipItem({
        metadata: metadataWith({
          id: 'relationship-2',
          title: '跨书关系',
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
});
