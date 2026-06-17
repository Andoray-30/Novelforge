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
  original_candidates?: string[];
  candidate_order_source?: string;
  profile_order_source?: string;
  profile_rankings?: ProfileRankingItem[];
  profile_confidence?: string;
  profile_warnings?: string[];
  selected_profile_hint?: string;
  selected_profile_metrics?: SelectedProfileMetrics;
  health_rankings?: Array<Record<string, unknown>>;
}

export interface ProfileRankingItem {
  model: string;
  score: number;
  reason: string;
  original_index: number;
  confidence_level: string;
  success_rate?: number;
  p95_latency_ms?: number;
  timeout_rate?: number;
  json_invalid_rate?: number;
  repair_salvage_rate?: number;
  retry_salvage_rate?: number;
  recommendation_hint?: string;
  hint_flags?: string[];
}

export interface SelectedProfileMetrics {
  success_rate?: number;
  p95_latency_ms?: number;
  timeout_rate?: number;
  repair_salvage_rate?: number;
  confidence_level?: string;
  recommendation_hint?: string;
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
  diagnostic_seed_assets?: Array<Record<string, unknown>>;
  needs_ai_repair_assets?: Array<Record<string, unknown>>;
  diagnostic_seed_characters?: Array<string | Record<string, unknown>>;
  needs_ai_repair_characters?: Array<string | Record<string, unknown>>;
  fallback_quality_boundary?: Record<string, unknown>;
  recovered_from_assets?: boolean;
  repair_strategy?: Record<string, unknown>;
  repair_strategy_batches?: Array<Record<string, unknown>>;
  model_route_batches?: Array<Record<string, unknown>>;
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
  recovered_from_assets?: boolean;
}

