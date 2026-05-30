import { describe, expect, it } from 'vitest';

import { buildChapterIndexRunRerunPayload, getRetryableChapterIndexRunStatuses } from './chapter-index-run-utils';
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
});
