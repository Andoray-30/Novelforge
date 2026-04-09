'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { contentService } from '@/lib/api';
import CharacterCard from '@/components/Character/CharacterCard';
import CharacterRelationshipGraph from '@/components/Character/CharacterRelationshipGraph';
import { Users, Database, Wand2, Filter, Network, LayoutGrid } from 'lucide-react';
import { Character, ContentItem, NetworkEdge } from '@/types';

function parseCharacter(item: ContentItem): Character | null {
  const payload = item.extracted_data;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const data = payload as Record<string, unknown>;
  const name = typeof data.name === 'string' && data.name.trim().length > 0
    ? data.name
    : item.metadata.title;

  return {
    id: item.metadata.id,
    name,
    description: typeof data.description === 'string' ? data.description : '',
    personality: typeof data.personality === 'string' ? data.personality : '',
    background: typeof data.background === 'string' ? data.background : '',
    role: typeof data.role === 'string' ? data.role : 'supporting',
    age: typeof data.age === 'number' ? data.age : undefined,
    gender: typeof data.gender === 'string' ? data.gender : undefined,
    appearance: typeof data.appearance === 'string' ? data.appearance : undefined,
    occupation: typeof data.occupation === 'string' ? data.occupation : undefined,
    abilities: Array.isArray(data.abilities) ? data.abilities.filter((value): value is string => typeof value === 'string') : [],
    tags: Array.isArray(data.tags) ? data.tags.filter((value): value is string => typeof value === 'string') : item.metadata.tags,
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
    importance:
      data.importance === 'critical' || data.importance === 'high' || data.importance === 'medium' || data.importance === 'low'
        ? data.importance
        : 'medium',
  };
}

export default function CharactersPage() {
  const router = useRouter();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [relationships, setRelationships] = useState<NetworkEdge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'network'>('grid');

  useEffect(() => {
    const loadCharacters = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await contentService.searchContent({
          query: '',
          content_type: 'character',
          limit: 100,
        });

        const chars = result.items
          .map(parseCharacter)
          .filter((item): item is Character => item !== null);
        setCharacters(chars);

        const allRelationships: NetworkEdge[] = [];
        chars.forEach((char) => {
          char.relationships.forEach((rel) => {
            const target = chars.find((candidate) => candidate.name === rel.target_name);
            allRelationships.push({
              source: char.id,
              target: target?.id || rel.target_name,
              relationship_type: 'other',
              description: rel.description,
              strength: 5,
              status: 'active',
              evidence: rel.description ? [rel.description] : [],
            });
          });
        });
        setRelationships(allRelationships);
      } catch (loadError) {
        console.error('加载角色失败:', loadError);
        setError(loadError instanceof Error ? loadError.message : '加载角色失败');
      } finally {
        setIsLoading(false);
      }
    };

    loadCharacters();
  }, []);

  const filteredChars = characters.filter((character) =>
    character.name.includes(searchTerm) ||
    character.role.includes(searchTerm) ||
    character.description.includes(searchTerm)
  );

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

        {characters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/20 backdrop-blur-sm">
            <Database className="w-16 h-16 text-slate-700 mb-6" />
            <h3 className="text-2xl font-bold text-slate-300 mb-2">未发现命运的收束点</h3>
            <p className="text-slate-500 max-w-md">
              当前档案馆中没有任何实体。你可以通过文本提取引擎上传文稿，或者直接呼叫 Agent 为你凭空构造。
            </p>
          </div>
        ) : viewMode === 'network' ? (
          <div className="h-[750px] w-full animate-in fade-in zoom-in-95 duration-500">
            <CharacterRelationshipGraph characters={filteredChars} relationships={relationships.filter((edge) => filteredChars.some((character) => character.id === edge.source))} />
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

      </div>
    </div>
  );
}
