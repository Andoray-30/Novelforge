'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from '@/components/ui';

export default function CharactersPage() {
  const [characters] = useState([
    {
      id: '1',
      name: '示例角色',
      role: '主角',
      status: 'active'
    }
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">角色管理</h1>
          <Button>创建新角色</Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {characters.map((character) => (
            <Card key={character.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle>{character.name}</CardTitle>
                  <Badge variant={character.status === 'active' ? 'default' : 'secondary'}>
                    {character.role}
                  </Badge>
                </div>
                <CardDescription>点击查看详情和编辑</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  编辑角色
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        
        {characters.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">暂无角色</p>
            <Button>开始创建您的第一个角色</Button>
          </div>
        )}
      </div>
    </div>
  );
}