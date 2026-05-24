'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Character, ContentItem, ImportanceLevel } from '@/types';
import { contentService } from '@/lib/api';
import { useSessions } from '@/lib/hooks/use-sessions';
import { useAppStore } from '@/lib/hooks/use-app-store';

function parseCharacter(item: ContentItem): Character | null {
  const payload = item.extracted_data;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const data = payload as Record<string, unknown>;
  const creativeSignals = data.creative_signals && typeof data.creative_signals === 'object'
    ? data.creative_signals as Record<string, unknown>
    : {};
  const name = typeof data.name === 'string' && data.name.trim().length > 0
    ? data.name
    : item.metadata.title;

  const importance =
    data.importance === 'critical' || data.importance === 'high' || data.importance === 'medium' || data.importance === 'low'
      ? (data.importance as ImportanceLevel)
      : String(data.role || '').toLowerCase().split('.').pop() === 'protagonist'
        ? 'critical'
        : String(data.role || '').toLowerCase().split('.').pop() === 'antagonist'
          ? 'high'
          : 'medium';

  return {
    id: item.metadata.id,
    name,
    description: typeof data.description === 'string' ? data.description : item.content,
    personality: typeof data.personality === 'string' ? data.personality : '',
    background: typeof data.background === 'string' ? data.background : '',
    role: typeof data.role === 'string' ? data.role.split('.').pop() || data.role : 'supporting',
    age: typeof data.age === 'number' ? data.age : undefined,
    gender: typeof data.gender === 'string' ? data.gender : undefined,
    appearance: typeof data.appearance === 'string' ? data.appearance : undefined,
    occupation: typeof data.occupation === 'string' ? data.occupation : undefined,
    abilities: Array.isArray(data.abilities) ? data.abilities.filter((value): value is string => typeof value === 'string') : [],
    tags: Array.isArray(data.tags) ? data.tags.filter((value): value is string => typeof value === 'string') : item.metadata.tags,
    aliases: Array.isArray(data.aliases) ? data.aliases.filter((value): value is string => typeof value === 'string') : [],
    goals: [
      ...(Array.isArray(data.goals) ? data.goals.filter((value): value is string => typeof value === 'string') : []),
      ...(Array.isArray(creativeSignals.desires) ? creativeSignals.desires.filter((value): value is string => typeof value === 'string') : []),
    ],
    desires: [
      ...(Array.isArray(data.desires) ? data.desires.filter((value): value is string => typeof value === 'string') : []),
      ...(Array.isArray(creativeSignals.desires) ? creativeSignals.desires.filter((value): value is string => typeof value === 'string') : []),
    ],
    fears: [
      ...(Array.isArray(data.fears) ? data.fears.filter((value): value is string => typeof value === 'string') : []),
      ...(Array.isArray(creativeSignals.wounds) ? creativeSignals.wounds.filter((value): value is string => typeof value === 'string') : []),
    ],
    wounds: [
      ...(Array.isArray(data.wounds) ? data.wounds.filter((value): value is string => typeof value === 'string') : []),
      ...(Array.isArray(creativeSignals.wounds) ? creativeSignals.wounds.filter((value): value is string => typeof value === 'string') : []),
    ],
    conflicts: Array.isArray(data.conflicts) ? data.conflicts.filter((value): value is string => typeof value === 'string') : [],
    personality_tension: typeof data.personality_tension === 'string'
      ? data.personality_tension
      : Array.isArray(creativeSignals.emotional_states)
        ? creativeSignals.emotional_states.find((value): value is string => typeof value === 'string')
        : undefined,
    character_arc: typeof data.character_arc === 'string' ? data.character_arc : undefined,
    relationship_hooks: Array.isArray(data.relationship_hooks) ? data.relationship_hooks.filter((value): value is string => typeof value === 'string') : [],
    entity_type: typeof data.entity_type === 'string' ? data.entity_type : undefined,
    relationships: Array.isArray(data.relationships)
      ? data.relationships
          .filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null)
          .map((relationship) => ({
            target_name: typeof relationship.target_name === 'string' ? relationship.target_name : '',
            relationship: typeof relationship.relationship === 'string' ? relationship.relationship : 'other',
            description: typeof relationship.description === 'string' ? relationship.description : '',
          }))
          .filter((relationship) => relationship.target_name.length > 0)
      : [],
    example_dialogues: Array.isArray(data.example_dialogues)
      ? data.example_dialogues.filter((value): value is string => typeof value === 'string')
      : [],
    example_messages: Array.isArray(data.example_messages)
      ? data.example_messages.filter((value): value is string => typeof value === 'string')
      : [],
    behavior_examples: Array.isArray(data.behavior_examples)
      ? data.behavior_examples.filter((value): value is string => typeof value === 'string')
      : [],
    source_contexts: Array.isArray(data.source_contexts)
      ? data.source_contexts.filter((value): value is string => typeof value === 'string')
      : [],
    importance,
  };
}

