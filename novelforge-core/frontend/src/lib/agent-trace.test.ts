import { describe, expect, it } from 'vitest';
import { normalizeAgentTrace } from '@/lib/agent-trace';

describe('agent trace normalization', () => {
  it('normalizes backend trace payloads for assistant messages', () => {
    const trace = normalizeAgentTrace({
      enabled: true,
      plan_summary: '读取最近对话和章节结尾。',
      degraded: false,
      max_tool_calls: 5,
      tool_calls: [
        { name: 'get_recent_conversation', status: 'ok', summary: '读取最近 2 条对话。', item_count: 2 },
        { name: 'search_chapter_snippets', status: 'ok', summary: '找到 1 段章节片段。', item_count: 1 },
      ],
      used_assets: [{ id: 'char-1', type: 'character', title: '辉夜' }],
      chapter_snippets: [{ id: 'chapter-1', title: '第一章', mode: 'end', preview: '她在章末看见另一个自己。' }],
    });

    expect(trace).toMatchObject({
      enabled: true,
      plan_summary: '读取最近对话和章节结尾。',
      degraded: false,
      max_tool_calls: 5,
      tool_calls: [
        { name: 'get_recent_conversation', status: 'ok', summary: '读取最近 2 条对话。', item_count: 2 },
        { name: 'search_chapter_snippets', status: 'ok', summary: '找到 1 段章节片段。', item_count: 1 },
      ],
      used_assets: [{ id: 'char-1', type: 'character', title: '辉夜' }],
      chapter_snippets: [{ id: 'chapter-1', title: '第一章', mode: 'end', preview: '她在章末看见另一个自己。' }],
    });
  });

  it('drops malformed empty payloads but keeps degraded summaries', () => {
    expect(normalizeAgentTrace(null)).toBeUndefined();
    expect(normalizeAgentTrace({ tool_calls: [], used_assets: [] })).toBeUndefined();

    expect(normalizeAgentTrace({
      enabled: false,
      plan_summary: '缺少 session_id，已使用普通单轮上下文。',
      degraded: true,
    })).toMatchObject({
      enabled: false,
      plan_summary: '缺少 session_id，已使用普通单轮上下文。',
      degraded: true,
      tool_calls: [],
    });
  });

  it('normalizes relationship quality and repair suggestion trace fields', () => {
    const trace = normalizeAgentTrace({
      enabled: true,
      plan_summary: 'used relationship context',
      used_assets: [
        { id: 'rel-enriched', type: 'relationship', title: 'A/B', relationship_enriched: true },
      ],
      retrieval_coverage: {
        counts: { characters: 2, relationships: 1, world: 1, chapter_snippets: 1 },
        issues: ['relationship weak'],
      },
      relationship_quality_report: {
        total_relationships: 1,
        tension_relationships: 0,
        low_information_relationships: 1,
        missing_plot_function_relationships: 1,
        missing_signals: { emotional_tension: 1 },
        status: 'thin',
      },
      relationship_repair_suggestions: [
        {
          relationship_id: 'rel-1',
          title: 'A/B repair',
          source: 'A',
          target: 'B',
          core: 'make the choice cost visible',
          scene_potential: ['A hides the truth from B'],
          missing_signals: ['emotional_tension'],
          usable_signals: ['relationship_type'],
          enriched_relationship_draft: { conflict: 'truth versus safety' },
        },
      ],
    });

    expect(trace?.used_assets[0]).toMatchObject({
      id: 'rel-enriched',
      relationship_enriched: true,
    });
    expect(trace?.retrieval_coverage?.counts.relationships).toBe(1);
    expect(trace?.relationship_quality_report).toMatchObject({
      total_relationships: 1,
      low_information_relationships: 1,
      missing_signals: { emotional_tension: 1 },
    });
    expect(trace?.relationship_repair_suggestions[0]).toMatchObject({
      relationship_id: 'rel-1',
      source: 'A',
      target: 'B',
      missing_signals: ['emotional_tension'],
      enriched_relationship_draft: { conflict: 'truth versus safety' },
    });
  });
});
