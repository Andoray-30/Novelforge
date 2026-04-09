'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Loader2, Mic, Paperclip, Sparkles, X } from 'lucide-react';
import { aiService } from '@/lib/api';
import type { OpenAIConfig } from '@/types';

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
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder,
  sessionId,
  openAIConfig,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [promptSuggestions, setPromptSuggestions] = useState<string[]>(DEFAULT_PROMPT_SUGGESTIONS);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const apiKeyInput = openAIConfig?.api_key ?? '';
  const baseUrlInput = openAIConfig?.base_url ?? '';
  const modelInput = openAIConfig?.model ?? '';

  const requestConfig = useMemo(() => {
    const normalized: OpenAIConfig = {};
    const apiKey = apiKeyInput.trim();
    const baseUrl = baseUrlInput.trim();
    const model = modelInput.trim();

    if (apiKey) normalized.api_key = apiKey;
    if (baseUrl) normalized.base_url = baseUrl;
    if (model) normalized.model = model;

    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }, [apiKeyInput, baseUrlInput, modelInput]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [input]);

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
        if (Array.isArray(result) && result.length > 0) {
          setPromptSuggestions(result.slice(0, 8));
        } else {
          setPromptSuggestions(DEFAULT_PROMPT_SUGGESTIONS);
        }
      } catch {
        if (!cancelled) {
          setPromptSuggestions(DEFAULT_PROMPT_SUGGESTIONS);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSuggestions(false);
        }
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
    <div
      style={{
        padding: '12px 20px 20px',
        background: 'transparent',
        flexShrink: 0,
      }}
    >
      {input.length === 0 && !disabled && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              paddingBottom: 4,
              msOverflowStyle: 'none',
              scrollbarWidth: 'none',
            }}
          >
            {promptSuggestions.map((suggestion, index) => (
              <button
                key={`${suggestion}-${index}`}
                onClick={() => {
                  setInput(suggestion);
                  textareaRef.current?.focus();
                }}
                style={{
                  flexShrink: 0,
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 150ms',
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.borderColor = 'var(--accent-primary)';
                  event.currentTarget.style.color = 'var(--text-secondary)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.borderColor = 'var(--border-default)';
                  event.currentTarget.style.color = 'var(--text-muted)';
                }}
              >
                {suggestion.length > 34 ? `${suggestion.slice(0, 34)}...` : suggestion}
              </button>
            ))}
          </div>
          {isLoadingSuggestions && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--text-disabled)',
                fontSize: 11,
              }}
            >
              <Loader2 size={12} className="animate-spin" />
              正在刷新提示词...
            </div>
          )}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          background: 'var(--bg-elevated)',
          borderRadius: 14,
          border: `1px solid ${isFocused ? 'rgba(139, 92, 246, 0.5)' : 'var(--border-default)'}`,
          boxShadow: isFocused ? '0 0 0 3px rgba(139, 92, 246, 0.1)' : 'var(--shadow-sm)',
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
          placeholder={
            placeholder ??
            (disabled ? 'Agent 正在生成中...' : '告诉 NovelForge 你想创作什么...（Shift+Enter 换行）')
          }
          style={{
            background: 'none',
            border: 'none',
            outline: 'none',
            resize: 'none',
            color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
            fontSize: 14,
            lineHeight: 1.6,
            width: '100%',
            minHeight: 24,
            maxHeight: 180,
            fontFamily: 'inherit',
            overflowY: 'auto',
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 10,
          }}
        >
          <div style={{ display: 'flex', gap: 4 }}>
            <ToolButton icon={<Paperclip size={15} />} title="上传文本文件" disabled />
            <ToolButton icon={<Mic size={15} />} title="语音输入（即将支持）" disabled />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {input.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>
                {input.length}
              </span>
            )}
            {input.length > 0 && (
              <button
                onClick={() => setInput('')}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: 3,
                  borderRadius: 4,
                  display: 'flex',
                }}
                title="清空输入"
              >
                <X size={13} />
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={!canSend}
              title="发送（Enter）"
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: canSend
                  ? 'linear-gradient(135deg, #8b5cf6, #6366f1)'
                  : 'var(--bg-hover)',
                border: 'none',
                cursor: canSend ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: canSend ? '#fff' : 'var(--text-disabled)',
                transition: 'background 200ms, transform 100ms',
                boxShadow: canSend ? '0 2px 8px rgba(139, 92, 246, 0.4)' : 'none',
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
          color: 'var(--text-disabled)',
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
        color: disabled ? 'var(--text-disabled)' : 'var(--text-muted)',
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
