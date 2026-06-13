import { describe, expect, it } from 'vitest';

import type { ExtractionAttempt, ExtractionAttemptSummary, RetryQueueSummary } from '@/types';

import {
  buildRecoverySummaryCards,
  formatAttemptErrorLabel,
  getRecoveryTone,
  getRetryableAttempts,
} from './extraction-recovery-utils';

function makeSummary(overrides?: Partial<ExtractionAttemptSummary>): ExtractionAttemptSummary {
  return {
    total_attempts: 10,
    success_count: 7,
    failed_count: 2,
    deadline_exceeded_count: 1,
    skipped_count: 0,
    avg_latency_ms: 2000,
    p95_latency_ms: 5000,
    error_breakdown: { timeout: 1, rate_limited: 1 },
    chapters_with_attempts: 10,
    chapters_needing_retry: 2,
    repair_local_count: 1,
    repair_model_count: 0,
    repair_failed_count: 0,
    repair_success_rate: 1.0,
    session_id: 'session-a',
    partial_recoverable: true,
    overall_status: 'partial',
    ...overrides,
  };
}

function makeAttempt(overrides?: Partial<ExtractionAttempt>): ExtractionAttempt {
  return {
    id: 'attempt-1',
    session_id: 'session-a',
    chapter_id: 'chapter-1',
    chapter_title: '第一章',
    chapter_order: 1,
    attempt_number: 1,
    status: 'failed',
    model_used: 'test-model',
    timeout: 180,
    max_tokens: 2500,
    latency_ms: 2000,
    error_type: 'timeout',
    error_message: 'Request timed out',
    raw_response_hash: null,
    raw_response_chars: 0,
    raw_response_preview: null,
    parsed_candidate_counts: {},
    retry_count: 0,
    needs_retry: true,
    deadline_remaining_ms: null,
    repair_layer: null,
    repair_fixes: [],
    repair_model_used: null,
    repair_latency_ms: 0,
    schema_valid_after_repair: false,
    created_at: '2026-06-04T12:00:00',
    ...overrides,
  };
}

describe('getRecoveryTone', () => {
  it('returns empty for null summary', () => {
    expect(getRecoveryTone(null)).toBe('empty');
  });

  it('returns empty for no_data', () => {
    expect(getRecoveryTone(makeSummary({ total_attempts: 0, overall_status: 'no_data' }))).toBe('empty');
  });

  it('returns success for success status', () => {
    expect(getRecoveryTone(makeSummary({ overall_status: 'success', partial_recoverable: false }))).toBe('success');
  });

  it('returns warning for partial recoverable', () => {
    expect(getRecoveryTone(makeSummary({ overall_status: 'partial', partial_recoverable: true }))).toBe('warning');
  });

  it('returns danger for partial_exhausted', () => {
    expect(getRecoveryTone(makeSummary({ overall_status: 'partial_exhausted' }))).toBe('danger');
  });

  it('returns danger when exhausted jobs exist', () => {
    const retryQueue = { items: [], total: 1, stats: { total_jobs: 1, pending_count: 0, waiting_count: 0, running_count: 0, success_count: 0, failed_count: 0, exhausted_count: 1, cancelled_count: 0, error_breakdown: {}, avg_retries_to_success: 0 } };
    expect(getRecoveryTone(makeSummary({ overall_status: 'partial' }), retryQueue)).toBe('danger');
  });
});

describe('getRetryableAttempts', () => {
  it('includes failed attempts with needs_retry', () => {
    const attempts = [makeAttempt({ status: 'failed', needs_retry: true })];
    expect(getRetryableAttempts(attempts)).toHaveLength(1);
  });

  it('includes deadline_exceeded attempts', () => {
    const attempts = [makeAttempt({ status: 'deadline_exceeded', needs_retry: false })];
    expect(getRetryableAttempts(attempts)).toHaveLength(1);
  });

  it('excludes success attempts', () => {
    const attempts = [makeAttempt({ status: 'success', needs_retry: false })];
    expect(getRetryableAttempts(attempts)).toHaveLength(0);
  });

  it('excludes skipped attempts', () => {
    const attempts = [makeAttempt({ status: 'skipped', needs_retry: false })];
    expect(getRetryableAttempts(attempts)).toHaveLength(0);
  });
});

describe('formatAttemptErrorLabel', () => {
  it('returns Chinese label for known errors', () => {
    expect(formatAttemptErrorLabel('timeout')).toBe('请求超时');
    expect(formatAttemptErrorLabel('rate_limited')).toBe('频率限制 (429)');
  });

  it('returns raw string for unknown errors', () => {
    expect(formatAttemptErrorLabel('custom_error')).toBe('custom_error');
  });

  it('returns unknown error for null', () => {
    expect(formatAttemptErrorLabel(null)).toBe('未知错误');
  });
});

describe('buildRecoverySummaryCards', () => {
  it('returns cards for summary', () => {
    const cards = buildRecoverySummaryCards(makeSummary());
    expect(cards.length).toBeGreaterThanOrEqual(8);
    expect(cards.find((c) => c.label === '总尝试')?.value).toBe(10);
    expect(cards.find((c) => c.label === '成功')?.value).toBe(7);
  });

  it('includes retry queue stats when provided', () => {
    const retryQueue: RetryQueueSummary = {
      items: [],
      total: 1,
      stats: { total_jobs: 1, pending_count: 1, waiting_count: 0, running_count: 0, success_count: 0, failed_count: 0, exhausted_count: 0, cancelled_count: 0, error_breakdown: {}, avg_retries_to_success: 0 },
    };
    const cards = buildRecoverySummaryCards(makeSummary(), retryQueue);
    expect(cards.find((c) => c.label === '待重试')?.value).toBe(1);
  });
});
