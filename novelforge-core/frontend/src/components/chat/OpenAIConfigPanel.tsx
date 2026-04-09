'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Check, Cpu, Globe, KeyRound, Loader2, RefreshCw, X } from 'lucide-react';
import { openAIService } from '@/lib/api';
import type { OpenAIConfig, OpenAIModelInfo } from '@/types';

interface OpenAIConfigPanelProps {
  open: boolean;
  value?: OpenAIConfig;
  onOpenChange: (open: boolean) => void;
  onApply: (config: OpenAIConfig) => void;
}

interface DraftConfig {
  api_key: string;
  base_url: string;
  model: string;
}

function toDraft(value?: OpenAIConfig): DraftConfig {
  return {
    api_key: value?.api_key ?? '',
    base_url: value?.base_url ?? '',
    model: value?.model ?? '',
  };
}

function normalizeDraft(draft: DraftConfig): OpenAIConfig | undefined {
  const normalized: OpenAIConfig = {};
  const apiKey = draft.api_key.trim();
  const baseUrl = draft.base_url.trim();
  const model = draft.model.trim();

  if (apiKey) normalized.api_key = apiKey;
  if (baseUrl) normalized.base_url = baseUrl;
  if (model) normalized.model = model;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function getSuggestedModelId(models: OpenAIModelInfo[], currentModel?: string | null, draftModel?: string): string {
  const modelIds = new Set(models.map((item) => item.id));
  if (draftModel && modelIds.has(draftModel)) return draftModel;
  if (currentModel && modelIds.has(currentModel)) return currentModel;
  const firstChatModel = models.find((item) => item.supports_chat);
  return firstChatModel?.id ?? models[0]?.id ?? draftModel ?? '';
}

export function OpenAIConfigPanel({ open, value, onOpenChange, onApply }: OpenAIConfigPanelProps) {
  const [draft, setDraft] = useState<DraftConfig>(() => toDraft(value));
  const [models, setModels] = useState<OpenAIModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [resolvedBaseUrl, setResolvedBaseUrl] = useState<string | null>(null);
  const [usingDefaultConfig, setUsingDefaultConfig] = useState(false);

  const normalizedDraft = useMemo(() => normalizeDraft(draft), [draft]);
  const selectableModels = useMemo(() => {
    const chatModels = models.filter((item) => item.supports_chat);
    return chatModels.length > 0 ? chatModels : models;
  }, [models]);

  useEffect(() => {
    if (!open) return;
    setDraft(toDraft(value));
    setModels([]);
    setModelError(null);
    setResolvedBaseUrl(null);
    setUsingDefaultConfig(false);
  }, [open, value]);

  const refreshModels = useCallback(async () => {
    setIsLoadingModels(true);
    setModelError(null);

    try {
      const result = await openAIService.listModels(normalizedDraft);
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
      setModelError(error instanceof Error ? error.message : '获取模型失败。');
    } finally {
      setIsLoadingModels(false);
    }
  }, [draft.model, normalizedDraft]);

  useEffect(() => {
    if (!open) return;
    const timeoutId = window.setTimeout(() => {
      void refreshModels();
    }, 550);

    return () => window.clearTimeout(timeoutId);
  }, [open, draft.api_key, draft.base_url, refreshModels]);

  if (!open) {
    return null;
  }

  return (
    <div style={overlayStyle} onClick={() => onOpenChange(false)}>
      <div style={panelStyle} onClick={(event) => event.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>AI 连接配置</div>
            <h2 style={titleStyle}>OpenAI 兼容 API 配置</h2>
            <p style={subtitleStyle}>
              可为当前页面配置 API Key、Base URL 和模型，不会修改后端 `.env` 文件。
            </p>
          </div>
          <button onClick={() => onOpenChange(false)} style={closeButtonStyle} title="关闭">
            <X size={16} />
          </button>
        </div>

        <div style={heroCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={heroIconWrapStyle}>
              <Cpu size={18} />
            </div>
            <div>
              <div style={{ color: '#f5f7fb', fontSize: 15, fontWeight: 600 }}>
                {draft.model.trim() || '当前未选择模型'}
              </div>
              <div style={{ color: 'rgba(245, 247, 251, 0.72)', fontSize: 12 }}>
                {resolvedBaseUrl || draft.base_url.trim() || '将使用后端默认 OpenAI Base URL'}
              </div>
            </div>
          </div>
          <div style={heroBadgeStyle}>
            {usingDefaultConfig && !draft.api_key.trim() ? '后端默认配置' : '当前页面自定义配置'}
          </div>
        </div>

        <div style={bodyStyle}>
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>
              <KeyRound size={14} />
              API Key
            </label>
            <input
              type="password"
              value={draft.api_key}
              onChange={(event) => setDraft((current) => ({ ...current, api_key: event.target.value }))}
              placeholder="sk-... 或兼容平台 Key"
              style={inputStyle}
              autoComplete="off"
            />
            <div style={helpTextStyle}>
              仅在当前浏览器上下文保存，用于本次前端请求。
            </div>
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>
              <Globe size={14} />
              Base URL
            </label>
            <input
              type="text"
              value={draft.base_url}
              onChange={(event) => setDraft((current) => ({ ...current, base_url: event.target.value }))}
              placeholder="https://api.openai.com/v1"
              style={inputStyle}
            />
            <div style={helpTextStyle}>
              留空则沿用后端默认 Base URL。
            </div>
          </div>

          <div style={fieldGroupStyle}>
            <div style={inlineHeaderStyle}>
              <label style={labelStyle}>
                <Cpu size={14} />
                已探测模型
              </label>
              <button
                onClick={() => void refreshModels()}
                style={secondaryButtonStyle}
                disabled={isLoadingModels}
                type="button"
              >
                {isLoadingModels ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {isLoadingModels ? '加载中...' : '刷新'}
              </button>
            </div>

            {selectableModels.length > 0 ? (
              <div style={modelListStyle}>
                {selectableModels.map((item) => {
                  const isActive = item.id === draft.model;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setDraft((current) => ({ ...current, model: item.id }))}
                      style={{
                        ...modelItemStyle,
                        borderColor: isActive ? 'rgba(109,124,255,0.62)' : 'rgba(255,255,255,0.08)',
                        background: isActive ? 'rgba(109,124,255,0.2)' : 'rgba(255,255,255,0.02)',
                        color: isActive ? '#f5f7ff' : 'rgba(233,238,249,0.86)',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.id}</span>
                      {isActive ? <Check size={14} /> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={emptyStateStyle}>
                {isLoadingModels ? '正在探测可用模型...' : '暂未获取到模型，你也可以手动输入模型 ID。'}
              </div>
            )}

            <input
              type="text"
              value={draft.model}
              onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
              placeholder="例如：gpt-4.1、gpt-4o-mini、deepseek-chat"
              style={inputStyle}
            />

            {modelError ? (
              <div style={errorBoxStyle}>{modelError}</div>
            ) : (
              <div style={successBoxStyle}>
                {models.length > 0
                  ? `已加载 ${models.length} 个模型，当前展示 ${selectableModels.length} 个可对话模型。`
                  : '填写配置后会自动探测模型列表，也可直接手动输入模型 ID。'}
              </div>
            )}
          </div>
        </div>

        <div style={footerStyle}>
          <button
            type="button"
            onClick={() => {
              onApply({});
              onOpenChange(false);
            }}
            style={ghostButtonStyle}
          >
            恢复后端默认
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(normalizedDraft ?? {});
              onOpenChange(false);
            }}
            style={primaryButtonStyle}
          >
            应用到当前界面
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(5, 8, 16, 0.72)',
  backdropFilter: 'blur(12px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 200,
};

const panelStyle: CSSProperties = {
  width: 'min(560px, calc(100vw - 24px))',
  maxHeight: 'min(780px, calc(100vh - 24px))',
  overflowY: 'auto',
  borderRadius: 24,
  background: 'linear-gradient(180deg, rgba(18, 20, 28, 0.98), rgba(11, 13, 18, 0.98))',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 30px 90px rgba(0,0,0,0.45)',
  color: 'var(--text-primary)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  padding: '24px 24px 18px',
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'rgba(155, 166, 194, 0.82)',
  marginBottom: 8,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 700,
  color: '#f6f7fb',
};

const subtitleStyle: CSSProperties = {
  margin: '8px 0 0',
  color: 'rgba(214, 221, 236, 0.7)',
  fontSize: 13,
  lineHeight: 1.6,
};

const closeButtonStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
};

const heroCardStyle: CSSProperties = {
  margin: '0 24px',
  padding: '18px 20px',
  borderRadius: 18,
  background: 'linear-gradient(135deg, rgba(47, 86, 212, 0.28), rgba(17, 29, 56, 0.9))',
  border: '1px solid rgba(118, 154, 255, 0.18)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
};

const heroIconWrapStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  background: 'rgba(255,255,255,0.12)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#edf2ff',
  flexShrink: 0,
};

const heroBadgeStyle: CSSProperties = {
  padding: '6px 10px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.08)',
  color: '#eef2ff',
  fontSize: 12,
  whiteSpace: 'nowrap',
};

const bodyStyle: CSSProperties = {
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
};

const fieldGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const inlineHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};

const labelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: '#eef2ff',
};

const inputStyle: CSSProperties = {
  width: '100%',
  height: 44,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: '#f5f7fb',
  padding: '0 14px',
  outline: 'none',
  fontSize: 14,
};

const helpTextStyle: CSSProperties = {
  fontSize: 12,
  color: 'rgba(195, 203, 220, 0.72)',
  lineHeight: 1.5,
};

const modelListStyle: CSSProperties = {
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.02)',
  padding: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  maxHeight: 190,
  overflowY: 'auto',
};

const modelItemStyle: CSSProperties = {
  height: 36,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.02)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  width: '100%',
  padding: '0 12px',
  cursor: 'pointer',
  fontSize: 13,
};

const emptyStateStyle: CSSProperties = {
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px dashed rgba(255,255,255,0.12)',
  color: 'rgba(195, 203, 220, 0.72)',
  fontSize: 13,
};

const successBoxStyle: CSSProperties = {
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(46, 160, 67, 0.1)',
  border: '1px solid rgba(46, 160, 67, 0.22)',
  color: '#b4f0bf',
  fontSize: 13,
  lineHeight: 1.5,
};

const errorBoxStyle: CSSProperties = {
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(255, 107, 107, 0.1)',
  border: '1px solid rgba(255, 107, 107, 0.22)',
  color: '#ffb2b2',
  fontSize: 13,
  lineHeight: 1.5,
};

const footerStyle: CSSProperties = {
  padding: '0 24px 24px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};

const secondaryButtonStyle: CSSProperties = {
  height: 34,
  padding: '0 12px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.04)',
  color: '#e7ebf6',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
};

const ghostButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  background: 'transparent',
  color: 'rgba(215, 222, 238, 0.86)',
};

const primaryButtonStyle: CSSProperties = {
  height: 42,
  padding: '0 16px',
  borderRadius: 12,
  border: 'none',
  background: 'linear-gradient(135deg, #6d7cff, #3d5af1)',
  color: '#fff',
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
  boxShadow: '0 14px 30px rgba(61, 90, 241, 0.3)',
};
