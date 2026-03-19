import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WorldRule } from '@/types';

interface RuleHierarchyTreeProps {
  rules: WorldRule[];
  onRuleClick?: (rule: WorldRule) => void;
}

interface RuleNode {
  id: string;
  name: string;
  description: string;
  category: string;
  importance: 'low' | 'medium' | 'high' | 'critical';
  children: RuleNode[];
}

const RuleHierarchyTree: React.FC<RuleHierarchyTreeProps> = ({ 
  rules, 
  onRuleClick 
}) => {
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  const [selectedRule, setSelectedRule] = useState<WorldRule | null>(null);

  // 按类别对规则进行分组
  const categorizedRules: { [key: string]: WorldRule[] } = {};
  rules.forEach(rule => {
    const category = rule.category || '未分类';
    if (!categorizedRules[category]) {
      categorizedRules[category] = [];
    }
    categorizedRules[category].push(rule);
  });

  const toggleRule = (ruleId: string) => {
    const newExpanded = new Set(expandedRules);
    if (newExpanded.has(ruleId)) {
      newExpanded.delete(ruleId);
    } else {
      newExpanded.add(ruleId);
    }
    setExpandedRules(newExpanded);
  };

  const getImportanceColor = (importance: string) => {
    switch (importance) {
      case 'critical': return 'text-red-600';
      case 'high': return 'text-orange-600';
      case 'medium': return 'text-yellow-600';
      case 'low': 
      default: return 'text-gray-600';
    }
  };

  const getImportanceLabel = (importance: string) => {
    switch (importance) {
      case 'critical': return '极高';
      case 'high': return '高';
      case 'medium': return '中';
      case 'low': 
      default: return '低';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>规则体系树</CardTitle>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm">展开全部</Button>
          <Button variant="outline" size="sm">收起全部</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Object.entries(categorizedRules).map(([category, categoryRules]) => (
            <div key={category} className="border rounded-lg">
              <div className="p-3 bg-muted rounded-t-lg">
                <h3 className="font-semibold">{category}</h3>
                <p className="text-sm text-muted-foreground">{categoryRules.length} 条规则</p>
              </div>
              
              <div className="p-3 space-y-3">
                {categoryRules.map((rule, index) => (
                  <div 
                    key={rule.name || index}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedRule?.name === rule.name 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:shadow'
                    }`}
                    onClick={() => {
                      setSelectedRule(rule);
                      onRuleClick && onRuleClick(rule);
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <h4 className="font-medium">{rule.name}</h4>
                      <div className="flex space-x-2">
                        <Badge 
                          variant="outline" 
                          className={getImportanceColor(rule.importance)}
                        >
                          {getImportanceLabel(rule.importance)}
                        </Badge>
                      </div>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                      {rule.description}
                    </p>
                    
                    <div className="mt-2 flex justify-end">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRule(rule.name);
                        }}
                      >
                        {expandedRules.has(rule.name) ? '收起' : '展开详情'}
                      </Button>
                    </div>
                    
                    {expandedRules.has(rule.name) && (
                      <div className="mt-3 pt-3 border-t">
                        <h5 className="font-medium mb-1">规则描述</h5>
                        <p className="text-sm">{rule.description}</p>
                        
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge variant="outline">{rule.category || '未分类'}</Badge>
                          <Badge variant="outline" className={getImportanceColor(rule.importance)}>
                            {getImportanceLabel(rule.importance)}
                          </Badge>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {selectedRule && (
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">{selectedRule.name} 详情</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p><span className="font-medium">类别:</span> {selectedRule.category || '未分类'}</p>
                <p className="mt-1"><span className="font-medium">重要性:</span> {getImportanceLabel(selectedRule.importance)}</p>
              </div>
              <div>
                <p><span className="font-medium">描述:</span> {selectedRule.description}</p>
              </div>
            </div>
            
            <div className="mt-4">
              <h5 className="font-medium text-sm mb-2">适用范围</h5>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">世界观</Badge>
                <Badge variant="outline">角色行为</Badge>
                <Badge variant="outline">情节发展</Badge>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RuleHierarchyTree;