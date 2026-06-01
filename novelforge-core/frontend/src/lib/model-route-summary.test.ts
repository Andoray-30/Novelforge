import { describe, expect, it } from 'vitest';
import {
  getModelProbeStatusLabel,
  getModelRouteSummary,
  normalizeModelRoute,
} from './model-route-summary';

describe('model route summary', () => {
  it('normalizes selected model, probes, and health rankings from import diagnostics', () => {
    const summary = getModelRouteSummary({
      analysis_diagnostics: {
        model_route: {
          role: 'extractor_fast',
          selected_model: 'deepseek-ai/deepseek-v4-flash',
          reason: 'no_probe_passed_using_best_score',
          candidates: ['gemini-3.5-flash', 'deepseek-ai/deepseek-v4-flash'],
          original_candidates: ['deepseek-ai/deepseek-v4-flash', 'gemini-3.5-flash'],
          candidate_order_source: 'health_history',
          health_rankings: [
            {
              model: 'deepseek-ai/deepseek-v4-flash',
              score: 24,
              reason: 'positive_history',
              successful_attempts: 1,
              failed_attempts: 0,
              probe_passed: 1,
              probe_failed: 0,
              average_latency_ms: 3200,
              error_counts: {},
            },
          ],
          probe_results: [
            {
              model: 'gemini-3.5-flash',
              available: false,
              latency_ms: 8010,
              error_type: 'empty_content',
              score: 0,
            },
            {
              model: 'deepseek-ai/deepseek-v4-flash',
              available: true,
              non_empty_chat: true,
              json_capable: true,
              extraction_rich: true,
              latency_ms: 3200,
              score: 92,
            },
          ],
        },
      },
    });

    expect(summary?.selectedModel).toBe('deepseek-ai/deepseek-v4-flash');
    expect(summary?.reasonLabel).toBe('无模型完全通过，使用最高分候选');
    expect(summary?.candidates).toEqual(['gemini-3.5-flash', 'deepseek-ai/deepseek-v4-flash']);
    expect(summary?.originalCandidates).toEqual(['deepseek-ai/deepseek-v4-flash', 'gemini-3.5-flash']);
    expect(summary?.candidateOrderSource).toBe('health_history');
    expect(summary?.healthRankings[0]).toMatchObject({
      model: 'deepseek-ai/deepseek-v4-flash',
      reasonLabel: '历史成功率较高',
      successfulAttempts: 1,
      probePassed: 1,
    });
    expect(summary?.probeResults[0].errorType).toBe('empty_content');
    expect(summary?.probeResults[1].extractionRich).toBe(true);
  });

  it('returns null when the route is missing a selected model', () => {
    expect(normalizeModelRoute({ role: 'extractor_fast' })).toBeNull();
  });

  it('labels common probe failures in user-readable Chinese', () => {
    expect(getModelProbeStatusLabel({
      model: 'm',
      available: false,
      score: null,
      latencyMs: null,
      errorType: 'gateway_timeout',
      error: null,
      nonEmptyChat: false,
      jsonCapable: false,
      extractionRich: false,
    })).toBe('网关超时');
  });
});
