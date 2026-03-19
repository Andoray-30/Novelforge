import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Location } from '@/types';

interface LocationMapProps {
  locations: Location[];
  onLocationClick?: (location: Location) => void;
}

const LocationMap: React.FC<LocationMapProps> = ({ 
  locations, 
  onLocationClick 
}) => {
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // 按类型对地点进行分类
  const categorizedLocations: { [key: string]: Location[] } = {};
  locations.forEach(location => {
    const type = location.type || '未分类';
    if (!categorizedLocations[type]) {
      categorizedLocations[type] = [];
    }
    categorizedLocations[type].push(location);
  });

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>地点地图</CardTitle>
        <div className="flex space-x-2">
          <Button 
            variant={viewMode === 'grid' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setViewMode('grid')}
          >
            网格
          </Button>
          <Button 
            variant={viewMode === 'list' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setViewMode('list')}
          >
            列表
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === 'grid' ? (
          <div className="space-y-8">
            {Object.entries(categorizedLocations).map(([type, locs]) => (
              <div key={type}>
                <div className="flex items-center mb-4">
                  <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
                  <h3 className="text-lg font-semibold">{type}</h3>
                  <Badge variant="outline" className="ml-2">
                    {locs.length} 个地点
                  </Badge>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {locs.map((location, index) => (
                    <div 
                      key={location.name || index}
                      className={`p-4 rounded-lg border cursor-pointer transition-all ${
                        selectedLocation?.name === location.name 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:shadow'
                      }`}
                      onClick={() => {
                        setSelectedLocation(location);
                        onLocationClick && onLocationClick(location);
                      }}
                    >
                      <div className="flex justify-between items-start">
                        <h4 className="font-medium">{location.name}</h4>
                        <Badge variant="outline" className="text-xs">
                          {location.type || '地点'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                        {location.description}
                      </p>
                      
                      {location.notable_features && location.notable_features.length > 0 && (
                        <div className="mt-3">
                          <h5 className="text-xs font-medium text-muted-foreground mb-1">特色</h5>
                          <div className="flex flex-wrap gap-1">
                            {location.notable_features.slice(0, 3).map((feature, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {feature}
                              </Badge>
                            ))}
                            {location.notable_features.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{location.notable_features.length - 3}
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {locations.map((location, index) => (
              <div 
                key={location.name || index}
                className={`p-4 rounded-lg border-l-4 cursor-pointer transition-all ${
                  selectedLocation?.name === location.name 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
                onClick={() => {
                  setSelectedLocation(location);
                  onLocationClick && onLocationClick(location);
                }}
              >
                <div className="flex justify-between">
                  <div>
                    <h4 className="font-medium">{location.name}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {location.description}
                    </p>
                  </div>
                  <Badge variant="outline">{location.type || '地点'}</Badge>
                </div>
                
                <div className="flex flex-wrap gap-2 mt-3">
                  {location.notable_features && location.notable_features.map((feature, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {feature}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedLocation && (
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">{selectedLocation.name} 详情</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p><span className="font-medium">类型:</span> {selectedLocation.type || '未分类'}</p>
                <p className="mt-1"><span className="font-medium">描述:</span> {selectedLocation.description}</p>
              </div>
              <div>
                <p><span className="font-medium">地理位置:</span> {selectedLocation.geography || '未指定'}</p>
                <p className="mt-1"><span className="font-medium">文化背景:</span> {selectedLocation.culture || '未指定'}</p>
              </div>
            </div>
            
            {selectedLocation.notable_features && selectedLocation.notable_features.length > 0 && (
              <div className="mt-3">
                <h5 className="font-medium text-sm">特色:</h5>
                <ul className="list-disc list-inside mt-1">
                  {selectedLocation.notable_features.map((feature, idx) => (
                    <li key={idx} className="text-sm">{feature}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LocationMap;