import { describe, expect, it } from 'vitest';

import {
  buildChapterIndexRunRerunPayload,
  getRepairBatchSummaries,
  getRetryableChapterIndexRunStatuses,
} from './chapter-index-run-utils';
import type { ChapterIndexRun } from '@/types';

function buildRun(overrides: Partial<ChapterIndexRun> = {}): ChapterIndexRun {
  return {
    run_key: 'chapter_index_run_task-a',
    session_id: 'session-a',
    parent_id: 'novel-a',
    total_chapters: 3,
    chapter_index_attempts: [],
    chapter_index_status: [],
    chapter_indices_summary: [],
    candidate_counts: {},
    ...overrides,
  };
}

describe('chapter index run utils', () => {
  it('builds precise rerun payload from failed and retryable statuses', () => {
    const run = buildRun({
      chapter_index_status: [
        { chapter_id: 'chapter-1', chapter_title: '第一章', status: 'success', needs_retry: false },
        { chapter_id: 'chapter-2', chapter_title: '第二章', status: 'failed', error_type: 'gateway_timeout' },
        { chapter_id: 'chapter-3', chapter_title: '第三章', status: 'partial', needs_retry: true },
      ],
    });

    const payload = buildChapterIndexRunRerunPayload(run);

    expect(payload.chapter_index_run_key).toBe('chapter_index_run_task-a');
    expect(payload.chapter_ids).toEqual(['chapter-2', 'chapter-3']);
    expect(payload.analysis_diagnostics).toMatchObject({
      chapter_index_run_key: 'chapter_index_run_task-a',
    });
  });

  it('falls back to failed attempts when final status is missing', () => {
    const run = buildRun({
      chapter_index_attempts: [
        { chapter_id: 'chapter-1', status: 'failed', error_type: 'json_invalid' },
        { chapter_id: 'chapter-1', status: 'failed', error_type: 'timeout' },
        { chapter_id: 'chapter-2', status: 'success' },
      ],
      model_route: {
        selected_model: 'route-model',
        role: 'extractor_fast',
        reason: 'probe_passed',
      },
    });

    const retryable = getRetryableChapterIndexRunStatuses(run);

    expect(retryable).toHaveLength(1);
    expect(retryable[0].chapter_id).toBe('chapter-1');
    expect(run.model_route?.selected_model).toBe('route-model');
  });

  it('summarizes repair batches with readable strategy and model labels', () => {
    const run = buildRun({
      repair_strategy_batches: [
        {
          batch_key: 'repair_batch_1_shrink_chunk_and_extend_timeout',
          chapter_ids: ['chapter-1'],
          repair_strategy: {
            actions: ['shrink_chunk_and_extend_timeout'],
            error_types: ['gateway_timeout'],
            chapter_count: 1,
          },
        },
        {
          batch_key: 'repair_batch_2_prefer_json_repair',
          chapter_ids: ['chapter-2', 'chapter-3'],
          repair_strategy: {
            actions: ['prefer_json_repair'],
            error_types: ['json_invalid'],
            chapter_count: 2,
          },
        },
      ],
      model_route_batches: [
        {
          batch_key: 'repair_batch_1_shrink_chunk_and_extend_timeout',
          model_route: { selected_model: 'slow-stable-model' },
        },
        {
          batch_key: 'repair_batch_2_prefer_json_repair',
          model_route: { selected_model: 'json-repair-model' },
        },
      ],
    });

    const summaries = getRepairBatchSummaries(run);

    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({
      chapterCount: 1,
      actionLabel: '缩短分段并延长超时',
      errorTypeLabel: '网关超时',
      modelLabel: 'slow-stable-model',
    });
    expect(summaries[1]).toMatchObject({
      chapterCount: 2,
      actionLabel: 'JSON 修复优先',
      errorTypeLabel: 'JSON 不合规',
      modelLabel: 'json-repair-model',
    });
  });
});
