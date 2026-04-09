'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Character } from '@/types';
import { contentService } from '@/lib/api';

const CharacterDetailPage: React.FC = () => {
  const { id } = useParams();
  const router = useRouter();
  const [character, setCharacter] = useState<Character | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCharacter = async () => {
      if (!id) return;
      setIsLoading(true);
      try {
        const data = await contentService.getContentItem(id as string);
        let parsedCharacter: Character | null = null;
        try {
          const raw = JSON.parse((data as any).content || '{}');
          parsedCharacter = {
            id: raw.id || (data as any).metadata?.id || String(id),
            name: raw.name || (data as any).metadata?.title || '未命名角色',
            description: raw.description || '',
            personality: raw.personality || '',
            background: raw.background || '',
            role: raw.role || 'supporting',
            importance: raw.importance || 'medium',
            abilities: raw.abilities || [],
            tags: raw.tags || [],
            relationships: raw.relationships || [],
            example_dialogues: raw.example_dialogues || [],
            example_messages: raw.example_messages || [],
          };
        } catch {
          parsedCharacter = null;
        }
        setCharacter(parsedCharacter);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载角色失败');
      } finally {
        setIsLoading(false);
      }
    };

    loadCharacter();
  }, [id]);

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 px-4">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold">加载中...</h2>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !character) {
    return (
      <div className="container mx-auto py-6 px-4">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold">角色未找到</h2>
            <p className="text-muted-foreground mt-2">ID为 {id} 的角色不存在或加载失败</p>
            {error && <p className="text-red-500 mt-2">{error}</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  // 将性格字符串转换为数组
  const personalityTraits = character.personality ?
    character.personality.split(/[，,、\n]/).filter((trait: string) => trait.trim().length > 0) : [];

  // 计算出场次数
  const appearanceCount = character.example_dialogues?.length || 0;

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{character.name}</h1>
        <div className="flex space-x-2">
          <Button onClick={() => alert('角色编辑功能开发中')}>编辑角色</Button>
          <Button variant="outline" onClick={() => router.push('/characters')}>返回列表</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧基本信息 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 角色卡片 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-4">
                <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center text-lg">
                  {character.name.charAt(0)}
                </div>
                <div>
                  <CardTitle className="text-2xl">{character.name}</CardTitle>
                  <Badge variant="secondary" className="mt-1">
                    {character.importance || '普通角色'}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">角色描述</h3>
                  <p className="text-foreground">{character.description}</p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">角色背景</h3>
                  <p className="text-foreground">{character.background}</p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">能力</h3>
                  <div className="flex flex-wrap gap-2">
                    {character.abilities && character.abilities.length > 0 ? (
                      character.abilities.map((ability: string, index: number) => (
                        <Badge key={index} variant="outline">{ability}</Badge>
                      ))
                    ) : (
                      <p className="text-muted-foreground italic">暂无能力信息</p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">性格特征</h3>
                  <div className="flex flex-wrap gap-2">
                    {personalityTraits.length > 0 ? (
                      personalityTraits.map((trait: string, index: number) => (
                        <Badge key={index} variant="outline">{trait.trim()}</Badge>
                      ))
                    ) : (
                      <p className="text-muted-foreground italic">暂无性格信息</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 示例对话 */}
          <Card>
            <CardHeader>
              <CardTitle>示例对话</CardTitle>
            </CardHeader>
            <CardContent>
              {character.example_dialogues && character.example_dialogues.length > 0 ? (
                <div className="space-y-4">
                  {character.example_dialogues.map((message: string, index: number) => (
                    <div key={index} className="bg-secondary p-3 rounded-lg">
                      <p>{message}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground italic">暂无示例对话</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 右侧信息栏 */}
        <div className="space-y-6">
          {/* 统计信息 */}
          <Card>
            <CardHeader>
              <CardTitle>统计信息</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">出场次数</span>
                  <span className="font-medium">{appearanceCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">角色类型</span>
                  <span className="font-medium">{character.role || '未分类'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">年龄</span>
                  <span className="font-medium">{character.age || '未设置'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">性别</span>
                  <span className="font-medium">{character.gender || '未设置'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 人际关系 */}
          <Card>
            <CardHeader>
              <CardTitle>人际关系</CardTitle>
            </CardHeader>
            <CardContent>
              {character.relationships && character.relationships.length > 0 ? (
                <div className="space-y-3">
                  {character.relationships.map((relationship: any, index: number) => (
                    <div key={index} className="border-b pb-3 last:border-0 last:pb-0">
                      <div className="flex justify-between">
                        <span className="font-medium">{relationship.target_name}</span>
                        <Badge variant="outline">{relationship.relationship}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{relationship.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground italic">暂无关系信息</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CharacterDetailPage;
