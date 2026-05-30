'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Filter,
  MessageSquareText,
  Network,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import { contentService } from '@/lib/api';
import { ArtifactPanel } from '@/components/chat/ArtifactPanel';
import {
  resolveContentItemReopen,
  saveReopenedContentItem,
  type ContentItemArtifactData,
} from '@/lib/content-item-reopen';
import { useAppStore } from '@/lib/hooks/use-app-store';
import { getContentAssetPayload, getContentAssetTitle } from '@/lib/content-contract';
import {
  bindContentItemToNovel,
  isUnassignedNovelScopedContentItem,
} from '@/lib/content-item-binding';
import {
  decodeAssetTitle,
  normalizeRelationshipType,
  resolveRelationshipEdges,
} from '@/lib/asset-normalization';
import { useSessionTaskEvents } from '@/lib/hooks/use-session-task-events';
import { useSessions } from '@/lib/hooks/use-sessions';
import { shouldRefreshCharacterLibrary } from '@/lib/task-refresh-scope';
import CharacterRelationshipGraph from '@/components/Character/CharacterRelationshipGraph';
import type { Character, ContentItem, ImportanceLevel, NetworkEdge } from '@/types';
import type { ToolCall } from '@/lib/chat-parser';

type ArtifactData = ContentItemArtifactData & { toolCall?: ToolCall };
type CharacterFilter = 'all' | 'core' | 'supporting' | 'needs_repair';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function normalizeImportance(value: unknown): ImportanceLevel {
  switch (value) {
    case 'critical':
    case 'high':
    case 'medium':
    case 'low':
      return value;
    default:
      return 'medium';
  }
}

function inferImportance(value: unknown, roleValue: unknown): ImportanceLevel {
  const explicit = normalizeImportance(value);
  if (value === 'critical' || value === 'high' || value === 'medium' || value === 'low') {
    return explicit;
  }
  const role = String(roleValue || '').toLowerCase().split('.').pop();
  if (role === 'protagonist') return 'critical';
  if (role === 'antagonist') return 'high';
  if (role === 'supporting') return 'medium';
  return explicit;
}

function parseCharacter(item: ContentItem): Character | null {
  const payload = item.extracted_data;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const data = payload as Record<string, unknown>;
  const creativeSignals = asRecord(data.creative_signals) ?? {};
  const name = typeof data.name === 'string' && data.name.trim().length > 0
    ? data.name
    : item.metadata.title;

  return {
    id: item.metadata.id,
    name: decodeAssetTitle(name),
    description: asString(data.description),
    personality: asString(data.personality),
    background: asString(data.background),
    role: asString(data.role).split('.').pop() || 'supporting',
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
    example_messages: asStringArray(data.example_messages),
    example_dialogues: asStringArray(data.example_dialogues),
    behavior_examples: asStringArray(data.behavior_examples),
    source_contexts: asStringArray(data.source_contexts),
    importance: inferImportance(data.importance, data.role),
  };
}

function buildRelationshipEdges(characters: Character[], relationshipItems: ContentItem[]): NetworkEdge[] {
  const persistedEdges = resolveRelationshipEdges(characters, relationshipItems);
  if (persistedEdges.length > 0) {
    return persistedEdges;
  }

  const derivedEdges: NetworkEdge[] = [];
  characters.forEach((character) => {
    character.relationships.forEach((relationship) => {
      const target = characters.find((candidate) => candidate.name === relationship.target_name);
      derivedEdges.push({
        source: character.id,
        target: target?.id || relationship.target_name,
        relationship_type: normalizeRelationshipType(relationship.relationship),
        description: relationship.description,
        strength: 5,
        status: 'active',
        evidence: relationship.description ? [relationship.description] : [],
      });
    });
  });
  return derivedEdges;
}

function getRoleLabel(role: string): string {
  const normalized = role.toLowerCase();
  if (normalized.includes('protagonist')) return '主角';
  if (normalized.includes('antagonist')) return '反派';
  if (normalized.includes('supporting')) return '配角';
  if (normalized.includes('mentor')) return '导师';
  if (normalized.includes('love')) return '情感关系';
  return role || '角色';
}

