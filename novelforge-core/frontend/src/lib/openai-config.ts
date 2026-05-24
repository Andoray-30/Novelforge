import type { OpenAIConfig } from '@/types';
import { storage } from '@/lib/utils';

export const OPENAI_CONFIG_STORAGE_KEY = 'novelforge-openai-config';

type StoredOpenAIConfig = OpenAIConfig & {
  enabled?: boolean;
};

export interface OpenAIConfigState {
  enabled: boolean;
  config: OpenAIConfig;
}

export type AIMode = 'fast' | 'pro';

export const AI_MODE_STORAGE_KEY = 'novelforge-ai-mode';

export function normalizeAIMode(value: unknown, fallback: AIMode = 'fast'): AIMode {
  return value === 'pro' || value === 'fast' ? value : fallback;
}

export function loadAIMode(fallback: AIMode = 'fast'): AIMode {
  return normalizeAIMode(storage.get<string | undefined>(AI_MODE_STORAGE_KEY, undefined), fallback);
}

export function saveAIMode(mode: AIMode): AIMode {
  const normalized = normalizeAIMode(mode);
  storage.set(AI_MODE_STORAGE_KEY, normalized);
  return normalized;
}

export function normalizeOpenAIConfig(input: unknown): OpenAIConfig {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const candidate = input as Record<string, unknown>;
  const normalized: OpenAIConfig = {};

  if (typeof candidate.api_key === 'string' && candidate.api_key.trim()) {
    normalized.api_key = candidate.api_key.trim();
  }
  if (typeof candidate.base_url === 'string' && candidate.base_url.trim()) {
    normalized.base_url = candidate.base_url.trim();
  }
  if (typeof candidate.model === 'string' && candidate.model.trim()) {
    normalized.model = candidate.model.trim();
  }
  if (candidate.ai_mode === 'fast' || candidate.ai_mode === 'pro') {
    normalized.ai_mode = candidate.ai_mode;
  }

  return normalized;
}

export function hasOpenAIConfig(config?: OpenAIConfig | null): boolean {
  return Boolean(config?.api_key || config?.base_url || config?.model);
}

export function loadOpenAIConfigState(): OpenAIConfigState {
  const stored = storage.get<StoredOpenAIConfig | undefined>(OPENAI_CONFIG_STORAGE_KEY, undefined);
  if (!stored || typeof stored !== 'object') {
    return { enabled: false, config: {} };
  }

  const config = normalizeOpenAIConfig(stored);
  const enabled = typeof stored.enabled === 'boolean' ? stored.enabled : hasOpenAIConfig(config);

  return {
    enabled: enabled && hasOpenAIConfig(config),
    config,
  };
}

export function loadEffectiveOpenAIConfig(): OpenAIConfig {
  const state = loadOpenAIConfigState();
  return state.enabled ? state.config : {};
}

export function saveOpenAIConfigState(state: OpenAIConfigState): OpenAIConfigState {
  const config = normalizeOpenAIConfig(state.config);
  const normalizedState: OpenAIConfigState = {
    enabled: state.enabled && hasOpenAIConfig(config),
    config,
  };

  if (normalizedState.enabled || hasOpenAIConfig(normalizedState.config)) {
    storage.set(OPENAI_CONFIG_STORAGE_KEY, {
      enabled: normalizedState.enabled,
      ...normalizedState.config,
    });
  } else {
    storage.remove(OPENAI_CONFIG_STORAGE_KEY);
  }

  return normalizedState;
}
