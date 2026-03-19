'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from '@/components/ui';

export default function WorldSettingsPage() {
  const worldElements = [
    {
      id: '1',
      name: '示例世界',
      type: '世界观',
      status: 'active'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">世界设定</h1>
          <Button>创建新世界元素</Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {worldElements.map((element) => (
            <Card key={element.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle>{element.name}</CardTitle>
                  <Badge variant={element.status === 'active' ? 'default' : 'secondary'}>
                    {element.type}
                  </Badge>
                </div>
                <CardDescription>管理地点、文化、历史和规则设定</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  编辑设定
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        
        {worldElements.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">暂无世界设定</p>
            <Button>开始构建您的世界</Button>
          </div>
        )}
        
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>地点管理</CardTitle>
              <CardDescription>创建和管理故事中的地点</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm">管理地点</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>文化设定</CardTitle>
              <CardDescription>定义不同文明的文化特征</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm">管理文化</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>历史时间线</CardTitle>
              <CardDescription>构建完整的历史事件序列</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm">管理时间线</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>世界规则</CardTitle>
              <CardDescription>设定魔法、科技等世界规则</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm">管理规则</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}