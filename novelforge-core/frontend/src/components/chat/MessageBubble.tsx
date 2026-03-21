'use client';
import { useRef, useEffect } from 'react';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  // 结构化数据：当 Agent 返回角色卡/世界书等产物时附带
  artifact?: {
    type: 'character_card' | 'world_setting' | 'timeline' | 'relationship' | 'outline';
    title: string;
    data: Record<string, unknown>;
  };
}

interface MessageBubbleProps {
  message: Message;
}

// 简单 Markdown 渲染函数，替代完整 MD 解析库
function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
    .replace(/\n/g, '<br />');
}

// 产物类型图标映射
function getArtifactIcon(type: string): string {
  const icons: Record<string, string> = {
    character_card: '👤',
    world_setting: '🌍',
    timeline: '📅',
    relationship: '🕸️',
    outline: '📖',
  };
  return icons[type] ?? '📄';
}

function getArtifactLabel(type: string): string {
  const labels: Record<string, string> = {
    character_card: '角色卡',
    world_setting: '世界设定',
    timeline: '时间线事件',
    relationship: '关系图谱',
    outline: '故事大纲',
  };
  return labels[type] ?? '产物';
}

// 消息气泡
export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className="message-animate"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 20,
        gap: 8,
      }}
    >
      {/* 角色标签 */}
      {!isUser && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 4,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              color: '#fff',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            N
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-muted)',
              letterSpacing: '0.04em',
            }}
          >
            NovelForge Agent
          </span>
        </div>
      )}

      {/* 气泡主体 */}
      <div
        style={{
          maxWidth: isUser ? '70%' : '85%',
          padding: isUser ? '10px 15px' : '14px 18px',
          borderRadius: isUser ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
          background: isUser
            ? 'linear-gradient(135deg, #8b5cf6, #6366f1)'
            : 'var(--bg-elevated)',
          border: isUser ? 'none' : '1px solid var(--border-subtle)',
          color: isUser ? '#fff' : 'var(--text-secondary)',
          fontSize: 14,
          lineHeight: 1.75,
          boxShadow: isUser ? '0 2px 12px rgba(139, 92, 246, 0.3)' : 'var(--shadow-sm)',
        }}
      >
        {isUser ? (
          <span style={{ color: '#fff' }}>{message.content}</span>
        ) : (
          <div
            className={`prose-dark ${message.isStreaming ? 'typing-cursor' : ''}`}
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(message.content || ''),
            }}
          />
        )}
      </div>

      {/* 附带产物预览条（点击后展开右侧面板，由父组件处理）*/}
      {message.artifact && (
        <div
          data-artifact-id={message.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 10,
            background: 'rgba(139, 92, 246, 0.08)',
            border: '1px solid rgba(139, 92, 246, 0.25)',
            cursor: 'pointer',
            maxWidth: '85%',
            fontSize: 13,
            color: '#c4b5fd',
            transition: 'background 150ms',
          }}
          onMouseEnter={e =>
            ((e.currentTarget as HTMLElement).style.background = 'rgba(139, 92, 246, 0.15)')
          }
          onMouseLeave={e =>
            ((e.currentTarget as HTMLElement).style.background = 'rgba(139, 92, 246, 0.08)')
          }
        >
          <span style={{ fontSize: 16 }}>{getArtifactIcon(message.artifact.type)}</span>
          <div>
            <span style={{ fontWeight: 600 }}>{getArtifactLabel(message.artifact.type)}</span>
            <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
              {message.artifact.title}
            </span>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
            点击预览 →
          </span>
        </div>
      )}

      {/* 时间戳 */}
      <span
        style={{
          fontSize: 11,
          color: 'var(--text-disabled)',
          paddingLeft: isUser ? 0 : 4,
          paddingRight: isUser ? 4 : 0,
        }}
      >
        {message.timestamp.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    </div>
  );
}

// 消息列表（带自动滚动到底部）
interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px clamp(16px, 5%, 80px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
