import { describe, expect, it } from 'vitest';
import type { ChapterIndexRun, ModelHealthReport } from '@/types';
import { buildPersistedModelHealthSummary, buildRecentModelHealthSummary } from './model-health-summary';

function run(overrides: Partial<ChapterIndexRun>): ChapterIndexRun {
  return {
    run_key: 'run-1',
    chapter_index_attempts: [],
    chapter_index_status: [],
    chapter_indices_summary: [],
    candidate_counts: {},
    ...overrides,
  };
}

describe('buildRecentModelHealthSummary', () => {
  it('aggregates selected models, probe results, attempts, latency, and error counts', () => {
    const summary = buildRecentModelHealthSummary([
      run({
        run_key: 'run-a',
        model_route: {
          role: 'extractor_fast',
          selected_model: 'fast-a',
          reason: 'probe_passed',
          candidates: ['fast-a', 'fast-b'],
          probe_results: [
            {
              role: 'extractor_fast',
              model: 'fast-a',
              available: true,
              latency_ms: 1200,
              non_empty_chat: true,
              json_capable: true,
              extraction_rich: true,
              score: 94,
            },
            {
              role: 'extractor_fast',
              model: 'fast-b',
              available: false,
              latency_ms: 5400,
              error_type: 'gateway_timeout',
              score: 0,
            },
          ],
        },
        chapter_index_attempts: [
          { model_used: 'fast-a', status: 'success', latency_ms: 1000 },
          { model_used: 'fast-b', status: 'failed', error_type: 'gateway_timeout', latency_ms: 6000 },
          { model_used: 'fast-b', status: 'failed', error_type: 'empty_content', latency_ms: 900 },
        ],
      }),
    ]);

    expect(summary[0]).toMatchObject({
      model: 'fast-a',
      selectedCount: 1,
      probePassed: 1,
      attemptCount: 1,
      successfulAttempts: 1,
      failedAttempts: 0,
      averageLatencyMs: 1100,
      lastRole: 'extractor_fast',
      lastReasonLabel: '测速通过',
    });
    expect(summary[1]).toMatchObject({
      model: 'fast-b',
      selectedCount: 0,
      probeFailed: 1,
      attemptCount: 2,
      failedAttempts: 2,
    });
    expect(summary[1].errorCounts).toEqual([
      { type: 'gateway_timeout', label: '网关超时', count: 2 },
      { type: 'empty_content', label: '空响应', count: 1 },
    ]);
  });

  it('keeps slow but successful models visible instead of treating latency as failure', () => {
    const [summary] = buildRecentModelHealthSummary([
      run({
        run_key: 'run-slow',
        model_route: {
          role: 'extractor_deep',
          selected_model: 'slow-pro',
          reason: 'probe_passed',
          candidates: ['slow-pro'],
          probe_results: [
            {
              role: 'extractor_deep',
              model: 'slow-pro',
              available: true,
              latency_ms: 28000,
              non_empty_chat: true,
              json_capable: true,
              extraction_rich: true,
              score: 81,
            },
          ],
        },
        chapter_index_attempts: [{ model_used: 'slow-pro', status: 'success', latency_ms: 32000 }],
      }),
    ]);

    expect(summary.model).toBe('slow-pro');
    expect(summary.averageLatencyMs).toBe(30000);
    expect(summary.failedAttempts).toBe(0);
    expect(summary.errorCounts).toEqual([]);
  });

  it('counts split repair batch routes as selected models', () => {
    const summary = buildRecentModelHealthSummary([
      run({
        run_key: 'run-repair',
        model_route_batches: [
          {
            batch_key: 'repair_batch_1_shrink_chunk_and_extend_timeout',
            model_route: {
              role: 'extractor_repair',
              selected_model: 'slow-stable-model',
              reason: 'probe_passed',
            },
          },
          {
            batch_key: 'repair_batch_2_prefer_json_repair',
            model_route: {
              role: 'extractor_repair',
              selected_model: 'json-repair-model',
              reason: 'probe_skipped',
            },
          },
        ],
      }),
    ]);

    expect(summary.map((item) => item.model)).toEqual(['json-repair-model', 'slow-stable-model']);
    expect(summary.find((item) => item.model === 'slow-stable-model')).toMatchObject({
      selectedCount: 1,
      lastRole: 'extractor_repair',
    });
    expect(summary.find((item) => item.model === 'json-repair-model')).toMatchObject({
      selectedCount: 1,
      lastReasonLabel: '未执行测速，使用候选模型',
    });
  });
});

describe('buildPersistedModelHealthSummary', () => {
  it('normalizes backend model health report summaries', () => {
    const report: ModelHealthReport = {
      generated_at: '2026-06-01T10:00:00',
      event_count: 3,
      items: [
        {
          model: 'persisted-fast',
          roles: ['extractor_fast'],
          selected_count: 2,
          probe_count: 1,
          probe_passed: 1,
          probe_failed: 0,
          attempt_count: 2,
          successful_attempts: 1,
          failed_attempts: 1,
          average_latency_ms: 1800,
          error_counts: { gateway_timeout: 1 },
        },
      ],
      events: [
        {
          id: 'old',
          model: 'persisted-fast',
          role: 'extractor_fast',
          reason: 'probe_skipped',
          created_at: '2026-06-01T09:59:00',
        },
        {
          id: 'new',
          model: 'persisted-fast',
          role: 'extractor_repair',
          reason: 'probe_passed',
          created_at: '2026-06-01T10:00:00',
        },
      ],
    };

    const [summary] = buildPersistedModelHealthSummary(report);

    expect(summary).toMatchObject({
      model: 'persisted-fast',
      selectedCount: 2,
      probeCount: 1,
      probePassed: 1,
      attemptCount: 2,
      successfulAttempts: 1,
      failedAttempts: 1,
      averageLatencyMs: 1800,
      lastRole: 'extractor_repair',
      lastReasonLabel: '测速通过',
    });
    expect(summary.errorCounts).toEqual([
      { type: 'gateway_timeout', label: '网关超时', count: 1 },
    ]);
  });
});
