'use client';
import { useState } from 'react';
import { X, User, Globe, Calendar, Network, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';

type ArtifactType = 'character_card' | 'world_setting' | 'timeline' | 'relationship' | 'outline';

interface ArtifactData {
  type: ArtifactType;
  title: string;
  data: Record<string, unknown>;
}

interface ArtifactPanelProps {
  artifact: ArtifactData | null;
  onClose: () => void;
  visible: boolean;
}

// 图标映射
const ICON_MAP: Record<ArtifactType, React.ReactNode> = {
  character_card: <User size={16} />,
  world_setting: <Globe size={16} />,
  timeline: <Calendar size={16} />,
  relationship: <Network size={16} />,
  outline: <BookOpen size={16} />,
};

const LABEL_MAP: Record<ArtifactType, string> = {
  character_card: '角色卡',
  world_setting: '世界设定',
  timeline: '时间线事件',
  relationship: '关系图谱',
  outline: '故事大纲',
};

// 递归渲染数据字段（高亮展示 JSON 中的每一各字段）
function DataSection({
  label,
  value,
  depth = 0,
}: {
  label: string;
  value: unknown;
  depth?: number;
}) {
  const [open, setOpen] = useState(true);

  // 跳过空值
  if (value === null || value === undefined || value === '') return null;

  // 渲染数组
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return (
      <div style={{ marginBottom: 10 }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '4px 0',
            width: '100%',
            textAlign: 'left',
          }}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {label}
          <span style={{ color: 'var(--text-disabled)', fontWeight: 400 }}>({value.length})</span>
        </button>
        {open && (
          <div style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
            {value.map((item, i) => (
              <div
                key={i}
                style={{
                  padding: '6px 10px',
                  marginBottom: 4,
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                }}
              >
                {typeof item === 'object' ? (
                  Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                    <DataSection key={k} label={k} value={v} depth={depth + 1} />
                  ))
                ) : (
                  String(item)
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 渲染对象
  if (typeof value === 'object') {
    return (
      <div style={{ marginBottom: 10 }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '4px 0',
            width: '100%',
            textAlign: 'left',
          }}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {label}
        </button>
        {open && (
          <div style={{ paddingLeft: 8 }}>
            {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
              <DataSection key={k} label={k} value={v} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 渲染基本类型
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--text-muted)',
          marginBottom: 2,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 6,
          padding: '6px 10px',
          border: '1px solid var(--border-subtle)',
          lineHeight: 1.6,
        }}
      >
        {String(value)}
      </div>
    </div>
  );
}

export function ArtifactPanel({ artifact, onClose, visible }: ArtifactPanelProps) {
  return (
    <div
      style={{
        width: visible ? '360px' : '0px',
        minWidth: visible ? '360px' : '0px',
        transition: 'width 320ms cubic-bezier(0.4, 0, 0.2, 1), min-width 320ms cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        borderLeft: visible ? '1px solid var(--border-subtle)' : 'none',
        height: '100%',
      }}
    >
      {artifact && visible && (
        <>
          {/* 顶部标题栏 */}
          <div
            style={{
              padding: '18px 20px 14px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            {/* 类型图标 */}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(139, 92, 246, 0.15)',
                border: '1px solid rgba(139, 92, 246, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#a78bfa',
                flexShrink: 0,
              }}
            >
              {ICON_MAP[artifact.type]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#a78bfa',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  marginBottom: 2,
                }}
              >
                {LABEL_MAP[artifact.type]}
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {artifact.title}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: 4,
                borderRadius: 6,
                display: 'flex',
                flexShrink: 0,
              }}
            >
              <X size={15} />
            </button>
          </div>

          {/* 数据内容区 */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 20px',
            }}
          >
            {Object.entries(artifact.data).map(([key, value]) => (
              <DataSection key={key} label={key} value={value} />
            ))}
          </div>

          {/* 底部操作 */}
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              gap: 8,
            }}
          >
            <button
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: 8,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)',
                fontSize: 12,
                cursor: 'pointer',
              }}
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(artifact.data, null, 2));
              }}
            >
              复制 JSON
            </button>
            <button
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: 8,
                background: 'rgba(139, 92, 246, 0.12)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                color: '#c4b5fd',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              保存到项目
            </button>
          </div>
        </>
      )}

      {/* 空状态 - 在面板展开但无内容时 */}
      {!artifact && visible && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            textAlign: 'center',
            color: 'var(--text-muted)',
          }}
        >
          <BookOpen size={36} style={{ opacity: 0.3, marginBottom: 16 }} />
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>产物预览区</div>
          <div style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.6 }}>
            当 NovelForge Agent 为你生成角色卡、世界设定或其他创作产物时，
            会在这里以可视化方式展示
          </div>
        </div>
      )}
    </div>
  );
}
