import { describe, expect, it } from 'vitest';
import {
  getModelProbeStatusLabel,
  getModelRouteSummary,
  normalizeModelRoute,
} from './model-route-summary';

describe('model route summary', () => {
  it('normalizes selected model and probe results from import diagnostics', () => {
    const summary = getModelRouteSummary({
      analysis_diagnostics: {
        model_route: {
          role: 'extractor_fast',
          selected_model: 'deepseek-ai/deepseek-v4-flash',
          reason: 'no_probe_passed_using_best_score',
          candidates: ['gemini-3.5-flash', 'deepseek-ai/deepseek-v4-flash'],
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
