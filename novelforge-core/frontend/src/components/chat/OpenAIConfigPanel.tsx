'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Cpu, Globe, KeyRound, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { openAIService } from '@/lib/api';
import { hasOpenAIConfig, normalizeOpenAIConfig, type OpenAIConfigState } from '@/lib/openai-config';
import type { OpenAIConfig, OpenAIModelInfo } from '@/types';

interface OpenAIConfigPanelProps {
  open: boolean;
  value?: OpenAIConfigState;
  onOpenChange: (open: boolean) => void;
  onApply: (state: OpenAIConfigState) => void;
}

interface DraftConfig {
  api_key: string;
  base_url: string;
  model: string;
}

function toDraft(value?: OpenAIConfigState): DraftConfig {
  return {
    api_key: value?.config.api_key ?? '',
    base_url: value?.config.base_url ?? '',
    model: value?.config.model ?? '',
  };
}

function normalizeDraft(draft: DraftConfig): OpenAIConfig {
  return normalizeOpenAIConfig(draft);
}

function getSuggestedModelId(models: OpenAIModelInfo[], currentModel?: string | null, draftModel?: string): string {
  const modelIds = new Set(models.map((item) => item.id));
  if (draftModel && modelIds.has(draftModel)) {
    return draftModel;
  }
  if (currentModel && modelIds.has(currentModel)) {
    return currentModel;
  }
  const firstChatModel = models.find((item) => item.supports_chat);
  return firstChatModel?.id ?? models[0]?.id ?? draftModel ?? '';
}

