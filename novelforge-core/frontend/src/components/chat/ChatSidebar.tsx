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
        width: collapsed ? '60px' : '256px',
        minWidth: collapsed ? '60px' : '256px',
        height: '100%',
        maxHeight: '100%',
        minHeight: 0,
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
          padding: collapsed ? '18px 0 12px' : '18px 16px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          borderBottom: '1px solid var(--border-subtle)',
          whiteSpace: 'nowrap',
        }}
      >
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
            >
              <BookOpen size={14} color="#fff" />
            </div>
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              NovelForge
            </span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          title={collapsed ? '展开' : '收起'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
            padding: 8, borderRadius: 6, display: 'flex', alignItems: 'center',
            transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 300ms ease'
          }}
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* 新建对话按钮 */}
      <div style={{ padding: collapsed ? '12px 0 8px' : '12px 12px 8px', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={onNewSession}
          title="新建创作对话"
          style={{
            width: collapsed ? '36px' : '100%',
            height: '36px',
            display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 8, padding: collapsed ? '0' : '0 12px', borderRadius: 8,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
            transition: 'background 150ms, border-color 150ms', whiteSpace: 'nowrap',
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
          {!collapsed && <span>新建创作对话</span>}
        </button>
      </div>

      {!collapsed && (
        <div style={{ padding: '4px 16px 6px', fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-disabled)' }}>
          历史创作
        </div>
      )}

      {/* 会话列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: collapsed ? '0' : '0 6px', display: 'flex', flexDirection: 'column', alignItems: collapsed ? 'center' : 'stretch' }}>
        {!collapsed && sessions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 12px', color: 'var(--text-muted)', fontSize: 13 }}>
            还没有历史对话<br /><span style={{ fontSize: 11, opacity: 0.7 }}>开始创作你的第一个故事吧</span>
          </div>
        )}
        {sessions.map(session => {
          const isActive = session.id === currentSessionId;
          const isHovered = hoveredId === session.id;
          return (
            <div
              key={session.id}
              title={collapsed ? session.title : undefined}
              onMouseEnter={() => setHoveredId(session.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSelectSession(session.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 8,
                padding: collapsed ? '0' : '9px 10px', width: collapsed ? '36px' : 'auto', height: collapsed ? '36px' : 'auto',
                borderRadius: 8, marginBottom: 8, cursor: 'pointer',
                background: isActive ? 'rgba(139, 92, 246, 0.12)' : (isHovered ? 'var(--bg-elevated)' : 'transparent'),
                border: isActive ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid transparent',
                transition: 'background 120ms, border-color 120ms', position: 'relative',
              }}
            >
              <MessageSquare size={14} style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)', flexShrink: 0 }} />
              
              {!collapsed && (
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {session.title}
                  </div>
                  {session.preview && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {session.preview}
                    </div>
                  )}
                </div>
              )}
              
              {/* 删除按钮 */}
              {!collapsed && (isHovered || isActive) && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                  title="删除对话"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部版本信息 */}
      {!collapsed && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-disabled)', whiteSpace: 'nowrap' }}>
          NovelForge v0.5.0
        </div>
      )}
    </aside>
  );
}
