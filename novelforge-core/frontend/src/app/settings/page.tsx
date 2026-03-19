'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from '@/components/ui';

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">系统设置</h1>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>AI配置</CardTitle>
              <CardDescription>配置AI模型参数和行为</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium">AI故事生成</h3>
                  <p className="text-sm text-gray-600">启用AI辅助故事创作功能</p>
                </div>
                <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium">角色分析</h3>
                  <p className="text-sm text-gray-600">启用AI角色性格分析</p>
                </div>
                <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium">质量评估</h3>
                  <p className="text-sm text-gray-600">启用AI文本质量评估</p>
                </div>
                <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>集成设置</CardTitle>
              <CardDescription>配置第三方服务集成</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium">云存储</h3>
                  <p className="text-sm text-gray-600">同步到云端存储</p>
                </div>
                <input type="checkbox" className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium">协作功能</h3>
                  <p className="text-sm text-gray-600">启用实时协作编辑</p>
                </div>
                <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium">版本控制</h3>
                  <p className="text-sm text-gray-600">自动保存版本历史</p>
                </div>
                <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>个性化选项</CardTitle>
              <CardDescription>自定义界面和编辑体验</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium">深色模式</h3>
                  <p className="text-sm text-gray-600">切换深色/浅色主题</p>
                </div>
                <input type="checkbox" className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium">自动保存</h3>
                  <p className="text-sm text-gray-600">自动保存编辑内容</p>
                </div>
                <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium">通知提醒</h3>
                  <p className="text-sm text-gray-600">接收系统通知</p>
                </div>
                <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>导出配置</CardTitle>
              <CardDescription>配置文档导出格式和选项</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button variant="outline">PDF格式</Button>
                <Button variant="outline">EPUB格式</Button>
                <Button variant="outline">纯文本</Button>
              </div>
              <div className="flex justify-end">
                <Button>保存导出配置</Button>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="mt-8 flex justify-end">
          <Button size="lg">保存所有设置</Button>
        </div>
      </div>
    </div>
  );
}