import { describe, expect, it } from 'vitest';
import { validateDirectContentAssetSession } from './direct-content-asset';
import type { ContentItem } from '@/types';

function itemWithSession(sessionId?: string | null): ContentItem {
  return {
    metadata: {
      id: 'asset-1',
      title: '关系补强',
      type: 'relationship',
      status: 'draft',
      author: 'tester',
      tags: [],
      created_at: '2026-05-30T00:00:00.000Z',
      updated_at: '2026-05-30T00:00:00.000Z',
      version: 1,
      parent_id: 'novel-1',
      children_ids: [],
      session_id: sessionId ?? undefined,
    },
    content: '',
    extracted_data: {},
    stats: null,
    relations: null,
  };
}

describe('validateDirectContentAssetSession', () => {
  it('requires a selected project before opening direct writeback assets', () => {
    expect(validateDirectContentAssetSession(itemWithSession('session-a'), null)).toEqual({
      ok: false,
      message: '请先选择项目后再查看写回资产。',
    });
  });

  it('blocks assets from another project', () => {
    expect(validateDirectContentAssetSession(itemWithSession('session-b'), 'session-a')).toEqual({
      ok: false,
      message: '该资产不属于当前项目，请先切换到对应项目后再查看。',
    });
  });

  it('allows assets from the selected project', () => {
    expect(validateDirectContentAssetSession(itemWithSession('session-a'), 'session-a')).toEqual({ ok: true });
  });
});
