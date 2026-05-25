import { describe, expect, it, vi } from 'vitest';
import {
  buildEditorChapterArchiveRequest,
  buildEditorChapterChatHandoff,
  buildEditorChapterPromotionRequest,
  buildEditorChapterRestoreRequest,
  filterEditorChapters,
  getEditorChapterWorkflowState,
  resolveEditorChapterSelection,
} from '@/lib/editor-chapter-workflow';
import type { ContentItem, ContentMetadata } from '@/types';

const now = '2026-05-24T00:00:00.000Z';

function metadata(overrides: Partial<ContentMetadata> = {}): ContentMetadata {
  return {
    id: overrides.id ?? 'chapter-1',
    title: overrides.title ?? '章节',
    type: 'chapter',
    status: overrides.status ?? 'draft',
    tags: overrides.tags ?? ['chapter'],
    created_at: overrides.created_at ?? now,
    updated_at: overrides.updated_at ?? now,
    version: 1,
    parent_id: overrides.parent_id,
    session_id: overrides.session_id,
    children_ids: overrides.children_ids,
    author: overrides.author,
  };
}

function chapter(overrides: {
  id?: string;
  title?: string;
  content?: string;
  status?: ContentMetadata['status'];
  tags?: string[];
  data?: Record<string, unknown>;
  updatedAt?: string;
} = {}): ContentItem {
  const title = overrides.title ?? '章节';
  const content = overrides.content ?? '正文内容';
  return {
    metadata: metadata({
      id: overrides.id,
      title,
      status: overrides.status,
      tags: overrides.tags,
      updated_at: overrides.updatedAt,
    }),
    content,
    extracted_data: {
      title,
      chapter_title: title,
      display_title: title,
      content,
      volume_index: 1,
      chapter_index: 1,
      segment_index: 0,
      ...overrides.data,
    },
  };
}

