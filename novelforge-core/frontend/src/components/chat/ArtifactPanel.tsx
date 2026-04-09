'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Save, Layers, ListChecks, Check, Loader2 } from 'lucide-react';

type ArtifactType = 'character_card' | 'world_setting' | 'timeline' | 'relationship' | 'outline' | 'chapter';

interface ArtifactData {
  type: ArtifactType;
  title: string;
  data: Record<string, any>;
  toolCall?: any;
}

interface ArtifactPanelProps {
  /** 当前选中的资产列表（支持多个并行产出） */
  artifacts: ArtifactData[];
  onClose: () => void;
  visible: boolean;
  /** 保存单个资产 */
  onSaveToProject?: (artifact: ArtifactData, updatedData: Record<string, any>) => void;
  /** 批量保存所有资产 */
  onSaveAll?: (dataList: Array<{ artifact: ArtifactData, data: Record<string, any> }>) => void;
}

const ICON_MAP: Record<ArtifactType, string> = {
  character_card: '👤',
  world_setting: '🌍',
  timeline: '📅',
  relationship: '🔗',
  outline: '📋',
  chapter: '📝',
};

const LABEL_MAP: Record<ArtifactType, string> = {
  character_card: '角色设定',
  world_setting: '世界观',
  timeline: '时间线',
  relationship: '关联',
  outline: '大纲',
  chapter: '正文章节',
};

