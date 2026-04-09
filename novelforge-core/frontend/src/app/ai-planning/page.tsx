'use client';

import { useState } from 'react';
import { useAIPlanning } from '@/lib/hooks/use-ai-planning';
import type { StoryOutlineParams, StoryOutline, NovelType } from '@/types';

export default function AIPlanningPage() {
  const { 
    isLoading: isGenerating, 
    error, 
    generateStoryOutline
  } = useAIPlanning();

  const [currentOutline, setCurrentOutline] = useState<StoryOutline | null>(null);

  const [formData, setFormData] = useState<StoryOutlineParams>({
    novel_type: 'fantasy',
    theme: '',
    length: 'medium',
    target_audience: 'general'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.theme.trim()) return;
    
    try {
      const result = await generateStoryOutline(formData);
      setCurrentOutline(result);
    } catch (err) {
      console.error('Generation failed:', err);
    }
  };

  const resetPlanning = () => {
    setCurrentOutline(null);
    setFormData({
      novel_type: 'fantasy',
      theme: '',
      length: 'medium',
      target_audience: 'general'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">AI 故事创作助手</h1>
        
        {!currentOutline ? (
          <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow">
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">小说类型</label>
              <select
                value={formData.novel_type}
                onChange={(e) => setFormData({...formData, novel_type: e.target.value as NovelType})}
                className="w-full p-2 border rounded"
              >
                <option value="fantasy">奇幻</option>
                <option value="science_fiction">科幻</option>
                <option value="romance">言情</option>
                <option value="mystery">悬疑</option>
                <option value="historical">历史</option>
                <option value="wuxia">武侠</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">主题</label>
              <input
                type="text"
                value={formData.theme}
                onChange={(e) => setFormData({...formData, theme: e.target.value})}
                className="w-full p-2 border rounded"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isGenerating || !formData.theme.trim()}
              className="w-full bg-blue-600 text-white p-3 rounded disabled:opacity-50"
            >
              {isGenerating ? '生成中...' : '开始生成故事'}
            </button>
          </form>
        ) : (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">生成的故事架构</h2>
            <h3 className="text-2xl font-bold mb-2">{currentOutline.title}</h3>
            <p className="text-gray-600">{currentOutline.theme}</p>
            
            <button
              onClick={resetPlanning}
              className="mt-4 bg-gray-600 text-white p-2 rounded"
            >
              重新开始
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 bg-red-100 text-red-800 p-4 rounded">
            <p>生成失败: {error}</p>
            <button 
              onClick={() => resetPlanning()}
              className="mt-2 text-red-600 underline"
            >
              重试
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
