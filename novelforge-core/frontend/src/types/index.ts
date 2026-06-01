// Frontend shared types aligned with backend API/contracts.

export type NovelType =
  | 'fantasy'
  | 'science_fiction'
  | 'romance'
  | 'mystery'
  | 'historical'
  | 'wuxia';

export type LengthType = 'short' | 'medium' | 'long';
export type TargetAudience = 'general' | 'young_adult' | 'adult';
export type PlotPosition = 'beginning' | 'development' | 'climax' | 'ending';
export type ImportanceLevel = 'low' | 'medium' | 'high' | 'critical';

export interface StoryOutlineParams {
  novel_type: NovelType;
  theme: string;
  length: LengthType;
  constraints?: string[];
  target_audience?: TargetAudience;
  openai_config?: OpenAIConfig;
}

export interface CharacterDesignRequest {
  context: string;
  roles: string[];
  openai_config?: OpenAIConfig;
}

export interface WorldBuildingRequest {
  story_outline: Record<string, unknown>;
  openai_config?: OpenAIConfig;
}

export interface PlotPoint {
  id: string;
  title: string;
  description: string;
  position: PlotPosition;
  importance: ImportanceLevel;
}

export interface CharacterRole {
  role: 'protagonist' | 'antagonist' | 'supporting' | 'mentor' | 'love_interest';
  name: string;
  description: string;
  keyTraits: string[];
  background: string;
  relationships: string[];
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
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CharacterArc {
  current_belief: string;
  target_truth: string;
  transformation_steps: Array<Record<string, unknown>>;
  setbacks: Array<Record<string, unknown>>;
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
  importance: ImportanceLevel;
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

export interface Relationship {
  target_name: string;
  relationship: string;
  description: string;
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
  occupation?: string;
  abilities: string[];
  tags: string[];
  aliases?: string[];
  goals?: string[];
  desires?: string[];
  fears?: string[];
  wounds?: string[];
  conflicts?: string[];
  personality_tension?: string;
  character_arc?: string;
  relationship_hooks?: string[];
  entity_type?: string;
  relationships: Relationship[];
  example_messages?: string[];
  example_dialogues?: string[];
  behavior_examples?: string[];
  source_contexts?: string[];
  importance: ImportanceLevel;
}

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  event_type: 'historical' | 'political' | 'cultural' | 'technological' | 'natural' | 'social';
  characters: string[];
  locations: string[];
  importance: ImportanceLevel;
  date?: string;
}

export interface Timeline {
  events: TimelineEvent[];
  start_point?: string;
  end_point?: string;
  total_events: number;
}

export interface NetworkEdge {
  source: string;
  target: string;
  relationship_type:
    | 'family'
    | 'friendship'
    | 'romantic'
    | 'professional'
    | 'conflict'
    | 'alliance'
    | 'mentorship'
    | 'other';
  description: string;
  strength: number;
  label?: string;
  relationship_types?: string[];
  source_name?: string;
  target_name?: string;
  relationship_tension?: string;
  evolution?: string[];
  confidence?: 'high' | 'medium' | 'low' | string;
  relationship_details?: Array<{
    asset_id: string;
    title: string;
    source: string;
    target: string;
    relationship_type: string;
    description: string;
    relationship_tension?: string;
    evolution?: string[];
    evidence?: string[];
    confidence?: string;
  }>;
  status?: 'active' | 'inactive' | 'unknown';
  evidence?: string[];
}

export interface RelationshipNetwork {
  edges: NetworkEdge[];
  nodes: string[];
  total_relationships: number;
}

export interface ExtractionResult {
  characters: Character[];
  world?: WorldSetting | null;
  timeline?: Timeline | null;
  relationships?: RelationshipNetwork | null;
  success?: boolean;
  errors?: string[];
  metadata?: {
    sourceFile?: string;
    extractionTime?: string | Date;
    qualityScore?: number;
  };
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string | Date;
  metadata?: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  title?: string;
  messages: Message[];
  metadata?: Record<string, unknown>;
  created_at?: string | Date;
  updated_at?: string | Date;
}

export interface ChatResponse {
  conversation_id: string;
  message: Message;
  context?: Record<string, unknown>;
  suggestions: string[];
}

export interface OpenAIConfig {
  api_key?: string;
  base_url?: string;
  model?: string;
  ai_mode?: 'fast' | 'pro';
}

export interface OpenAIModelInfo {
  id: string;
  owned_by?: string | null;
  created?: number | null;
  supports_chat: boolean;
}

export interface OpenAIModelListResponse {
  models: OpenAIModelInfo[];
  current_model?: string | null;
  base_url?: string | null;
  using_default_config: boolean;
}

export interface Session {
  id: string;
  title: string;
  preview: string;
  time: string;
  metadata?: Record<string, unknown>;
  messageCount?: number;
}

export type ContentType =
  | 'novel'
  | 'chapter'
  | 'scene'
  | 'character'
  | 'world'
  | 'timeline'
  | 'relationship'
  | 'conversation'
  | 'outline';

export type ContentStatus = 'draft' | 'review' | 'published' | 'archived' | 'deleted';

export interface ContentMetadata {
  id: string;
  title: string;
  type: ContentType;
  status: ContentStatus;
  author?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  version: number;
  parent_id?: string;
  children_ids?: string[];
  session_id?: string;
}

export interface ContentItem {
  metadata: ContentMetadata;
  content: string;
  extracted_data?: Record<string, unknown> | null;
  stats?: Record<string, unknown> | null;
  relations?: Record<string, string[]> | null;
}

export interface ContentWriteMetadata {
  title: string;
  type: ContentType;
  status?: ContentStatus;
  author?: string;
  tags?: string[];
  parent_id?: string;
  children_ids?: string[];
  session_id?: string;
}

export interface ContentCreateRequest {
  metadata: ContentWriteMetadata;
  content: string;
  extracted_data?: Record<string, unknown> | null;
  stats?: Record<string, unknown> | null;
  relations?: Record<string, string[]> | null;
}

export interface ContentUpdateRequest extends ContentCreateRequest {}

export interface ContentSearchRequest {
  query?: string;
  content_type?: ContentType;
  content_types?: ContentType[];
  tags?: string[];
  status?: ContentStatus;
  session_id?: string;
  parent_id?: string;
  limit?: number;
  offset?: number;
  include_content?: boolean;
}

export interface ContentSearchResult {
  items: ContentItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ContentTopologyNode {
  id: string;
  type: ContentType | string;
  title: string;
  metadata?: Record<string, unknown>;
}

export interface ContentTopologyEdge {
  source: string;
  target: string;
  type: string;
}

export interface ContentTopology {
  nodes: ContentTopologyNode[];
  edges: ContentTopologyEdge[];
  total_nodes?: number;
  total_edges?: number;
}

export interface Novel {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  stats: Record<string, number>;
}

export interface NovelListResponse {
  novels: Novel[];
  total: number;
}

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type NovelImportAnalysisStatus = 'completed' | 'partial' | 'low_quality' | 'timed_out' | 'failed';
export type NovelImportAnalysisStageKey = 'chapter_index' | 'characters' | 'world_setting' | 'timeline_events' | 'relationships';
export type NovelImportAnalysisStageStatus = 'completed' | 'timed_out' | 'failed';

export interface ModelProbeResult {
  role?: string;
  model?: string;
  available?: boolean;
  latency_ms?: number;
  non_empty_chat?: boolean;
  json_capable?: boolean;
  extraction_rich?: boolean;
  error_type?: string | null;
  error?: string | null;
  score?: number;
  checked_at?: number;
}

export interface ModelRouteDecision {
  role?: string;
  selected_model?: string;
  reason?: string;
  candidates?: string[];
  probe_results?: ModelProbeResult[];
}

export interface ImportAnalysisDiagnostics {
  candidate_counts?: Record<string, number>;
  dropped_candidates?: Array<Record<string, unknown>>;
  low_confidence_characters?: Array<Record<string, unknown>>;
  relationship_unresolved_endpoints?: Array<string | Record<string, unknown>>;
  relationship_unresolved_details?: Array<Record<string, unknown>>;
  relationship_endpoint_resolution?: Array<Record<string, unknown>>;
  relationship_low_confidence_resolved_endpoints?: Array<Record<string, unknown>>;
  timeline_mismatch_events?: Array<Record<string, unknown>>;
  failed_chapters?: Array<Record<string, unknown>>;
  chapter_index_attempts?: Array<Record<string, unknown>>;
  chapter_index_status?: Array<Record<string, unknown>>;
  chapter_index_run_key?: string;
  suspected_merged_characters?: Array<Record<string, unknown>>;
  organization_as_character?: Array<Record<string, unknown>>;
  unresolved_relationship_edges?: Array<string | Record<string, unknown>>;
  decorative_chapters?: Array<Record<string, unknown>>;
  weak_relationships?: Array<Record<string, unknown>>;
  suspected_mojibake_assets?: Array<Record<string, unknown>>;
  weak_world_facts?: Array<Record<string, unknown>>;
  model_route?: ModelRouteDecision;
}

export interface NovelImportTaskResult {
  session_id?: string;
  parent_id?: string;
  book_title?: string;
  chapters_count?: number;
  chapter_ids?: string[];
  chapter_titles?: string[];
  characters_count?: number;
  world_count?: number;
  relationships_count?: number;
  timeline_count?: number;
  analysis_status?: NovelImportAnalysisStatus;
  analysis_warning?: string | null;
  analysis_stage_results?: Partial<Record<NovelImportAnalysisStageKey, NovelImportAnalysisStageStatus>>;
  analysis_quality_issues?: string[];
  analysis_diagnostics?: ImportAnalysisDiagnostics;
  candidate_counts?: Record<string, number>;
  failed_chapters?: Array<Record<string, unknown>>;
  chapter_index_attempts?: Array<Record<string, unknown>>;
  chapter_index_status?: Array<Record<string, unknown>>;
  relationship_unresolved_endpoints?: Array<string | Record<string, unknown>>;
  relationship_unresolved_details?: Array<Record<string, unknown>>;
  relationship_endpoint_resolution?: Array<Record<string, unknown>>;
  relationship_low_confidence_resolved_endpoints?: Array<Record<string, unknown>>;
  timeline_mismatch_events?: Array<Record<string, unknown>>;
  model_route?: ModelRouteDecision;
}

export interface ChapterIndexRun {
  run_key: string;
  task_id?: string;
  task_type?: string;
  model_role?: string;
  repair_strategy?: Record<string, unknown> | null;
  session_id?: string;
  parent_id?: string | null;
  total_chapters?: number;
  created_at?: string;
  updated_at?: string;
  chapter_index_attempts: Array<Record<string, unknown>>;
  chapter_index_status: Array<Record<string, unknown>>;
  chapter_indices_summary: Array<Record<string, unknown>>;
  chapter_indices?: Array<Record<string, unknown>>;
  candidate_counts: Record<string, number>;
  model_route?: ModelRouteDecision | null;
}

export interface AITask {
  id: string;
  type: string;
  status: TaskStatus;
  priority?: TaskPriority;
  parameters?: Record<string, unknown>;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  result?: Record<string, unknown>;
  error?: string;
  progress: number;
  message: string;
}

export interface TaskProgress {
  id: string;
  type: string;
  status: string;
  progress: number;
  message: string;
  result?: unknown;
  error?: string;
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

export interface ImportResult {
  success: boolean;
  message: string;
  imported_items: string[];
}
