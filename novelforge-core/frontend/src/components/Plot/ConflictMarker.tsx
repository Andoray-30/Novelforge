import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TimelineEvent } from '@/types';

interface ConflictMarkerProps {
  events: TimelineEvent[];
  onConflictClick?: (event: TimelineEvent) => void;
}

const ConflictMarker: React.FC<ConflictMarkerProps> = ({ 
  events, 
  onConflictClick 
}) => {
  // 筛选出冲突相关的事件
  const conflictEvents = events.filter(event =>
    event.title.toLowerCase().includes('冲突') ||
    event.title.toLowerCase().includes('矛盾') ||
    event.title.toLowerCase().includes('争执') ||
    event.title.toLowerCase().includes('对立') ||
    event.title.toLowerCase().includes('斗争') ||
    event.description.toLowerCase().includes('冲突') ||
    event.description.toLowerCase().includes('矛盾') ||
    event.importance === 'critical' ||
    event.importance === 'high'
  );

  // 按冲突类型分类
  const conflictTypes = {
    character: conflictEvents.filter(event => 
      event.title.toLowerCase().includes('角色') ||
      event.title.toLowerCase().includes('人物') ||
      event.description.toLowerCase().includes('角色') ||
      event.description.toLowerCase().includes('人物')
    ),
    plot: conflictEvents.filter(event => 
      event.title.toLowerCase().includes('情节') ||
      event.title.toLowerCase().includes('剧情') ||
      event.description.toLowerCase().includes('情节') ||
      event.description.toLowerCase().includes('剧情')
    ),
    thematic: conflictEvents.filter(event => 
      event.title.toLowerCase().includes('主题') ||
      event.title.toLowerCase().includes('理念') ||
      event.description.toLowerCase().includes('主题') ||
      event.description.toLowerCase().includes('理念')
    ),
    external: conflictEvents.filter(event => 
      event.title.toLowerCase().includes('外部') ||
      event.title.toLowerCase().includes('环境') ||
      event.description.toLowerCase().includes('外部') ||
      event.description.toLowerCase().includes('环境')
    ),
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>冲突点标注</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* 角色冲突 */}
          <div>
            <div className="flex items-center mb-3">
              <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
              <h3 className="text-lg font-semibold">角色冲突</h3>
              <Badge variant="outline" className="ml-2">
                {conflictTypes.character.length} 个
              </Badge>
            </div>
            <div className="space-y-3">
              {conflictTypes.character.map((event, index) => (
                <div 
                  key={event.id || `char-${index}`}
                  className="p-3 rounded-lg border-l-4 border-red-500 bg-red-50 hover:bg-red-100 cursor-pointer transition-colors"
                  onClick={() => onConflictClick && onConflictClick(event)}
                >
                  <div className="flex justify-between items-start">
                    <h4 className="font-medium">{event.title}</h4>
                    <Badge variant={
                      event.importance === 'critical' ? 'destructive' :
                      event.importance === 'high' ? 'default' :
                      'secondary'
                    }>
                      {event.importance === 'critical' ? '紧急' :
                       event.importance === 'high' ? '重要' : '一般'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {event.description}
                  </p>
                  {event.characters && event.characters.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {event.characters.map((char, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {char}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 情节冲突 */}
          <div>
            <div className="flex items-center mb-3">
              <div className="w-3 h-3 rounded-full bg-orange-500 mr-2"></div>
              <h3 className="text-lg font-semibold">情节冲突</h3>
              <Badge variant="outline" className="ml-2">
                {conflictTypes.plot.length} 个
              </Badge>
            </div>
            <div className="space-y-3">
              {conflictTypes.plot.map((event, index) => (
                <div 
                  key={event.id || `plot-${index}`}
                  className="p-3 rounded-lg border-l-4 border-orange-500 bg-orange-50 hover:bg-orange-100 cursor-pointer transition-colors"
                  onClick={() => onConflictClick && onConflictClick(event)}
                >
                  <div className="flex justify-between items-start">
                    <h4 className="font-medium">{event.title}</h4>
                    <Badge variant={
                      event.importance === 'critical' ? 'destructive' :
                      event.importance === 'high' ? 'default' :
                      'secondary'
                    }>
                      {event.importance === 'critical' ? '紧急' :
                       event.importance === 'high' ? '重要' : '一般'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {event.description}
                  </p>
                  {event.locations && event.locations.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {event.locations.map((loc, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {loc}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 主题冲突 */}
          <div>
            <div className="flex items-center mb-3">
              <div className="w-3 h-3 rounded-full bg-purple-500 mr-2"></div>
              <h3 className="text-lg font-semibold">主题冲突</h3>
              <Badge variant="outline" className="ml-2">
                {conflictTypes.thematic.length} 个
              </Badge>
            </div>
            <div className="space-y-3">
              {conflictTypes.thematic.map((event, index) => (
                <div 
                  key={event.id || `theme-${index}`}
                  className="p-3 rounded-lg border-l-4 border-purple-500 bg-purple-50 hover:bg-purple-100 cursor-pointer transition-colors"
                  onClick={() => onConflictClick && onConflictClick(event)}
                >
                  <div className="flex justify-between items-start">
                    <h4 className="font-medium">{event.title}</h4>
                    <Badge variant={
                      event.importance === 'critical' ? 'destructive' :
                      event.importance === 'high' ? 'default' :
                      'secondary'
                    }>
                      {event.importance === 'critical' ? '紧急' :
                       event.importance === 'high' ? '重要' : '一般'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {event.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 外部冲突 */}
          <div>
            <div className="flex items-center mb-3">
              <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
              <h3 className="text-lg font-semibold">外部冲突</h3>
              <Badge variant="outline" className="ml-2">
                {conflictTypes.external.length} 个
              </Badge>
            </div>
            <div className="space-y-3">
              {conflictTypes.external.map((event, index) => (
                <div 
                  key={event.id || `ext-${index}`}
                  className="p-3 rounded-lg border-l-4 border-yellow-500 bg-yellow-50 hover:bg-yellow-100 cursor-pointer transition-colors"
                  onClick={() => onConflictClick && onConflictClick(event)}
                >
                  <div className="flex justify-between items-start">
                    <h4 className="font-medium">{event.title}</h4>
                    <Badge variant={
                      event.importance === 'critical' ? 'destructive' :
                      event.importance === 'high' ? 'default' :
                      'secondary'
                    }>
                      {event.importance === 'critical' ? '紧急' :
                       event.importance === 'high' ? '重要' : '一般'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {event.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ConflictMarker;