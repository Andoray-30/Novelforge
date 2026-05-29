import { describe, expect, it } from 'vitest';
import { parseNovelImportTaskResult } from './task-events';

describe('parseNovelImportTaskResult', () => {
  it('keeps import analysis diagnostics for explainable quality UI', () => {
    const result = parseNovelImportTaskResult({
      session_id: 'session-1',
      chapters_count: '8',
      characters_count: 9,
      relationships_count: 10,
      timeline_count: 23,
      world_count: 1,
      analysis_status: 'low_quality',
      analysis_quality_issues: ['角色覆盖不足'],
      analysis_diagnostics: {
        candidate_counts: {
          chapter_character_candidates: 27,
          relationship_endpoint_mapping_ratio: 0.75,
        },
        failed_chapters: [{ title: '第二章', error: 'timeout' }],
        chapter_index_status: [{ chapter_id: 'chapter-2', status: 'failed', needs_retry: true }],
        chapter_index_attempts: [{ chapter_id: 'chapter-2', error_type: 'timeout' }],
        chapter_index_run_key: 'chapter_index_run_task-1',
        relationship_unresolved_endpoints: ['UnknownTarget'],
        timeline_mismatch_events: [{ title: '错配事件', description_preview: '描述' }],
        dropped_candidates: [{ name: '抽象概念', reason: 'invalid_character_name' }],
        low_confidence_characters: [{ name: '配角甲', confidence: 'low' }],
        suspected_merged_characters: [{ name: '甲与乙' }],
        weak_relationships: [{ source: '甲', target: '乙' }],
      },
    });

    expect(result?.analysis_status).toBe('low_quality');
    expect(result?.chapters_count).toBe(8);
    expect(result?.candidate_counts?.chapter_character_candidates).toBe(27);
    expect(result?.candidate_counts?.relationship_endpoint_mapping_ratio).toBe(0.75);
    expect(result?.failed_chapters?.[0]?.title).toBe('第二章');
    expect(result?.chapter_index_status?.[0]?.chapter_id).toBe('chapter-2');
    expect(result?.chapter_index_attempts?.[0]?.error_type).toBe('timeout');
    expect(result?.analysis_diagnostics?.chapter_index_run_key).toBe('chapter_index_run_task-1');
    expect(result?.relationship_unresolved_endpoints?.[0]).toBe('UnknownTarget');
    expect(result?.timeline_mismatch_events?.[0]?.title).toBe('错配事件');
    expect(result?.analysis_diagnostics?.dropped_candidates?.[0]?.name).toBe('抽象概念');
    expect(result?.analysis_diagnostics?.low_confidence_characters?.[0]?.name).toBe('配角甲');
    expect(result?.analysis_diagnostics?.suspected_merged_characters?.[0]?.name).toBe('甲与乙');
    expect(result?.analysis_diagnostics?.weak_relationships?.[0]?.source).toBe('甲');
  });
});
