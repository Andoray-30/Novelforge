import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TimelineEvent } from '@/types';

interface TimelineComponentProps {
  events: TimelineEvent[];
  onEventClick?: (event: TimelineEvent) => void;
}

const TimelineComponent: React.FC<TimelineComponentProps> = ({ 
  events, 
  onEventClick 
}) => {
  // 按重要性对事件进行分类
  const categorizedEvents = {
    critical: events.filter(event => event.importance === 'critical'),
    high: events.filter(event => event.importance === 'high'),
    medium: events.filter(event => event.importance === 'medium'),
    low: events.filter(event => event.importance === 'low'),
  };

  // 按时间或章节对事件进行分组
  const groupedEvents: { [key: string]: TimelineEvent[] } = {};
  events.forEach(event => {
    const groupKey = event.date || '未分类';
    if (!groupedEvents[groupKey]) {
      groupedEvents[groupKey] = [];
    }
    groupedEvents[groupKey].push(event);
  });

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>故事时间线</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {Object.entries(groupedEvents).map(([date, events]) => (
            <div key={date} className="relative pl-8 border-l-2 border-gray-200">
              <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-blue-500"></div>
              <h3 className="font-semibold text-lg mb-2">{date}</h3>
              
              <div className="space-y-4">
                {events.map((event, index) => (
                  <div 
                    key={event.id || index} 
                    className={`p-4 rounded-lg border-l-4 cursor-pointer transition-all hover:shadow-md ${
                      event.importance === 'critical' ? 'border-red-500 bg-red-50' :
                      event.importance === 'high' ? 'border-orange-500 bg-orange-50' :
                      event.importance === 'medium' ? 'border-yellow-500 bg-yellow-50' :
                      'border-gray-500 bg-gray-50'
                    }`}
                    onClick={() => onEventClick && onEventClick(event)}
                  >
                    <div className="flex justify-between items-start">
                      <h4 className="font-medium text-base">{event.title}</h4>
                      <Badge variant={
                        event.importance === 'critical' ? 'destructive' :
                        event.importance === 'high' ? 'default' :
                        event.importance === 'medium' ? 'secondary' : 'outline'
                      }>
                        {event.importance === 'critical' ? '关键' :
                         event.importance === 'high' ? '重要' :
                         event.importance === 'medium' ? '中等' : '低'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {event.description}
                    </p>
                    
                    <div className="flex flex-wrap gap-2 mt-2">
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
                    
                    {event.event_type && (
                      <Badge variant="outline" className="mt-2 text-xs">
                        {event.event_type}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default TimelineComponent;