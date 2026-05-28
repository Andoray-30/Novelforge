'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen, Database, MessageSquareText, Quote, RefreshCw, UserRound } from 'lucide-react';
import type { Character, ContentItem, ImportanceLevel } from '@/types';
import { contentService } from '@/lib/api';
import { useSessions } from '@/lib/hooks/use-sessions';
import { useAppStore } from '@/lib/hooks/use-app-store';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/support-state';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function parseCharacter(item: ContentItem): Character | null {
  const payload = item.extracted_data;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const data = payload as Record<string, unknown>;
  const creativeSignals = asRecord(data.creative_signals);
  const name = asString(data.name).trim().length > 0 ? asString(data.name) : item.metadata.title;
  const normalizedRole = asString(data.role).toLowerCase().split('.').pop();
  const importance =
    data.importance === 'critical' || data.importance === 'high' || data.importance === 'medium' || data.importance === 'low'
      ? (data.importance as ImportanceLevel)
      : normalizedRole === 'protagonist'
        ? 'critical'
        : normalizedRole === 'antagonist'
          ? 'high'
          : 'medium';

  return {
    id: item.metadata.id,
    name,
    description: asString(data.description) || item.content,
    personality: asString(data.personality),
    background: asString(data.background),
    role: normalizedRole || 'supporting',
    age: typeof data.age === 'number' ? data.age : undefined,
    gender: asString(data.gender) || undefined,
    appearance: asString(data.appearance) || undefined,
    occupation: asString(data.occupation) || undefined,
    abilities: asStringArray(data.abilities),
    tags: asStringArray(data.tags).length > 0 ? asStringArray(data.tags) : item.metadata.tags,
    aliases: asStringArray(data.aliases),
    goals: [...asStringArray(data.goals), ...asStringArray(creativeSignals.desires)],
    desires: [...asStringArray(data.desires), ...asStringArray(creativeSignals.desires)],
    fears: [...asStringArray(data.fears), ...asStringArray(creativeSignals.fears), ...asStringArray(creativeSignals.wounds)],
    wounds: [...asStringArray(data.wounds), ...asStringArray(creativeSignals.wounds)],
    conflicts: asStringArray(data.conflicts),
    personality_tension: asString(data.personality_tension) || asStringArray(creativeSignals.emotional_states)[0],
    character_arc: asString(data.character_arc) || undefined,
    relationship_hooks: asStringArray(data.relationship_hooks),
    entity_type: asString(data.entity_type) || undefined,
    relationships: Array.isArray(data.relationships)
      ? data.relationships
          .filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null)
          .map((relationship) => ({
            target_name: asString(relationship.target_name),
            relationship: asString(relationship.relationship) || 'other',
            description: asString(relationship.description),
          }))
          .filter((relationship) => relationship.target_name.length > 0)
      : [],
    example_dialogues: asStringArray(data.example_dialogues),
    example_messages: asStringArray(data.example_messages),
    behavior_examples: asStringArray(data.behavior_examples),
    source_contexts: asStringArray(data.source_contexts),
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
    .split(/[，,、；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="nf-panel nf-panel-pad">
      <div className="nf-panel-title">
        {icon}
        {title}
      </div>
      <div className="mt-3 text-sm leading-7 text-[var(--nf-text-muted)]">{children}</div>
    </section>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="nf-chip">{children}</span>;
}

function SignalList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-[var(--nf-text-subtle)]">{empty}</p>;
  }
  return (
    <div className="grid gap-2">
      {items.slice(0, 6).map((item, index) => (
        <div key={`${item}-${index}`} className="rounded-xl border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] px-3 py-2 text-[var(--nf-text)]">
          {item}
        </div>
      ))}
    </div>
  );
}

