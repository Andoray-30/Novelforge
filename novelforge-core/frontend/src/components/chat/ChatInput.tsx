'use client';
import { useRef, useState, useEffect } from 'react';
import { ArrowUp, Paperclip, Mic, X, Sparkles } from 'lucide-react';

const PROMPT_SUGGESTIONS = [
  '帮我设计一个反派角色，背景是唐朝，性格复杂且有魅力',
  '我的故事需要一个神秘的世界观设定，想要有东方神话元素',
  '分析一下我上传的这段文本，提取出所有登场角色',
  '帮我规划一条从序章到结局的完整时间线',
  '设计主角和反派之间的关系网络',
];

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled = false, placeholder }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动调整高度
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
  }, [input]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const canSend = input.trim().length > 0 && !disabled;

  return (
    <div
      style={{
        padding: '12px 20px 20px',
        background: 'transparent',
        flexShrink: 0,
      }}
    >
      {/* 快捷提示词（仅在输入为空时显示）*/}
      {input.length === 0 && !disabled && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 12,
            overflowX: 'auto',
            paddingBottom: 4,
            msOverflowStyle: 'none',
            scrollbarWidth: 'none' as const,
          }}
        >
          {PROMPT_SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => {
                setInput(s);
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
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-primary)';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
              }}
            >
              {s.length > 24 ? s.slice(0, 24) + '…' : s}
            </button>
          ))}
        </div>
      )}

      {/* 输入框主容器 */}
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
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          rows={1}
          placeholder={
            placeholder ??
            (disabled ? 'Agent 正在思考中...' : '告诉 NovelForge 你想要创作什么... (Shift+Enter 换行)')
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

        {/* 底部工具栏 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 10,
          }}
        >
          {/* 左侧：附件/语音（预留功能）*/}
          <div style={{ display: 'flex', gap: 4 }}>
            <ToolButton icon={<Paperclip size={15} />} title="上传文本文件" disabled />
            <ToolButton icon={<Mic size={15} />} title="语音输入（即将支持）" disabled />
          </div>

          {/* 右侧：字符计数 + 发送按钮 */}
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
              >
                <X size={13} />
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={!canSend}
              title="发送 (Enter)"
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
              onMouseDown={e => {
                if (canSend) (e.currentTarget as HTMLElement).style.transform = 'scale(0.92)';
              }}
              onMouseUp={e => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
              }}
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 底部说明 */}
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
        NovelForge 由 OpenAI 模型驱动，生成结果仅供创作参考
      </div>
    </div>
  );
}

// 工具栏小按钮
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
