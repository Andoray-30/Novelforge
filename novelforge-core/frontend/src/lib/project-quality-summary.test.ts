import { describe, expect, it } from 'vitest';
import { buildProjectQualitySummary } from '@/lib/project-quality-summary';
import type { ContentItem, ContentMetadata, ContentType } from '@/types';

const now = '2026-05-25T00:00:00.000Z';

function item(type: ContentType, id: string, title: string, data: Record<string, unknown> = {}, content = ''): ContentItem {
  const metadata: ContentMetadata = {
    id,
    title,
    type,
    status: data.workflow_status === 'archived' ? 'archived' : 'draft',
    tags: Array.isArray(data.tags) ? data.tags as string[] : [type],
    created_at: now,
    updated_at: now,
    version: 1,
  };
  return {
    metadata,
    content: content || String(data.content ?? data.description ?? ''),
    extracted_data: {
      title,
      content,
      ...data,
    },
  };
}

function summary(overrides: Partial<Parameters<typeof buildProjectQualitySummary>[0]> = {}) {
  return buildProjectQualitySummary({
    chapters: [],
    characters: [],
    relationships: [],
    worlds: [],
    timelines: [],
    outlines: [],
    ...overrides,
  });
}

describe('project quality summary', () => {
  it('returns unknown when a project has no usable assets', () => {
    const result = summary();

    expect(result.overall_status).toBe('unknown');
    expect(result.writing_ready).toBe(false);
    expect(result.chapter.total).toBe(0);
  });

  it('counts chapter workflow states without changing directory responsibilities', () => {
    const result = summary({
      chapters: [
        item('chapter', 'imported', '第一章', { source_type: 'imported', chapter_role: '正文', word_count: 800 }),
        item('chapter', 'draft', 'AI 草稿', { source_type: 'ai_generated', save_destination: 'ai_draft', quality_flags: ['ai_draft'] }),
        item('chapter', 'candidate', '候选', { source_type: 'ai_generated', save_destination: 'alternate_version', quality_flags: ['alternate_version'] }),
        item('chapter', 'formal', '正式', { source_type: 'ai_generated', save_destination: 'formal_body', quality_flags: ['formal_body'] }),
        item('chapter', 'archived', '归档', { source_type: 'ai_generated', save_destination: 'alternate_version', workflow_status: 'archived', quality_flags: ['archived'] }),
      ],
    });

    expect(result.chapter.total).toBe(5);
    expect(result.chapter.imported_originals).toBe(1);
    expect(result.chapter.ai_drafts).toBe(1);
    expect(result.chapter.candidates).toBe(2);
    expect(result.chapter.formal_body).toBe(1);
    expect(result.chapter.archived).toBe(1);
  });

  it('marks a project ready when all writing preparation gates are present', () => {
    const result = summary({
      chapters: [item('chapter', 'chapter-1', '第一章', { source_type: 'imported', chapter_role: '正文', word_count: 1000 }, '她走进雨夜。')],
      characters: [item('character', 'char-1', '辉夜', {
        description: '从发光的电线中诞生的少女，她渴望理解人类，也害怕自己只是短暂的异常。',
        desires: ['理解人类'],
        fears: ['被世界抹除'],
        wounds: ['被当作异常'],
      })],
      relationships: [item('relationship', 'rel-1', '辉夜与扶桑', {
        source: '辉夜',
        target: '扶桑',
        core: '彼此依赖又互相误解',
        emotional_tension: '想靠近却害怕伤害对方',
        scene_potential: ['雨夜争执'],
      })],
      worlds: [item('world', 'world-1', '都市规则', {
        rules: ['时间冻结会吞噬记忆'],
        imagery: ['冷光电线'],
        costs: ['每次回溯都失去一个名字'],
      })],
      timelines: [item('timeline', 'time-1', '相遇')],
      outlines: [item('novel', 'novel-1', '小说根')],
    });

    expect(result.overall_status).toBe('ready');
    expect(result.writing_ready).toBe(true);
    expect(result.character.writable).toBe(1);
    expect(result.relationship.usable).toBe(1);
    expect(result.world.usable_signals).toBeGreaterThan(0);
  });

  it('marks projects needs_repair when core gates pass but thin assets remain', () => {
    const result = summary({
      chapters: [
        item('chapter', 'chapter-1', '第一章', { source_type: 'imported', chapter_role: '正文', word_count: 1000 }, '正文'),
        item('chapter', 'draft-1', '候选一', { source_type: 'ai_generated', save_destination: 'ai_draft' }),
        item('chapter', 'draft-2', '候选二', { source_type: 'ai_generated', save_destination: 'alternate_version' }),
        item('chapter', 'draft-3', '候选三', { source_type: 'ai_generated', save_destination: 'alternate_version' }),
        item('chapter', 'draft-4', '候选四', { source_type: 'ai_generated', save_destination: 'alternate_version' }),
        item('chapter', 'draft-5', '候选五', { source_type: 'ai_generated', save_destination: 'alternate_version' }),
      ],
      characters: [
        item('character', 'char-1', 'A', { description: '一个足够复杂的人物。', goals: ['离开'], fears: ['失败'] }),
        item('character', 'char-2', 'B', { description: '名字。' }),
      ],
      relationships: [
        item('relationship', 'rel-good', 'A-B', { source: 'A', target: 'B', emotional_tension: '互相亏欠' }),
        item('relationship', 'rel-thin', 'A-C', { source: 'A', target: 'C', description: '朋友', missing_signals: ['conflict', 'debt'] }),
      ],
      worlds: [item('world', 'world-1', '规则', { rules: ['禁忌'] })],
    });

    expect(result.overall_status).toBe('needs_repair');
    expect(result.chapter.actions.join(' ')).toContain('editor');
    expect(result.relationship.needs_repair).toBe(1);
    expect(result.relationship.quality_status).toBe('usable');
    expect(result.relationship.relationship_quality_report).toMatchObject({
      total_relationships: 2,
      tension_relationships: 1,
      low_information_relationships: 1,
      missing_plot_function_relationships: 1,
      status: 'usable',
    });
    expect(result.relationship.top_missing_signals).toEqual(['conflict ×1', 'debt ×1']);
  });

  it('marks projects insufficient when writing preparation gates are missing', () => {
    const result = summary({
      chapters: [item('chapter', 'chapter-1', '第一章', { source_type: 'imported', chapter_role: '正文' })],
      characters: [item('character', 'char-1', '薄角色', { description: '只有名字。' })],
      relationships: [item('relationship', 'rel-1', '薄关系', { source: 'A', target: 'B', description: '认识' })],
      worlds: [item('world', 'world-1', '空世界', { description: '城市。' })],
    });

    expect(result.overall_status).toBe('insufficient');
    expect(result.writing_readiness.issues).toEqual(expect.arrayContaining([
      '至少需要 1 个可写角色。',
      '至少需要 1 条 usable/enriched 关系。',
      '至少需要 1 个世界观规则、意象、代价或禁忌。',
    ]));
  });

  it('counts enriched relationships as usable even if original prose is short', () => {
    const result = summary({
      relationships: [
        item('relationship', 'rel-1', '补强关系', {
          source: 'A',
          target: 'B',
          repair_status: 'confirmed',
          quality_flags: ['relationship_enriched'],
          remaining_missing_signals: ['arc'],
        }),
      ],
    });

    expect(result.relationship.enriched).toBe(1);
    expect(result.relationship.usable).toBe(1);
    expect(result.relationship.relationship_quality_report.status).toBe('usable');
    expect(result.relationship.needs_repair).toBe(0);
    expect(result.relationship.top_missing_signals).toEqual(['arc ×1']);
  });

  it('does not treat diagnostic seed or repair-needed assets as writing ready', () => {
    const result = summary({
      chapters: [item('chapter', 'chapter-1', '第一章', { source_type: 'imported', chapter_role: '正文' })],
      characters: [item('character', 'seed-char', '种子角色', {
        source_type: 'diagnostic_seed',
        needs_ai_repair: true,
        quality_flags: ['diagnostic_seed', 'needs_ai_repair'],
        description: '这个角色有较长描述，并且表面上包含足够信息，但仍来自诊断种子，必须先修复确认后才能作为写作记忆。',
        desires: ['找到答案'],
        fears: ['失去自我'],
      })],
      relationships: [item('relationship', 'seed-rel', '种子关系', {
        source: 'A',
        target: 'B',
        quality_flags: ['needs_ai_repair', 'missing_evidence'],
        emotional_tension: '双方互相需要，但没有可靠证据支撑。',
      })],
      worlds: [item('world', 'world-1', '规则', { rules: ['代价明确'] })],
    });

    expect(result.writing_ready).toBe(false);
    expect(result.overall_status).toBe('insufficient');
    expect(result.character.writable).toBe(0);
    expect(result.character.low_information).toBe(1);
    expect(result.relationship.usable).toBe(0);
    expect(result.relationship.needs_repair).toBe(1);
  });
});