export function OpenAIConfigPanel({ open, value, onOpenChange, onApply }: OpenAIConfigPanelProps) {
  const [draft, setDraft] = useState<DraftConfig>(() => toDraft(value));
  const [overrideEnabled, setOverrideEnabled] = useState(value?.enabled ?? false);
  const [models, setModels] = useState<OpenAIModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [resolvedBaseUrl, setResolvedBaseUrl] = useState<string | null>(null);
  const [usingDefaultConfig, setUsingDefaultConfig] = useState(false);

  const normalizedDraft = useMemo(() => normalizeDraft(draft), [draft]);
  const hasDraftConfig = useMemo(() => hasOpenAIConfig(normalizedDraft), [normalizedDraft]);
  const selectableModels = useMemo(() => {
    const chatModels = models.filter((item) => item.supports_chat);
    return chatModels.length > 0 ? chatModels : models;
  }, [models]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft(toDraft(value));
    setOverrideEnabled(value?.enabled ?? false);
    setModels([]);
    setModelError(null);
    setResolvedBaseUrl(null);
    setUsingDefaultConfig(false);
  }, [open, value]);

  const refreshModels = useCallback(async () => {
    setIsLoadingModels(true);
    setModelError(null);

    try {
      const result = await openAIService.listModels(hasDraftConfig ? normalizedDraft : undefined);
      const nextModels = result.models || [];
      setModels(nextModels);
      setResolvedBaseUrl(result.base_url ?? null);
      setUsingDefaultConfig(result.using_default_config);

      const suggestedModel = getSuggestedModelId(nextModels, result.current_model, draft.model.trim());
      if (suggestedModel) {
        setDraft((current) => ({ ...current, model: suggestedModel }));
      }
    } catch (error) {
      setModels([]);
      setModelError(error instanceof Error ? error.message : '获取模型列表失败，请检查配置后重试。');
    } finally {
      setIsLoadingModels(false);
    }
  }, [draft.model, hasDraftConfig, normalizedDraft]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void refreshModels();
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [open, draft.api_key, draft.base_url, refreshModels]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="max-h-[calc(100vh-24px)] w-full max-w-[560px] overflow-y-auto rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(18,20,28,0.98),rgba(11,13,18,0.98))] shadow-[0_30px_90px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 pb-4 pt-6">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">AI 连接配置</div>
            <h2 className="mt-2 text-3xl font-black text-white">OpenAI 兼容 API 配置</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
              这里保存的是浏览器本地覆盖配置。开启后，当前浏览器会优先使用这里的 API Key、Base URL 和模型；
              关闭后，则回退到后端 `.env` 默认配置。
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-2xl border border-white/10 p-3 text-zinc-400 transition hover:bg-white/5 hover:text-white"
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6">
          <div className="rounded-3xl border border-indigo-400/20 bg-indigo-500/10 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-100">
                  <Cpu size={20} />
                </div>
                <div>
                  <div className="text-lg font-semibold text-white">{draft.model.trim() || '未指定模型'}</div>
                  <div className="text-sm text-zinc-400">
                    {resolvedBaseUrl || draft.base_url.trim() || '将沿用后端默认 Base URL'}
                  </div>
                </div>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-zinc-200">
                {overrideEnabled && hasDraftConfig ? '当前使用浏览器覆盖配置' : '当前使用后端默认配置'}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck size={16} />
              浏览器覆盖是独立开关
            </div>
            <p className="mt-2 leading-6 text-emerald-100/85">
              如果你希望继续使用前端里保存的模型和网关，请保持开关开启；如果只想临时回退到后端 `.env`，直接关闭开关即可，
              不需要删除你已经保存的配置。
            </p>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-white">启用浏览器覆盖配置</div>
                <div className="mt-1 text-sm text-zinc-400">
                  启用后，本浏览器会优先使用下方配置向后端发起请求。
                </div>
              </div>
              <input
                type="checkbox"
                checked={overrideEnabled}
                onChange={(event) => setOverrideEnabled(event.target.checked)}
                className="h-5 w-5"
              />
            </div>
          </div>

          <div className="mt-5 space-y-5 pb-6">
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-200">
                <KeyRound size={14} />
                API Key
              </label>
              <input
                type="password"
                value={draft.api_key}
                onChange={(event) => setDraft((current) => ({ ...current, api_key: event.target.value }))}
                placeholder="sk-... 或兼容平台密钥"
                autoComplete="off"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400/60"
              />
              <p className="mt-2 text-xs text-zinc-500">仅保存在当前浏览器，用于本次前端请求覆盖。</p>
            </div>

            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-200">
                <Globe size={14} />
                基础 URL
              </label>
              <input
                type="text"
                value={draft.base_url}
                onChange={(event) => setDraft((current) => ({ ...current, base_url: event.target.value }))}
                placeholder="https://api.openai.com/v1"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400/60"
              />
              <p className="mt-2 text-xs text-zinc-500">留空时会沿用后端默认 Base URL。</p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                  <Cpu size={14} />
                  已探测模型
                </label>
                <button
                  onClick={() => void refreshModels()}
                  type="button"
                  disabled={isLoadingModels}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-zinc-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoadingModels ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  {isLoadingModels ? '刷新中...' : '刷新'}
                </button>
              </div>

              {selectableModels.length > 0 ? (
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  {selectableModels.map((item) => {
                    const isActive = item.id === draft.model;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setDraft((current) => ({ ...current, model: item.id }))}
                        className={[
                          'flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition',
                          isActive
                            ? 'border-indigo-400/60 bg-indigo-500/20 text-white'
                            : 'border-white/10 bg-transparent text-zinc-300 hover:bg-white/[0.04]',
                        ].join(' ')}
                      >
                        <span className="truncate">{item.id}</span>
                        {isActive ? <Check size={14} /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-zinc-400">
                  {isLoadingModels ? '正在探测可用模型...' : '暂时没有拿到模型列表，你也可以直接手动输入模型 ID。'}
                </div>
              )}

              <input
                type="text"
                value={draft.model}
                onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
                placeholder="例如：qwen3.6-plus、gemini-3-flash-preview、gemini-2.5-flash"
                className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400/60"
              />

              {modelError ? (
                <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {modelError}
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  {models.length > 0
                    ? `已载入 ${models.length} 个模型，可聊天模型 ${selectableModels.length} 个。`
                    : usingDefaultConfig
                      ? '当前显示的是后端默认配置对应的模型列表。'
                      : '填写配置后会自动探测模型列表，也可以直接手动输入模型 ID。'}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-5">
          <button
            type="button"
            onClick={() => {
              onApply({ enabled: false, config: {} });
              onOpenChange(false);
            }}
            className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-zinc-200 transition hover:bg-white/[0.08]"
          >
            清空本地配置
          </button>
          <button
            type="button"
            onClick={() => {
              onApply({
                enabled: overrideEnabled && hasDraftConfig,
                config: normalizedDraft,
              });
              onOpenChange(false);
            }}
            className="rounded-full bg-indigo-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
          >
            保存当前配置
          </button>
        </div>
      </div>
    </div>
  );
}