export default function CharacterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentSession, currentSessionId } = useSessions();
  const selectedNovelId = useAppStore((state) => state.selectedNovelId);
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : undefined;

  const [character, setCharacter] = useState<Character | null>(null);
  const [contentItem, setContentItem] = useState<ContentItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

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

        if (selectedNovelId && item.metadata.parent_id && item.metadata.parent_id !== selectedNovelId) {
          setError('这个角色不属于当前小说。请先切换到对应小说后再查看。');
          setCharacter(null);
          setContentItem(null);
          return;
        }

        const parsedCharacter = parseCharacter(item);
        if (!parsedCharacter) {
          setError('这个角色缺少结构化档案数据，暂时无法展示详情。');
          setCharacter(null);
          setContentItem(item);
          return;
        }

        setCharacter(parsedCharacter);
        setContentItem(item);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载角色详情失败。');
        setCharacter(null);
        setContentItem(null);
      } finally {
        setIsLoading(false);
      }
    };

    void loadCharacter();
  }, [currentSessionId, id, refreshTick, selectedNovelId]);

  const personalityTraits = useMemo(
    () => splitTraits(character?.personality || ''),
    [character?.personality],
  );
  const writingHooks = useMemo(
    () => [
      ...(character?.relationship_hooks ?? []),
      ...(character?.personality_tension ? [character.personality_tension] : []),
      ...(character?.character_arc ? [character.character_arc] : []),
    ],
    [character],
  );
  const evidence = useMemo(
    () => [
      ...(character?.source_contexts ?? []),
      ...(character?.behavior_examples ?? []),
      ...(character?.example_dialogues ?? []),
      ...(character?.example_messages ?? []),
    ],
    [character],
  );

  if (isLoading) {
    return <LoadingState title="正在加载角色档案..." description="正在从内容库读取结构化角色资料。" />;
  }

  if (error || !character) {
    return (
      <ErrorState
        title="角色详情暂不可用"
        description={error || `未找到 ID 为 ${id} 的角色资产。`}
      >
        <button type="button" className="nf-button nf-button-primary" onClick={() => router.push('/characters')}>
          返回角色档案馆
        </button>
        <button type="button" className="nf-button" onClick={() => setRefreshTick((current) => current + 1)}>
          刷新
        </button>
      </ErrorState>
    );
  }

  const goalsAndDesires = [...(character.goals ?? []), ...(character.desires ?? [])];
  const woundsAndFears = [...(character.wounds ?? []), ...(character.fears ?? []), ...(character.conflicts ?? [])];

  return (
    <div className="nf-editor-shell">
      <div className="nf-editor-page">
        <section className="nf-editor-hero">
          <div>
            <div className="nf-kicker">Character Profile</div>
            <h1 className="nf-editor-title">
              <UserRound size={28} />
              {character.name}
            </h1>
            <p className="nf-editor-subline">
              {character.description || '这个角色还缺少可写摘要。'}
            </p>
            <p className="nf-editor-meta">
              当前项目：{currentSession?.title || '未选择项目'}
            </p>
          </div>
          <div className="nf-editor-actions">
            <button type="button" className="nf-button" onClick={() => router.push('/characters')}>
              <ArrowLeft size={16} />
              返回档案馆
            </button>
            <button type="button" className="nf-button" onClick={() => setRefreshTick((current) => current + 1)}>
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
          <main className="space-y-5">
            <DetailSection title="Profile" icon={<UserRound size={16} />}>
              <div className="flex flex-wrap gap-2">
                <Pill>{labelRole(character.role)}</Pill>
                <Pill>{labelImportance(character.importance)}</Pill>
                <Pill>性别 {labelGender(character.gender)}</Pill>
                {character.age ? <Pill>{character.age} 岁</Pill> : null}
                {character.occupation ? <Pill>{character.occupation}</Pill> : null}
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 font-semibold text-[var(--nf-text)]">欲望 / 目标</div>
                  <SignalList items={goalsAndDesires} empty="暂无明确欲望或目标。" />
                </div>
                <div>
                  <div className="mb-2 font-semibold text-[var(--nf-text)]">伤痕 / 恐惧</div>
                  <SignalList items={woundsAndFears} empty="暂无明确伤痕或恐惧。" />
                </div>
              </div>
            </DetailSection>

            <DetailSection title="Writing hooks" icon={<SparkIcon />}>
              <SignalList items={writingHooks} empty="暂无关系钩子、人物弧线或内在张力。" />
            </DetailSection>

            <DetailSection title="Relationships" icon={<MessageSquareText size={16} />}>
              {character.relationships.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {character.relationships.map((relationship, index) => (
                    <div key={`${relationship.target_name}-${index}`} className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold text-[var(--nf-text)]">{relationship.target_name}</div>
                        <Pill>{relationship.relationship || '未标注'}</Pill>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[var(--nf-text-muted)]">
                        {relationship.description || '暂无关系描述。'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="暂无关系信息"
                  description="这个角色还没有可写的人物关系。建议回到角色档案馆或工作台补强关系。"
                  icon={<MessageSquareText size={34} />}
                >
                  <button type="button" className="nf-button" onClick={() => router.push('/characters')}>
                    查看角色档案馆
                  </button>
                </EmptyState>
              )}
            </DetailSection>

            <DetailSection title="Evidence" icon={<Quote size={16} />}>
              <SignalList items={evidence} empty="暂无原文证据、示例对白或行为片段。" />
            </DetailSection>
          </main>

          <aside className="space-y-4">
            <DetailSection title="档案摘要" icon={<BookOpen size={16} />}>
              <div className="space-y-3">
                <div className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] p-4">
                  <div className="text-xs font-semibold text-[var(--nf-text-subtle)]">性格特征</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {personalityTraits.length > 0 ? personalityTraits.map((trait, index) => (
                      <Pill key={`${trait}-${index}`}>{trait}</Pill>
                    )) : <span className="text-sm text-[var(--nf-text-muted)]">暂无性格特征。</span>}
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] p-4">
                  <div className="text-xs font-semibold text-[var(--nf-text-subtle)]">别名</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {character.aliases && character.aliases.length > 0 ? character.aliases.map((alias) => (
                      <Pill key={alias}>{alias}</Pill>
                    )) : <span className="text-sm text-[var(--nf-text-muted)]">暂无别名。</span>}
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] p-4">
                  <div className="text-xs font-semibold text-[var(--nf-text-subtle)]">能力 / 标签</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[...character.abilities, ...character.tags].slice(0, 10).map((item) => (
                      <Pill key={item}>{item}</Pill>
                    ))}
                    {[...character.abilities, ...character.tags].length === 0 ? (
                      <span className="text-sm text-[var(--nf-text-muted)]">暂无能力或标签。</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </DetailSection>

            <details className="nf-panel nf-panel-pad">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--nf-text)]">
                高级详情：原始 extracted_data
              </summary>
              <pre className="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-bg)] p-4 text-xs leading-5 text-[var(--nf-text-muted)]">
                {JSON.stringify(contentItem?.extracted_data ?? {}, null, 2)}
              </pre>
            </details>

            <div className="nf-panel nf-panel-pad">
              <div className="nf-panel-title">
                <Database size={16} />
                下一步
              </div>
              <div className="mt-3 grid gap-2">
                <button type="button" className="nf-button" onClick={() => router.push('/')}>
                  带入 AI 写作
                </button>
                <button type="button" className="nf-button" onClick={() => router.push('/extract')}>
                  补强提取质量
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function SparkIcon() {
  return <span className="text-[var(--nf-accent)]">✦</span>;
}