describe('editor chapter workflow', () => {
  it('filters directory-sorted chapters by workflow metadata without reordering', () => {
    const imported = chapter({ id: 'imported', data: { source_type: 'imported' } });
    const draft = chapter({
      id: 'draft',
      tags: ['ai-generated', 'ai_draft'],
      data: { source_type: 'ai_generated', save_destination: 'ai_draft', quality_flags: ['ai_draft'] },
    });
    const candidate = chapter({
      id: 'candidate',
      tags: ['ai-generated', 'alternate_version'],
      data: { source_type: 'ai_generated', save_destination: 'alternate_version', quality_flags: ['alternate_version'] },
    });
    const formal = chapter({
      id: 'formal',
      tags: ['ai-generated', 'formal_body'],
      data: { source_type: 'ai_generated', save_destination: 'formal_body', quality_flags: ['formal_body'] },
    });
    const archived = chapter({
      id: 'archived',
      status: 'archived',
      tags: ['ai-generated', 'archived'],
      data: { source_type: 'ai_generated', save_destination: 'alternate_version', workflow_status: 'archived' },
    });
    const items = [imported, draft, candidate, formal, archived];

    expect(filterEditorChapters(items, 'all').map((item) => item.metadata.id)).toEqual(['imported', 'draft', 'candidate', 'formal']);
    expect(filterEditorChapters(items, 'imported').map((item) => item.metadata.id)).toEqual(['imported']);
    expect(filterEditorChapters(items, 'ai_draft').map((item) => item.metadata.id)).toEqual(['draft']);
    expect(filterEditorChapters(items, 'alternate_version').map((item) => item.metadata.id)).toEqual(['candidate']);
    expect(filterEditorChapters(items, 'formal_body').map((item) => item.metadata.id)).toEqual(['formal']);
    expect(filterEditorChapters(items, 'archived').map((item) => item.metadata.id)).toEqual(['archived']);
  });

  it('builds metadata-only promotion requests for AI candidates', () => {
    const item = chapter({
      id: 'candidate',
      title: '候选序章',
      content: '月光落下。',
      tags: ['ai-generated', 'alternate_version'],
      data: {
        source_type: 'ai_generated',
        source: 'ai_save_asset',
        save_destination: 'alternate_version',
        chapter_role: '正文',
        quality_flags: ['alternate_version'],
        chapter_index: 3,
      },
    });

    const request = buildEditorChapterPromotionRequest(item, 'formal_prologue');

    expect(request.content).toBe('月光落下。');
    expect(request.metadata.title).toBe('候选序章');
    expect(request.metadata.tags).toEqual(expect.arrayContaining(['ai-generated', 'ai-suggested', 'formal_prologue']));
    expect(request.metadata.tags).not.toContain('alternate_version');
    expect(request.extracted_data).toMatchObject({
      content: '月光落下。',
      source_type: 'ai_generated',
      save_destination: 'formal_prologue',
      should_replace_existing: false,
      quality_flags: expect.arrayContaining(['formal_prologue']),
    });
  });

  it('archives candidate chapters without deleting or changing body text', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-25T01:02:03.000Z'));
    const item = chapter({
      id: 'draft',
      content: '草稿正文',
      tags: ['ai-generated', 'ai_draft'],
      data: { source_type: 'ai_generated', save_destination: 'ai_draft', quality_flags: ['ai_draft'] },
    });

    const request = buildEditorChapterArchiveRequest(item);

    expect(request.content).toBe('草稿正文');
    expect(request.metadata.status).toBe('archived');
    expect(request.metadata.tags).toContain('archived');
    expect(request.extracted_data).toMatchObject({
      workflow_status: 'archived',
      archived_at: '2026-05-25T01:02:03.000Z',
      quality_flags: expect.arrayContaining(['archived']),
    });
    vi.useRealTimers();
  });

  it('restores previous_snapshot and preserves the current version as recovery_snapshot', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-25T02:03:04.000Z'));
    const item = chapter({
      id: 'chapter-restore',
      title: '新标题',
      content: '新版正文',
      data: {
        source_type: 'ai_generated',
        save_destination: 'update_existing',
        previous_snapshot: {
          old_title: '旧标题',
          old_body: '旧版正文',
          old_updated_at: '2026-05-20T00:00:00.000Z',
          old_extracted_data: {
            title: '旧标题',
            content: '旧版正文',
            source_type: 'imported',
          },
        },
      },
    });

    const state = getEditorChapterWorkflowState(item);
    const request = buildEditorChapterRestoreRequest(item);

    expect(state.hasPreviousSnapshot).toBe(true);
    expect(state.previousSnapshot?.oldTitle).toBe('旧标题');
    expect(request?.metadata.title).toBe('旧标题');
    expect(request?.content).toBe('旧版正文');
    expect(request?.extracted_data?.previous_snapshot).toBeUndefined();
    expect(request?.extracted_data?.recovery_snapshot).toMatchObject({
      current_title: '新标题',
      current_content: '新版正文',
      current_updated_at: now,
      restored_at: '2026-05-25T02:03:04.000Z',
    });
    vi.useRealTimers();
  });

  it('selects explicit chapterId before falling back to latest or directory first', () => {
    const first = chapter({ id: 'first' });
    const requested = chapter({ id: 'requested' });
    const latest = chapter({ id: 'latest', updatedAt: '2026-05-25T00:00:00.000Z' });
    const items = [first, requested, latest];

    expect(resolveEditorChapterSelection({
      items,
      preferredChapterId: 'requested',
      preferLatestItem: latest,
      currentSelectedId: 'first',
    })).toBe('requested');
    expect(resolveEditorChapterSelection({
      items,
      preferLatestItem: latest,
      currentSelectedId: 'first',
    })).toBe('latest');
    expect(resolveEditorChapterSelection({
      items,
      currentSelectedId: 'first',
      requestedChapterId: 'requested',
    })).toBe('first');
    expect(resolveEditorChapterSelection({
      items,
      requestedChapterId: 'requested',
    })).toBe('requested');
  });

  it('does not treat imported originals as candidates or archived assets', () => {
    const item = chapter({
      id: 'imported',
      status: 'published',
      tags: ['imported'],
      data: { source_type: 'imported', chapter_role: '正文' },
    });

    const state = getEditorChapterWorkflowState(item);

    expect(state.isAIGenerated).toBe(false);
    expect(state.isCandidate).toBe(false);
    expect(state.isArchived).toBe(false);
    expect(buildEditorChapterRestoreRequest(item)).toBeNull();
  });

  it('builds chat handoff prompts with a focused chapter asset', () => {
    const item = chapter({
      id: 'chapter-focus',
      title: '第一章',
      content: '她站在雨里，终于决定回头。',
      data: { source_type: 'imported' },
    });

    const handoff = buildEditorChapterChatHandoff(item, 'polish');

    expect(handoff.prompt).toContain('润色《第一章》');
    expect(handoff.focusedAsset).toMatchObject({
      id: 'chapter-focus',
      type: 'chapter',
      title: '第一章',
      source: 'project_asset',
    });
  });
});
