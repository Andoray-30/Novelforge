import { describe, expect, it } from 'vitest';
import {
  buildManualChapterPayload,
  buildPromotedAIChapterPayload,
  buildPromotedAIChapterTags,
  buildUpdatedChapterPayload,
  findMostRecentlyUpdatedChapter,
  getNextManualChapterIndex,
  resolveChapterDirectoryMetadata,
  sortChaptersByDirectory,
} from './chapter-metadata';
import type { ContentItem } from '@/types';

function chapter(params: {
  id: string;
  title: string;
  content?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  data?: Record<string, unknown>;
}): ContentItem {
  return {
    metadata: {
      id: params.id,
      title: params.title,
      type: 'chapter',
      status: 'draft',
      tags: params.tags ?? [],
      created_at: params.createdAt ?? '2026-05-24T00:00:00.000Z',
      updated_at: params.updatedAt ?? '2026-05-24T00:00:00.000Z',
      version: 1,
    },
    content: params.content ?? '',
    extracted_data: params.data ?? null,
  };
}

describe('chapter metadata helper', () => {
  it('prefers display title and keeps imported original title', () => {
    const metadata = resolveChapterDirectoryMetadata(chapter({
      id: 'ch-1',
      title: '旧标题',
      content: '月光落在城市边缘。',
      data: {
        title: '旧标题',
        chapter_title: '第一章',
        display_title: '第一章 · 雨夜',
        original_title: '第一章',
        source_type: 'imported',
        chapter_role: '正文',
        volume_index: 1,
        chapter_index: 1,
        segment_index: 0,
        word_count: 10,
      },
    }));

    expect(metadata.displayTitle).toBe('第一章 · 雨夜');
    expect(metadata.originalTitle).toBe('第一章');
    expect(metadata.sourceLabel).toBe('导入原文');
    expect(metadata.roleLabel).toBe('正文');
  });

  it('sorts by volume, chapter, and segment index', () => {
    const items = [
      chapter({ id: 'v2', title: '第二卷 第一章', data: { volume_index: 2, chapter_index: 1, segment_index: 0 } }),
      chapter({ id: 'seg-2', title: '第一卷 第三章 · 片段 02', data: { volume_index: 1, chapter_index: 3, segment_index: 2, source_type: 'system_split' } }),
      chapter({ id: 'body-2', title: '第一卷 第二章', data: { volume_index: 1, chapter_index: 2, segment_index: 0 } }),
      chapter({ id: 'seg-1', title: '第一卷 第三章 · 片段 01', data: { volume_index: 1, chapter_index: 3, segment_index: 1, source_type: 'system_split' } }),
    ];

    expect(sortChaptersByDirectory(items).map((item) => item.metadata.id)).toEqual(['body-2', 'seg-1', 'seg-2', 'v2']);
  });

  it('keeps latest updated selection independent from directory sorting', () => {
    const firstChapter = chapter({
      id: 'first',
      title: '第一章',
      updatedAt: '2026-05-24T10:00:00.000Z',
      data: { volume_index: 1, chapter_index: 1 },
    });
    const newestDraft = chapter({
      id: 'newest',
      title: '第九章',
      updatedAt: '2026-05-24T12:00:00.000Z',
      data: { volume_index: 1, chapter_index: 9 },
    });

    expect(sortChaptersByDirectory([newestDraft, firstChapter]).map((item) => item.metadata.id)).toEqual(['first', 'newest']);
    expect(findMostRecentlyUpdatedChapter([firstChapter, newestDraft])?.metadata.id).toBe('newest');
  });

  it('infers old chapter assets without metadata', () => {
    const metadata = resolveChapterDirectoryMetadata(chapter({
      id: 'old',
      title: '第十二章 风暴之前',
      content: '风声从塔楼穿过，众人终于意识到选择已经来临。',
      tags: ['chapter'],
    }));

    expect(metadata.displayTitle).toBe('第十二章 风暴之前');
    expect(metadata.chapterIndex).toBe(12);
    expect(metadata.sourceType).toBe('unknown');
    expect(metadata.wordCount).toBeGreaterThan(0);
  });

  it('marks decorative chapters and split segments distinctly', () => {
    const decorative = resolveChapterDirectoryMetadata(chapter({
      id: 'illu',
      title: '插图',
      content: '◆◇◆◇',
      data: {
        display_title: '插图',
        chapter_role: '插图',
        is_decorative: true,
        quality_flags: ['decorative_or_non_narrative'],
      },
    }));
    const split = resolveChapterDirectoryMetadata(chapter({
      id: 'split',
      title: '第三章 · 片段 01',
      content: '正文片段。',
      data: {
        source_type: 'system_split',
        chapter_index: 3,
        segment_index: 1,
        system_split: { split_part: 1, split_total: 2 },
      },
    }));

    expect(decorative.isDecorative).toBe(true);
    expect(decorative.qualityFlagLabels).toContain('非正文');
    expect(split.sourceLabel).toBe('系统拆分');
    expect(split.splitLabel).toBe('片段 1/2');
  });

  it('infers legacy numeric split titles without new metadata', () => {
    const first = chapter({
      id: 'legacy-1',
      title: '第一卷 第二章（1）',
      tags: ['imported'],
      data: { chapter_title: '第一卷 第二章（1）', chapter_index: 2 },
    });
    const second = chapter({
      id: 'legacy-2',
      title: '第一卷 第二章（2）',
      tags: ['imported'],
      data: { chapter_title: '第一卷 第二章（2）', chapter_index: 3 },
    });

    expect(resolveChapterDirectoryMetadata(first).sourceType).toBe('system_split');
    expect(resolveChapterDirectoryMetadata(first).originalTitle).toBe('第一卷 第二章');
    expect(resolveChapterDirectoryMetadata(first).chapterIndex).toBe(2);
    expect(resolveChapterDirectoryMetadata(second).chapterIndex).toBe(2);
    expect(sortChaptersByDirectory([second, first]).map((item) => item.metadata.id)).toEqual(['legacy-1', 'legacy-2']);
  });

  it('builds compatible metadata for manual chapters and updates', () => {
    const payload = buildManualChapterPayload({ title: '第 13 章', chapterIndex: 13, content: '新章节正文。' });
    expect(payload).toMatchObject({
      display_title: '第 13 章',
      original_title: '第 13 章',
      source_type: 'user_created',
      chapter_role: '正文',
      volume_index: 1,
      chapter_index: 13,
      segment_index: 0,
      is_decorative: false,
      source: 'editor_manual',
    });

    const item = chapter({ id: 'manual', title: '第 13 章', data: payload, content: '新章节正文。' });
    const updated = buildUpdatedChapterPayload({ item, title: '第 13 章 修订', content: '修订后的正文。' });
    expect(updated.display_title).toBe('第 13 章 修订');
    expect(updated.original_title).toBe('第 13 章');
    expect(updated.source_type).toBe('user_created');
    expect(updated.chapter_index).toBe(13);
  });

  it('uses max structural chapter index for the next manual chapter', () => {
    expect(getNextManualChapterIndex([
      chapter({ id: 'one', title: '第一章', data: { chapter_index: 1 } }),
      chapter({ id: 'ai', title: '序章', tags: ['ai-suggested'], data: { chapter_index: 8, source_type: 'ai_generated' } }),
    ])).toBe(9);
  });

  it('labels AI-generated chapter save destinations in the editor directory', () => {
    const metadata = resolveChapterDirectoryMetadata(chapter({
      id: 'ai-draft',
      title: 'AI 序章候选',
      tags: ['ai-generated'],
      data: {
        title: 'AI 序章候选',
        content: '月光落下。',
        source_type: 'ai_generated',
        save_destination: 'ai_draft',
        chapter_role: '序章',
        quality_flags: ['ai_draft'],
      },
    }));

    expect(metadata.sourceType).toBe('ai_generated');
    expect(metadata.sourceLabel).toBe('AI 草稿');
    expect(metadata.saveDestination).toBe('ai_draft');
    expect(metadata.saveDestinationLabel).toBe('AI 草稿');
    expect(metadata.qualityFlagLabels).toContain('AI 草稿');
  });
  it('promotes AI draft metadata to formal body without changing content or source', () => {
    const item = chapter({
      id: 'ai-draft',
      title: 'AI Draft',
      content: 'Draft body.',
      tags: ['ai-generated', 'ai_draft'],
      data: {
        title: 'AI Draft',
        content: 'Draft body.',
        source_type: 'ai_generated',
        source: 'ai_save_asset',
        save_destination: 'ai_draft',
        chapter_role: '序章',
        quality_flags: ['ai_draft', 'short_chapter'],
        volume_index: 1,
        chapter_index: 2,
      },
    });

    const payload = buildPromotedAIChapterPayload({ item, destination: 'formal_body' });
    const tags = buildPromotedAIChapterTags(item.metadata.tags, 'formal_body');

    expect(payload).toMatchObject({
      content: 'Draft body.',
      source_type: 'ai_generated',
      save_destination: 'formal_body',
      should_replace_existing: false,
      chapter_role: '正文',
      quality_flags: expect.arrayContaining(['formal_body', 'short_chapter']),
    });
    expect(payload.quality_flags).not.toContain('ai_draft');
    expect(tags).toEqual(expect.arrayContaining(['ai-generated', 'ai-suggested', 'formal_body']));
    expect(tags).not.toContain('ai_draft');
  });

  it('promotes alternate version metadata to formal prologue and keeps directory order stable', () => {
    const imported = chapter({
      id: 'imported',
      title: 'Chapter 1',
      createdAt: '2026-05-24T00:00:00.000Z',
      data: { source_type: 'imported', volume_index: 1, chapter_index: 1 },
    });
    const candidate = chapter({
      id: 'candidate',
      title: 'Candidate',
      content: 'Candidate body.',
      createdAt: '2026-05-24T00:01:00.000Z',
      tags: ['ai-generated', 'alternate_version'],
      data: {
        title: 'Candidate',
        content: 'Candidate body.',
        source_type: 'ai_generated',
        save_destination: 'alternate_version',
        chapter_role: '正文',
        quality_flags: ['alternate_version'],
        volume_index: 1,
        chapter_index: 1,
      },
    });

    const promotedPayload = buildPromotedAIChapterPayload({ item: candidate, destination: 'formal_prologue' });
    const promotedCandidate = chapter({
      id: 'candidate',
      title: 'Candidate',
      content: 'Candidate body.',
      createdAt: '2026-05-24T00:01:00.000Z',
      tags: buildPromotedAIChapterTags(candidate.metadata.tags, 'formal_prologue'),
      data: promotedPayload,
    });

    expect(promotedPayload).toMatchObject({
      content: 'Candidate body.',
      source_type: 'ai_generated',
      save_destination: 'formal_prologue',
      chapter_role: '序章',
      quality_flags: expect.arrayContaining(['formal_prologue']),
    });
    expect(promotedPayload.quality_flags).not.toContain('alternate_version');
    expect(sortChaptersByDirectory([promotedCandidate, imported]).map((item) => item.metadata.id)).toEqual(['candidate', 'imported']);
  });
});
