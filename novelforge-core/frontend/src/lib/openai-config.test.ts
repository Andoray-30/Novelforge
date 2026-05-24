import { describe, expect, it } from 'vitest';
import { normalizeAIMode, normalizeOpenAIConfig } from '@/lib/openai-config';

describe('AI mode config', () => {
  it('normalizes supported user-facing AI modes', () => {
    expect(normalizeAIMode('fast')).toBe('fast');
    expect(normalizeAIMode('pro')).toBe('pro');
    expect(normalizeAIMode('custom', 'pro')).toBe('pro');
  });

  it('keeps ai_mode while normalizing OpenAI config', () => {
    expect(normalizeOpenAIConfig({ ai_mode: 'pro', model: ' ignored-model ' })).toEqual({
      ai_mode: 'pro',
      model: 'ignored-model',
    });
  });
});
