import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ThemeWord {
  text: string;
  count: number;
  category: string;
}

interface ThemeWordCloudProps {
  themes: ThemeWord[];
  onWordClick?: (word: ThemeWord) => void;
}

const ThemeWordCloud: React.FC<ThemeWordCloudProps> = ({ 
  themes, 
  onWordClick 
}) => {
  // 按频率对主题词进行排序
  const sortedThemes = [...themes].sort((a, b) => b.count - a.count);
  
  // 计算字体大小范围
  const maxCount = Math.max(...themes.map(t => t.count), 1);
  const minCount = Math.min(...themes.map(t => t.count), 1);
  const minSize = 12;
  const maxSize = 32;
  
  // 根据计数计算字体大小
  const getFontSize = (count: number) => {
    if (maxCount === minCount) return maxSize;
    return minSize + ((count - minCount) / (maxCount - minCount)) * (maxSize - minSize);
  };

  // 主题词分类颜色映射
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'theme':
        return 'text-blue-600 hover:text-blue-800';
      case 'character':
        return 'text-green-600 hover:text-green-800';
      case 'plot':
        return 'text-purple-600 hover:text-purple-800';
      case 'setting':
        return 'text-yellow-600 hover:text-yellow-800';
      case 'conflict':
        return 'text-red-600 hover:text-red-800';
      default:
        return 'text-gray-600 hover:text-gray-800';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>主题词云图</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap justify-center items-center gap-3 p-4 min-h-[300px] bg-muted rounded-md">
          {sortedThemes.map((theme, index) => (
            <span
              key={index}
              className={`cursor-pointer transition-all duration-200 hover:scale-110 ${getCategoryColor(theme.category)}`}
              style={{
                fontSize: `${getFontSize(theme.count)}px`,
                fontWeight: getFontSize(theme.count) > 24 ? 'bold' : 'normal',
              }}
              onClick={() => onWordClick && onWordClick(theme)}
              title={`出现 ${theme.count} 次 - ${theme.category} 类`}
            >
              {theme.text}
            </span>
          ))}
        </div>
        
        <div className="mt-6">
          <h4 className="font-semibold mb-3">主题分类</h4>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
              <span className="text-sm">主题</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
              <span className="text-sm">角色</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-purple-500 mr-2"></div>
              <span className="text-sm">情节</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
              <span className="text-sm">设定</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
              <span className="text-sm">冲突</span>
            </div>
          </div>
        </div>
        
        <div className="mt-6">
          <h4 className="font-semibold mb-3">词频统计</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {sortedThemes.slice(0, 8).map((theme, index) => (
              <div 
                key={index} 
                className="p-3 bg-background rounded-lg border flex justify-between items-center cursor-pointer hover:bg-muted transition-colors"
                onClick={() => onWordClick && onWordClick(theme)}
              >
                <span className="font-medium">{theme.text}</span>
                <Badge variant="secondary">{theme.count}</Badge>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// 导出辅助函数用于生成测试数据
export const generateSampleThemes = (): ThemeWord[] => {
  return [
    { text: '爱情', count: 42, category: 'theme' },
    { text: '冒险', count: 38, category: 'theme' },
    { text: '背叛', count: 35, category: 'conflict' },
    { text: '成长', count: 33, category: 'theme' },
    { text: '复仇', count: 30, category: 'conflict' },
    { text: '勇气', count: 28, category: 'theme' },
    { text: '主角', count: 25, category: 'character' },
    { text: '反派', count: 22, category: 'character' },
    { text: '友情', count: 20, category: 'theme' },
    { text: '秘密', count: 18, category: 'plot' },
    { text: '王国', count: 16, category: 'setting' },
    { text: '魔法', count: 15, category: 'setting' },
    { text: '战斗', count: 14, category: 'plot' },
    { text: '命运', count: 13, category: 'theme' },
    { text: '导师', count: 12, category: 'character' },
    { text: '试炼', count: 10, category: 'plot' },
  ];
};

export default ThemeWordCloud;