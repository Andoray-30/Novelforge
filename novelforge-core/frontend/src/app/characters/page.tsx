'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import CharacterCard from '@/components/Character/CharacterCard';
import CharacterRelationshipGraph from '@/components/Character/CharacterRelationshipGraph';
import { Users, Database, Wand2, Filter, Network, LayoutGrid } from 'lucide-react';
import type { Character, ContentItem, ImportanceLevel, NetworkEdge } from '@/types';
import type { ToolCall } from '@/lib/chat-parser';

type ArtifactData = ContentItemArtifactData & { toolCall?: ToolCall };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
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
    description: typeof data.description === 'string' ? data.description : '',
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
    goals: [...asStringArray(data.goals), ...asStringArray(creativeSignals.desires)],
    desires: [...asStringArray(data.desires), ...asStringArray(creativeSignals.desires)],
    fears: [...asStringArray(data.fears), ...asStringArray(creativeSignals.wounds)],
    wounds: [...asStringArray(data.wounds), ...asStringArray(creativeSignals.wounds)],
    conflicts: asStringArray(data.conflicts),
    personality_tension: typeof data.personality_tension === 'string' ? data.personality_tension : asStringArray(creativeSignals.emotional_states)[0],
    character_arc: typeof data.character_arc === 'string' ? data.character_arc : undefined,
    relationship_hooks: asStringArray(data.relationship_hooks),
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
    example_messages: Array.isArray(data.example_messages)
      ? data.example_messages.filter((value): value is string => typeof value === 'string')
      : [],
    example_dialogues: Array.isArray(data.example_dialogues)
      ? data.example_dialogues.filter((value): value is string => typeof value === 'string')
      : [],
    behavior_examples: Array.isArray(data.behavior_examples)
      ? data.behavior_examples.filter((value): value is string => typeof value === 'string')
      : [],
    source_contexts: Array.isArray(data.source_contexts)
      ? data.source_contexts.filter((value): value is string => typeof value === 'string')
      : [],
    importance: inferImportance(data.importance, data.role),
  };
}

function buildRelationshipEdges(characters: Character[], relationshipItems: ContentItem[]): NetworkEdge[] {
  const characterIdByName = new Map(
    characters
      .filter((character) => character.name.trim().length > 0)
      .map((character) => [character.name.trim(), character.id]),
  );

  const persistedEdges = resolveRelationshipEdges(characters, relationshipItems);

  if (persistedEdges.length > 0) {
    return persistedEdges;
  }

  const derivedEdges: NetworkEdge[] = [];
  characters.forEach((char) => {
    char.relationships.forEach((rel) => {
      const target = characters.find((candidate) => candidate.name === rel.target_name);
      derivedEdges.push({
        source: char.id,
        target: target?.id || rel.target_name,
        relationship_type: normalizeRelationshipType(rel.relationship),
        description: rel.description,
        strength: 5,
        status: 'active',
        evidence: rel.description ? [rel.description] : [],
      });
    });
  });
  return derivedEdges;
}

function characterNameById(characters: Character[], id: string) {
  return characters.find((character) => character.id === id)?.name ?? id;
}

