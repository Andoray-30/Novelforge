import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Character } from '@/types';

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
  // 将性格字符串转换为数组，以便显示多个特质
  const personalityTraits = character.personality ?
    character.personality.split(/[，,、\n]/).filter(trait => trait.trim().length > 0) : [];

  return (
    <Card className="w-full hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg">{character.name}</CardTitle>
          <Badge variant="secondary">
            {character.importance || '普通角色'}
          </Badge>
        </div>
        {character.appearance && (
          <div className="mt-2 flex justify-center">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-xs text-muted-foreground">
              {character.name.charAt(0)}
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground line-clamp-2">
            {character.description}
          </p>
          
          {personalityTraits.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {personalityTraits.map((trait, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {trait.trim()}
                </Badge>
              ))}
            </div>
          )}
          
          <div className="flex justify-between items-center pt-2">
            <div className="text-xs text-muted-foreground">
              出场次数: {character.example_messages?.length || 0}
            </div>
            <div className="flex space-x-2">
              {onViewDetail && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onViewDetail(character)}
                >
                  详情
                </Button>
              )}
              {onEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onEdit(character)}
                >
                  编辑
                </Button>
              )}
              {onRelationshipView && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRelationshipView(character)}
                >
                  关系
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CharacterCard;