export interface ChapterIndexRun {
  run_key: string;
  task_id?: string;
  task_type?: string;
  model_role?: string;
  repair_strategy?: Record<string, unknown> | null;
  repair_strategy_batches?: Array<Record<string, unknown>>;
  model_route_batches?: Array<Record<string, unknown>>;
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

export interface ModelHealthReportItem {
  model: string;
  roles?: string[];
  sources?: string[];
  selected_count?: number;
  probe_count?: number;
  probe_passed?: number;
  probe_failed?: number;
  attempt_count?: number;
  successful_attempts?: number;
  failed_attempts?: number;
  average_latency_ms?: number | null;
  error_counts?: Record<string, number>;
  last_seen_at?: string | null;
}

export interface ModelRoleRecommendation {
  role: string;
  recommended_model: string;
  candidate_count?: number;
  candidate_order?: string[];
  has_recent_health?: boolean;
  reason?: string | null;
  score?: number | null;
  latency_tolerance_ms?: number | null;
  rankings?: Array<Record<string, unknown>>;
}

export interface ModelHealthEvent {
  id?: string;
  source?: string;
  role?: string;
  model?: string;
  status?: string;
  available?: boolean;
  latency_ms?: number | null;
  error_type?: string | null;
  reason?: string | null;
  score?: number | null;
  task_id?: string;
  task_type?: string;
  session_id?: string;
  parent_id?: string | null;
  run_key?: string;
  batch_key?: string;
  chapter_id?: string;
  attempt_number?: number;
  needs_retry?: boolean;
  observed_at?: string;
  created_at?: string;
}

export interface ModelHealthReport {
  generated_at?: string;
  event_count: number;
  items: ModelHealthReportItem[];
  events?: ModelHealthEvent[];
  role_recommendations?: ModelRoleRecommendation[];
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

// === Attempt / Retry Types ===

export type ExtractionAttemptStatus = 'pending' | 'running' | 'success' | 'failed' | 'deadline_exceeded' | 'skipped';
export type RetryJobStatus = 'pending' | 'waiting' | 'running' | 'success' | 'failed' | 'exhausted' | 'cancelled';
export type ExtractionRecoveryStatus = 'no_data' | 'success' | 'partial' | 'partial_exhausted' | 'failed';

export interface RetrySourceRef {
  kind: string;
  content_id: string;
  session_id: string;
  parent_id?: string | null;
  import_task_id?: string | null;
}

export interface ExtractionAttempt {
  id: string;
  session_id: string;
  chapter_id: string;
  chapter_title: string;
  chapter_order: number;
  attempt_number: number;
  status: ExtractionAttemptStatus;
  model_used: string;
  timeout: number;
  max_tokens: number;
  latency_ms: number;
  error_type?: string | null;
  error_message?: string | null;
  raw_response_hash?: string | null;
  raw_response_chars: number;
  raw_response_preview?: string | null;
  parsed_candidate_counts: Record<string, number>;
  retry_count: number;
  needs_retry: boolean;
  deadline_remaining_ms?: number | null;
  repair_layer?: string | null;
  repair_fixes: string[];
  repair_model_used?: string | null;
  repair_latency_ms: number;
  schema_valid_after_repair: boolean;
  created_at: string;
}

export interface ExtractionAttemptSummary {
  total_attempts: number;
  success_count: number;
  failed_count: number;
  deadline_exceeded_count: number;
  skipped_count: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  error_breakdown: Record<string, number>;
  chapters_with_attempts: number;
  chapters_needing_retry: number;
  repair_local_count: number;
  repair_model_count: number;
  repair_failed_count: number;
  repair_success_rate: number;
  session_id: string;
  partial_recoverable: boolean;
  overall_status: ExtractionRecoveryStatus;
}

export interface RetryJob {
  job_id: string;
  session_id: string;
  chapter_id: string;
  chapter_title: string;
  chapter_order: number;
  error_type: string;
  error_message: string;
  original_attempt_id: string;
  model_used: string;
  source_ref?: RetrySourceRef | null;
  status: RetryJobStatus;
  retry_count: number;
  max_retries: number;
  next_retry_at?: string | null;
  last_error_type?: string | null;
  last_error_message?: string | null;
  result_attempt_id?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface RetryQueueStats {
  total_jobs: number;
  pending_count: number;
  waiting_count: number;
  running_count: number;
  success_count: number;
  failed_count: number;
  exhausted_count: number;
  cancelled_count: number;
  error_breakdown: Record<string, number>;
  avg_retries_to_success: number;
}

export interface RetryQueueSummary {
  items: RetryJob[];
  total: number;
  stats: RetryQueueStats;
}

export interface RunDueRetryJobsResponse {
  accepted: number;
  skipped_already_success: number;
  queued: number;
}

export interface RetryExtractionAttemptResponse {
  job_id: string;
  status: string;
}

// === Deep Synthesis Types (aligned with backend deep_synthesis_models.py) ===

export type DeepSynthesisBudgetTier = 'low' | 'medium' | 'high';
export type DeepSynthesisScopeType = 'character' | 'relationship' | 'event' | 'world_fact' | 'full';
export type DeepSynthesisAssetType = 'character' | 'relationship' | 'event' | 'world_fact';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface DeepSynthesisRequestAsset {
  asset_type: DeepSynthesisAssetType;
  asset_id: string;
  asset_version: string;
  data?: Record<string, unknown>;
}

export interface DeepSynthesisRequest {
  session_id: string;
  scope_type: DeepSynthesisScopeType;
  scope_ids: string[];
  assets: DeepSynthesisRequestAsset[];
  quality_summary?: Record<string, unknown> | null;
  conflicts: Conflict[];
  budget_tier: DeepSynthesisBudgetTier;
  accepted_change_ids?: string[];
  rejected_change_ids?: string[];
}

export interface EvidenceRef {
  evidence_id: string;
  source_type: string;
  asset_type?: DeepSynthesisAssetType | null;
  asset_id?: string | null;
  asset_version?: string | null;
  field_path?: string | null;
  summary?: string | null;
}

export interface ProposedChange {
  change_id: string;
  asset_type: DeepSynthesisAssetType;
  asset_id: string;
  asset_version: string;
  field_path: string;
  current_value: unknown;
  proposed_value: unknown;
  confidence: number;
  reason: string;
  evidence_refs: EvidenceRef[];
  risk_level: RiskLevel;
}

export interface DeepSynthesisPreview {
  summary: string;
  proposed_changes: ProposedChange[];
  conflicts_resolved: Conflict[];
  new_links: NewLink[];
  risk_flags: RiskFlag[];
  confidence_delta: number;
  evidence_refs: EvidenceRef[];
  apply_plan: ApplyPlan;
  requires_user_confirmation: boolean;
}

export interface Conflict {
  conflict_id: string;
  asset_type: DeepSynthesisAssetType;
  asset_ids: string[];
  conflict_type: 'inconsistent_description' | 'contradictory_traits' | 'timeline_mismatch';
  description: string;
  resolution: string;
  confidence: number;
}

export interface NewLink {
  link_id: string;
  source_asset_type: DeepSynthesisAssetType;
  source_asset_id: string;
  target_asset_type: DeepSynthesisAssetType;
  target_asset_id: string;
  relation_type: string;
  confidence: number;
  evidence_refs: EvidenceRef[];
}

export interface RiskFlag {
  risk_id: string;
  severity: RiskLevel;
  message: string;
  affected_asset_ids: string[];
  evidence_refs: EvidenceRef[];
}

export interface ApplyPlan {
  requires_user_confirmation: boolean;
  apply_mode: string;
  patch_strategy: string;
  asset_write_policy: string;
}

export interface DeepSynthesisBudgetSummary {
  budget_tier: DeepSynthesisBudgetTier;
  max_model_calls: number;
  max_estimated_tokens: number;
  max_rounds: number;
  model_calls_used: number;
  estimated_tokens_used: number;
  remaining_model_calls: number;
  remaining_estimated_tokens: number;
  exhausted: boolean;
  reason?: string | null;
}

export interface DeepSynthesisRoundSummary {
  round_index: number;
  pass_type: 'generation' | 'validation' | 'conflict_resolution';
  status: 'success' | 'skipped' | 'stopped' | 'failed';
  proposed_change_count: number;
  high_confidence_change_count: number;
  unresolved_conflict_count: number;
  quality_before?: number | null;
  quality_after?: number | null;
  quality_delta: number;
  model_calls_used: number;
  estimated_tokens_used: number;
  stop_reason?: string | null;
  warnings: DeepSynthesisWarning[];
}

export interface DeepSynthesisConvergenceSummary {
  converged: boolean;
  reason: string;
  rounds_completed: number;
  quality_before?: number | null;
  quality_after?: number | null;
  total_quality_delta: number;
  total_proposed_change_count: number;
  total_high_confidence_change_count: number;
  unresolved_conflict_count: number;
  user_acceptance_rate?: number | null;
  should_continue: boolean;
}

export interface DeepSynthesisQualityTrace {
  quality_before?: number | null;
  quality_after_preview?: number | null;
  quality_delta: number;
  proposed_change_count: number;
  high_confidence_change_count: number;
  unresolved_conflict_count: number;
}

export interface DeepSynthesisUserFeedback {
  accepted_change_ids: string[];
  rejected_change_ids: string[];
  user_acceptance_rate?: number | null;
}

export interface DeepSynthesisWarning {
  warning_id: string;
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface DeepSynthesisResult {
  status: string;
  preview: DeepSynthesisPreview;
  budget_summary: DeepSynthesisBudgetSummary;
  model_route?: Record<string, unknown> | null;
  warnings: DeepSynthesisWarning[];
  attempt_id?: string | null;
  round_summaries: DeepSynthesisRoundSummary[];
  convergence_summary?: DeepSynthesisConvergenceSummary | null;
  quality_trace?: DeepSynthesisQualityTrace | null;
  user_feedback?: DeepSynthesisUserFeedback | null;
  task_type: string;
}

// === Deep Synthesis Apply Types ===

export type DeepSynthesisApplySkipReason =
  | 'rejected_by_user'
  | 'undecided'
  | 'duplicate_change_id'
  | 'unsupported_asset_type'
  | 'missing_asset'
  | 'invalid_field_path'
  | 'forbidden_field_path'
  | 'version_mismatch'
  | 'current_value_mismatch'
  | 'dry_run';

export interface DeepSynthesisApplyRequest {
  session_id: string;
  preview: DeepSynthesisPreview;
  accepted_change_ids: string[];
  rejected_change_ids: string[];
  expected_asset_versions: Record<string, string>;
  dry_run: boolean;
  idempotency_key?: string | null;
}

export interface DeepSynthesisAppliedChange {
  change_id: string;
  asset_type: DeepSynthesisAssetType;
  asset_id: string;
  asset_version_before: string;
  asset_version_after: string;
  field_path: string;
  previous_value?: unknown;
  applied_value?: unknown;
}

export interface DeepSynthesisSkippedChange {
  change_id: string;
  asset_type: DeepSynthesisAssetType;
  asset_id: string;
  field_path: string;
  reason: DeepSynthesisApplySkipReason;
  message: string;
}

export interface DeepSynthesisApplyConflict {
  change_id: string;
  asset_type: DeepSynthesisAssetType;
  asset_id: string;
  field_path: string;
  reason: DeepSynthesisApplySkipReason;
  expected?: unknown;
  actual?: unknown;
  message: string;
}

export interface DeepSynthesisApplySummary {
  accepted_count: number;
  rejected_count: number;
  undecided_count: number;
  applied_count: number;
  skipped_count: number;
  conflict_count: number;
  failed_count: number;
  dry_run: boolean;
  all_or_nothing: boolean;
}

export interface DeepSynthesisApplyResult {
  status: 'success' | 'partial' | 'failed' | 'dry_run';
  summary: DeepSynthesisApplySummary;
  applied_changes: DeepSynthesisAppliedChange[];
  skipped_changes: DeepSynthesisSkippedChange[];
  conflicts: DeepSynthesisApplyConflict[];
  warnings: DeepSynthesisWarning[];
  attempt_id?: string | null;
  task_type: string;
}