function getCharacterConfidence(item: ContentItem): number | null {
  const payload = getContentAssetPayload(item);
  const extractionQuality = asRecord(payload.extraction_quality) ?? {};
  return asNumber(payload.confidence) ?? asNumber(extractionQuality.confidence);
}

function getCharacterSummary(character: Character, item: ContentItem): string {
  return (
    character.description ||
    character.personality ||
    character.background ||
    item.content ||
    '这个角色还缺少可写摘要，需要补充欲望、伤痕、恐惧或说话方式。'
  );
}

function getSignalList(character: Character): Array<{ label: string; value: string }> {
  const entries = [
    { label: '欲望', value: character.desires?.[0] || character.goals?.[0] || '' },
    { label: '伤痕', value: character.wounds?.[0] || '' },
    { label: '恐惧', value: character.fears?.[0] || '' },
    { label: '说话方式', value: character.example_dialogues?.[0] || character.example_messages?.[0] || '' },
    { label: '人物弧线', value: character.character_arc || '' },
    { label: '关系钩子', value: character.relationship_hooks?.[0] || '' },
  ];
  return entries.filter((entry) => entry.value.trim().length > 0).slice(0, 4);
}

function isLowInfoCharacter(character: Character, item: ContentItem): boolean {
  const confidence = getCharacterConfidence(item);
  return getSignalList(character).length < 2 || (confidence !== null && confidence < 0.55);
}

function formatConfidence(confidence: number | null): string {
  if (confidence === null) return '未标注';
  return `${Math.round(confidence * 100)}%`;
}

function getAssetTypeLabel(type: string): string {
  if (type === 'relationship') return '关系';
  if (type === 'character') return '角色';
  return type;
}

