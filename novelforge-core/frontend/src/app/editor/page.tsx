'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from '@/components/ui';

export default function NovelEditorPage() {
  const [documents] = useState([
    {
      id: '1',
      title: '示例小说',
      lastModified: '2024-01-01',
      status: 'draft'
    }
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">小说编辑器</h1>
          <Button>新建文档</Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {documents.map((doc) => (
            <Card key={doc.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle>{doc.title}</CardTitle>
                  <Badge variant={doc.status === 'draft' ? 'secondary' : 'default'}>
                    {doc.status === 'draft' ? '草稿' : '已发布'}
                  </Badge>
                </div>
                <CardDescription>最后修改: {doc.lastModified}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1">
                    编辑
                  </Button>
                  <Button variant="ghost" size="icon">
                    <span>...</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        {documents.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">暂无文档</p>
            <Button>开始创作您的第一篇小说</Button>
          </div>
        )}
        
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>富文本编辑功能</CardTitle>
              <CardDescription>支持实时协作、版本管理和多格式导出</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <Button variant="outline" size="sm">富文本编辑</Button>
                <Button variant="outline" size="sm">实时协作</Button>
                <Button variant="outline" size="sm">版本管理</Button>
                <Button variant="outline" size="sm">导出功能</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}