// 类型定义 - 与后端Pydantic模型保持一致
export interface StoryOutlineParams {
  novel_type: string;
  theme: string;
  length: 'short' | 'medium' | 'long';
  constraints?: string[];
  target_audience?: string;
}

export interface StoryOutline {
  id: string;
  title: string;
  genre: string;
  theme: string;
  plotPoints: PlotPoint[];
  characterRoles: CharacterRole[];
  worldElements: string[];
  tone: string;
  targetAudience: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlotPoint {
  id: string;
  title: string;
  description: string;
  position: 'beginning' | 'development' | 'climax' | 'ending';
  importance: 'low' | 'medium' | 'high' | 'critical';
}

export interface CharacterRole {
  role: 'protagonist' | 'antagonist' | 'supporting' | 'mentor' | 'love_interest';
  name: string;
  description: string;
  keyTraits: string[];
  background: string;
  relationships: string[];
}

export interface CharacterDesign {
  name: string;
  role: string;
  description: string;
  personality: string;
  background: string;
  keyTraits: string[];
  relationships: Record<string, string>;
  arc: CharacterArc;
}

export interface CharacterArc {
  current_belief: string;
  target_truth: string;
  transformation_steps: ArcStep[];
  setbacks: ArcSetback[];
}

export interface ArcStep {
  stage: string;
  description: string;
  key_events: string[];
}

export interface ArcSetback {
  trigger: string;
  impact: string;
  resolution: string;
}

export interface WorldSetting {
  name: string;
  description: string;
  geography: string;
  social_structure: string;
  culture: string;
  technology_magic: string;
  history: string;
  core_conflicts: string[];
  locations: Location[];
  cultures: Culture[];
  rules: WorldRule[];
}

export interface Location {
  name: string;
  type: string;
  description: string;
  geography?: string;
  culture?: string;
  history?: string;
  notable_features: string[];
}

export interface Culture {
  name: string;
  description: string;
  beliefs: string[];
  values: string[];
  customs: string[];
}

export interface WorldRule {
  name: string;
  description: string;
  category: string;
  importance: 'low' | 'medium' | 'high' | 'critical';
}

export interface ExtractionResult {
  characters: Character[];
  world: WorldSetting;
  timeline: Timeline;
  relationships: RelationshipNetwork;
  metadata: {
    sourceFile: string;
    extractionTime: Date;
    qualityScore: number;
  };
}

export interface Character {
  id: string;
  name: string;
  description: string;
  personality: string;
  background: string;
  role: string;
  age?: number;
  gender?: string;
  appearance?: string;
  abilities: string[];
  relationships: Relationship[];
  example_messages: string[];
  importance: 'low' | 'medium' | 'high' | 'critical';
}

export interface Relationship {
  target_name: string;
  relationship: string;
  description: string;
}

export interface Timeline {
  events: TimelineEvent[];
  start_point?: string;
  end_point?: string;
  total_events: number;
}

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  event_type: 'historical' | 'political' | 'cultural' | 'technological' | 'natural' | 'social';
  characters: string[];
  locations: string[];
  importance: 'low' | 'medium' | 'high' | 'critical';
  date?: string;
}

export interface RelationshipNetwork {
  edges: NetworkEdge[];
  nodes: string[];
  total_relationships: number;
}

export interface NetworkEdge {
  source: string;
  target: string;
  relationship_type: 'family' | 'friendship' | 'romantic' | 'professional' | 'conflict' | 'alliance' | 'mentorship';
  description: string;
  strength: number;
}

export interface ExtractOptions {
  max_characters?: number;
  include_timeline?: boolean;
  include_relationships?: boolean;
  quality_threshold?: number;
}

export interface SillyTavernOutput {
  characters: SillyTavernCharacter[];
  worldInfo: WorldInfoEntry[];
  narrator: SillyTavernCharacter;
  groups: GroupChat[];
}

export interface SillyTavernCharacter {
  spec: 'chara_card_v3';
  spec_version: '3.0';
  data: {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    alternate_greetings: string[];
    tags: string[];
    creator: string;
    character_version: string;
  };
}

export interface WorldInfoEntry {
  key: string[];
  comment: string;
  content: string;
  constant: boolean;
  selective: boolean;
  order: number;
}

export interface GroupChat {
  name: string;
  members: string[];
  description: string;
}

export interface ImportResult {
  success: boolean;
  message: string;
  imported_items: string[];
}

export interface Conversation {
  id: string;
  messages: Message[];
  metadata: Record<string, any>;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface QualityReport {
  overallScore: number;
  issues: string[];
  strengths: string[];
  recommendations: string[];
  detailedScores: {
    plotCoherence: number;
    characterDevelopment: number;
    worldBuilding: number;
    writingQuality: number;
    originality: number;
  };
}

export type QualityLevel = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';