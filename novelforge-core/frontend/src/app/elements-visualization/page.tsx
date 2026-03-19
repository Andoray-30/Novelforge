'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CharacterCard from '@/components/Character/CharacterCard';
import CharacterRelationshipGraph from '@/components/Character/CharacterRelationshipGraph';
import TimelineComponent from '@/components/Plot/TimelineComponent';
import PlotFlowDiagram from '@/components/Plot/PlotFlowDiagram';
import ConflictMarker from '@/components/Plot/ConflictMarker';
import ThemeWordCloud, { generateSampleThemes } from '@/components/Plot/ThemeWordCloud';
import LocationMap from '@/components/World/LocationMap';
import CulturePanel from '@/components/World/CulturePanel';
import RuleHierarchyTree from '@/components/World/RuleHierarchyTree';
import HistoricalTimeline from '@/components/World/HistoricalTimeline';
import { Character, TimelineEvent, Location, Culture, WorldRule } from '@/types';
import { useAppStore } from '@/lib/hooks/use-app-store';

const ElementsVisualizationPage: React.FC = () => {
  // const { characters, timeline } = useAppStore();
  const [sampleCharacters] = useState<Character[]>([
    {
      id: '1',
      name: '主角',
      description: '故事的主人公，勇敢而正义',
      personality: '勇敢，正义，坚韧',
      background: '出身于小村庄，后成为英雄',
      role: '主角',
      importance: 'critical',
      abilities: ['剑术', '领导力', '洞察力'],
      example_messages: ['我们必须保护无辜的人', '即使面对绝境也不放弃'],
      relationships: [
        { target_name: '导师', relationship: '师徒', description: '传授技能和智慧' },
        { target_name: '反派', relationship: '敌对', description: '正义与邪恶的对立' }
      ]
    },
    {
      id: '2',
      name: '导师',
      description: '经验丰富的长者，指导主角成长',
      personality: '智慧，慈祥，严格',
      background: '曾是传奇英雄，现已隐退',
      role: '导师',
      importance: 'high',
      abilities: ['魔法', '智慧', '战斗技巧'],
      example_messages: ['真正的力量来自内心', '记住，能力越大责任越大'],
      relationships: [
        { target_name: '主角', relationship: '师徒', description: '传授技能和智慧' }
      ]
    },
    {
      id: '3',
      name: '反派',
      description: '故事的主要对手，强大而狡猾',
      personality: '狡猾，冷酷，野心勃勃',
      background: '曾是英雄，因追求力量而堕落',
      role: '反派',
      importance: 'high',
      abilities: ['黑暗魔法', '策略', '操控'],
      example_messages: ['力量就是一切', '弱者只配被强者统治'],
      relationships: [
        { target_name: '主角', relationship: '敌对', description: '正义与邪恶的对立' }
      ]
    }
  ]);
  
  const [sampleEvents] = useState<TimelineEvent[]>([
    {
      id: '1',
      title: '故事开始',
      description: '主角在小村庄的日常生活',
      event_type: 'historical',
      characters: ['主角'],
      locations: ['小村庄'],
      importance: 'medium',
      date: '第一天'
    },
    {
      id: '2',
      title: '遇见导师',
      description: '主角遇到改变命运的导师',
      event_type: 'cultural',
      characters: ['主角', '导师'],
      locations: ['森林'],
      importance: 'high',
      date: '第十天'
    },
    {
      id: '3',
      title: '首次冲突',
      description: '主角与反派势力的初次交锋',
      event_type: 'social',
      characters: ['主角', '反派'],
      locations: ['边境城市'],
      importance: 'critical',
      date: '第二十天'
    },
    {
      id: '4',
      title: '重大转折',
      description: '主角发现自己的真正使命',
      event_type: 'political',
      characters: ['主角', '导师', '反派'],
      locations: ['古代遗迹'],
      importance: 'critical',
      date: '第三十天'
    }
  ]);
  
  const [sampleLocations] = useState<Location[]>([
    {
      name: '小村庄',
      type: '居住地',
      description: '主角的故乡，宁静祥和',
      geography: '平原',
      culture: '农耕文化',
      history: '建立于百年前',
      notable_features: ['古老的神庙', '清澈的河流']
    },
    {
      name: '边境城市',
      type: '城市',
      description: '重要的贸易和军事重镇',
      geography: '山地',
      culture: '商业文化',
      history: '战略要地',
      notable_features: ['坚固的城墙', '繁华的市场']
    },
    {
      name: '古代遗迹',
      type: '遗迹',
      description: '失落文明的遗迹，充满神秘力量',
      geography: '高原',
      culture: '古代文明',
      history: '千年历史',
      notable_features: ['神秘符文', '强大魔法']
    }
  ]);
  
  const [sampleCultures] = useState<Culture[]>([
    {
      name: '农耕文化',
      description: '以农业为主的传统文化',
      beliefs: ['与自然和谐共处', '勤劳致富'],
      values: ['勤劳', '朴实', '团结'],
      customs: ['节日庆典', '互助传统']
    },
    {
      name: '商业文化',
      description: '以贸易为主的商业文化',
      beliefs: ['互利共赢', '市场自由'],
      values: ['效率', '创新', '竞争'],
      customs: ['商业联盟', '贸易协定']
    },
    {
      name: '古代文明',
      description: '失落的高科技古代文明',
      beliefs: ['知识至上', '力量传承'],
      values: ['智慧', '力量', '永恆'],
      customs: ['知识传承', '力量试炼']
    }
  ]);
  
  const [sampleRules] = useState<WorldRule[]>([
    {
      name: '魔法规则',
      description: '魔法使用的基本原则和限制',
      category: '魔法',
      importance: 'high'
    },
    {
      name: '社会等级',
      description: '社会地位和权力的分配体系',
      category: '社会',
      importance: 'medium'
    },
    {
      name: '自然法则',
      description: '自然界的运行规律，不容违背',
      category: '自然',
      importance: 'critical'
    }
  ]);
  
  const [sampleThemes] = useState(() => generateSampleThemes());

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">交互式要素展示系统</h1>
        <p className="text-muted-foreground mt-2">
          直观展示从文本中提取的角色、剧情和世界设定要素
        </p>
      </div>

      {/* 角色展示区域 */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>角色展示与编辑</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-3">角色卡片</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sampleCharacters.map((character) => (
                  <CharacterCard 
                    key={character.id} 
                    character={character} 
                  />
                ))}
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-3">角色关系图谱</h3>
              <CharacterRelationshipGraph characters={sampleCharacters} />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 剧情可视化区域 */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>剧情可视化</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-3">故事时间线</h3>
              <TimelineComponent events={sampleEvents} />
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-3">情节流程图</h3>
              <PlotFlowDiagram events={sampleEvents} />
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-3">冲突点标注</h3>
              <ConflictMarker events={sampleEvents} />
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-3">主题词云图</h3>
              <ThemeWordCloud themes={sampleThemes} />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 世界设定展示区域 */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>世界设定展示</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-3">地点地图</h3>
              <LocationMap locations={sampleLocations} />
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-3">文化背景面板</h3>
              <CulturePanel cultures={sampleCultures} />
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-3">规则体系树</h3>
              <RuleHierarchyTree rules={sampleRules} />
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-3">历史事件轴</h3>
              <HistoricalTimeline events={sampleEvents} />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default ElementsVisualizationPage;