function RelationshipInsightPanel({
  edge,
  characters,
  onClose,
}: {
  edge: NetworkEdge;
  characters: Character[];
  onClose: () => void;
}) {
  const sourceName = edge.source_name || characterNameById(characters, edge.source);
  const targetName = edge.target_name || characterNameById(characters, edge.target);
  const details = edge.relationship_details ?? [];
  const evidence = edge.evidence ?? [];
  const evolution = edge.evolution ?? [];

  return (
    <div className="rounded-3xl border border-blue-400/20 bg-slate-900/90 p-6 shadow-2xl shadow-blue-950/30">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">关系解释</p>
          <h3 className="text-2xl font-bold text-white">{sourceName} 与 {targetName}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {(edge.relationship_types ?? [edge.relationship_type]).map((type) => (
              <span key={type} className="rounded-full border border-blue-300/20 bg-blue-400/10 px-3 py-1 text-xs font-semibold text-blue-100">
                {type}
              </span>
            ))}
            <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
              强度 {edge.strength}/10
            </span>
            {edge.confidence ? (
              <span className="rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1 text-xs font-semibold text-violet-100">
                置信度 {edge.confidence}
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
        >
          关闭
        </button>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-700/60 bg-slate-950/70 p-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-200">关系描述</h4>
          <p className="whitespace-pre-line text-sm leading-7 text-slate-300">
            {edge.description || '暂无关系描述。'}
          </p>
        </div>

        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4">
          <h4 className="mb-3 text-sm font-semibold text-rose-100">张力 / 阶段变化</h4>
          {edge.relationship_tension || evolution.length > 0 ? (
            <div className="space-y-2 text-sm leading-6 text-rose-50/90">
              {edge.relationship_tension ? <p>{edge.relationship_tension}</p> : null}
              {evolution.slice(0, 5).map((item, index) => (
                <p key={`${item}-${index}`} className="rounded-xl bg-slate-950/40 px-3 py-2">{item}</p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-rose-100/60">暂无可解释张力，建议后续关系回补。</p>
          )}
        </div>

        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
          <h4 className="mb-3 text-sm font-semibold text-emerald-100">原文证据</h4>
          {evidence.length > 0 ? (
            <div className="space-y-2">
              {evidence.slice(0, 5).map((item, index) => (
                <blockquote key={`${item}-${index}`} className="rounded-xl border-l-2 border-emerald-300/70 bg-slate-950/40 px-3 py-2 text-sm leading-6 text-emerald-50/90">
                  {item}
                </blockquote>
              ))}
            </div>
          ) : (
            <p className="text-sm text-emerald-100/60">缺少证据，建议标记为待复核关系。</p>
          )}
        </div>
      </div>

      {details.length > 1 ? (
        <div className="mt-4 rounded-2xl border border-slate-700/60 bg-slate-950/70 p-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-200">合并来源</h4>
          <div className="grid gap-2 md:grid-cols-2">
            {details.map((detail) => (
              <div key={detail.asset_id} className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs leading-5 text-slate-300">
                <div className="font-semibold text-slate-100">{detail.title}</div>
                <div>{detail.relationship_type} · {detail.confidence || 'unknown'}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CharactersPage() {
  const router = useRouter();
  const { currentSession, currentSessionId } = useSessions();
  const selectedNovelId = useAppStore((s) => s.selectedNovelId);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterItems, setCharacterItems] = useState<ContentItem[]>([]);
  const [relationships, setRelationships] = useState<NetworkEdge[]>([]);
  const [relationshipItems, setRelationshipItems] = useState<ContentItem[]>([]);
  const [activeArtifacts, setActiveArtifacts] = useState<ArtifactData[]>([]);
  const [artifactPanelVisible, setArtifactPanelVisible] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedRelationshipEdge, setSelectedRelationshipEdge] = useState<NetworkEdge | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'network'>('grid');

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
            limit: 100,
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

        const chars = characterResult.items
          .map(parseCharacter)
          .filter((item): item is Character => item !== null);
        setCharacters(chars);
        setCharacterItems(characterResult.items);
        setRelationshipItems(relationshipResult.items);
        setRelationships(buildRelationshipEdges(chars, relationshipResult.items));
        setSelectedRelationshipEdge(null);
      } catch (loadError) {
        console.error('加载角色失败:', loadError);
        setError(loadError instanceof Error ? loadError.message : '加载角色失败');
      } finally {
        setIsLoading(false);
      }
    };

    void loadCharacters();
  }, [currentSessionId, selectedNovelId, refreshTick]);

  useSessionTaskEvents({
    sessionId: currentSessionId,
    onCompleted: (detail) => {
      if (!['novel_import', 'extraction', 'character_generation', 'relationship_extraction'].includes(detail.taskType)) {
        return;
      }
      setRefreshTick((current) => current + 1);
    },
    onFailed: (detail) => {
      if (!['novel_import', 'extraction', 'character_generation', 'relationship_extraction'].includes(detail.taskType)) {
        return;
      }
      setError(`后台任务失败，角色资产未完成更新：${detail.error || detail.message || 'unknown error'}`);
    },
  });

  const filteredChars = useMemo(
    () => characters.filter((character) =>
      character.name.includes(searchTerm) ||
      character.role.includes(searchTerm) ||
      character.description.includes(searchTerm)
    ),
    [characters, searchTerm]
  );

  const openRelationshipAsset = (edge: NetworkEdge) => {
    const original = relationshipItems.find((item) => {
      const payload = getContentAssetPayload(item);
      const source = asString(payload.source);
      const target = asString(payload.target) || asString(payload.target_name);
      const relationshipType = normalizeRelationshipType(payload.relationship_type || payload.relationship);
      return source === edge.source || source === characters.find((character) => character.id === edge.source)?.name
        ? target === edge.target || target === characters.find((character) => character.id === edge.target)?.name
          ? relationshipType === edge.relationship_type
          : false
        : false;
    });

    if (!original) {
      setError('未找到对应关系资产，暂时无法打开详情。');
      return;
    }

    const result = resolveContentItemReopen(original, selectedNovelId);
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
  };

  const handleSaveArtifact = async (artifact: ArtifactData, updatedData: Record<string, unknown>) => {
    setError(null);
    try {
      const result = await saveReopenedContentItem({
        items: relationshipItems,
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

  const bindableCharacterItems = useMemo(
    () => characterItems.filter(
      (item) => Boolean(selectedNovelId && isUnassignedNovelScopedContentItem(item)),
    ),
    [characterItems, selectedNovelId],
  );

  const bindableRelationshipItems = useMemo(
    () => relationshipItems.filter(
      (item) => Boolean(selectedNovelId && isUnassignedNovelScopedContentItem(item)),
    ),
    [relationshipItems, selectedNovelId],
  );

  const bindableAssets = useMemo(
    () => [...bindableCharacterItems, ...bindableRelationshipItems],
    [bindableCharacterItems, bindableRelationshipItems],
  );

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
      <div className="min-h-screen bg-slate-950 text-slate-100 p-8 pt-16 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">加载角色数据中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 pt-16 selection:bg-blue-500/30">
      <div className="max-w-7xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 p-10 flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl shadow-blue-900/10">
          <div className="absolute top-0 right-0 p-32 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 p-32 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10 max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 flex items-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
              <Users className="w-10 h-10 mr-4 text-blue-400" />
              角色档案馆
            </h1>
            <p className="text-slate-400 text-lg leading-relaxed">
              这里存放着被 AI 从原典文本中剥离出的所有生灵。你可以查阅他们的侧写大纲，或者跳转探索他们那错综复杂的羁绊网络。
            </p>
            <p className="mt-3 text-sm text-slate-500">
              当前项目: {currentSession?.title || '未选择，默认显示全部角色资产'}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              当前小说: {selectedNovelId ? '已按当前小说容器收敛角色与关系网络' : '当前展示全部小说聚合角色与关系网络'}
            </p>
          </div>

          <div className="relative z-10 flex items-center gap-4 bg-slate-800/80 p-4 rounded-2xl border border-slate-700 backdrop-blur-md shrink-0">
             <div className="flex flex-col items-center justify-center p-3 bg-slate-950/50 rounded-xl w-24">
               <span className="text-3xl font-black text-white">{characters.length}</span>
               <span className="text-xs font-medium text-slate-400 mt-1 uppercase tracking-wider">在库刻印</span>
             </div>
             <div className="flex flex-col items-center justify-center p-3 bg-slate-950/50 rounded-xl w-24">
               <span className="text-3xl font-black text-rose-400">{characters.filter(c => c.importance === 'critical').length}</span>
               <span className="text-xs font-medium text-slate-400 mt-1 uppercase tracking-wider">核心锚点</span>
             </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="relative w-full md:w-96 group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Filter className="w-5 h-5 text-slate-400 group-focus-within:text-blue-400 transition-colors" />
            </div>
            <input
              type="text"
              placeholder="通过尊名、特质或职能检索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700/50 text-slate-200 placeholder-slate-500 rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 backdrop-blur-md transition-all shadow-inner"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex bg-slate-900/80 p-1.5 rounded-2xl border border-slate-700/50 backdrop-blur-md">
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center px-4 py-2 rounded-xl transition-all font-medium text-sm ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
              >
                <LayoutGrid className="w-4 h-4 mr-2" />
                陈列柜
              </button>
              <button
                onClick={() => setViewMode('network')}
                className={`flex items-center px-4 py-2 rounded-xl transition-all font-medium text-sm ${viewMode === 'network' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
              >
                <Network className="w-4 h-4 mr-2" />
                羁绊全景
              </button>
            </div>

            <button
              onClick={() => router.push('/extract')}
              className="hidden lg:flex whitespace-nowrap items-center bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-2.5 px-6 rounded-2xl transition-all shadow-lg shadow-blue-900/30 hover:shadow-blue-900/50 active:scale-95"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              降临躯壳
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-200">
            {error}
          </div>
        )}
        {saveMessage && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-emerald-200">
            {saveMessage}
          </div>
        )}

        {bindableAssets.length > 0 && (
          <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-5 py-4 text-indigo-100">
            <div className="mb-3 text-sm font-semibold">发现未绑定到当前小说的角色/关系资产</div>
            <div className="flex flex-wrap gap-2">
              {bindableAssets.map((item) => (
                <button
                  key={item.metadata.id}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void bindAssetToSelectedNovel(item);
                  }}
                  className="rounded-full border border-indigo-300/30 bg-indigo-400/10 px-3 py-1 text-xs font-medium text-indigo-100 transition hover:border-indigo-200/60 hover:bg-indigo-400/20"
                >
                  绑定「{getContentAssetTitle(item)}」({item.metadata.type === 'character' ? '角色' : '关系'})
                </button>
              ))}
            </div>
          </div>
        )}

        {characters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/20 backdrop-blur-sm">
            <Database className="w-16 h-16 text-slate-700 mb-6" />
            <h3 className="text-2xl font-bold text-slate-300 mb-2">未发现命运的收束点</h3>
            <p className="text-slate-500 max-w-md">
              当前项目下还没有任何角色资产。你可以通过文本提取、AI 规划，或在聊天中继续生成并保存角色。
            </p>
          </div>
        ) : viewMode === 'network' ? (
          <div className="h-[750px] w-full animate-in fade-in zoom-in-95 duration-500">
            <CharacterRelationshipGraph
              characters={filteredChars}
              relationships={relationships.filter(
                (edge) =>
                  filteredChars.some((character) => character.id === edge.source || character.id === edge.target) ||
                  filteredChars.some((character) => character.name === edge.source || character.name === edge.target)
              )}
              onRelationshipSelect={setSelectedRelationshipEdge}
            />
            {selectedRelationshipEdge ? (
              <div className="mt-6">
                <RelationshipInsightPanel
                  edge={selectedRelationshipEdge}
                  characters={characters}
                  onClose={() => setSelectedRelationshipEdge(null)}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredChars.map((character, index) => (
              <div
                key={character.id}
                className="animate-in fade-in zoom-in-95 fill-mode-both"
                style={{ animationDelay: `${index * 50}ms`, animationDuration: '600ms' }}
              >
                <CharacterCard
                  character={character}
                  onViewDetail={(currentCharacter) => router.push(`/characters/${currentCharacter.id}`)}
                  onRelationshipView={() => setViewMode('network')}
                />
              </div>
            ))}
          </div>
        )}

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
