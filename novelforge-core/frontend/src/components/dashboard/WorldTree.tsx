'use client';

import React, { useMemo, useState } from 'react';
import { Activity, FileText, GitBranch, Globe, Move, RefreshCw, Share2, Trash2, User, Zap, ZoomIn, ZoomOut } from 'lucide-react';

export interface TreeNode {
  id: string;
  label: string;
  type: string;
  importance: string;
  metadata: Record<string, unknown>;
  x?: number;
  y?: number;
}

interface TreeEdge {
  source: string;
  target: string;
  type: string;
  label: string;
}

interface WorldTreeProps {
  sessionId: string;
  topology: {
    nodes: TreeNode[];
    edges: TreeEdge[];
  };
  onNodeClick: (node: TreeNode) => void;
  onNodeDelete?: (nodeId: string) => void;
}

const MAX_NODES = 180;

function isVirtualNode(node: TreeNode) {
  return node.id.includes('::world_fact::') || node.type.startsWith('world_');
}

function getTypeIcon(type: string) {
  if (type === 'character') return <User size={16} />;
  if (type === 'world' || type.startsWith('world_')) return <Globe size={16} />;
  if (type === 'chapter') return <FileText size={16} />;
  if (type === 'novel' || type === 'outline') return <GitBranch size={16} />;
  return <Zap size={16} />;
}

function getTypeColor(type: string) {
  if (type === 'character') return '#3b82f6';
  if (type === 'world' || type.startsWith('world_')) return '#10b981';
  if (type === 'chapter') return '#f59e0b';
  if (type === 'novel' || type === 'outline') return '#8b5cf6';
  if (type === 'relationship') return '#ec4899';
  if (type === 'timeline') return '#14b8a6';
  return '#6b7280';
}

function getTypeLabel(type: string) {
  const labels: Record<string, string> = {
    novel: '小说',
    outline: '大纲',
    chapter: '章节',
    character: '角色',
    world: '世界观',
    relationship: '关系',
    timeline: '时间线',
    world_location: '地点',
    world_rule: '规则',
    world_culture: '文化',
    world_organization: '组织',
    world_history: '历史',
    world_theme: '主题',
    world_concept: '概念',
  };
  return labels[type] || type;
}

function getLayer(type: string) {
  if (type === 'novel') return 0;
  if (type === 'world') return 1;
  if (type.startsWith('world_')) return 2;
  if (type === 'chapter' || type === 'timeline') return 3;
  if (type === 'character' || type === 'relationship') return 4;
  return 2;
}

function edgeStyle(type: string) {
  if (type === 'relationship') return { stroke: '#3b82f6', strokeWidth: 2, dash: '5,5' };
  if (type === 'world_fact') return { stroke: '#10b981', strokeWidth: 2, dash: 'none' };
  if (type === 'timeline') return { stroke: '#14b8a6', strokeWidth: 2, dash: 'none' };
  return { stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1.5, dash: 'none' };
}

function layoutNodes(nodes: TreeNode[]) {
  const visible = [...nodes]
    .sort((a, b) => getLayer(a.type) - getLayer(b.type))
    .slice(0, MAX_NODES);
  const groups = new Map<number, TreeNode[]>();
  visible.forEach((node) => {
    const layer = getLayer(node.type);
    groups.set(layer, [...(groups.get(layer) ?? []), node]);
  });

  const laidOut: TreeNode[] = [];
  groups.forEach((group, layer) => {
    const totalHeight = (group.length - 1) * 116;
    group.forEach((node, index) => {
      laidOut.push({
        ...node,
        x: layer * 292 + 116,
        y: index * 116 - totalHeight / 2 + 380,
      });
    });
  });
  return laidOut;
}

