import React, { useEffect, useRef, useState } from 'react';
import { Network, Maximize2, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import type { Character, NetworkEdge } from '@/types';

interface CharacterRelationshipGraphProps {
  characters: Character[];
  relationships?: NetworkEdge[];
  onRelationshipSelect?: (relationship: NetworkEdge) => void;
}

type GraphNode = {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
};

function stableAngle(id: string, index: number, total: number) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return (index / Math.max(total, 1)) * Math.PI * 2 + ((hash % 100) / 100) * 0.35;
}

function nodeRadius(character: Character) {
  if (character.importance === 'critical') return 24;
  if (character.importance === 'high') return 18;
  if (character.importance === 'medium') return 14;
  return 10;
}

function nodeColor(character: Character) {
  if (character.importance === 'critical') return '#e11d48';
  if (character.importance === 'high') return '#f59e0b';
  if (character.importance === 'medium') return '#3b82f6';
  return '#64748b';
}

function distanceToLineSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const CharacterRelationshipGraph: React.FC<CharacterRelationshipGraphProps> = ({
  characters,
  relationships = [],
  onRelationshipSelect,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || characters.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId = 0;
    let width = canvas.clientWidth || 900;
    let height = canvas.clientHeight || 700;
    let mouseX = 0;
    let mouseY = 0;
    let hoverNodeId: string | null = null;
    let hoverEdge: NetworkEdge | null = null;

    const resizeCanvas = (w: number, h: number) => {
      width = Math.max(w, 320);
      height = Math.max(h, 320);
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries.find((item) => item.target === containerRef.current);
      if (entry) resizeCanvas(entry.contentRect.width, entry.contentRect.height);
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
      resizeCanvas(containerRef.current.clientWidth, containerRef.current.clientHeight);
    }

    const nodes: GraphNode[] = characters.map((character, index) => {
      const angle = stableAngle(character.id, index, characters.length);
      const orbit = Math.min(width, height) * (character.importance === 'critical' ? 0.16 : character.importance === 'high' ? 0.24 : 0.32);
      return {
        id: character.id,
        name: character.name,
        x: width / 2 + Math.cos(angle) * orbit,
        y: height / 2 + Math.sin(angle) * orbit,
        vx: 0,
        vy: 0,
        radius: nodeRadius(character),
        color: nodeColor(character),
      };
    });

    const edges: NetworkEdge[] = relationships.length > 0
      ? relationships
      : characters.flatMap((character) =>
          (character.relationships || [])
            .map((relationship): NetworkEdge | null => {
              const target = characters.find((candidate) => candidate.name === relationship.target_name);
              return target
                ? {
                    source: character.id,
                    target: target.id,
                    relationship_type: 'other' as const,
                    description: relationship.description,
                    strength: 5,
                    status: 'active' as const,
                    evidence: relationship.description ? [relationship.description] : [],
                  }
                : null;
            })
            .filter((edge): edge is NetworkEdge => edge !== null),
        );

    const findHoveredEdge = () => {
      let closestEdge: NetworkEdge | null = null;
      let closestDistance = 14;
      for (const edge of edges) {
        const source = nodes.find((node) => node.id === edge.source);
        const target = nodes.find((node) => node.id === edge.target);
        if (!source || !target) continue;
        const distance = distanceToLineSegment(mouseX, mouseY, source.x, source.y, target.x, target.y);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestEdge = edge;
        }
      }
      return closestEdge;
    };

    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = event.clientX - rect.left;
      mouseY = event.clientY - rect.top;
    };

    const handleCanvasClick = () => {
      if (hoverEdge && onRelationshipSelect) onRelationshipSelect(hoverEdge);
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleCanvasClick);

    const simulate = () => {
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const distSq = dx * dx + dy * dy + 1e-6;
          const dist = Math.sqrt(distSq);
          const force = 1500 / distSq;
          nodes[i].vx += (dx / dist) * force;
          nodes[i].vy += (dy / dist) * force;
          nodes[j].vx -= (dx / dist) * force;
          nodes[j].vy -= (dy / dist) * force;
        }
      }

      edges.forEach((edge) => {
        const source = nodes.find((node) => node.id === edge.source);
        const target = nodes.find((node) => node.id === edge.target);
        if (!source || !target) return;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const springForce = (dist - 150) * 0.01;
        source.vx += (dx / dist) * springForce;
        source.vy += (dy / dist) * springForce;
        target.vx -= (dx / dist) * springForce;
        target.vy -= (dy / dist) * springForce;
      });

      hoverNodeId = null;
      nodes.forEach((node) => {
        node.vx += (width / 2 - node.x) * 0.005;
        node.vy += (height / 2 - node.y) * 0.005;

        if (isHovered) {
          const mdx = node.x - mouseX;
          const mdy = node.y - mouseY;
          const mdistSq = mdx * mdx + mdy * mdy;
          if (mdistSq < 10000) {
            const mdist = Math.sqrt(mdistSq) || 1;
            node.vx += (mdx / mdist) * 2;
            node.vy += (mdy / mdist) * 2;
          }
          if (Math.hypot(node.x - mouseX, node.y - mouseY) < node.radius + 10) {
            hoverNodeId = node.id;
          }
        }

        node.vx *= 0.85;
        node.vy *= 0.85;
        node.x += node.vx;
        node.y += node.vy;
      });

      hoverEdge = isHovered && !hoverNodeId ? findHoveredEdge() : null;
    };

    const render = () => {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.42)';
      ctx.fillRect(0, 0, width, height);
      simulate();

      edges.forEach((edge) => {
        const source = nodes.find((node) => node.id === edge.source);
        const target = nodes.find((node) => node.id === edge.target);
        if (!source || !target) return;

        const highlighted = hoverEdge === edge || hoverNodeId === source.id || hoverNodeId === target.id;
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = highlighted ? 'rgba(59, 130, 246, 0.8)' : 'rgba(148, 163, 184, 0.16)';
        ctx.lineWidth = hoverEdge === edge ? 4 : highlighted ? 2.5 : 1;
        ctx.stroke();

        if (highlighted && edge.label) {
          ctx.font = '12px Inter, system-ui, sans-serif';
          ctx.fillStyle = 'rgba(226, 232, 240, 0.95)';
          ctx.textAlign = 'center';
          ctx.fillText(edge.label, (source.x + target.x) / 2, (source.y + target.y) / 2 - 8);
        }
      });

      nodes.forEach((node) => {
        const active = hoverNodeId === node.id;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + (active ? 6 : 2), 0, Math.PI * 2);
        ctx.fillStyle = `${node.color}${active ? '40' : '20'}`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        if (active) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        }
        ctx.fill();

        ctx.font = `${active ? 'bold 14px' : '11px'} Inter, system-ui, sans-serif`;
        ctx.fillStyle = active ? '#ffffff' : 'rgba(248, 250, 252, 0.82)';
        ctx.textAlign = 'center';
        ctx.fillText(node.name, node.x, node.y + node.radius + (active ? 20 : 16));
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleCanvasClick);
    };
  }, [characters, relationships, isHovered, onRelationshipSelect]);

  return (
    <div className="relative w-full h-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl group flex flex-col">
      <div className="absolute top-0 left-0 right-0 p-5 flex items-center justify-between z-10 bg-gradient-to-b from-slate-900/80 to-transparent pointer-events-none">
        <h3 className="text-xl font-bold text-slate-200 flex items-center">
          <Network className="w-5 h-5 mr-3 text-blue-400" />
          羁绊网络
        </h3>
        <div className="flex space-x-2 pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <button className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors backdrop-blur-sm"><ZoomIn className="w-4 h-4" /></button>
          <button className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors backdrop-blur-sm"><ZoomOut className="w-4 h-4" /></button>
          <button className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors backdrop-blur-sm"><RefreshCw className="w-4 h-4" /></button>
          <button className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors backdrop-blur-sm"><Maximize2 className="w-4 h-4" /></button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 w-full"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <canvas ref={canvasRef} className={`w-full h-full block touch-none ${onRelationshipSelect ? 'cursor-pointer' : 'cursor-crosshair'}`} />
      </div>

      <div className="absolute bottom-6 left-6 flex items-center gap-4 text-[11px] font-semibold tracking-wider uppercase text-slate-400">
        <div className="flex items-center"><span className="w-2 h-2 rounded-full bg-rose-500 mr-2 shadow-[0_0_8px_rgba(225,29,72,0.8)]" /> 核心</div>
        <div className="flex items-center"><span className="w-2 h-2 rounded-full bg-amber-500 mr-2 shadow-[0_0_8px_rgba(245,158,11,0.8)]" /> 重要</div>
        <div className="flex items-center"><span className="w-2 h-2 rounded-full bg-blue-500 mr-2 shadow-[0_0_8px_rgba(59,130,246,0.8)]" /> 普通</div>
        <div className="flex items-center"><span className="w-2 h-2 rounded-full bg-slate-500 mr-2 shadow-[0_0_8px_rgba(100,116,139,0.8)]" /> 次要</div>
      </div>
    </div>
  );
};

export default CharacterRelationshipGraph;
