import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contentService } from '@/lib/api';
import { upsertContentAsset } from '@/lib/content-upsert';
import {
  applyChapterSaveDestinationToRequest,
  buildSaveAssetContentRequest,
  getSaveAssetRequestId,
  saveAssetRequestToContent,
} from '@/lib/save-asset-requests';
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
    expect(getSaveAssetRequestId({ type: 'chapter', title: 'A', id: 'chapter-1', data: {} })).toBeUndefined();
    expect(getSaveAssetRequestId({
      type: 'chapter',
      title: 'A',
      id: 'chapter-1',
      save_destination: 'update_existing',
      data: {},
    })).toBe('chapter-1');
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
    expect(request.metadata.tags).toEqual(['chapter', 'project-session-a', 'ai-suggested', 'ai-generated', 'ai_draft']);
    expect(request.content).toBe('月光落在旧城的天台上，她第一次听见时间回潮。');
    expect(request.extracted_data).toMatchObject({
      title: '序章',
      chapter_title: '序章',
      display_title: '序章',
      original_title: '序章',
      content: '月光落在旧城的天台上，她第一次听见时间回潮。',
      source_type: 'ai_generated',
      source: 'ai_save_asset',
      generated_by_ai: true,
      save_destination: 'ai_draft',
      should_replace_existing: false,
      chapter_role: '序章',
      volume_index: 1,
      segment_index: 0,
      is_decorative: false,
      quality_flags: expect.arrayContaining(['ai_draft', 'short_chapter']),
      characters: ['辉夜'],
      locations: ['旧城天台'],
    });
    expect(request.relations).toEqual({
      characters: ['辉夜'],
      locations: ['旧城天台'],
      worlds: [],
    });
  });

  it('defaults old chapter save requests to AI drafts with compatible metadata', () => {
    const request = buildSaveAssetContentRequest({
      request: {
        type: 'chapter',
        title: 'Test Chapter',
        data: { content: 'A quiet test draft.' },
      },
      sessionId: 'session-a',
      parentId: 'novel-a',
    });

    expect(request.extracted_data).toMatchObject({
      source_type: 'ai_generated',
      save_destination: 'ai_draft',
      chapter_role: '正文',
      word_count: 4,
      quality_flags: expect.arrayContaining(['ai_draft', 'short_chapter']),
    });
    expect(request.metadata.tags).toEqual(['chapter', 'project-session-a', 'ai-suggested', 'ai-generated', 'ai_draft']);
  });

  it('builds alternate version chapter metadata without pretending it is imported body', () => {
    const request = buildSaveAssetContentRequest({
      request: {
        type: 'chapter',
        title: 'Rewrite Candidate',
        save_destination: 'alternate_version',
        chapter_role: '正文',
        data: {
          content: 'The candidate opening moves with sharper tension.',
          characters: ['Ari'],
        },
      },
      sessionId: 'session-a',
      parentId: 'novel-a',
    });

    expect(request.extracted_data).toMatchObject({
      source_type: 'ai_generated',
      save_destination: 'alternate_version',
      generated_by_ai: true,
      chapter_role: '正文',
      quality_flags: expect.arrayContaining(['alternate_version']),
    });
    expect(request.metadata.tags).toContain('alternate_version');
    expect(request.metadata.tags).not.toContain('imported');
  });

  it('applies user-selected chapter destination before save', () => {
    const original = {
      type: 'chapter',
      title: 'Rewrite Candidate',
      id: 'chapter-1',
      save_destination: 'update_existing',
      should_replace_existing: true,
      data: {
        id: 'chapter-1',
        contentItemId: 'chapter-1',
        content: '候选版本。',
        should_replace_existing: true,
      },
    } as const;

    const alternate = applyChapterSaveDestinationToRequest(original, 'alternate_version');
    expect(alternate.id).toBeUndefined();
    expect(alternate.save_destination).toBe('alternate_version');
    expect(alternate.should_replace_existing).toBe(false);
    expect(alternate.data).toMatchObject({
      save_destination: 'alternate_version',
      should_replace_existing: false,
    });
    expect(alternate.data.id).toBeUndefined();
    expect(alternate.data.contentItemId).toBeUndefined();

    const request = buildSaveAssetContentRequest({
      request: alternate,
      sessionId: 'session-a',
      parentId: 'novel-a',
    });
    expect(request.extracted_data).toMatchObject({
      save_destination: 'alternate_version',
      should_replace_existing: false,
      source_type: 'ai_generated',
    });
    expect(request.extracted_data).not.toHaveProperty('id');
    expect(request.metadata.tags).toContain('alternate_version');
  });
});
