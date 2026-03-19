'use client';

import { useState } from 'react';
import { useAIPlanning } from '@/lib/hooks/use-ai-planning';
import { StoryOutlineParams } from '@/lib/api';

export default function AIPlanningTest() {
  const { isGenerating, error, currentOutline, generateStoryOutline } = useAIPlanning();
  const [formData, setFormData] = useState<StoryOutlineParams>({
    novel_type: 'fantasy',
    theme: 'friendship and betrayal',
    length: 'medium',
    target_audience: 'young adult',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await generateStoryOutline(formData);
    } catch (err) {
      console.error('生成失败:', err);
    }
  };

  const handleChange = (field: keyof StoryOutlineParams, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">AI故事规划测试</h1>
      
      <form onSubmit={handleSubmit} className="space-y-4 mb-8">
        <div>
          <label className="block text-sm font-medium mb-2">小说类型</label>
          <select
            value={formData.novel_type}
            onChange={(e) => handleChange('novel_type', e.target.value)}
            className="w-full p-2 border rounded-md"
            disabled={isGenerating}
          >
            <option value="fantasy">奇幻</option>
            <option value="science_fiction">科幻</option>
            <option value="romance">言情</option>
            <option value="mystery">悬疑</option>
            <option value="historical">历史</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">主题</label>
          <input
            type="text"
            value={formData.theme}
            onChange={(e) => handleChange('theme', e.target.value)}
            className="w-full p-2 border rounded-md"
            disabled={isGenerating}
            placeholder="例如：友谊与背叛"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">长度</label>
          <select
            value={formData.length}
            onChange={(e) => handleChange('length', e.target.value)}
            className="w-full p-2 border rounded-md"
            disabled={isGenerating}
          >
            <option value="short">短篇（&lt; 50,000字）</option>
            <option value="medium">中篇（50,000-100,000字）</option>
            <option value="long">长篇（&gt; 100,000字）</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">目标受众</label>
          <select
            value={formData.target_audience}
            onChange={(e) => handleChange('target_audience', e.target.value)}
            className="w-full p-2 border rounded-md"
            disabled={isGenerating}
          >
            <option value="young adult">青少年</option>
            <option value="adult">成人</option>
            <option value="general">一般读者</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={isGenerating}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isGenerating ? '生成中...' : '生成故事架构'}
        </button>
      </form>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          错误: {error}
        </div>
      )}

      {currentOutline && (
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">生成的故事架构</h2>
          
          <div className="mb-4">
            <h3 className="text-lg font-medium mb-2">{currentOutline.title}</h3>
            <p className="text-gray-600 mb-2">类型: {currentOutline.genre} | 主题: {currentOutline.theme}</p>
            <p className="text-gray-600 mb-4">基调: {currentOutline.tone} | 目标受众: {currentOutline.targetAudience}</p>
          </div>

          <div className="mb-4">
            <h4 className="text-md font-medium mb-2">主要情节节点</h4>
            <div className="space-y-2">
              {currentOutline.plotPoints.map((point, index) => (
                <div key={point.id} className="border-l-4 border-blue-500 pl-4">
                  <h5 className="font-medium">{point.title}</h5>
                  <p className="text-sm text-gray-600">{point.description}</p>
                  <div className="flex gap-4 text-xs text-gray-500 mt-1">
                    <span>位置: {point.position}</span>
                    <span>重要性: {point.importance}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <h4 className="text-md font-medium mb-2">关键角色</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentOutline.characterRoles.map((role, index) => (
                <div key={index} className="border rounded p-3">
                  <h5 className="font-medium">{role.name}</h5>
                  <p className="text-sm text-gray-600 mb-1">{role.role}</p>
                  <p className="text-sm">{role.description}</p>
                  {role.keyTraits.length > 0 && (
                    <div className="mt-2">
                      <span className="text-xs text-gray-500">特征: </span>
                      <span className="text-xs">{role.keyTraits.join(', ')}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {currentOutline.worldElements.length > 0 && (
            <div>
              <h4 className="text-md font-medium mb-2">世界观要素</h4>
              <div className="flex flex-wrap gap-2">
                {currentOutline.worldElements.map((element, index) => (
                  <span key={index} className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm">
                    {element}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}