export default function CharactersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const directAssetId = searchParams.get('assetId');
  const { currentSession, currentSessionId } = useSessions();
  const selectedNovelId = useAppStore((state) => state.selectedNovelId);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterItems, setCharacterItems] = useState<ContentItem[]>([]);
  const [relationshipItems, setRelationshipItems] = useState<ContentItem[]>([]);
  const [relationships, setRelationships] = useState<NetworkEdge[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<CharacterFilter>('all');
  const [activeArtifacts, setActiveArtifacts] = useState<ArtifactData[]>([]);
  const [artifactPanelVisible, setArtifactPanelVisible] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const loadCharacters = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [characterResult, relationshipResult] = await Promise.all([
          contentService.searchContent({
            query: '',
            content_type: 'character',
            session_id: currentSessionId || undefined,
            parent_id: selectedNovelId || undefined,
            limit: 200,
            include_content: false,
          }),
          contentService.searchContent({
            query: '',
            content_type: 'relationship',
            session_id: currentSessionId || undefined,
            parent_id: selectedNovelId || undefined,
            limit: 200,
            include_content: false,
          }),
        ]);

        const parsedCharacters = characterResult.items
          .map(parseCharacter)
          .filter((item): item is Character => item !== null);
        setCharacters(parsedCharacters);
        setCharacterItems(characterResult.items);
        setRelationshipItems(relationshipResult.items);
        setRelationships(buildRelationshipEdges(parsedCharacters, relationshipResult.items));
      } catch (loadError) {
        console.error('Failed to load character assets:', loadError);
        setError(loadError instanceof Error ? loadError.message : '加载角色资产失败');
      } finally {
        setIsLoading(false);
      }
    };

    void loadCharacters();
  }, [currentSessionId, selectedNovelId, refreshTick]);

  useSessionTaskEvents({
    sessionId: currentSessionId,
    onCompleted: (detail) => {
      if (!shouldRefreshCharacterLibrary(detail.taskType)) {
        return;
      }
      setRefreshTick((current) => current + 1);
    },
    onFailed: (detail) => {
      if (!shouldRefreshCharacterLibrary(detail.taskType)) {
        return;
      }
      setError(`后台任务失败，角色资料库可能未完全更新：${detail.error || detail.message || '未知错误'}`);
    },
  });

  const characterById = useMemo(
    () => new Map(characterItems.map((item) => [item.metadata.id, item])),
    [characterItems],
  );

  const filteredCharacters = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return characters.filter((character) => {
      const item = characterById.get(character.id);
      const text = [
        character.name,
        character.role,
        character.description,
        character.personality,
        character.background,
        ...(character.tags || []),
      ].join(' ').toLowerCase();
      const keywordMatched = !keyword || text.includes(keyword);
      const lowInfo = item ? isLowInfoCharacter(character, item) : false;
      if (filter === 'core') return keywordMatched && ['critical', 'high'].includes(character.importance);
      if (filter === 'supporting') return keywordMatched && !['critical', 'high'].includes(character.importance);
      if (filter === 'needs_repair') return keywordMatched && lowInfo;
      return keywordMatched;
    });
  }, [characterById, characters, filter, searchTerm]);

  const lowInfoCount = useMemo(
    () => characters.filter((character) => {
      const item = characterById.get(character.id);
      return item ? isLowInfoCharacter(character, item) : false;
    }).length,
    [characterById, characters],
  );

  const bindableAssets = useMemo(
    () => [...characterItems, ...relationshipItems].filter(
      (item) => Boolean(selectedNovelId && isUnassignedNovelScopedContentItem(item)),
    ),
    [characterItems, relationshipItems, selectedNovelId],
  );

  const openContentAsset = useCallback((item: ContentItem) => {
    const result = resolveContentItemReopen(item, selectedNovelId);
    if (result.kind === 'error') {
      setError(result.message);
      return;
    }
    if (result.kind === 'route') {
      router.push(result.href);
      return;
    }
    setActiveArtifacts([result.artifact]);
    setArtifactPanelVisible(true);
    setSaveMessage(result.message);
  }, [router, selectedNovelId]);

  useEffect(() => {
    if (!directAssetId) return;
    let disposed = false;

    const openDirectAsset = async () => {
      try {
        const item = await contentService.getById(directAssetId);
        if (disposed) return;
        if (currentSessionId && item.metadata.session_id && item.metadata.session_id !== currentSessionId) {
          setError('该资产不属于当前项目，请先切换到对应项目后再查看。');
          return;
        }
        openContentAsset(item);
      } catch (openError) {
        if (!disposed) setError(openError instanceof Error ? openError.message : '打开写回资产失败');
      }
    };

    void openDirectAsset();
    return () => {
      disposed = true;
    };
  }, [currentSessionId, directAssetId, openContentAsset, selectedNovelId]);

  const handleSaveArtifact = async (artifact: ArtifactData, updatedData: Record<string, unknown>) => {
    setError(null);
    try {
      const result = await saveReopenedContentItem({
        items: [...characterItems, ...relationshipItems],
        artifact,
        updatedData,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setSaveMessage(`已保存「${result.title}」的修改。`);
      setRefreshTick((current) => current + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存资产失败');
    }
  };

  const bindAssetToSelectedNovel = async (item: ContentItem) => {
    if (!selectedNovelId || !isUnassignedNovelScopedContentItem(item)) {
      return;
    }

    setError(null);
    try {
      await bindContentItemToNovel(item, selectedNovelId);
      setSaveMessage(`已将「${getContentAssetTitle(item)}」绑定到当前小说。`);
      setRefreshTick((current) => current + 1);
    } catch (bindError) {
      setError(bindError instanceof Error ? bindError.message : '绑定资产失败');
    }
  };

  if (isLoading) {
    return (
      <div className="nf-editor-shell">
        <div className="nf-editor-loading">
          <div className="nf-editor-spinner" />
          <p>正在加载角色资料库...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nf-editor-shell">
      <div className="nf-editor-page">
        <section className="nf-editor-hero">
          <div>
            <div className="nf-kicker">Character Archive</div>
            <h1 className="nf-editor-title">
              <Users size={28} />
              角色档案馆
            </h1>
            <p className="nf-editor-subline">
              这里整理当前项目的角色档案、写作信号和关系入口。角色越有欲望、伤痕、恐惧和说话方式，AI 后续创作越稳定。
            </p>
            <p className="nf-editor-meta">
              当前项目：{currentSession?.title || '未选择项目，显示当前会话可读取资产'}
            </p>
          </div>
          <div className="nf-editor-actions">
            <button type="button" className="nf-button" onClick={() => router.push('/')}>
              <ArrowLeft size={16} />
              返回工作台
            </button>
            <button type="button" className="nf-button" onClick={() => setRefreshTick((current) => current + 1)}>
              <RefreshCw size={16} />
              刷新
            </button>
            <button type="button" className="nf-button nf-button-primary" onClick={() => router.push('/extract')}>
              <Wand2 size={16} />
              导入/补强
            </button>
          </div>
        </section>

        {error ? <div className="nf-editor-alert">{error}</div> : null}
        {saveMessage ? <div className="nf-editor-alert success">{saveMessage}</div> : null}

        {bindableAssets.length > 0 ? (
          <div className="nf-panel nf-panel-pad">
            <div className="nf-panel-title">发现未绑定到当前小说的资产</div>
            <div className="nf-panel-subtitle">这些角色或关系可以绑定到当前小说容器，避免后续检索时混入其他项目。</div>
            <div className="nf-pill-row" style={{ marginTop: 12 }}>
              {bindableAssets.slice(0, 8).map((item) => (
                <button
                  key={item.metadata.id}
                  type="button"
                  className="nf-chip"
                  onClick={() => void bindAssetToSelectedNovel(item)}
                >
                  绑定「{getContentAssetTitle(item)}」{getAssetTypeLabel(item.metadata.type)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: '角色总数', value: characters.length },
            { label: '核心角色', value: characters.filter((character) => ['critical', 'high'].includes(character.importance)).length },
            { label: '关系边', value: relationships.length },
            { label: '需要补强', value: lowInfoCount },
          ].map((stat) => (
            <div key={stat.label} className="nf-stat">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <main className="space-y-5">
            <div className="nf-panel nf-panel-pad">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--nf-text-subtle)]" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="搜索角色名、身份、特质..."
                    className="w-full rounded-xl border border-[var(--nf-border)] bg-[var(--nf-surface)] py-2.5 pl-10 pr-3 text-sm text-[var(--nf-text)] outline-none focus:border-[color-mix(in_srgb,var(--nf-accent)_40%,transparent)]"
                  />
                </div>
                <div className="nf-pill-row">
                  {[
                    { id: 'all', label: '全部' },
                    { id: 'core', label: '核心' },
                    { id: 'supporting', label: '配角' },
                    { id: 'needs_repair', label: '需补强' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`nf-chip ${filter === item.id ? 'nf-button-primary' : ''}`}
                      onClick={() => setFilter(item.id as CharacterFilter)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {characters.length === 0 ? (
              <div className="nf-editor-empty">
                <BookOpen size={34} />
                <h3>还没有角色档案</h3>
                <p>先导入长篇文本，或在主工作台让 AI 创建角色并保存到项目内容库。</p>
                <div className="nf-pill-row" style={{ justifyContent: 'center' }}>
                  <button type="button" className="nf-button nf-button-primary" onClick={() => router.push('/extract')}>
                    去导入
                  </button>
                  <button type="button" className="nf-button" onClick={() => router.push('/')}>
                    打开主工作台
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredCharacters.map((character) => {
                  const item = characterById.get(character.id);
                  const confidence = item ? getCharacterConfidence(item) : null;
                  const signals = getSignalList(character);
                  const lowInfo = item ? isLowInfoCharacter(character, item) : false;
                  return (
                    <article key={character.id} className="nf-panel nf-panel-pad">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="nf-kicker">{getRoleLabel(character.role)}</div>
                          <h2 className="text-xl font-semibold text-[var(--nf-text)]">{character.name}</h2>
                        </div>
                        {lowInfo ? (
                          <span className="rounded-full border border-[color-mix(in_srgb,var(--nf-warning)_32%,transparent)] bg-[color-mix(in_srgb,var(--nf-warning)_8%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--nf-warning)]">
                            需要补强
                          </span>
                        ) : (
                          <span className="rounded-full border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] px-3 py-1 text-xs font-semibold text-[var(--nf-text-muted)]">
                            可写
                          </span>
                        )}
                      </div>
                      <p className="mt-3 line-clamp-4 text-sm leading-6 text-[var(--nf-text-muted)]">
                        {item ? getCharacterSummary(character, item) : character.description}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="nf-chip">置信度 {formatConfidence(confidence)}</span>
                        {character.aliases?.[0] ? <span className="nf-chip">别名 {character.aliases[0]}</span> : null}
                        {character.importance ? <span className="nf-chip">{character.importance}</span> : null}
                      </div>
                      <div className="mt-4 space-y-2">
                        {signals.length > 0 ? signals.map((signal) => (
                          <div key={`${character.id}-${signal.label}`} className="rounded-xl border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] px-3 py-2">
                            <div className="text-xs font-semibold text-[var(--nf-text-subtle)]">{signal.label}</div>
                            <div className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--nf-text)]">{signal.value}</div>
                          </div>
                        )) : (
                          <div className="rounded-xl border border-[color-mix(in_srgb,var(--nf-warning)_28%,transparent)] bg-[color-mix(in_srgb,var(--nf-warning)_7%,transparent)] px-3 py-2 text-sm text-[var(--nf-text-muted)]">
                            缺少欲望、伤痕、恐惧、说话方式等写作信号。
                          </div>
                        )}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" className="nf-button" onClick={() => item && openContentAsset(item)}>
                          查看/编辑
                        </button>
                        <button type="button" className="nf-button" onClick={() => router.push('/?mode=chat')}>
                          <MessageSquareText size={15} />
                          带入写作
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </main>

          <aside className="space-y-4">
            <div className="nf-panel nf-panel-pad">
              <div className="nf-panel-title">
                <Filter size={16} />
                质量提示
              </div>
              <div className="mt-3 space-y-3 text-sm leading-6 text-[var(--nf-text-muted)]">
                <p>低信息角色不会被隐藏，但会标记为“需要补强”。优先补主角、反派和核心关系中的角色。</p>
                <p>推荐补充：人物欲望、伤痕、恐惧、说话方式、关系钩子、可写场景。</p>
              </div>
            </div>
            <div className="nf-panel nf-panel-pad">
              <div className="nf-panel-title">
                <Network size={16} />
                关系网络
              </div>
              <p className="nf-panel-subtitle">图谱保留为次级检查工具，默认不抢占角色档案视线。</p>
              <details className="nf-save-details mt-3">
                <summary>展开关系图谱</summary>
                <div className="mt-3 h-[420px] overflow-hidden rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-panel-soft)]">
                  <CharacterRelationshipGraph
                    characters={filteredCharacters}
                    relationships={relationships.filter(
                      (edge) =>
                        filteredCharacters.some((character) => character.id === edge.source || character.id === edge.target) ||
                        filteredCharacters.some((character) => character.name === edge.source || character.name === edge.target),
                    )}
                  />
                </div>
              </details>
            </div>
            <div className="nf-panel nf-panel-pad">
              <div className="nf-panel-title">
                <Sparkles size={16} />
                下一步
              </div>
              <div className="mt-3 grid gap-2">
                <button type="button" className="nf-button" onClick={() => router.push('/extract')}>
                  修复提取质量
                </button>
                <button type="button" className="nf-button" onClick={() => router.push('/analytics')}>
                  查看项目总览
                </button>
                <button type="button" className="nf-button" onClick={() => router.push('/')}>
                  回到 AI 写作
                </button>
              </div>
            </div>
            {lowInfoCount > 0 ? (
              <div className="nf-alert">
                <AlertCircle size={16} />
                还有 {lowInfoCount} 个角色缺少写作信号。可以先写作，但建议在生成序章前补强核心人物。
              </div>
            ) : null}
          </aside>
        </div>

        <ArtifactPanel
          visible={artifactPanelVisible}
          onClose={() => setArtifactPanelVisible(false)}
          artifacts={activeArtifacts}
          onSaveToProject={(artifact, updatedData) => {
            void handleSaveArtifact(artifact, updatedData);
          }}
          onSaveAll={async (payload) => {
            for (const item of payload) {
              await handleSaveArtifact(item.artifact, item.data);
            }
          }}
        />
      </div>
    </div>
  );
}
