import React, { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Character } from '@/types';

interface CharacterRelationshipGraphProps {
  characters: Character[];
}

const CharacterRelationshipGraph: React.FC<CharacterRelationshipGraphProps> = ({ 
  characters 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 简化的关系网络数据结构
  interface RelationshipEdge {
    source: string;
    target: string;
    relationship: string;
    strength: number;
  }

  // 生成关系网络数据
  const generateRelationshipData = (): { nodes: any[], edges: RelationshipEdge[] } => {
    const nodes = characters.map((char, index) => ({
      id: char.id,
      name: char.name,
      x: Math.random() * 400,
      y: Math.random() * 300,
      size: char.importance === 'critical' ? 20 : 
            char.importance === 'high' ? 16 : 
            char.importance === 'medium' ? 12 : 8
    }));

    const edges: RelationshipEdge[] = [];
    
    // 为每个角色创建一些关系
    characters.forEach(char => {
      if (char.relationships) {
        char.relationships.forEach(rel => {
          const targetChar = characters.find(c => c.name === rel.target_name);
          if (targetChar && char.id !== targetChar.id) {
            edges.push({
              source: char.id,
              target: targetChar.id,
              relationship: rel.relationship,
              strength: 0.5 // 暂时设为固定值
            });
          }
        });
      }
    });

    return { nodes, edges };
  };

  // 绘制力导向图
  const drawGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { nodes, edges } = generateRelationshipData();

    // 绘制连线
    ctx.strokeStyle = '#9ca3af'; // gray-400
    ctx.lineWidth = 1;
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (sourceNode && targetNode) {
        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        ctx.stroke();
      }
    });

    // 绘制节点
    nodes.forEach(node => {
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size / 2, 0, 2 * Math.PI);
      
      // 根据重要性设置颜色
      if (node.size === 20) ctx.fillStyle = '#ef4444'; // red-500 for critical
      else if (node.size === 16) ctx.fillStyle = '#f59e0b'; // amber-500 for high
      else if (node.size === 12) ctx.fillStyle = '#3b82f6'; // blue-500 for medium
      else ctx.fillStyle = '#6b7280'; // gray-500 for low
      
      ctx.fill();
      
      // 绘制节点名称
      ctx.fillStyle = '#1f2937'; // gray-800
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.name, node.x, node.y + node.size + 15);
    });
  };

  useEffect(() => {
    drawGraph();
    
    // 添加窗口大小调整监听器
    const handleResize = () => {
      drawGraph();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [characters]);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>角色关系图谱</CardTitle>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm">放大</Button>
          <Button variant="outline" size="sm">缩小</Button>
          <Button variant="outline" size="sm">重置</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <canvas 
            ref={canvasRef} 
            width={800} 
            height={500}
            className="w-full h-auto border rounded-md bg-white"
          />
          <div className="flex flex-wrap gap-4 mt-4 text-sm">
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
              <span>关键角色</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-amber-500 mr-2"></div>
              <span>重要角色</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
              <span>普通角色</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-gray-500 mr-2"></div>
              <span>次要角色</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CharacterRelationshipGraph;