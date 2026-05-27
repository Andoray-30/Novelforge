'use client';

import { useState } from 'react';
import { Plus, MessageSquare, BookOpen, Trash2, ChevronLeft } from 'lucide-react';

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
  onDeleteSession: (id: string) => void | Promise<void>;
  onCleanupEmptySessions?: () => void | Promise<void>;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function ChatSidebar({
  currentSessionId,
  sessions,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  onCleanupEmptySessions,
  collapsed,
  onToggleCollapse,
}: ChatSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isCleaningEmpty, setIsCleaningEmpty] = useState(false);
  const visibleSessions = sessions.filter((session) => session.id === currentSessionId || session.preview.trim().length > 0);
  const hiddenNoMessageCount = Math.max(0, sessions.length - visibleSessions.length);

  const handleCleanupEmpty = async () => {
    if (!onCleanupEmptySessions || isCleaningEmpty) return;
    const confirmed = window.confirm('只会删除没有消息、没有内容资产的空项目。继续吗？');
    if (!confirmed) return;
    setIsCleaningEmpty(true);
    try {
      await onCleanupEmptySessions();
    } catch (error) {
      console.error('Failed to clean empty conversations:', error);
    } finally {
      setIsCleaningEmpty(false);
    }
  };

  return (
    <aside
      style={{
        width: collapsed ? '56px' : '224px',
        minWidth: collapsed ? '56px' : '224px',
        height: '100%',
        maxHeight: '100%',
        minHeight: 0,
        background: 'var(--nf-bg-subtle)',
        borderRight: '1px solid var(--nf-border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 300ms ease, min-width 300ms ease',
        overflow: 'hidden',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <div
        style={{
          padding: collapsed ? '16px 0 10px' : '16px 14px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          borderBottom: '1px solid var(--nf-border)',
          whiteSpace: 'nowrap',
        }}
      >
        {!collapsed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'var(--nf-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <BookOpen size={14} color="#fff" />
            </div>
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--nf-text)' }}>NovelForge</span>
          </div>
        ) : null}
        <button
          onClick={onToggleCollapse}
          title={collapsed ? '展开侧栏' : '收起侧栏'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--nf-text-muted)',
            padding: 8,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            transform: collapsed ? 'rotate(180deg)' : 'none',
            transition: 'transform 300ms ease',
          }}
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      <div style={{ padding: collapsed ? '10px 0 8px' : '10px 10px 8px', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={onNewSession}
          title="新建创作项目"
          className="nf-button"
          style={{
            width: collapsed ? '36px' : '100%',
            height: '36px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '0' : '0 12px',
          }}
        >
          <Plus size={15} />
          {!collapsed ? <span>新建创作项目</span> : null}
        </button>
      </div>

      {!collapsed ? (
        <div style={{ padding: '4px 12px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--nf-text-subtle)' }}>
            历史项目
          </span>
          {onCleanupEmptySessions && sessions.length > 0 ? (
            <button
              type="button"
              onClick={handleCleanupEmpty}
              disabled={isCleaningEmpty}
              title="清理没有消息和内容资产的空项目"
              className="nf-button"
              style={{ minHeight: 28, padding: '4px 7px', fontSize: 11 }}
            >
              <Trash2 size={11} />
              {isCleaningEmpty ? '清理中' : '清理空项目'}
            </button>
          ) : null}
        </div>
      ) : null}

      <div style={{ flex: 1, overflowY: 'auto', padding: collapsed ? '0' : '0 5px', display: 'flex', flexDirection: 'column', alignItems: collapsed ? 'center' : 'stretch' }}>
        {!collapsed && sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 12px', color: 'var(--nf-text-muted)', fontSize: 13 }}>
            还没有历史项目<br /><span style={{ fontSize: 11, opacity: 0.7 }}>开始创作你的第一个故事吧</span>
          </div>
        ) : null}
        {visibleSessions.map((session) => {
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
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 8,
                padding: collapsed ? '0' : '8px 9px',
                width: collapsed ? '36px' : 'auto',
                height: collapsed ? '36px' : 'auto',
                borderRadius: 8,
                marginBottom: 8,
                cursor: 'pointer',
                background: isActive ? 'var(--nf-accent-soft)' : (isHovered ? 'var(--nf-panel-soft)' : 'transparent'),
                border: isActive ? '1px solid color-mix(in srgb, var(--nf-accent) 30%, transparent)' : '1px solid transparent',
                transition: 'background 120ms, border-color 120ms',
                position: 'relative',
              }}
            >
              <MessageSquare size={14} style={{ color: isActive ? 'var(--nf-accent)' : 'var(--nf-text-muted)', flexShrink: 0 }} />

              {!collapsed ? (
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: isActive ? 'var(--nf-text)' : 'var(--nf-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {session.title}
                  </div>
                  {session.preview ? (
                    <div style={{ fontSize: 11, color: 'var(--nf-text-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {session.preview}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {!collapsed && (isHovered || isActive) ? (
                <button
                  onClick={async (event) => {
                    event.stopPropagation();
                    if (deletingId) return;
                    setDeletingId(session.id);
                    try {
                      await onDeleteSession(session.id);
                    } catch (error) {
                      console.error('Failed to delete conversation:', error);
                    } finally {
                      setDeletingId(null);
                    }
                  }}
                  title="删除项目"
                  disabled={deletingId === session.id}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: deletingId ? 'wait' : 'pointer',
                    color: 'var(--nf-text-muted)',
                    padding: 2,
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                    opacity: deletingId === session.id ? 0.45 : 1,
                  }}
                >
                  <Trash2 size={12} />
                </button>
              ) : null}
            </div>
          );
        })}
        {!collapsed && hiddenNoMessageCount > 0 ? (
          <div style={{ padding: '10px 12px 18px', color: 'var(--nf-text-subtle)', fontSize: 11, lineHeight: 1.5 }}>
            已隐藏 {hiddenNoMessageCount} 个无聊天记录的导入项目，可在顶部项目选择器中切换有资产项目。
          </div>
        ) : null}
      </div>

      {!collapsed ? (
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--nf-border)', fontSize: 11, color: 'var(--nf-text-subtle)', whiteSpace: 'nowrap' }}>
          NovelForge v0.5.0
        </div>
      ) : null}
    </aside>
  );
}
