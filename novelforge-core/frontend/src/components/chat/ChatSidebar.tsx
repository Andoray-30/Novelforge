'use client';
import { useState } from 'react';
import { Plus, MessageSquare, BookOpen, Trash2, ChevronLeft } from 'lucide-react';

// 历史会话条目类型
interface Session {
  id: string;
  title: string;
  preview: string;
  time: string;
}

interface ChatSidebarProps {
  currentSessionId: string;
  sessions: Session[];
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function ChatSidebar({
  currentSessionId,
  sessions,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  collapsed,
  onToggleCollapse,
}: ChatSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <aside
      style={{
        width: collapsed ? '0px' : '256px',
        minWidth: collapsed ? '0px' : '256px',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 300ms ease, min-width 300ms ease',
        overflow: 'hidden',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* 顶部 Logo + 折叠按钮 */}
      <div
        style={{
          padding: '18px 16px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-subtle)',
          gap: 8,
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <BookOpen size={14} color="#fff" />
          </div>
          <span
            style={{
              fontWeight: 600,
              fontSize: 15,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
            }}
          >
            NovelForge
          </span>
        </div>
        <button
          onClick={onToggleCollapse}
          title={collapsed ? '展开' : '收起'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            padding: 4,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* 新建对话按钮 */}
      <div style={{ padding: '12px 12px 8px' }}>
        <button
          onClick={onNewSession}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 12px',
            borderRadius: 8,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 13,
            transition: 'background 150ms, border-color 150ms',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-primary)';
            (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)';
            (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
          }}
        >
          <Plus size={15} />
          <span>新建创作对话</span>
        </button>
      </div>

      {/* 会话标签 */}
      <div
        style={{
          padding: '4px 16px 6px',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-disabled)',
        }}
      >
        历史创作
      </div>

      {/* 会话列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px' }}>
        {sessions.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 12px',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            还没有历史对话
            <br />
            <span style={{ fontSize: 11, opacity: 0.7 }}>开始创作你的第一个故事吧</span>
          </div>
        )}
        {sessions.map(session => {
          const isActive = session.id === currentSessionId;
          const isHovered = hoveredId === session.id;
          return (
            <div
              key={session.id}
              onMouseEnter={() => setHoveredId(session.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSelectSession(session.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 10px',
                borderRadius: 8,
                marginBottom: 2,
                cursor: 'pointer',
                background: isActive
                  ? 'rgba(139, 92, 246, 0.12)'
                  : isHovered
                  ? 'var(--bg-elevated)'
                  : 'transparent',
                border: isActive
                  ? '1px solid rgba(139, 92, 246, 0.3)'
                  : '1px solid transparent',
                transition: 'background 120ms, border-color 120ms',
                position: 'relative',
              }}
            >
              <MessageSquare
                size={14}
                style={{
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {session.title}
                </div>
                {session.preview && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {session.preview}
                  </div>
                )}
              </div>
              {/* 删除按钮（悬停时显示）*/}
              {(isHovered || isActive) && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: 2,
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部版本信息 */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: 11,
          color: 'var(--text-disabled)',
          whiteSpace: 'nowrap',
        }}
      >
        NovelForge v0.5.0
      </div>
    </aside>
  );
}
