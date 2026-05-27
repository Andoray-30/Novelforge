'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Loader2, Mic, Paperclip, Sparkles, X } from 'lucide-react';
import { aiService } from '@/lib/api';
import type { OpenAIConfig } from '@/types';
import type { AIMode } from '@/lib/openai-config';

const DEFAULT_PROMPT_SUGGESTIONS = [
  '帮我设计一个有魅力且复杂的反派角色。',
  '构建一个带有神话色彩和社会冲突的世界观。',
  '分析我上传的文本并提取角色与关系。',
  '按章节规划从开端到结局的完整时间线。',
  '把这段剧情改写得更有情绪张力。',
];

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  sessionId?: string;
  openAIConfig?: OpenAIConfig;
  aiMode?: AIMode;
  onAIModeChange?: (mode: AIMode) => void;
  prefill?: { id: string; text: string } | null;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder,
  sessionId,
  openAIConfig,
  aiMode = 'fast',
  onAIModeChange,
  prefill,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [promptSuggestions, setPromptSuggestions] = useState<string[]>(DEFAULT_PROMPT_SUGGESTIONS);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const apiKeyInput = openAIConfig?.api_key ?? '';
  const baseUrlInput = openAIConfig?.base_url ?? '';
  const modelInput = openAIConfig?.model ?? '';
  const modeInput = openAIConfig?.ai_mode ?? aiMode;

  const requestConfig = useMemo(() => {
    const normalized: OpenAIConfig = {};
    const apiKey = apiKeyInput.trim();
    const baseUrl = baseUrlInput.trim();
    const model = modelInput.trim();

    if (apiKey) normalized.api_key = apiKey;
    if (baseUrl) normalized.base_url = baseUrl;
    if (model) normalized.model = model;
    normalized.ai_mode = modeInput === 'pro' ? 'pro' : 'fast';

    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }, [apiKeyInput, baseUrlInput, modelInput, modeInput]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [input]);

  useEffect(() => {
    if (!prefill?.text) return;
    setInput(prefill.text);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [prefill?.id, prefill?.text]);

  useEffect(() => {
    let cancelled = false;

    const fetchSuggestions = async () => {
      if (!sessionId) {
        setPromptSuggestions(DEFAULT_PROMPT_SUGGESTIONS);
        return;
      }

      setIsLoadingSuggestions(true);
      try {
        const result = await aiService.suggestPrompts(sessionId, requestConfig);
        if (cancelled) return;
        setPromptSuggestions(Array.isArray(result) && result.length > 0 ? result.slice(0, 8) : DEFAULT_PROMPT_SUGGESTIONS);
      } catch {
        if (!cancelled) setPromptSuggestions(DEFAULT_PROMPT_SUGGESTIONS);
      } finally {
        if (!cancelled) setIsLoadingSuggestions(false);
      }
    };

    void fetchSuggestions();
    return () => {
      cancelled = true;
    };
  }, [sessionId, requestConfig]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput('');
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const canSend = input.trim().length > 0 && !disabled;

  return (
    <div style={{ padding: '12px 20px 20px', background: 'transparent', flexShrink: 0 }}>
      {input.length === 0 && !disabled ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <div className="nf-prompt-suggestions" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
            {promptSuggestions.map((suggestion, index) => (
              <button
                key={`${suggestion}-${index}`}
                onClick={() => {
                  setInput(suggestion);
                  textareaRef.current?.focus();
                }}
                className="nf-chip"
                style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                {suggestion.length > 34 ? `${suggestion.slice(0, 34)}...` : suggestion}
              </button>
            ))}
          </div>
          {isLoadingSuggestions ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--nf-text-subtle)', fontSize: 11 }}>
              <Loader2 size={12} className="animate-spin" />
              正在刷新提示词...
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          background: 'var(--nf-surface-raised)',
          borderRadius: 14,
          border: `1px solid ${isFocused ? 'color-mix(in srgb, var(--nf-accent) 45%, transparent)' : 'var(--nf-border)'}`,
          boxShadow: isFocused ? '0 0 0 3px var(--nf-accent-soft)' : 'var(--shadow-sm)',
          transition: 'border-color 200ms, box-shadow 200ms',
          padding: '12px 14px',
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          rows={1}
          placeholder={placeholder ?? (disabled ? 'Agent 正在生成中...' : '告诉 NovelForge 你想创作什么...（Shift+Enter 换行）')}
          style={{
            background: 'none',
            border: 'none',
            outline: 'none',
            resize: 'none',
            color: disabled ? 'var(--nf-text-subtle)' : 'var(--nf-text)',
            fontSize: 14,
            lineHeight: 1.6,
            width: '100%',
            minHeight: 24,
            maxHeight: 180,
            fontFamily: 'inherit',
            overflowY: 'auto',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ToolButton icon={<Paperclip size={15} />} title="上传文本文件" disabled />
            <ToolButton icon={<Mic size={15} />} title="语音输入（即将支持）" disabled />
            {onAIModeChange ? (
              <div
                role="group"
                aria-label="创作模式"
                style={{
                  display: 'flex',
                  padding: 2,
                  borderRadius: 999,
                  border: '1px solid var(--nf-border)',
                  background: 'var(--nf-panel-soft)',
                }}
              >
                {(['fast', 'pro'] as AIMode[]).map((mode) => {
                  const active = aiMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onAIModeChange(mode)}
                      title={mode === 'fast' ? '快速模式：适合灵感、聊天和轻量改写' : 'Pro 模式：适合深度创作、序章和复杂分析'}
                      style={{
                        border: 'none',
                        borderRadius: 999,
                        padding: '4px 9px',
                        fontSize: 11,
                        fontWeight: active ? 700 : 500,
                        background: active ? 'var(--nf-accent-soft)' : 'transparent',
                        color: active ? 'var(--nf-accent)' : 'var(--nf-text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      {mode === 'fast' ? '快速' : 'Pro'}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {input.length > 0 ? <span style={{ fontSize: 11, color: 'var(--nf-text-subtle)' }}>{input.length}</span> : null}
            {input.length > 0 ? (
              <button
                onClick={() => setInput('')}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--nf-text-muted)',
                  padding: 3,
                  borderRadius: 4,
                  display: 'flex',
                }}
                title="清空输入"
              >
                <X size={13} />
              </button>
            ) : null}
            <button
              onClick={handleSend}
              disabled={!canSend}
              title="发送（Enter）"
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: canSend ? 'var(--nf-accent)' : 'color-mix(in srgb, var(--nf-text-subtle) 18%, transparent)',
                border: 'none',
                cursor: canSend ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: canSend ? '#fff' : 'var(--nf-text-subtle)',
                transition: 'background 200ms, transform 100ms',
                boxShadow: canSend ? '0 2px 8px var(--nf-accent-soft)' : 'none',
              }}
              onMouseDown={(event) => {
                if (canSend) event.currentTarget.style.transform = 'scale(0.92)';
              }}
              onMouseUp={(event) => {
                event.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 8,
          textAlign: 'center',
          fontSize: 11,
          color: 'var(--nf-text-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        <Sparkles size={10} />
        AI 生成内容可能存在误差，请在使用前自行核对。
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  title,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: 'none',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--nf-text-subtle)' : 'var(--nf-text-muted)',
        padding: '4px 6px',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        transition: 'background 150ms, color 150ms',
      }}
    >
      {icon}
    </button>
  );
}
