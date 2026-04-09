'use client';

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { 
  GitBranch, User, Globe, FileText, Zap, 
  ChevronRight, Share2, Info, Activity,
  Maximize, Minimize, RefreshCw, Move, Trash2
} from 'lucide-react';

interface TreeNode {
  id: string;
  label: string;
  type: string;
  importance: string;
  metadata: any;
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

export const WorldTree: React.FC<WorldTreeProps> = ({ sessionId, topology, onNodeClick, onNodeDelete }) => {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.8 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  
  const [localNodes, setLocalNodes] = useState<TreeNode[]>([]);
  
  const dragStart = useRef({ x: 0, y: 0 });
  const nodeDragStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  const MAX_NODES = 150;
  
  // 初始化或更新节点位置
  useEffect(() => {
    const { nodes } = topology;
    if (nodes.length === 0) {
      setLocalNodes([]);
      return;
    }
    
    let processedNodes = nodes;
    if (nodes.length > MAX_NODES) {
      processedNodes = nodes
        .sort((a, b) => {
          const importanceOrder = { 'high': 3, 'medium': 2, 'low': 1 };
          return (importanceOrder[b.importance as keyof typeof importanceOrder] || 0) - 
                 (importanceOrder[a.importance as keyof typeof importanceOrder] || 0);
        })
        .slice(0, MAX_NODES);
    }

    const layers: Record<string, number> = {
      'world': 0,
      'novel': 0,
      'outline': 1,
      'chapter': 2,
      'scene': 3,
      'timeline': 3,
      'character': 4,
      'relationship': 4
    };

    const layerGroups: Record<number, TreeNode[]> = {};
    processedNodes.forEach(node => {
      const layer = layers[node.type] ?? 2;
      if (!layerGroups[layer]) layerGroups[layer] = [];
      layerGroups[layer].push({ ...node });
    });

    const finalNodes: TreeNode[] = [];
    const layerSpacing = 320;
    const nodeSpacing = 140;

    Object.keys(layerGroups).forEach(layerStr => {
      const layer = parseInt(layerStr);
      const group = layerGroups[layer];
      const totalHeight = (group.length - 1) * nodeSpacing;
      
      group.forEach((node, idx) => {
        // 如果原本没有 x,y，赋予计算的初始值
        const x = layer * layerSpacing + 150;
        const y = idx * nodeSpacing - (totalHeight / 2) + 400;
        finalNodes.push({ ...node, x, y });
      });
    });

    // 只同步新增的节点或完全重置，保持拖拽后的位置
    setLocalNodes(prev => {
      const prevMap = new Map(prev.map(p => [p.id, p]));
      return finalNodes.map(n => {
        if (prevMap.has(n.id)) {
          return { ...n, x: prevMap.get(n.id)!.x, y: prevMap.get(n.id)!.y };
        }
        return n;
      });
    });
  }, [topology]);

  const paths = useMemo(() => {
    const nodeMap = new Map(localNodes.map(n => [n.id, n]));
    return topology.edges.map(edge => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (source && target && source.x !== undefined && source.y !== undefined && target.x !== undefined && target.y !== undefined) {
        const dx = Math.abs(target.x - source.x);
        const cp1x = source.x + dx * 0.5;
        const cp2x = target.x - dx * 0.5;
        
        return {
          id: `${edge.source}-${edge.target}`,
          d: `M ${source.x + 200} ${source.y + 45} C ${cp1x + 100} ${source.y + 45}, ${cp2x} ${target.y + 45}, ${target.x} ${target.y + 45}`,
          type: edge.type
        };
      }
      return null;
    }).filter(Boolean);
  }, [localNodes, topology.edges]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) {
      setIsDraggingCanvas(true);
      dragStart.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
      e.preventDefault();
    }
  }, [transform]);

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (e.button === 0) {
      e.stopPropagation();
      setDraggingNodeId(nodeId);
      nodeDragStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggingNodeId) {
      const dx = (e.clientX - nodeDragStart.current.x) / transform.scale;
      const dy = (e.clientY - nodeDragStart.current.y) / transform.scale;
      
      setLocalNodes(prev => prev.map(n => 
        n.id === draggingNodeId 
          ? { ...n, x: (n.x || 0) + dx, y: (n.y || 0) + dy } 
          : n
      ));
      
      nodeDragStart.current = { x: e.clientX, y: e.clientY };
    } else if (isDraggingCanvas) {
      setTransform(prev => ({
        ...prev,
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      }));
    }
  }, [draggingNodeId, isDraggingCanvas, transform.scale]);

  const handleMouseUp = useCallback(() => {
    setIsDraggingCanvas(false);
    setDraggingNodeId(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(prev => {
      const newScale = Math.min(Math.max(prev.scale * delta, 0.2), 3);
      return { ...prev, scale: newScale };
    });
  }, []);

  const resetView = () => {
    setTransform({ x: 0, y: 0, scale: 0.8 });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'character': return <User size={16} />;
      case 'world': return <Globe size={16} />;
      case 'chapter': return <FileText size={16} />;
      case 'novel':
      case 'outline': return <GitBranch size={16} />;
      default: return <Zap size={16} />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'character': return '#3b82f6';
      case 'world': return '#10b981';
      case 'chapter': return '#f59e0b';
      case 'novel':
      case 'outline': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  const getEdgeStyle = (type: string) => {
    switch (type) {
      case 'hierarchy': return { stroke: 'rgba(255,255,255,0.2)', strokeWidth: 2, dash: 'none' };
      case 'relationship': return { stroke: '#3b82f6', strokeWidth: 2, dash: '5,5' };
      case 'timeline': return { stroke: '#10b981', strokeWidth: 2, dash: 'none' };
      default: return { stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, dash: 'none' };
    }
  };

  return (
    <div 
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
      style={{ 
        width: '100%', 
        height: '750px', 
        background: '#0f172a', // 深色背景更适合可视化
        borderRadius: '24px',
        border: '1px solid rgba(255,255,255,0.1)',
        position: 'relative',
        overflow: 'hidden',
        cursor: isDraggingCanvas ? 'grabbing' : 'grab',
        userSelect: 'none'
      }}
    >
      {/* 顶部控制栏 */}
      <div style={{ 
        position: 'absolute', 
        top: 20, 
        left: 20, 
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(30, 41, 59, 0.8)', padding: '8px 16px', borderRadius: 12, fontSize: 13, border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', color: '#f8fafc' }}>
            <Activity size={16} color="#3b82f6" /> 
            <span><b>{topology.nodes.length}</b> 节点</span>
            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
            <Share2 size={16} color="#10b981" />
            <span><b>{topology.edges.length}</b> 连线</span>
          </div>
          
          <button 
            onClick={resetView}
            style={{ padding: '8px', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            title="复位视图"
          >
            <RefreshCw size={16} />
            <span style={{ fontSize: 12 }}>复位</span>
          </button>
        </div>

        {/* 交互提示 */}
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Move size={12} /> 右键平移 · 滚轮缩放
        </div>
      </div>

      {/* 侧边图例 */}
      <div style={{ 
        position: 'absolute', 
        bottom: 20, 
        right: 20, 
        zIndex: 50,
        background: 'rgba(15, 23, 42, 0.8)', 
        padding: '12px', 
        borderRadius: 16, 
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', marginBottom: 4, textTransform: 'uppercase' }}>关系图例</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#e2e8f0' }}>
          <div style={{ width: 24, height: 2, background: 'rgba(255,255,255,0.2)' }} />
          <span>层级/包含</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#e2e8f0' }}>
          <div style={{ width: 24, height: 2, borderTop: '2px dashed #3b82f6' }} />
          <span>角色关系</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#e2e8f0' }}>
          <div style={{ width: 24, height: 2, background: '#10b981' }} />
          <span>剧情脉络</span>
        </div>
      </div>

      {/* 画布主体 */}
      <div style={{
        width: '100%',
        height: '100%',
        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        transformOrigin: '0 0',
        transition: isDraggingCanvas ? 'none' : 'transform 0.1s ease-out'
      }}>
        {/* 连线层 - 放在最底层 */}
        <svg style={{
          position: 'absolute',
          width: '5000px',
          height: '5000px',
          pointerEvents: 'none',
          overflow: 'visible',
          zIndex: 1
        }}>
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orientation="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="rgba(255,255,255,0.2)" />
            </marker>
          </defs>
          {paths.map((path: any) => {
            const style = getEdgeStyle(path.type);
            return (
              <path
                key={path.id}
                d={path.d}
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                strokeDasharray={style.dash === 'none' ? undefined : style.dash}
                fill="none"
                markerEnd="url(#arrowhead)"
                style={{ opacity: 0.6 }}
              />
            );
          })}
        </svg>

        {/* 节点层 - 确保在连线上方 */}
        <div style={{ position: 'relative', zIndex: 20 }}>
          {localNodes.map(node => (
            <div
              key={node.id}
              onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
              onClick={(e) => {
                e.stopPropagation();
                if (!draggingNodeId) onNodeClick(node);
              }}
              style={{
                position: 'absolute',
                left: node.x,
                top: node.y,
                width: '200px',
                padding: '16px',
                background: 'rgba(30, 41, 59, 0.95)',
                border: `1px solid ${getTypeColor(node.type)}44`,
                borderLeft: `4px solid ${getTypeColor(node.type)}`,
                borderRadius: '16px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
                cursor: draggingNodeId === node.id ? 'grabbing' : 'pointer',
                zIndex: draggingNodeId === node.id ? 30 : 20,
                transition: draggingNodeId === node.id ? 'none' : 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                backdropFilter: 'blur(4px)'
              }}
              onMouseOver={(e) => {
                if (draggingNodeId) return;
                e.currentTarget.style.transform = 'translateY(-4px) scale(1.05)';
                e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.4)';
                e.currentTarget.style.background = 'rgba(30, 41, 59, 1)';
              }}
              onMouseOut={(e) => {
                if (draggingNodeId) return;
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.3)';
                e.currentTarget.style.background = 'rgba(30, 41, 59, 0.95)';
              }}
            >
              {/* 删除按钮 */}
              {onNodeDelete && node.type !== 'novel' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('确定要删除该节点吗？此操作将不可逆。')) {
                      onNodeDelete(node.id);
                      setLocalNodes(prev => prev.filter(n => n.id !== node.id));
                    }
                  }}
                  style={{
                    position: 'absolute', top: 8, right: 8, background: 'rgba(239, 68, 68, 0.1)',
                    border: 'none', color: '#ef4444', borderRadius: '4px', padding: 4, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                  title="删除节点"
                >
                  <Trash2 size={12} />
                </button>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ 
                  color: getTypeColor(node.type),
                  background: `${getTypeColor(node.type)}22`,
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'flex'
                }}>
                  {getTypeIcon(node.type)}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {node.type}
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc', marginBottom: 6, lineHeight: 1.4, paddingRight: 16 }}>
                {node.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                <span style={{ 
                  padding: '1px 6px', 
                  borderRadius: '4px', 
                  background: 'rgba(255,255,255,0.05)',
                  color: node.importance === 'high' ? '#f43f5e' : 'inherit'
                }}>
                  {node.importance.toUpperCase()}
                </span>
                <span>·</span>
                <span>{node.metadata?.status === 'draft' ? '草稿' : '发布'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