function labelImportance(value: ImportanceLevel): string {
  switch (value) {
    case 'critical':
      return '核心';
    case 'high':
      return '重要';
    case 'medium':
      return '中等';
    case 'low':
      return '次要';
    default:
      return '未标注';
  }
}

function labelRole(value: string): string {
  switch (value) {
    case 'protagonist':
      return '主角';
    case 'antagonist':
      return '反派';
    case 'supporting':
      return '配角';
    case 'minor':
      return '次要角色';
    default:
      return value || '未标注';
  }
}

function labelGender(value?: string): string {
  if (!value) return '未标注';
  const normalized = value.toLowerCase();
  if (['male', 'man', 'boy', '男'].includes(normalized)) return '男';
  if (['female', 'woman', 'girl', '女'].includes(normalized)) return '女';
  return value;
}

function splitTraits(value: string): string[] {
  return value
    .split(/[，、,；;。\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold tracking-wide text-slate-300">{title}</h3>
      <div className="text-sm leading-7 text-slate-200">{children}</div>
    </div>
  );
}

const CharacterDetailPage: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const { currentSession, currentSessionId } = useSessions();
  const selectedNovelId = useAppStore((state) => state.selectedNovelId);
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : undefined;

  const [character, setCharacter] = useState<Character | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCharacter = async () => {
      if (!id) {
        setError('角色 ID 无效。');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const item = await contentService.getContentItem(id);

        if (
          selectedNovelId &&
          item.metadata.parent_id &&
          item.metadata.parent_id !== selectedNovelId
        ) {
          setError('该角色不属于当前小说，请先切换到对应小说后再查看。');
          setCharacter(null);
          return;
        }

        const parsedCharacter = parseCharacter(item);
        if (!parsedCharacter) {
          setError('该角色缺少结构化侧写数据，暂时无法展示详情。');
          setCharacter(null);
          return;
        }

        setCharacter(parsedCharacter);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载角色详情失败。');
        setCharacter(null);
      } finally {
        setIsLoading(false);
      }
    };

    void loadCharacter();
  }, [currentSessionId, id, selectedNovelId]);

  const personalityTraits = useMemo(
    () => splitTraits(character?.personality || ''),
    [character?.personality]
  );

  if (isLoading) {
    return (
      <div className="min-h-full bg-slate-950 px-6 py-10 text-slate-100">
        <div className="mx-auto max-w-6xl">
          <Card className="border-slate-800 bg-slate-900/80">
            <CardContent className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                <p className="text-sm text-slate-400">正在加载角色档案...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !character) {
    return (
      <div className="min-h-full bg-slate-950 px-6 py-10 text-slate-100">
        <div className="mx-auto max-w-4xl">
          <Card className="border-red-500/20 bg-red-500/10">
            <CardContent className="space-y-4 py-12 text-center">
              <h2 className="text-2xl font-semibold text-white">角色详情暂不可用</h2>
              <p className="text-sm leading-7 text-red-100/80">
                {error || `未找到 ID 为 ${id} 的角色资产。`}
              </p>
              <div>
                <Button
                  variant="outline"
                  className="border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                  onClick={() => router.push('/characters')}
                >
                  返回角色列表
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-950 px-6 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="mb-2 text-sm text-slate-400">
              当前项目：{currentSession?.title || '未选择项目'}
            </p>
            <h1 className="text-4xl font-extrabold tracking-tight text-white">{character.name}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
              查看当前项目中已保存的角色侧写、关系、对白与行为证据。该页面只读取结构化资产，不再依赖将 JSON 塞入正文后反解析。
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              disabled
              className="bg-violet-600/80 text-white hover:bg-violet-600 disabled:opacity-70"
            >
              编辑角色（即将接入真实编辑流）
            </Button>
            <Button
              variant="outline"
              className="border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
              onClick={() => router.push('/characters')}
            >
              返回列表
            </Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
          <Card className="border-slate-800 bg-slate-900/80">
            <CardContent className="space-y-8 pt-6">
              <div className="flex flex-col gap-6 md:flex-row md:items-start">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-slate-800 text-3xl font-black text-white">
                  {character.name.charAt(0) || '角'}
                </div>
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-3xl font-bold text-white">{character.name}</h2>
                    <Badge className="border-violet-400/20 bg-violet-500/15 text-violet-100">
                      {labelImportance(character.importance)}
                    </Badge>
                    <Badge variant="outline" className="border-slate-700 text-slate-300">
                      {labelRole(character.role)}
                    </Badge>
                  </div>
                  <p className="text-sm leading-7 text-slate-300">
                    {character.description || '暂无角色描述。'}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <DetailSection title="目标 / 欲望">
                  {[...(character.goals ?? []), ...(character.desires ?? [])].length > 0 ? (
                    <div className="space-y-2">
                      {[...(character.goals ?? []), ...(character.desires ?? [])].slice(0, 4).map((item, index) => (
                        <div key={`${item}-${index}`} className="rounded-xl border border-violet-400/20 bg-violet-400/10 px-3 py-2 text-violet-100">
                          {item}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-500">暂无明确目标。</span>
                  )}
                </DetailSection>

                <DetailSection title="恐惧 / 冲突">
                  {[...(character.fears ?? []), ...(character.wounds ?? []), ...(character.conflicts ?? [])].length > 0 ? (
                    <div className="space-y-2">
                      {[...(character.fears ?? []), ...(character.wounds ?? []), ...(character.conflicts ?? [])].slice(0, 4).map((item, index) => (
                        <div key={`${item}-${index}`} className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-rose-100">
                          {item}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-500">暂无明确冲突。</span>
                  )}
                </DetailSection>
              </div>

              {character.personality_tension || character.character_arc ? (
                <DetailSection title="创作弧光">
                  <div className="space-y-3">
                    {character.personality_tension ? (
                      <p className="rounded-2xl border border-blue-400/20 bg-blue-400/10 px-4 py-3 text-blue-100">
                        {character.personality_tension}
                      </p>
                    ) : null}
                    {character.character_arc ? (
                      <p className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-emerald-100">
                        {character.character_arc}
                      </p>
                    ) : null}
                  </div>
                </DetailSection>
              ) : null}

              <DetailSection title="角色背景">
                {character.background || '暂无背景信息。'}
              </DetailSection>

              {character.appearance ? (
                <DetailSection title="外貌与气质">
                  {character.appearance}
                </DetailSection>
              ) : null}

              <div className="grid gap-6 md:grid-cols-2">
                <DetailSection title="能力">
                  {character.abilities.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {character.abilities.map((ability, index) => (
                        <Badge
                          key={`${ability}-${index}`}
                          variant="outline"
                          className="border-cyan-500/20 bg-cyan-500/10 text-cyan-100"
                        >
                          {ability}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-500">暂无能力信息。</span>
                  )}
                </DetailSection>

                <DetailSection title="标签">
                  {character.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {character.tags.map((tag, index) => (
                        <Badge
                          key={`${tag}-${index}`}
                          className="border-amber-500/20 bg-amber-500/15 text-amber-100"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-500">暂无标签。</span>
                  )}
                </DetailSection>
              </div>

              <DetailSection title="性格特征">
                {personalityTraits.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {personalityTraits.map((trait, index) => (
                      <Badge
                        key={`${trait}-${index}`}
                        variant="outline"
                        className="border-slate-700 bg-slate-950/60 text-slate-200"
                      >
                        {trait}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-500">暂无性格特征。</span>
                )}
              </DetailSection>

              {character.behavior_examples && character.behavior_examples.length > 0 ? (
                <DetailSection title="行为表现">
                  <div className="space-y-3">
                    {character.behavior_examples.map((example, index) => (
                      <div
                        key={`${example}-${index}`}
                        className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
                      >
                        {example}
                      </div>
                    ))}
                  </div>
                </DetailSection>
              ) : null}

              {character.source_contexts && character.source_contexts.length > 0 ? (
                <DetailSection title="原文证据">
                  <div className="space-y-3">
                    {character.source_contexts.map((context, index) => (
                      <blockquote
                        key={`${context}-${index}`}
                        className="rounded-2xl border-l-4 border-violet-500/60 bg-slate-950/80 px-4 py-3 text-slate-300"
                      >
                        {context}
                      </blockquote>
                    ))}
                  </div>
                </DetailSection>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-slate-800 bg-slate-900/80">
              <CardHeader>
                <CardTitle className="text-white">统计信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">示例对白</span>
                  <span className="font-semibold text-white">{character.example_dialogues?.length || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">角色定位</span>
                  <span className="font-semibold text-white">{labelRole(character.role)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">年龄</span>
                  <span className="font-semibold text-white">{character.age ?? '未标注'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">性别</span>
                  <span className="font-semibold text-white">{labelGender(character.gender)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">职业</span>
                  <span className="font-semibold text-white">{character.occupation || '未标注'}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/80">
              <CardHeader>
                <CardTitle className="text-white">人际关系</CardTitle>
              </CardHeader>
              <CardContent>
                {character.relationships.length > 0 ? (
                  <div className="space-y-4">
                    {character.relationships.map((relationship, index) => (
                      <div
                        key={`${relationship.target_name}-${index}`}
                        className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <span className="font-semibold text-white">{relationship.target_name}</span>
                          <Badge variant="outline" className="border-emerald-500/20 text-emerald-100">
                            {relationship.relationship || '未标注'}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                          {relationship.description || '暂无关系描述。'}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">暂无关系信息。</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="border-slate-800 bg-slate-900/80">
          <CardHeader>
            <CardTitle className="text-white">示例对白</CardTitle>
          </CardHeader>
          <CardContent>
            {character.example_dialogues && character.example_dialogues.length > 0 ? (
              <div className="space-y-4">
                {character.example_dialogues.map((message, index) => (
                  <div
                    key={`${message}-${index}`}
                    className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-4 text-sm leading-7 text-slate-200"
                  >
                    {message}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">暂无示例对白。</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CharacterDetailPage;