export const WorldTree: React.FC<WorldTreeProps> = ({ topology, onNodeClick, onNodeDelete }) => {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.82 });
  const [panStart, setPanStart] = useState<{ x: number; y: number; originX: number; originY: number } | null>(null);

  const localNodes = useMemo(() => layoutNodes(topology.nodes), [topology.nodes]);
  const nodeMap = useMemo(() => new Map(localNodes.map((node) => [node.id, node])), [localNodes]);
  const paths = useMemo(() => topology.edges
    .map((edge) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target || source.x === undefined || source.y === undefined || target.x === undefined || target.y === undefined) {
        return null;
      }
      const dx = Math.abs(target.x - source.x);
      const cp1x = source.x + dx * 0.5;
      const cp2x = target.x - dx * 0.5;
      return {
        id: `${edge.source}-${edge.target}-${edge.type}`,
        d: `M ${source.x + 200} ${source.y + 44} C ${cp1x + 90} ${source.y + 44}, ${cp2x} ${target.y + 44}, ${target.x} ${target.y + 44}`,
        type: edge.type,
      };
    })
    .filter((path): path is { id: string; d: string; type: string } => path !== null), [nodeMap, topology.edges]);

  const setScale = (nextScale: number) => {
    setTransform((current) => ({ ...current, scale: Math.min(Math.max(nextScale, 0.25), 2.5) }));
  };

  return (
    <div
      className="relative h-[750px] w-full overflow-hidden rounded-3xl border border-white/10 bg-slate-950 text-slate-100 select-none"
      onWheel={(event) => setScale(transform.scale * (event.deltaY > 0 ? 0.9 : 1.1))}
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        setPanStart({ x: event.clientX, y: event.clientY, originX: transform.x, originY: transform.y });
      }}
      onMouseMove={(event) => {
        if (!panStart) return;
        setTransform((current) => ({
          ...current,
          x: panStart.originX + event.clientX - panStart.x,
          y: panStart.originY + event.clientY - panStart.y,
        }));
      }}
      onMouseUp={() => setPanStart(null)}
      onMouseLeave={() => setPanStart(null)}
    >
      <div className="absolute left-5 top-5 z-50 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-800/85 px-4 py-2 text-sm backdrop-blur">
          <Activity size={16} className="text-blue-400" />
          <span><b>{topology.nodes.length}</b> 节点</span>
          <span className="h-4 w-px bg-white/10" />
          <Share2 size={16} className="text-emerald-400" />
          <span><b>{topology.edges.length}</b> 连线</span>
          <button
            type="button"
            onClick={() => setScale(transform.scale * 1.15)}
            className="ml-2 rounded-lg bg-white/5 p-1.5 text-slate-200 hover:bg-white/10"
            title="放大"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            onClick={() => setScale(transform.scale * 0.85)}
            className="rounded-lg bg-white/5 p-1.5 text-slate-200 hover:bg-white/10"
            title="缩小"
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            onClick={() => setTransform({ x: 0, y: 0, scale: 0.82 })}
            className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10"
            title="复位视图"
          >
            <RefreshCw size={14} />
            复位
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Move size={13} />
          拖动画布移动，滚轮缩放，点击节点查看详情
        </div>
      </div>

      <div className="absolute bottom-5 right-5 z-50 flex flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs text-slate-200 backdrop-blur">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">图例</div>
        <span className="inline-flex items-center gap-2"><i className="h-0.5 w-6 bg-white/30" /> 层级 / 包含</span>
        <span className="inline-flex items-center gap-2"><i className="h-0.5 w-6 border-t-2 border-dashed border-blue-500" /> 角色关系</span>
        <span className="inline-flex items-center gap-2"><i className="h-0.5 w-6 bg-emerald-500" /> 世界观事实</span>
      </div>

      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
        }}
      >
        <svg className="absolute left-0 top-0 z-0 h-[5000px] w-[5000px] overflow-visible pointer-events-none">
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orientation="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="rgba(255,255,255,0.25)" />
            </marker>
          </defs>
          {paths.map((path) => {
            const style = edgeStyle(path.type);
            return (
              <path
                key={path.id}
                d={path.d}
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                strokeDasharray={style.dash === 'none' ? undefined : style.dash}
                fill="none"
                markerEnd="url(#arrowhead)"
                opacity={0.72}
              />
            );
          })}
        </svg>

        <div className="relative z-10">
          {localNodes.map((node) => {
            const virtual = isVirtualNode(node);
            return (
              <button
                key={node.id}
                type="button"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => onNodeClick(node)}
                className="absolute w-[200px] rounded-2xl border bg-slate-800/95 p-4 text-left shadow-xl shadow-black/30 transition hover:-translate-y-1 hover:bg-slate-800"
                style={{
                  left: node.x,
                  top: node.y,
                  borderColor: `${getTypeColor(node.type)}66`,
                  borderLeftWidth: 4,
                  borderLeftColor: getTypeColor(node.type),
                  cursor: 'pointer',
                }}
              >
                {onNodeDelete && !virtual && node.type !== 'novel' && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (confirm('确定要删除这个节点吗？此操作不可撤销。')) onNodeDelete(node.id);
                    }}
                    className="absolute right-2 top-2 rounded bg-red-500/10 p-1 text-red-400 hover:bg-red-500/20"
                    title="删除节点"
                  >
                    <Trash2 size={12} />
                  </span>
                )}
                <span className="mb-2 flex items-center gap-2">
                  <span className="rounded-md p-1" style={{ color: getTypeColor(node.type), background: `${getTypeColor(node.type)}22` }}>
                    {getTypeIcon(node.type)}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{getTypeLabel(node.type)}</span>
                </span>
                <span className="block pr-4 text-sm font-semibold leading-snug text-slate-100">{node.label}</span>
                <span className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="rounded bg-white/5 px-1.5 py-0.5">{node.importance.toUpperCase()}</span>
                  <span>·</span>
                  <span>{virtual ? '派生节点' : node.metadata?.status === 'draft' ? '草稿' : '已保存'}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
