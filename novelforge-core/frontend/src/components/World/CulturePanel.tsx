import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Culture } from '@/types';

interface CulturePanelProps {
  cultures: Culture[];
  onCultureClick?: (culture: Culture) => void;
}

const CulturePanel: React.FC<CulturePanelProps> = ({ 
  cultures, 
  onCultureClick 
}) => {
  const [selectedCulture, setSelectedCulture] = useState<Culture | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // 按文化特征对文化进行分类
  const categorizedCultures: { [key: string]: Culture[] } = {};
  cultures.forEach(culture => {
    if (culture.beliefs && culture.beliefs.length > 0) {
      // 基于主要信仰进行分类
      const primaryBelief = culture.beliefs[0] || '其他';
      const category = primaryBelief.length > 20 ? '其他' : primaryBelief.substring(0, 20);
      if (!categorizedCultures[category]) {
        categorizedCultures[category] = [];
      }
      categorizedCultures[category].push(culture);
    } else {
      if (!categorizedCultures['未分类']) {
        categorizedCultures['未分类'] = [];
      }
      categorizedCultures['未分类'].push(culture);
    }
  });

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>文化背景面板</CardTitle>
        <Button variant="outline" size="sm">导出</Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {cultures.map((culture, index) => (
            <div 
              key={culture.name || index}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                selectedCulture?.name === culture.name 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:shadow'
              }`}
              onClick={() => {
                setSelectedCulture(culture);
                onCultureClick && onCultureClick(culture);
              }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{culture.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {culture.description}
                  </p>
                </div>
                <Badge variant="outline">{culture.values?.length || 0} 价值观</Badge>
              </div>
              
              {culture.beliefs && culture.beliefs.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">核心信仰</h4>
                  <div className="flex flex-wrap gap-1">
                    {culture.beliefs.slice(0, 3).map((belief, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {belief}
                      </Badge>
                    ))}
                    {culture.beliefs.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{culture.beliefs.length - 3}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {selectedCulture && (
          <div className="mt-6 border-t pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xl font-semibold mb-4">{selectedCulture.name}</h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">描述</h4>
                    <p>{selectedCulture.description}</p>
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-medium text-sm text-muted-foreground">核心信仰</h4>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => toggleSection('beliefs')}
                      >
                        {expandedSection === 'beliefs' ? '收起' : '展开'}
                      </Button>
                    </div>
                    <div className={`overflow-hidden transition-all ${
                      expandedSection === 'beliefs' ? 'max-h-96' : 'max-h-32'
                    }`}>
                      <ul className="list-disc list-inside space-y-1">
                        {selectedCulture.beliefs?.map((belief, idx) => (
                          <li key={idx}>{belief}</li>
                        )) || <li className="text-muted-foreground italic">暂无信仰信息</li>}
                      </ul>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-medium text-sm text-muted-foreground">核心价值观</h4>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => toggleSection('values')}
                      >
                        {expandedSection === 'values' ? '收起' : '展开'}
                      </Button>
                    </div>
                    <div className={`overflow-hidden transition-all ${
                      expandedSection === 'values' ? 'max-h-96' : 'max-h-32'
                    }`}>
                      <ul className="list-disc list-inside space-y-1">
                        {selectedCulture.values?.map((value, idx) => (
                          <li key={idx}>{value}</li>
                        )) || <li className="text-muted-foreground italic">暂无价值观信息</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-2">社会习俗</h4>
                <div className="space-y-3">
                  {selectedCulture.customs?.map((custom, idx) => (
                    <div key={idx} className="p-3 bg-muted rounded">
                      <p>{custom}</p>
                    </div>
                  )) || <p className="text-muted-foreground italic">暂无习俗信息</p>}
                </div>
                
                <div className="mt-4">
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">关联信息</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">文化</Badge>
                    <Badge variant="outline">社会</Badge>
                    <Badge variant="outline">传统</Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CulturePanel;