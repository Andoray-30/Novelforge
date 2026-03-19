'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from '@/components/ui';
import { BarChart3, FileText, TrendingUp, Users } from 'lucide-react';

export default function AnalyticsPage() {
  const stats = [
    { label: '总字数', value: '12,500', icon: <FileText className="h-5 w-5" /> },
    { label: '创作天数', value: '15', icon: <TrendingUp className="h-5 w-5" /> },
    { label: '角色数量', value: '8', icon: <Users className="h-5 w-5" /> },
    { label: '世界元素', value: '12', icon: <BarChart3 className="h-5 w-5" /> }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">数据分析</h1>
          <Button>刷新数据</Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <Card key={index} className="text-center">
              <CardContent className="p-6">
                <div className="flex justify-center mb-2">
                  {stat.icon}
                </div>
                <div className="text-2xl font-bold mb-1">{stat.value}</div>
                <div className="text-sm text-gray-600">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>创作统计</CardTitle>
              <CardDescription>分析您的创作习惯和进度</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 bg-gray-100 rounded flex items-center justify-center">
                <span className="text-gray-500">图表占位符</span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>质量评估</CardTitle>
              <CardDescription>AI驱动的文本质量分析</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <span>词汇多样性</span>
                    <span>85%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded h-2">
                    <div className="bg-green-500 h-2 rounded" style={{width: '85%'}}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span>句子复杂度</span>
                    <span>72%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded h-2">
                    <div className="bg-blue-500 h-2 rounded" style={{width: '72%'}}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span>一致性评分</span>
                    <span>91%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded h-2">
                    <div className="bg-purple-500 h-2 rounded" style={{width: '91%'}}></div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>改进建议</CardTitle>
              <CardDescription>基于数据分析的创作优化建议</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Badge variant="outline">建议</Badge>
                  <p>增加角色对话的多样性，当前对话模式较为单一</p>
                </div>
                <div className="flex items-start gap-3">
                  <Badge variant="outline">建议</Badge>
                  <p>世界设定中的地理描述可以更加详细</p>
                </div>
                <div className="flex items-start gap-3">
                  <Badge variant="outline">建议</Badge>
                  <p>考虑增加更多的情节转折点以提升故事张力</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}