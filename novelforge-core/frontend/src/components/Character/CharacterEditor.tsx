import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Character } from '@/types';

interface CharacterEditorProps {
  character: Character;
  onSave: (updatedCharacter: Character) => void;
  onCancel: () => void;
}

const CharacterEditor: React.FC<CharacterEditorProps> = ({ 
  character, 
  onSave, 
  onCancel 
}) => {
  const [editedCharacter, setEditedCharacter] = useState<Character>(character);
  const [newTrait, setNewTrait] = useState<string>('');

  const handleSave = () => {
    onSave(editedCharacter);
  };

  const handleFieldChange = (field: keyof Character, value: any) => {
    setEditedCharacter({
      ...editedCharacter,
      [field]: value
    });
  };

  const addPersonalityTrait = () => {
    if (newTrait.trim()) {
      const traits = editedCharacter.personality 
        ? editedCharacter.personality.split(/[，,、\n]/) 
        : [];
      if (!traits.includes(newTrait.trim())) {
        traits.push(newTrait.trim());
        handleFieldChange('personality', traits.join('，'));
        setNewTrait('');
      }
    }
  };

  const removePersonalityTrait = (traitToRemove: string) => {
    const traits = editedCharacter.personality 
      ? editedCharacter.personality.split(/[，,、\n]/) 
      : [];
    const updatedTraits = traits.filter(trait => trait !== traitToRemove);
    handleFieldChange('personality', updatedTraits.join('，'));
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>编辑角色</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium text-muted-foreground">角色名称</label>
          <Input
            value={editedCharacter.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            className="mt-1"
          />
        </div>
        
        <div>
          <label className="text-sm font-medium text-muted-foreground">角色描述</label>
          <Textarea
            value={editedCharacter.description}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            className="mt-1"
            rows={3}
          />
        </div>
        
        <div>
          <label className="text-sm font-medium text-muted-foreground">角色背景</label>
          <Textarea
            value={editedCharacter.background || ''}
            onChange={(e) => handleFieldChange('background', e.target.value)}
            className="mt-1"
            rows={3}
          />
        </div>
        
        <div>
          <label className="text-sm font-medium text-muted-foreground">角色类型</label>
          <Input
            value={editedCharacter.role || ''}
            onChange={(e) => handleFieldChange('role', e.target.value)}
            className="mt-1"
          />
        </div>
        
        <div>
          <label className="text-sm font-medium text-muted-foreground">重要性</label>
          <select 
            value={editedCharacter.importance || 'medium'}
            onChange={(e) => handleFieldChange('importance', e.target.value as any)}
            className="w-full mt-1 p-2 border rounded-md bg-background"
          >
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
            <option value="critical">极高</option>
          </select>
        </div>
        
        <div>
          <label className="text-sm font-medium text-muted-foreground">性格特征</label>
          <div className="flex mt-1">
            <Input
              value={newTrait}
              onChange={(e) => setNewTrait(e.target.value)}
              placeholder="输入新特征，回车添加"
              onKeyDown={(e) => e.key === 'Enter' && addPersonalityTrait()}
            />
            <Button 
              type="button" 
              variant="outline" 
              className="ml-2"
              onClick={addPersonalityTrait}
            >
              添加
            </Button>
          </div>
          
          <div className="flex flex-wrap gap-2 mt-2">
            {editedCharacter.personality && 
              editedCharacter.personality
                .split(/[，,、\n]/)
                .filter(trait => trait.trim().length > 0)
                .map((trait, index) => (
                  <Badge key={index} variant="outline" className="flex items-center">
                    {trait.trim()}
                    <button
                      type="button"
                      className="ml-1 text-red-500 hover:text-red-700"
                      onClick={() => removePersonalityTrait(trait.trim())}
                    >
                      ×
                    </button>
                  </Badge>
                ))
            }
          </div>
        </div>
        
        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={onCancel}>取消</Button>
          <Button onClick={handleSave}>保存</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default CharacterEditor;