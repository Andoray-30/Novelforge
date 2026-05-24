import React from 'react';
import { Activity, BookOpen, Sparkles, User } from 'lucide-react';
import type { Character } from '@/types';

interface CharacterCardProps {
  character: Character;
  onEdit?: (character: Character) => void;
  onViewDetail?: (character: Character) => void;
  onRelationshipView?: (character: Character) => void;
}

function importanceStyle(importance: string) {
  switch (importance) {
    case 'critical':
      return 'from-rose-500 to-rose-700 shadow-rose-900/40 text-rose-50';
    case 'high':
      return 'from-amber-500 to-orange-600 shadow-orange-900/40 text-amber-50';
    case 'medium':
      return 'from-blue-500 to-indigo-600 shadow-blue-900/40 text-blue-50';
    default:
      return 'from-slate-600 to-slate-800 shadow-slate-900/40 text-slate-200';
  }
}

function importanceLabel(importance: string) {
  switch (importance) {
    case 'critical':
      return '核心角色';
    case 'high':
      return '重要角色';
    case 'medium':
      return '次要角色';
    default:
      return '边缘角色';
  }
}

function compactSignals(character: Character) {
  return [
    ...(character.goals ?? []),
    ...(character.desires ?? []),
    ...(character.conflicts ?? []),
    character.personality_tension,
    character.character_arc,
  ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

const CharacterCard: React.FC<CharacterCardProps> = ({
  character,
  onViewDetail,
  onRelationshipView,
}) => {
  const signals = compactSignals(character);
  const traits = character.personality
    ? character.personality.split(/[，、；;\n]/).map((item) => item.trim()).filter(Boolean)
    : [];

  return (
    <div className="group relative flex min-h-[390px] flex-col justify-between overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900/60 p-6 shadow-xl shadow-black/10 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-blue-900/20">
      <div className="pointer-events-none absolute -inset-0.5 rounded-2xl bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="relative z-10">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-xl font-bold shadow-lg ${importanceStyle(character.importance)}`}>
              {character.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-xl font-bold tracking-tight text-white">{character.name}</h3>
              <p className="mt-1 inline-flex items-center rounded-full bg-emerald-400/10 px-2 py-0.5 text-sm font-medium text-emerald-300">
                <Sparkles className="mr-1 h-3 w-3" />
                {character.role}
              </p>
            </div>
          </div>
          <div className={`rounded-md bg-gradient-to-r px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${importanceStyle(character.importance)}`}>
            {importanceLabel(character.importance)}
          </div>
        </div>

        <p className="mb-4 min-h-[60px] line-clamp-3 text-sm leading-6 text-slate-300">
          {character.description || '暂无角色描述。'}
        </p>

        {signals.length > 0 && (
          <div className="mb-4 rounded-xl border border-violet-400/15 bg-violet-400/10 p-3">
            <div className="mb-2 flex items-center text-xs font-semibold text-violet-200">
              <BookOpen className="mr-1.5 h-3.5 w-3.5" />
              创作抓手
            </div>
            <p className="line-clamp-3 text-xs leading-5 text-violet-100/85">{signals[0]}</p>
          </div>
        )}

        {traits.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {traits.slice(0, 3).map((trait, index) => (
              <span key={`${trait}-${index}`} className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
                {trait}
              </span>
            ))}
            {traits.length > 3 && (
              <span className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-500">
                +{traits.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="relative z-10 mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onViewDetail?.(character)}
          className="flex items-center justify-center gap-2 rounded-xl bg-slate-800 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
        >
          <User className="h-4 w-4" />
          查看侧写
        </button>
        <button
          type="button"
          onClick={() => onRelationshipView?.(character)}
          className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-900/30 transition hover:bg-blue-500"
        >
          <Activity className="h-4 w-4" />
          羁绊网络
        </button>
      </div>
    </div>
  );
};

export default CharacterCard;
