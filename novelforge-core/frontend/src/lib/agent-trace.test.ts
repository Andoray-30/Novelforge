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

    expect(trace).toEqual({
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
});
