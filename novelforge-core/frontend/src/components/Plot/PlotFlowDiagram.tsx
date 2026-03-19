import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TimelineEvent } from '@/types';

interface PlotFlowDiagramProps {
  events: TimelineEvent[];
  onEventClick?: (event: TimelineEvent) => void;
}

const PlotFlowDiagram: React.FC<PlotFlowDiagramProps> = ({ 
  events, 
  onEventClick 
}) => {
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  
  // 按故事位置对事件进行分类
  const categorizedEvents = {
    beginning: events.filter(event => 
      event.title.toLowerCase().includes('开始') || 
      event.title.toLowerCase().includes('开端') ||
      event.title.toLowerCase().includes('介绍') ||
      event.title.toLowerCase().includes('建立')
    ),
    development: events.filter(event => 
      event.title.toLowerCase().includes('发展') ||
      event.title.toLowerCase().includes('冲突') ||
      event.title.toLowerCase().includes('升级') ||
      event.title.toLowerCase().includes('转折')
    ),
    climax: events.filter(event => 
      event.title.toLowerCase().includes('高潮') ||
      event.title.toLowerCase().includes('决战') ||
      event.title.toLowerCase().includes('关键') ||
      event.title.toLowerCase().includes('决定')
    ),
    ending: events.filter(event => 
      event.title.toLowerCase().includes('结局') ||
      event.title.toLowerCase().includes('结束') ||
      event.title.toLowerCase().includes('收尾') ||
      event.title.toLowerCase().includes('完成')
    ),
  };

  // 简化版流程图展示
  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>情节流程图</CardTitle>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm">展开</Button>
          <Button variant="outline" size="sm">收起</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
          {/* 开端阶段 */}
          <div>
            <div className="flex items-center mb-4">
              <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
              <h3 className="text-lg font-semibold">开端</h3>
              <Badge variant="outline" className="ml-2">
                {categorizedEvents.beginning.length} 事件
              </Badge>
            </div>
            <div className="flex flex-wrap gap-3">
              {categorizedEvents.beginning.map((event, index) => (
                <div 
                  key={event.id || index}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedEvent?.id === event.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:shadow'
                  }`}
                  onClick={() => {
                    setSelectedEvent(event);
                    onEventClick && onEventClick(event);
                  }}
                >
                  <div className="flex items-start">
                    <div className={`w-2 h-2 rounded-full mt-1.5 mr-2 ${
                      event.importance === 'critical' ? 'bg-red-500' :
                      event.importance === 'high' ? 'bg-orange-500' :
                      event.importance === 'medium' ? 'bg-yellow-500' : 'bg-gray-400'
                    }`}></div>
                    <div>
                      <h4 className="font-medium text-sm">{event.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 max-w-48">
                        {event.description}
                      </p>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {event.event_type || '事件'}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 发展阶段 */}
          <div>
            <div className="flex items-center mb-4">
              <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
              <h3 className="text-lg font-semibold">发展</h3>
              <Badge variant="outline" className="ml-2">
                {categorizedEvents.development.length} 事件
              </Badge>
            </div>
            <div className="flex flex-wrap gap-3">
              {categorizedEvents.development.map((event, index) => (
                <div 
                  key={event.id || `dev-${index}`}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedEvent?.id === event.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:shadow'
                  }`}
                  onClick={() => {
                    setSelectedEvent(event);
                    onEventClick && onEventClick(event);
                  }}
                >
                  <div className="flex items-start">
                    <div className={`w-2 h-2 rounded-full mt-1.5 mr-2 ${
                      event.importance === 'critical' ? 'bg-red-500' :
                      event.importance === 'high' ? 'bg-orange-500' :
                      event.importance === 'medium' ? 'bg-yellow-500' : 'bg-gray-400'
                    }`}></div>
                    <div>
                      <h4 className="font-medium text-sm">{event.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 max-w-48">
                        {event.description}
                      </p>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {event.event_type || '事件'}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 高潮阶段 */}
          <div>
            <div className="flex items-center mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
              <h3 className="text-lg font-semibold">高潮</h3>
              <Badge variant="outline" className="ml-2">
                {categorizedEvents.climax.length} 事件
              </Badge>
            </div>
            <div className="flex flex-wrap gap-3">
              {categorizedEvents.climax.map((event, index) => (
                <div 
                  key={event.id || `climax-${index}`}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedEvent?.id === event.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:shadow'
                  }`}
                  onClick={() => {
                    setSelectedEvent(event);
                    onEventClick && onEventClick(event);
                  }}
                >
                  <div className="flex items-start">
                    <div className={`w-2 h-2 rounded-full mt-1.5 mr-2 ${
                      event.importance === 'critical' ? 'bg-red-500' :
                      event.importance === 'high' ? 'bg-orange-500' :
                      event.importance === 'medium' ? 'bg-yellow-500' : 'bg-gray-400'
                    }`}></div>
                    <div>
                      <h4 className="font-medium text-sm">{event.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 max-w-48">
                        {event.description}
                      </p>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {event.event_type || '事件'}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 结尾阶段 */}
          <div>
            <div className="flex items-center mb-4">
              <div className="w-3 h-3 rounded-full bg-purple-500 mr-2"></div>
              <h3 className="text-lg font-semibold">结尾</h3>
              <Badge variant="outline" className="ml-2">
                {categorizedEvents.ending.length} 事件
              </Badge>
            </div>
            <div className="flex flex-wrap gap-3">
              {categorizedEvents.ending.map((event, index) => (
                <div 
                  key={event.id || `end-${index}`}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedEvent?.id === event.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:shadow'
                  }`}
                  onClick={() => {
                    setSelectedEvent(event);
                    onEventClick && onEventClick(event);
                  }}
                >
                  <div className="flex items-start">
                    <div className={`w-2 h-2 rounded-full mt-1.5 mr-2 ${
                      event.importance === 'critical' ? 'bg-red-500' :
                      event.importance === 'high' ? 'bg-orange-500' :
                      event.importance === 'medium' ? 'bg-yellow-500' : 'bg-gray-400'
                    }`}></div>
                    <div>
                      <h4 className="font-medium text-sm">{event.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 max-w-48">
                        {event.description}
                      </p>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {event.event_type || '事件'}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {selectedEvent && (
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">选中事件详情</h4>
            <p className="text-sm"><span className="font-medium">标题:</span> {selectedEvent.title}</p>
            <p className="text-sm mt-1"><span className="font-medium">描述:</span> {selectedEvent.description}</p>
            <p className="text-sm mt-1"><span className="font-medium">类型:</span> {selectedEvent.event_type}</p>
            <p className="text-sm mt-1"><span className="font-medium">重要性:</span> {selectedEvent.importance}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PlotFlowDiagram;