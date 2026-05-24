import { describe, expect, it } from 'vitest';
import { resolveRecentAssetOpen } from '@/lib/analytics-assets';
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

describe('world-style reopen routing', () => {
  it('opens timeline assets in the artifact panel when selected novel matches', () => {
    const result = resolveRecentAssetOpen(
      createItem({
        metadata: metadataWith({
          id: 'timeline-1',
          type: 'timeline',
          title: '王朝年表',
          parent_id: 'novel-a',
        }),
        extracted_data: {
          title: '王朝年表',
          description: '王朝更替记录',
          events: [],
        },
      }),
      'novel-a'
    );

    expect(result.kind).toBe('artifact');
    if (result.kind !== 'artifact') {
      throw new Error('Expected artifact result');
    }
    expect(result.artifact.type).toBe('timeline');
    expect(result.artifact.title).toBe('王朝年表');
  });

  it('opens relationship assets in the artifact panel when selected novel matches', () => {
    const result = resolveRecentAssetOpen(
      createItem({
        metadata: metadataWith({
          id: 'relationship-1',
          type: 'relationship',
          title: '角色关系',
          parent_id: 'novel-a',
        }),
        extracted_data: {
          source: '林舟',
          target: '沈月',
          relationship_type: 'alliance',
          description: '共同调查异象',
        },
      }),
      'novel-a'
    );

    expect(result.kind).toBe('artifact');
    if (result.kind !== 'artifact') {
      throw new Error('Expected artifact result');
    }
    expect(result.artifact.type).toBe('relationship');
    expect(result.artifact.title).toBe('角色关系');
  });
});
