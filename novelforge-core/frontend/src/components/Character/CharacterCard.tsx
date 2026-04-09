import React from 'react';
import { Character } from '@/types';
import { User, Activity, AlertCircle, Sparkles, BookOpen } from 'lucide-react';

interface CharacterCardProps {
  character: Character;
  onEdit?: (character: Character) => void;
  onViewDetail?: (character: Character) => void;
  onRelationshipView?: (character: Character) => void;
}

const CharacterCard: React.FC<CharacterCardProps> = ({
  character,
  onEdit,
  onViewDetail,
  onRelationshipView
}) => {
  // 提取性格标语
  const personalityTraits = character.personality 
    ? character.personality.split(/[，,、\n]/).filter(t => t.trim().length > 0) 
    : [];

  const getImportanceColor = (importance: string) => {
    switch (importance) {
      case 'critical': return 'from-rose-500 to-rose-700 shadow-rose-900/40 text-rose-50';
      case 'high': return 'from-amber-500 to-orange-600 shadow-orange-900/40 text-amber-50';
      case 'medium': return 'from-blue-500 to-indigo-600 shadow-blue-900/40 text-blue-50';
      default: return 'from-slate-600 to-slate-800 shadow-slate-900/40 text-slate-200';
    }
  };

  const getImportanceLabel = (importance: string) => {
    switch (importance) {
      case 'critical': return '核心角色';
      case 'high': return '重要角色';
      case 'medium': return '次要角色';
      default: return '边缘角色';
    }
  };

  return (
    <div className="group relative flex flex-col justify-between bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 transition-all duration-500 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-900/20 overflow-hidden">
      
      {/* 质感光晕 */}
      <div className="absolute -inset-0.5 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl" />

      <div>
        <div className="flex justify-between items-start mb-4 relative z-10">
          <div className="flex items-center space-x-3">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center font-bold text-xl shadow-lg ${getImportanceColor(character.importance)}`}>
              {character.name.charAt(0)}
            </div>
            <div>
              <h3 className="text-xl font-bold tracking-tight text-white mb-1">
                {character.name}
              </h3>
              <p className="text-sm font-medium text-emerald-400 bg-emerald-400/10 inline-flex items-center px-2 py-0.5 rounded-full">
                <Sparkles className="w-3 h-3 mr-1" /> {character.role}
              </p>
            </div>
          </div>
          
          <div className={`text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded-md bg-gradient-to-r ${getImportanceColor(character.importance)}`}>
            {getImportanceLabel(character.importance)}
          </div>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed line-clamp-3 mb-4 min-h-[60px] relative z-10">
          {character.description}
        </p>

        {personalityTraits.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6 relative z-10">
            {personalityTraits.slice(0, 3).map((trait, idx) => (
              <span key={idx} className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
                {trait.trim()}
              </span>
            ))}
            {personalityTraits.length > 3 && (
              <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-500">
                +{personalityTraits.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-auto relative z-10">
        <button 
          onClick={() => onViewDetail && onViewDetail(character)}
          className="flex items-center justify-center space-x-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl transition-colors"
        >
          <User className="w-4 h-4" />
          <span>查看侧写</span>
        </button>
        <button 
          onClick={() => onRelationshipView && onRelationshipView(character)}
          className="flex items-center justify-center space-x-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors shadow-lg shadow-blue-900/30"
        >
          <Activity className="w-4 h-4" />
          <span>羁绊网络</span>
        </button>
      </div>
    </div>
  );
};

export default CharacterCard;