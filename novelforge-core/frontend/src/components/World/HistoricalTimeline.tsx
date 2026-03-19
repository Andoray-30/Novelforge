import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TimelineEvent } from '@/types';

interface HistoricalTimelineProps {
  events: TimelineEvent[];
  onEventClick?: (event: TimelineEvent) => void;
}

const HistoricalTimeline: React.FC<HistoricalTimelineProps> = ({ 
  events, 
  onEventClick 
}) => {
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [timeFilter, setTimeFilter] = useState<string>('all');

  // 按事件类型对历史事件进行分类
  const categorizedEvents = {
    historical: events.filter(event => 
      event.event_type === 'historical' || 
      event.title.toLowerCase().includes('历史') ||
      event.description.toLowerCase().includes('历史')
    ),
    political: events.filter(event => 
      event.event_type === 'political' || 
      event.title.toLowerCase().includes('政治') ||
      event.description.toLowerCase().includes('政治')
    ),
    cultural: events.filter(event => 
      event.event_type === 'cultural' || 
      event.title.toLowerCase().includes('文化') ||
      event.description.toLowerCase().includes('文化')
    ),
    technological: events.filter(event => 
      event.event_type === 'technological' || 
      event.title.toLowerCase().includes('技术') ||
      event.description.toLowerCase().includes('技术')
    ),
    natural: events.filter(event => 
      event.event_type === 'natural' || 
      event.title.toLowerCase().includes('自然') ||
      event.description.toLowerCase().includes('自然')
    ),
    social: events.filter(event => 
      event.event_type === 'social' || 
      event.title.toLowerCase().includes('社会') ||
      event.description.toLowerCase().includes('社会')
    ),
  };

  // 按时间顺序排序事件
  const sortedEvents = [...events].sort((a, b) => {
    // 简单的时间字符串比较，实际项目中可能需要更复杂的日期解析
    if (a.date && b.date) {
      return a.date.localeCompare(b.date);
    }
    return 0;
  });

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>历史事件轴</CardTitle>
        <div className="flex space-x-2">
          <select 
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm bg-background"
          >
            <option value="all">全部事件</option>
            <option value="historical">历史事件</option>
            <option value="political">政治事件</option>
            <option value="cultural">文化事件</option>
            <option value="technological">技术事件</option>
            <option value="natural">自然事件</option>
            <option value="social">社会事件</option>
          </select>
          <Button variant="outline" size="sm">导出</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* 时间轴线 */}
          <div className="absolute left-4 top-0 h-full w-0.5 bg-gray-300 transform -translate-x-1/2"></div>
          
          <div className="space-y-8 pl-12">
            {sortedEvents.map((event, index) => {
              // 根据重要性确定样式
              const importanceClass = 
                event.importance === 'critical' ? 'border-red-500 bg-red-50' :
                event.importance === 'high' ? 'border-orange-500 bg-orange-50' :
                event.importance === 'medium' ? 'border-yellow-500 bg-yellow-50' :
                'border-gray-300 bg-gray-50';
              
              return (
                <div 
                  key={event.id || index}
                  className={`relative p-4 rounded-lg border-l-4 cursor-pointer transition-all hover:shadow-md ${importanceClass}`}
                  onClick={() => {
                    setSelectedEvent(event);
                    onEventClick && onEventClick(event);
                  }}
                >
                  {/* 时间轴点 */}
                  <div className={`absolute -left-11 top-6 w-6 h-6 rounded-full border-4 ${
                    event.importance === 'critical' ? 'bg-red-500 border-red-200' :
                    event.importance === 'high' ? 'bg-orange-500 border-orange-200' :
                    event.importance === 'medium' ? 'bg-yellow-500 border-yellow-200' : 
                    'bg-gray-500 border-gray-200'
                  }`}></div>
                  
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium text-lg">{event.title}</h4>
                      {event.date && (
                        <Badge variant="outline" className="mt-2">
                          {event.date}
                        </Badge>
                      )}
                    </div>
                    <Badge variant={
                      event.importance === 'critical' ? 'destructive' :
                      event.importance === 'high' ? 'default' :
                      event.importance === 'medium' ? 'secondary' : 'outline'
                    }>
                      {event.importance === 'critical' ? '重大' :
                       event.importance === 'high' ? '重要' :
                       event.importance === 'medium' ? '一般' : '次要'}
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mt-2">
                    {event.description}
                  </p>
                  
                  <div className="flex flex-wrap gap-2 mt-3">
                    {event.characters && event.characters.length > 0 && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">涉及角色:</span>
                        {event.characters.map((char, idx) => (
                          <span key={idx} className="ml-1">{char}</span>
                        ))}
                      </div>
                    )}
                    
                    {event.locations && event.locations.length > 0 && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">地点:</span>
                        {event.locations.map((loc, idx) => (
                          <span key={idx} className="ml-1">{loc}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <Badge variant="outline" className="mt-2 text-xs">
                    {event.event_type || '未分类'}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>

        {selectedEvent && (
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">{selectedEvent.title} 详情</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p><span className="font-medium">日期:</span> {selectedEvent.date || '未指定'}</p>
                <p className="mt-1"><span className="font-medium">类型:</span> {selectedEvent.event_type || '未分类'}</p>
                <p className="mt-1"><span className="font-medium">重要性:</span> {selectedEvent.importance}</p>
              </div>
              <div>
                <p><span className="font-medium">描述:</span> {selectedEvent.description}</p>
              </div>
            </div>
            
            {selectedEvent.characters && selectedEvent.characters.length > 0 && (
              <div className="mt-3">
                <h5 className="font-medium text-sm">相关角色</h5>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedEvent.characters.map((char, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {char}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {selectedEvent.locations && selectedEvent.locations.length > 0 && (
              <div className="mt-3">
                <h5 className="font-medium text-sm">相关地点</h5>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedEvent.locations.map((loc, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {loc}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default HistoricalTimeline;