// ============================================================
// 主面板
// ============================================================
export function ArtifactPanel({ artifacts, onClose, visible, onSaveToProject, onSaveAll }: ArtifactPanelProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  // 为每个资产维护一个独立的本地编辑状态
  const [localDataList, setLocalDataList] = useState<Record<string, any>[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  // 初始化本地数据：当外部 artifacts 改变时，如果是新的 AI 回复，则重置本地列表
  useEffect(() => {
    if (artifacts.length > 0) {
      // 深度拷贝以防污染
      setLocalDataList(artifacts.map(a => JSON.parse(JSON.stringify(a.data))));
      // 重置到第一个标签
      setActiveIndex(0);
    } else {
      setLocalDataList([]);
    }
  }, [artifacts]);

  // 全局事件监听：ESC 关闭
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [visible, onClose]);

  // 安全获取当前选中的资产
  const currentArtifact = artifacts[activeIndex] || artifacts[0];
  const currentLocalData = localDataList[activeIndex] || (localDataList.length > 0 ? localDataList[0] : {});

  const handleFieldChange = (key: string, value: any) => {
    const targetIdx = artifacts[activeIndex] ? activeIndex : 0;
    const nextList = [...localDataList];
    if (nextList[targetIdx]) {
        nextList[targetIdx] = { ...nextList[targetIdx], [key]: value };
        setLocalDataList(nextList);
    }
  };

  const handleSaveCurrent = async () => {
    if (!onSaveToProject || isSaving || !currentArtifact) return;
    setIsSaving(true);
    try {
      await onSaveToProject(currentArtifact, currentLocalData);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAll = async () => {
    if (!onSaveAll || isSaving || artifacts.length === 0) return;
    setIsSaving(true);
    try {
      const payload = artifacts.map((a, i) => ({ artifact: a, data: localDataList[i] }));
      await onSaveAll(payload);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <aside
      ref={panelRef}
      style={{
        width: visible ? '640px' : '0px',
        minWidth: visible ? '640px' : '0px',
        transition: 'all 350ms cubic-bezier(0.4, 0, 0.2, 1)',
        background: 'var(--bg-surface)',
        borderLeft: visible ? '1px solid var(--border-subtle)' : 'none',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 50,
        boxShadow: visible ? '-20px 0 50px rgba(0,0,0,0.3)' : 'none',
      }}
    >
      {artifacts.length > 0 && visible && (
        <>
          {/* 顶部：资产库 Tabs */}
          <div style={{ 
            display: 'flex', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)',
            padding: '12px 12px 0 12px', gap: 4, overflowX: 'auto', scrollbarWidth: 'none',
            flexShrink: 0
          }}>
            {artifacts.map((art, idx) => (
              <button
                key={idx}
                onClick={() => setActiveIndex(idx)}
                style={{
                  padding: '10px 16px', borderRadius: '12px 12px 0 0', display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 13, fontWeight: activeIndex === idx ? 700 : 500, cursor: 'pointer',
                  background: activeIndex === idx ? 'var(--bg-surface)' : 'transparent',
                  color: activeIndex === idx ? 'var(--accent-primary)' : 'var(--text-muted)',
                  border: 'none', borderBottom: activeIndex === idx ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  transition: 'all 0.2s', whiteSpace: 'nowrap'
                }}
              >
                <span>{ICON_MAP[art.type]}</span>
                {art.title}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button onClick={onClose} style={{ alignSelf: 'center', marginBottom: 8, padding: 6, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
               <X size={18} />
            </button>
          </div>

          {/* 资产详情头部 */}
          <div style={{ padding: '24px 24px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {LABEL_MAP[currentArtifact.type]}
                </span>
                <span style={{ color: 'var(--border-strong)', fontSize: 10 }}>●</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>并行创作模式</span>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{currentArtifact.title}</h2>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(currentLocalData, null, 2));
                    setIsCopied(true);
                    setTimeout(() => setIsCopied(false), 2000);
                  }}
                  style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  {isCopied ? <Check size={18} color="#10b981" /> : <Layers size={18} />}
                </button>
            </div>
          </div>

          {/* 编辑表单 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 40px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {Object.entries(currentLocalData).map(([key, value]) => (
                <EditableField
                  key={`${activeIndex}-${key}`}
                  label={key}
                  value={value}
                  onChange={(val) => handleFieldChange(key, val)}
                />
              ))}
            </div>
          </div>

          {/* 底部：动作栏 */}
          <div style={{ 
            padding: '20px 24px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
            display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0
          }}>
            <button
               onClick={handleSaveCurrent}
               disabled={isSaving}
               style={{
                 flex: 1, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.05)',
                 border: '1px solid var(--border-subtle)', color: 'var(--text-primary)',
                 fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
               }}
            >
              <Save size={18} />
              同步当前项
            </button>
            
            <button
              onClick={handleSaveAll}
              disabled={isSaving}
              style={{
                flex: 1.5, height: 48, borderRadius: 14,
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                border: 'none', boxShadow: '0 8px 16px -4px rgba(99, 102, 241, 0.4)', transition: 'transform 0.2s'
              }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              {isSaving ? <Loader2 size={18} className="spin" /> : <ListChecks size={20} />}
              同步全部资产 ({artifacts.length})
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

// -----------------------------------------------------
// 内部组件：可编辑字段
// -----------------------------------------------------
function EditableField({ label, value, onChange }: { label: string; value: any; onChange: (val: any) => void }) {
  if (label.startsWith('__')) return null;

  const isLongText = (typeof value === 'string' && value.length > 60) || label === 'content' || label === 'description' || label === 'background';
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      
      {Array.isArray(value) ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {value.map((v, i) => (
            <input 
              key={i} 
              value={String(v)} 
              onChange={e => {
                const next = [...value];
                next[i] = e.target.value;
                onChange(next);
              }}
              style={{ ...inputStyle, width: 'auto', minWidth: '120px' }}
            />
          ))}
          <button onClick={() => onChange([...value, ''])} style={{ padding: '6px 12px', borderRadius: 8, border: '1px dashed var(--border-subtle)', background: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>+ Add Item</button>
        </div>
      ) : isLongText ? (
        <textarea
          value={String(value || '')}
          onChange={e => onChange(e.target.value)}
          rows={Math.max(3, Math.min(10, String(value || '').split('\n').length))}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, minHeight: 80 }}
        />
      ) : (
        <input
          value={String(value || '')}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
        />
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
  transition: 'all 0.2s',
};
