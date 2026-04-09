import React, { useEffect, useRef, useState } from 'react';
import { NetworkEdge, Character } from '@/types';
import { Network, Maximize2, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';

interface CharacterRelationshipGraphProps {
  characters: Character[];
  relationships?: NetworkEdge[];
}

const CharacterRelationshipGraph: React.FC<CharacterRelationshipGraphProps> = ({ 
  characters,
  relationships = [] 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || characters.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = canvas.width;
    let height = canvas.height;

    // 自适应大小
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.target === containerRef.current) {
          const { width: w, height: h } = entry.contentRect;
          canvas.width = w * window.devicePixelRatio;
          canvas.height = h * window.devicePixelRatio;
          ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
          width = w;
          height = h;
        }
      }
    });
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    // 节点
    const nodes = characters.map(char => ({
      id: char.id,
      name: char.name,
      x: width / 2 + (Math.random() - 0.5) * 300,
      y: height / 2 + (Math.random() - 0.5) * 300,
      vx: 0,
      vy: 0,
      radius: char.importance === 'critical' ? 24 : 
              char.importance === 'high' ? 18 : 
              char.importance === 'medium' ? 14 : 10,
      color: char.importance === 'critical' ? '#e11d48' : 
             char.importance === 'high' ? '#f59e0b' : 
             char.importance === 'medium' ? '#3b82f6' : '#64748b',
    }));

    // 边
    const edges = relationships.length > 0 ? relationships : characters.flatMap(char => 
      (char.relationships || []).map(r => ({
        source: char.id,
        target: characters.find(c => c.name === r.target_name)?.id || '',
        strength: 0.5
      }))
    ).filter(e => e.target !== '');

    let hoverNodeId: string | null = null;
    let mouseX = 0;
    let mouseY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };
    canvas.addEventListener('mousemove', handleMouseMove);

    const simulate = () => {
      // 1. 斥力
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
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

      // 2. 引力
      edges.forEach(edge => {
        const source = nodes.find(n => n.id === edge.source);
        const target = nodes.find(n => n.id === edge.target);
        if (source && target) {
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const springLength = 150;
          const springForce = (dist - springLength) * 0.01;
          
          source.vx += (dx / dist) * springForce;
          source.vy += (dy / dist) * springForce;
          target.vx -= (dx / dist) * springForce;
          target.vy -= (dy / dist) * springForce;
        }
      });

      // 3. 向心与摩擦
      nodes.forEach(node => {
        const dx = width / 2 - node.x;
        const dy = height / 2 - node.y;
        node.vx += dx * 0.005;
        node.vy += dy * 0.005;

        // 交互感
        if (isHovered) {
          const mdx = node.x - mouseX;
          const mdy = node.y - mouseY;
          const mdistSq = mdx * mdx + mdy * mdy;
          if (mdistSq < 10000) {
            node.vx += (mdx / Math.sqrt(mdistSq)) * 2;
            node.vy += (mdy / Math.sqrt(mdistSq)) * 2;
          }
        }

        node.vx *= 0.85;
        node.vy *= 0.85;
        node.x += node.vx;
        node.y += node.vy;

        if (!isHovered) hoverNodeId = null;
        else if (Math.hypot(node.x - mouseX, node.y - mouseY) < node.radius + 10) {
          hoverNodeId = node.id;
        }
      });
    };

    const render = () => {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
      ctx.fillRect(0, 0, width, height);
      
      simulate();

      edges.forEach(edge => {
        const source = nodes.find(n => n.id === edge.source);
        const target = nodes.find(n => n.id === edge.target);
        if (source && target) {
          const isHighlighted = hoverNodeId === source.id || hoverNodeId === target.id;
          
          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);
          
          ctx.strokeStyle = isHighlighted ? 'rgba(59, 130, 246, 0.8)' : 'rgba(148, 163, 184, 0.15)';
          ctx.lineWidth = isHighlighted ? 2.5 : 1;
          ctx.stroke();
        }
      });

      nodes.forEach(node => {
        const isHoveredNode = node.id === hoverNodeId;
        
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + (isHoveredNode ? 6 : 2), 0, Math.PI * 2);
        ctx.fillStyle = node.color + (isHoveredNode ? '40' : '20');
        ctx.fill();

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        if (isHoveredNode) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        }
        ctx.fill();

        // 避免模板字符串错误，改用普通字符串加号连接
        ctx.font = (isHoveredNode ? 'bold 14px' : '11px') + ' Inter, system-ui, sans-serif';
        ctx.fillStyle = isHoveredNode ? '#ffffff' : 'rgba(248, 250, 252, 0.8)';
        ctx.textAlign = 'center';
        ctx.fillText(node.name, node.x, node.y + node.radius + (isHoveredNode ? 20 : 16));
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      canvas.removeEventListener('mousemove', handleMouseMove);
    };
  }, [characters, relationships, isHovered]);

  return (
    <div className="relative w-full h-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl group flex flex-col">
      <div className="absolute top-0 left-0 right-0 p-5 flex items-center justify-between z-10 bg-gradient-to-b from-slate-900/80 to-transparent pointer-events-none">
        <h3 className="text-xl font-bold text-slate-200 flex items-center">
          <Network className="w-5 h-5 mr-3 text-blue-400" />羁绊溯回网络
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
        <canvas ref={canvasRef} className="w-full h-full block touch-none cursor-crosshair" />
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