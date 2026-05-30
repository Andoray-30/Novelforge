'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  ClipboardPaste,
  FileText,
  FileUp,
  Globe2,
  LayoutDashboard,
  Loader2,
  MessageSquareText,
  RefreshCw,
  UploadCloud,
  Users,
  Wrench,
} from 'lucide-react';
import { chapterIndexRunService, contentService, taskService, textProcessingService } from '@/lib/api';
import { buildAssetQualityDiagnostics, type AssetQualityDiagnosticsResult } from '@/lib/asset-quality-diagnostics';
import { getModelProbeStatusLabel, getModelRouteSummary, normalizeModelRoute } from '@/lib/model-route-summary';
import { getNovelImportStageLabel, parseNovelImportTaskResult } from '@/lib/task-events';
import { useAppStore } from '@/lib/hooks/use-app-store';
import { useSessionTaskEvents } from '@/lib/hooks/use-session-task-events';
import { useSessions } from '@/lib/hooks/use-sessions';
import { formatFileSize } from '@/lib/utils';
import type { ChapterIndexRun, ImportAnalysisDiagnostics, NovelImportAnalysisStageKey, NovelImportTaskResult, OpenAIConfig } from '@/types';
import {
  buildChapterIndexRunRerunPayload,
  getChapterStatusPreview,
  getRetryableChapterIndexRunStatuses,
  getRunTimestampLabel,
} from './chapter-index-run-utils';

const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.text', '.epub', '.pdf', '.docx'];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

type ExtractStatus = 'idle' | 'uploading' | 'extracting' | 'success' | 'error';
type RepairTaskType = 'chapter_index_rerun' | 'relationship_backfill' | 'timeline_rebuild';
type RepairSeverity = 'high' | 'medium' | 'low';
type ImportStepKey = 'input' | 'progress' | 'diagnostics' | 'next';
type DiagnosticStatus = 'ready' | 'warning' | 'danger' | 'empty';

interface SavedSummary {
  characters: number;
  world: number;
  timeline: number;
  relationships: number;
  sessionId: string | null;
}

interface RepairChapterOption {
  id: string;
  title: string;
}

interface QualityRepairGroup {
  key: string;
  title: string;
  description: string;
  severity: RepairSeverity;
  recommendedTask: RepairTaskType;
  items: Array<string | Record<string, unknown>>;
}

interface DiagnosticArea {
  key: string;
  title: string;
  status: DiagnosticStatus;
  stat: string;
  detail: string;
  actions: string[];
}

const ANALYSIS_STATUS_LABELS: Record<NonNullable<NovelImportTaskResult['analysis_status']>, string> = {
  completed: '全部完成',
  partial: '部分完成',
  low_quality: '质量偏低',
  timed_out: '整体超时',
  failed: '分析失败',
};

const ANALYSIS_STATUS_STYLES: Record<NonNullable<NovelImportTaskResult['analysis_status']>, string> = {
  completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  partial: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  low_quality: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200',
  timed_out: 'border-orange-500/30 bg-orange-500/10 text-orange-200',
  failed: 'border-red-500/30 bg-red-500/10 text-red-200',
};

const ANALYSIS_STAGE_ORDER: NovelImportAnalysisStageKey[] = [
  'chapter_index',
  'characters',
  'world_setting',
  'timeline_events',
  'relationships',
];

const CANDIDATE_COUNT_LABELS: Record<string, string> = {
  chapters_total: '章节总数',
  chapters_indexed: '已索引章节',
  chapter_character_candidates: '角色候选',
  chapter_interaction_candidates: '互动候选',
  chapter_event_candidates: '事件候选',
  chapter_world_fact_candidates: '世界观候选',
  relationship_backfilled_characters: '关系回补角色',
  relationship_resolved_endpoints: '已归一关系端点',
  relationship_low_confidence_resolved_endpoints: '低置信归一端点',
  relationship_unresolved_endpoint_count: '未闭合关系端点',
  merged_characters: '合并角色',
  saved_characters: '落库角色',
  merged_relationships: '合并关系',
  merged_timeline_events: '合并事件',
  relationship_endpoint_mapping_ratio: '端点映射率',
  recovered_assets_total: '恢复资产总数',
  recovered_chapters: '恢复章节',
  recovered_characters: '恢复角色',
  recovered_relationships: '恢复关系',
  recovered_timeline_events: '恢复时间线',
  recovered_world_assets: '恢复世界观',
  suspected_mojibake_assets: '疑似乱码资产',
  decorative_chapters: '装饰章节',
  low_information_characters: '低信息角色',
  unresolved_relationship_edges: '未闭合关系',
  weak_relationships: '弱证据关系',
  timeline_mismatch_events: '时间线待复核',
  weak_world_facts: '世界观分类不足',
  chapter_index_attempts: '章节索引尝试',
  chapter_index_failed_attempts: '失败尝试',
  chapter_index_needs_retry: '需重跑章节',
  chapter_index_history_reused: '复用历史成功章',
  chapter_index_combined_indices: '合并章节索引',
};

function hasAcceptedExtension(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function getFileBaseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || '未命名文本';
}

function normalizeTaskStatus(status: unknown): string {
  return String(status || '').toUpperCase();
}

function buildSummaryFromTaskResult(result: unknown, sessionId: string | null): SavedSummary | null {
  const payload = parseNovelImportTaskResult(result);
  if (!payload) return null;

  const characterCount = payload.characters_count ?? null;
  const worldCount = payload.world_count ?? null;
  const timelineCount = payload.timeline_count ?? null;
  const relationshipCount = payload.relationships_count ?? null;
  if (characterCount === null && worldCount === null && timelineCount === null && relationshipCount === null) {
    return null;
  }

  return {
    characters: Math.max(characterCount ?? 0, 0),
    world: Math.max(worldCount ?? 0, 0),
    timeline: Math.max(timelineCount ?? 0, 0),
    relationships: Math.max(relationshipCount ?? 0, 0),
    sessionId,
  };
}

function getAnalysisStatusCopy(result: NovelImportTaskResult | null): string {
  if (!result?.analysis_status) return '提取完成：结构化资产已写入当前项目，创作就绪需要继续看质量诊断。';
  if (result.analysis_status === 'completed') {
    return '提取完成：章节与结构化资产已写入内容库。若项目质量仍显示需要修复，说明资产已生成但还不足以稳定支撑高质量写作。';
  }
  return '导入已完成，但部分深度分析结果需要复核。可以开始写作，但建议先处理角色、关系或世界观诊断。';
}

function getStageStatusLabel(status: NovelImportTaskResult['analysis_stage_results'] extends infer T
  ? T extends Partial<Record<NovelImportAnalysisStageKey, infer U>>
    ? U | undefined
    : undefined
  : undefined): string {
  if (status === 'completed') return '完成';
  if (status === 'timed_out') return '超时';
  if (status === 'failed') return '失败';
  return '未返回';
}

function getStageStatusStyle(status: NovelImportTaskResult['analysis_stage_results'] extends infer T
  ? T extends Partial<Record<NovelImportAnalysisStageKey, infer U>>
    ? U | undefined
    : undefined
  : undefined): string {
  if (status === 'completed') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (status === 'timed_out') return 'border-orange-500/30 bg-orange-500/10 text-orange-200';
  if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-200';
  return 'border-slate-700 bg-slate-900/80 text-slate-400';
}

function formatDiagnosticValue(key: string, value: number): string {
  if (key.includes('ratio')) return `${Math.round(value * 100)}%`;
  return String(value);
}

function getIssuePreview(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const payload = value as Record<string, unknown>;
    const endpoint =
      payload.raw_endpoint && payload.matched_character_name
        ? `${payload.raw_endpoint} -> ${payload.matched_character_name}`
        : payload.raw_endpoint || payload.endpoint || payload.resolved_endpoint;
    return String(endpoint || payload.title || payload.name || payload.description_preview || payload.error || JSON.stringify(payload));
  }
  return String(value ?? '');
}

function severityClass(severity: RepairSeverity): string {
  if (severity === 'high') return 'border-[color-mix(in_srgb,var(--nf-danger)_28%,transparent)] bg-[color-mix(in_srgb,var(--nf-danger)_7%,transparent)] text-[var(--nf-text)]';
  if (severity === 'medium') return 'border-[color-mix(in_srgb,var(--nf-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--nf-warning)_9%,transparent)] text-[var(--nf-text)]';
  return 'border-[var(--nf-border)] bg-[var(--nf-panel-soft)] text-[var(--nf-text)]';
}

function repairTaskLabel(taskType: RepairTaskType): string {
  switch (taskType) {
    case 'chapter_index_rerun':
      return '重跑章节索引';
    case 'relationship_backfill':
      return '回补关系';
    case 'timeline_rebuild':
      return '重建时间线';
    default:
      return '提交修复';
  }
}

function normalizeRepairItems(items?: Array<string | Record<string, unknown>>): Array<string | Record<string, unknown>> {
  return Array.isArray(items) ? items.filter(Boolean) : [];
}

function getRetryableChapterIndexStatus(result: NovelImportTaskResult | null): Array<Record<string, unknown>> {
  const statusItems = result?.chapter_index_status || result?.analysis_diagnostics?.chapter_index_status;
  if (!Array.isArray(statusItems)) return [];
  return statusItems.filter((item): item is Record<string, unknown> => {
    if (!item || typeof item !== 'object') return false;
    return item.needs_retry === true || item.status === 'failed';
  });
}

function buildChapterIndexRerunPayload(
  result: NovelImportTaskResult | null,
  group?: QualityRepairGroup
): Record<string, unknown> {
  const diagnostics = result?.analysis_diagnostics;
  const groupItems = group?.recommendedTask === 'chapter_index_rerun'
    ? group.items.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    : [];
  const retryableStatus = group?.key === 'failed_chapters'
    ? getRetryableChapterIndexStatus(result)
    : groupItems.length > 0
      ? groupItems
      : getRetryableChapterIndexStatus(result);
  const failedChapters = normalizeRepairItems(result?.failed_chapters || diagnostics?.failed_chapters)
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  const payload: Record<string, unknown> = {
    chapter_index_run_key: diagnostics?.chapter_index_run_key,
    chapter_index_status: retryableStatus,
    failed_chapters: failedChapters,
    analysis_diagnostics: {
      chapter_index_run_key: diagnostics?.chapter_index_run_key,
      chapter_index_status: retryableStatus,
      failed_chapters: failedChapters,
    },
  };
  const chapterIds = [...retryableStatus, ...failedChapters]
    .map((item) => item.chapter_id || item.id)
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (chapterIds.length > 0) {
    payload.chapter_ids = Array.from(new Set(chapterIds));
  }
  return payload;
}

function mergeDiagnostics(
  base: ImportAnalysisDiagnostics | undefined,
  recovered: ImportAnalysisDiagnostics | undefined
): ImportAnalysisDiagnostics | undefined {
  if (!base) return recovered;
  if (!recovered) return base;
  const merged: ImportAnalysisDiagnostics = { ...base };
  (Object.keys(recovered) as Array<keyof ImportAnalysisDiagnostics>).forEach((key) => {
    const baseValue = base[key];
    const recoveredValue = recovered[key];
    if (Array.isArray(baseValue) || Array.isArray(recoveredValue)) {
      (merged as Record<string, unknown>)[key] = [
        ...(Array.isArray(baseValue) ? baseValue : []),
        ...(Array.isArray(recoveredValue) ? recoveredValue : []),
      ];
      return;
    }
    if (key === 'candidate_counts') {
      merged.candidate_counts = {
        ...(base.candidate_counts ?? {}),
        ...(recovered.candidate_counts ?? {}),
      };
    }
  });
  return merged;
}

function mergeRecoveredAssetDiagnostics(
  result: NovelImportTaskResult | null,
  assetQuality: AssetQualityDiagnosticsResult | null
): NovelImportTaskResult | null {
  if (!assetQuality) return result;
  const mergedIssues = Array.from(new Set([...(result?.analysis_quality_issues ?? []), ...assetQuality.analysis_quality_issues]));
  return {
    ...(result ?? {}),
    analysis_status: assetQuality.analysis_status === 'low_quality' ? 'low_quality' : result?.analysis_status ?? assetQuality.analysis_status,
    analysis_quality_issues: mergedIssues,
    analysis_diagnostics: mergeDiagnostics(result?.analysis_diagnostics, assetQuality.analysis_diagnostics),
    candidate_counts: {
      ...(result?.candidate_counts ?? {}),
      ...assetQuality.candidate_counts,
    },
  };
}

function buildQualityRepairGroups(result: NovelImportTaskResult | null): QualityRepairGroup[] {
  if (!result) return [];
  const diagnostics = result.analysis_diagnostics;
  const groups: QualityRepairGroup[] = [
    {
      key: 'failed_chapters',
      title: '失败章节',
      description: '这些章节没有完成章节级索引，会直接影响角色、关系、时间线召回。',
      severity: 'high',
      recommendedTask: 'chapter_index_rerun',
      items: normalizeRepairItems(result.failed_chapters || diagnostics?.failed_chapters || getRetryableChapterIndexStatus(result)),
    },
    {
      key: 'suspected_mojibake_assets',
      title: '疑似乱码资产',
      description: '这些资产标题或名称疑似存在编码污染，会影响用户判断和 AI 检索。',
      severity: 'high',
      recommendedTask: 'chapter_index_rerun',
      items: normalizeRepairItems(diagnostics?.suspected_mojibake_assets),
    },
    {
      key: 'relationship_unresolved',
      title: '未映射关系端点',
      description: '关系边无法闭合到角色池，羁绊网络会出现丢边或错误端点。',
      severity: 'high',
      recommendedTask: 'relationship_backfill',
      items: normalizeRepairItems(result.relationship_unresolved_endpoints || diagnostics?.relationship_unresolved_endpoints || diagnostics?.unresolved_relationship_edges),
    },
    {
      key: 'relationship_low_confidence_resolved',
      title: '低置信关系归一',
      description: '这些关系端点已自动归一到角色池，但匹配依赖单字简称或较弱证据，建议人工复核后再用于核心写作。',
      severity: 'medium',
      recommendedTask: 'relationship_backfill',
      items: normalizeRepairItems(result.relationship_low_confidence_resolved_endpoints || diagnostics?.relationship_low_confidence_resolved_endpoints),
    },
    {
      key: 'weak_relationships',
      title: '弱证据关系',
      description: '关系存在但证据或张力不足，适合回补证据、阶段变化和关系动机。',
      severity: 'medium',
      recommendedTask: 'relationship_backfill',
      items: normalizeRepairItems(diagnostics?.weak_relationships),
    },
    {
      key: 'weak_world_facts',
      title: '世界观分类不足',
      description: '世界观资产缺少地点、组织、规则、历史或特殊概念分类，世界树和写作检索会变钝。',
      severity: 'medium',
      recommendedTask: 'chapter_index_rerun',
      items: normalizeRepairItems(diagnostics?.weak_world_facts),
    },
    {
      key: 'suspected_merged_characters',
      title: '疑似合并角色',
      description: '多个实体可能被合并为一个角色，需要重跑章节索引或手动拆分。',
      severity: 'medium',
      recommendedTask: 'chapter_index_rerun',
      items: normalizeRepairItems(diagnostics?.suspected_merged_characters),
    },
    {
      key: 'low_confidence_characters',
      title: '低置信角色',
      description: '角色有证据但档案不足，会影响 AI 写作时的人物稳定性。',
      severity: 'medium',
      recommendedTask: 'chapter_index_rerun',
      items: normalizeRepairItems(diagnostics?.low_confidence_characters),
    },
    {
      key: 'timeline_mismatch',
      title: '时间线错配事件',
      description: '事件标题和描述可能不属于同一事件，建议重建时间线。',
      severity: 'medium',
      recommendedTask: 'timeline_rebuild',
      items: normalizeRepairItems(result.timeline_mismatch_events || diagnostics?.timeline_mismatch_events),
    },
    {
      key: 'decorative_chapters',
      title: '装饰章节',
      description: '插图、封面或极短装饰内容被识别为章节，默认不应参与正文排序。',
      severity: 'low',
      recommendedTask: 'chapter_index_rerun',
      items: normalizeRepairItems(diagnostics?.decorative_chapters),
    },
    {
      key: 'dropped_candidates',
      title: '丢弃候选',
      description: '这些候选没有通过质量门槛，适合抽查是否误删重要资产。',
      severity: 'low',
      recommendedTask: 'chapter_index_rerun',
      items: normalizeRepairItems(diagnostics?.dropped_candidates),
    },
  ];

  return groups.filter((group) => group.items.length > 0);
}

function resolveCurrentStep(status: ExtractStatus, analysisResult: NovelImportTaskResult | null, savedSummary: SavedSummary | null): ImportStepKey {
  if (status === 'uploading' || status === 'extracting') return 'progress';
  if (status === 'success' && (analysisResult || savedSummary)) return 'diagnostics';
  if (status === 'error') return 'progress';
  return 'input';
}

function statusToneClass(status: DiagnosticStatus): string {
  if (status === 'ready') return 'border-[color-mix(in_srgb,var(--nf-success)_28%,transparent)] bg-[color-mix(in_srgb,var(--nf-success)_8%,transparent)]';
  if (status === 'warning') return 'border-[color-mix(in_srgb,var(--nf-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--nf-warning)_8%,transparent)]';
  if (status === 'danger') return 'border-[color-mix(in_srgb,var(--nf-danger)_28%,transparent)] bg-[color-mix(in_srgb,var(--nf-danger)_7%,transparent)]';
  return 'border-[var(--nf-border)] bg-[var(--nf-panel-soft)]';
}

function statusDotClass(status: DiagnosticStatus): string {
  if (status === 'ready') return 'bg-[var(--nf-success)]';
  if (status === 'warning') return 'bg-[var(--nf-warning)]';
  if (status === 'danger') return 'bg-[var(--nf-danger)]';
  return 'bg-[var(--nf-text-subtle)]';
}

function countDiagnosticItems(items?: Array<unknown>): number {
  return Array.isArray(items) ? items.filter(Boolean).length : 0;
}

function buildDiagnosticAreas(result: NovelImportTaskResult | null, summary: SavedSummary | null, repairGroups: QualityRepairGroup[]): DiagnosticArea[] {
  const diagnostics = result?.analysis_diagnostics;
  const issues = result?.analysis_quality_issues ?? [];
  const failedChapters = countDiagnosticItems(result?.failed_chapters || diagnostics?.failed_chapters);
  const weakRelationships = countDiagnosticItems(diagnostics?.weak_relationships);
  const unresolvedRelationships = countDiagnosticItems(result?.relationship_unresolved_endpoints || diagnostics?.relationship_unresolved_endpoints || diagnostics?.unresolved_relationship_edges);
  const lowConfidenceResolvedRelationships = countDiagnosticItems(
    result?.relationship_low_confidence_resolved_endpoints || diagnostics?.relationship_low_confidence_resolved_endpoints
  );
  const resolvedRelationshipEndpoints = countDiagnosticItems(result?.relationship_endpoint_resolution || diagnostics?.relationship_endpoint_resolution);
  const timelineMismatch = countDiagnosticItems(result?.timeline_mismatch_events || diagnostics?.timeline_mismatch_events);
  const lowConfidenceCharacters = countDiagnosticItems(diagnostics?.low_confidence_characters);
  const weakWorldFacts = countDiagnosticItems(diagnostics?.weak_world_facts);

  const chapterCount = result?.chapters_count ?? result?.candidate_counts?.chapters_total ?? result?.candidate_counts?.recovered_chapters ?? 0;
  const characterCount = result?.characters_count ?? summary?.characters ?? 0;
  const relationshipCount = result?.relationships_count ?? summary?.relationships ?? 0;
  const worldCount = result?.world_count ?? summary?.world ?? 0;
  const timelineCount = result?.timeline_count ?? summary?.timeline ?? 0;

  const writeReadyStatus: DiagnosticStatus =
    result?.analysis_status === 'completed' && repairGroups.length === 0
      ? 'ready'
      : result?.analysis_status === 'failed' || result?.analysis_status === 'timed_out'
        ? 'danger'
        : issues.length > 0 || repairGroups.length > 0
          ? 'warning'
          : summary
            ? 'ready'
            : 'empty';

  return [
    {
      key: 'chapters',
      title: '章节',
      status: failedChapters > 0 ? 'danger' : chapterCount > 0 ? 'ready' : 'empty',
      stat: chapterCount > 0 ? `${chapterCount} 章` : '暂无章节',
      detail: failedChapters > 0 ? `${failedChapters} 个章节索引失败` : '章节资产已写入内容库，后续可在 editor 中整理。',
      actions: failedChapters > 0 ? ['优先重跑失败章节', '检查章节标题和正文是否为空'] : ['打开 editor 检查章节顺序'],
    },
    {
      key: 'characters',
      title: '角色',
      status: lowConfidenceCharacters > 0 || characterCount < 3 ? 'warning' : characterCount > 0 ? 'ready' : 'empty',
      stat: characterCount > 0 ? `${characterCount} 个角色` : '暂无角色',
      detail: lowConfidenceCharacters > 0 ? `${lowConfidenceCharacters} 个角色置信度偏低` : '角色可作为后续写作上下文。',
      actions: lowConfidenceCharacters > 0 ? ['补充低置信角色证据', '回到角色页复核人物性格'] : ['查看角色档案'],
    },
    {
      key: 'relationships',
      title: '关系',
      status: unresolvedRelationships > 0 ? 'danger' : weakRelationships > 0 || lowConfidenceResolvedRelationships > 0 || relationshipCount < 3 ? 'warning' : relationshipCount > 0 ? 'ready' : 'empty',
      stat: relationshipCount > 0 ? `${relationshipCount} 条关系` : '暂无关系',
      detail: unresolvedRelationships > 0
        ? `${unresolvedRelationships} 个端点未闭合`
        : lowConfidenceResolvedRelationships > 0
          ? `${lowConfidenceResolvedRelationships} 个端点已自动归一但需要复核`
          : weakRelationships > 0
            ? `${weakRelationships} 条关系需要补强`
            : resolvedRelationshipEndpoints > 0
              ? `已归一 ${resolvedRelationshipEndpoints} 个关系端点，当前无未闭合端点`
              : '关系可用于驱动情绪张力。',
      actions: unresolvedRelationships > 0 || weakRelationships > 0 || lowConfidenceResolvedRelationships > 0
        ? ['回补关系证据', '复核低置信端点', '优先修复主角关系']
        : ['用关系生成序章冲突'],
    },
    {
      key: 'world',
      title: '世界观',
      status: weakWorldFacts > 0 ? 'warning' : worldCount > 0 ? 'ready' : 'empty',
      stat: worldCount > 0 ? `${worldCount} 条世界观` : '暂无世界观',
      detail: weakWorldFacts > 0 ? `${weakWorldFacts} 条设定分类不足` : '世界观资产可供 AI 检索和续写。',
      actions: weakWorldFacts > 0 ? ['补充地点、规则、历史分类'] : ['查看世界观资料库'],
    },
    {
      key: 'timeline',
      title: '时间线',
      status: timelineMismatch > 0 ? 'warning' : timelineCount > 0 ? 'ready' : 'empty',
      stat: timelineCount > 0 ? `${timelineCount} 个事件` : '暂无事件',
      detail: timelineMismatch > 0 ? `${timelineMismatch} 个事件标题/描述待复核` : '时间线可用于保持剧情顺序。',
      actions: timelineMismatch > 0 ? ['重建时间线', '检查事件标题和描述是否匹配'] : ['用时间线规划下一章'],
    },
    {
      key: 'readiness',
      title: '写作准备度',
      status: writeReadyStatus,
      stat: result?.analysis_status ? ANALYSIS_STATUS_LABELS[result.analysis_status] : summary ? '可开始写作' : '等待导入',
      detail: writeReadyStatus === 'ready' ? '资产足够支撑 AI 进入创作。' : writeReadyStatus === 'empty' ? '需要先导入文本或创建资产。' : '可以开始写作，但建议先处理高风险诊断。',
      actions: writeReadyStatus === 'ready' ? ['让 AI 写序章', '打开主工作台'] : ['先修复高风险项', '写作时提醒 AI 标注不确定处'],
    },
  ];
}

async function loadSavedSummaryFromContent(sessionId: string, parentId?: string | null): Promise<SavedSummary> {
  const searchResult = await contentService.search({
    session_id: sessionId,
    parent_id: parentId || undefined,
    content_types: ['character', 'world', 'timeline', 'relationship'],
    limit: 500,
    offset: 0,
  });
  const items = searchResult.items;
  return {
    characters: items.filter((item) => item.metadata.type === 'character').length,
    world: items.filter((item) => item.metadata.type === 'world').length,
    timeline: items.filter((item) => item.metadata.type === 'timeline').length,
    relationships: items.filter((item) => item.metadata.type === 'relationship').length,
    sessionId,
  };
}

async function loadLatestNovelSavedSummary(sessionId: string): Promise<{ summary: SavedSummary; parentId: string | null }> {
  const novelsResult = await contentService.getNovels(sessionId);
  const latestNovel = [...(novelsResult.novels || [])].sort((left, right) => {
    const leftTime = new Date(left.updated_at || left.created_at || 0).getTime();
    const rightTime = new Date(right.updated_at || right.created_at || 0).getTime();
    return rightTime - leftTime;
  })[0];
  if (latestNovel?.id) {
    return {
      summary: await loadSavedSummaryFromContent(sessionId, latestNovel.id),
      parentId: latestNovel.id,
    };
  }
  return { summary: await loadSavedSummaryFromContent(sessionId), parentId: null };
}

async function loadRecoveredAssetQuality(sessionId: string, parentId?: string | null): Promise<AssetQualityDiagnosticsResult> {
  const result = await contentService.search({
    session_id: sessionId,
    parent_id: parentId || undefined,
    content_types: ['chapter', 'character', 'world', 'timeline', 'relationship'],
    limit: 500,
    offset: 0,
    include_content: true,
  });
  return buildAssetQualityDiagnostics(result.items);
}

export default function ExtractPage() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<ExtractStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('等待上传文本');
  const [savedSummary, setSavedSummary] = useState<SavedSummary | null>(null);
  const [completedResult, setCompletedResult] = useState<NovelImportTaskResult | null>(null);
  const [assetQualityResult, setAssetQualityResult] = useState<AssetQualityDiagnosticsResult | null>(null);
  const openAIConfig = useMemo<OpenAIConfig>(() => ({ ai_mode: 'pro' }), []);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [repairSubmitting, setRepairSubmitting] = useState<string | null>(null);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const [repairChapters, setRepairChapters] = useState<RepairChapterOption[]>([]);
  const [selectedRepairChapterId, setSelectedRepairChapterId] = useState<string>('');
  const [chapterIndexRuns, setChapterIndexRuns] = useState<ChapterIndexRun[]>([]);
  const [chapterIndexRunError, setChapterIndexRunError] = useState<string | null>(null);
  const [chapterIndexRunsLoading, setChapterIndexRunsLoading] = useState(false);

  const { currentSession, currentSessionId, createSession, switchSession, loadSessions } = useSessions();
  const setSelectedNovelId = useAppStore((state) => state.setSelectedNovelId);
  const activeTasks = useAppStore((state) => state.activeTasks);
  const addTask = useAppStore((state) => state.addTask);
  const updateTask = useAppStore((state) => state.updateTask);
  const currentTask = useMemo(() => (activeTaskId ? activeTasks[activeTaskId] ?? null : null), [activeTaskId, activeTasks]);

  useEffect(() => {
    setActiveTaskId(null);
    setSavedSummary(null);
    setCompletedResult(null);
    setAssetQualityResult(null);
    setErrorMessage(null);
    setProgress(0);
    setStatus('idle');
    setStatusMessage('等待上传文本');
    setRepairSubmitting(null);
    setRepairMessage(null);
    setRepairChapters([]);
    setSelectedRepairChapterId('');
    setChapterIndexRuns([]);
    setChapterIndexRunError(null);
    setChapterIndexRunsLoading(false);
  }, [currentSessionId]);

  const ensureSessionId = useCallback(async (selectedFile: File): Promise<string> => {
    if (currentSessionId) return currentSessionId;
    const created = await createSession(`${getFileBaseName(selectedFile.name)} 提取项目`);
    return created.id;
  }, [createSession, currentSessionId]);

  const finalizeCompletedTask = useCallback(async (taskId: string, sessionId: string | null, result: unknown, message?: string | null) => {
    const parsedResult = parseNovelImportTaskResult(result);
    const fallbackSessionId =
      sessionId ||
      parsedResult?.session_id ||
      (result && typeof result === 'object' && typeof (result as Record<string, unknown>).session_id === 'string'
        ? ((result as Record<string, unknown>).session_id as string)
        : null);
    const summary =
      buildSummaryFromTaskResult(result, fallbackSessionId) ||
      (fallbackSessionId ? await loadSavedSummaryFromContent(fallbackSessionId, parsedResult?.parent_id) : null);
    if (parsedResult?.parent_id && fallbackSessionId && fallbackSessionId === currentSessionId) {
      setSelectedNovelId(parsedResult.parent_id);
    }
    if (!summary) throw new Error('导入任务已完成，但没有找到可展示的资产统计。');

    setActiveTaskId(taskId);
    setSavedSummary(summary);
    setCompletedResult(parsedResult);
    setAssetQualityResult(null);
    setStatus('success');
    setProgress(100);
    setErrorMessage(null);
    setStatusMessage(message?.trim() || getAnalysisStatusCopy(parsedResult));
  }, [currentSessionId, setSelectedNovelId]);

  const finalizeFailedTask = useCallback((taskId: string | null, message?: string | null, error?: string | null) => {
    if (taskId) setActiveTaskId(taskId);
    setStatus('error');
    setProgress(0);
    setSavedSummary(null);
    setCompletedResult(null);
    setAssetQualityResult(null);
    setErrorMessage(error?.trim() || message?.trim() || '提取失败，请稍后重试。');
    setStatusMessage('提取流程已中断');
  }, []);

  useEffect(() => {
    if (!currentTask) return;
    const normalizedStatus = normalizeTaskStatus(currentTask.status);
    if (normalizedStatus === 'PENDING' || normalizedStatus === 'RUNNING') {
      setStatus('extracting');
      setProgress(Math.min(Math.max(Math.round((currentTask.progress || 0) * 100), 5), 99));
      setStatusMessage(currentTask.message || '后台任务正在处理文本...');
      setErrorMessage(null);
    } else if (normalizedStatus === 'FAILED') {
      finalizeFailedTask(currentTask.id, currentTask.message, currentTask.error);
    } else if (normalizedStatus === 'CANCELLED') {
      finalizeFailedTask(currentTask.id, '导入任务已取消', null);
    } else if (normalizedStatus === 'COMPLETED' && !savedSummary) {
      void finalizeCompletedTask(currentTask.id, currentSessionId, currentTask.result, currentTask.message);
    }
  }, [currentSessionId, currentTask, finalizeCompletedTask, finalizeFailedTask, savedSummary]);

  useEffect(() => {
    if (!currentSessionId || activeTaskId) return;
    let cancelled = false;
    const recoverTask = async () => {
      try {
        const remoteTasks = await taskService.getActiveTasks(currentSessionId);
        if (cancelled) return;
        const task = remoteTasks
          .filter((item) => item.type === 'novel_import')
          .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())[0];
        if (task) setActiveTaskId(task.id);
      } catch {
        // 提取页不因后台任务恢复失败而阻断用户流程。
      }
    };
    void recoverTask();
    return () => {
      cancelled = true;
    };
  }, [activeTaskId, currentSessionId]);

  useEffect(() => {
    if (!currentSessionId || activeTaskId || savedSummary || status !== 'idle') return;
    let cancelled = false;
    const recoverSavedSummary = async () => {
      try {
        const recentTasks = await taskService.getRecentTasks(currentSessionId, { limit: 5, task_type: 'novel_import' }).catch(() => []);
        const latestCompletedImport = recentTasks.find((task) => normalizeTaskStatus(task.status) === 'COMPLETED' && task.result);
        const parsedLatest = latestCompletedImport ? parseNovelImportTaskResult(latestCompletedImport.result) : null;
        if (!cancelled && latestCompletedImport && parsedLatest) {
          const summary =
            buildSummaryFromTaskResult(latestCompletedImport.result, currentSessionId) ||
            await loadSavedSummaryFromContent(currentSessionId, parsedLatest.parent_id);
          if (parsedLatest.parent_id) setSelectedNovelId(parsedLatest.parent_id);
          setActiveTaskId(latestCompletedImport.id);
          setSavedSummary(summary);
          setCompletedResult(parsedLatest);
          setStatus('success');
          setProgress(100);
          setErrorMessage(null);
          setStatusMessage(latestCompletedImport.message || getAnalysisStatusCopy(parsedLatest));
          return;
        }

        const { summary, parentId } = await loadLatestNovelSavedSummary(currentSessionId);
        if (cancelled || summary.characters + summary.world + summary.timeline + summary.relationships === 0) return;
        if (parentId) setSelectedNovelId(parentId);
        setSavedSummary(summary);
        setStatus('success');
        setProgress(100);
        setErrorMessage(null);
        setStatusMessage('已在当前项目资产库中找到已提取的结构化资产。');
      } catch {
        // 刷新后的资产摘要恢复失败时，用户仍可重新上传。
      }
    };
    void recoverSavedSummary();
    return () => {
      cancelled = true;
    };
  }, [activeTaskId, currentSessionId, savedSummary, setSelectedNovelId, status]);

  useEffect(() => {
    const sessionId = completedResult?.session_id || savedSummary?.sessionId || currentSessionId;
    if (!sessionId || !savedSummary || status !== 'success') {
      setAssetQualityResult(null);
      return;
    }
    let disposed = false;
    const loadAssetQuality = async () => {
      try {
        const quality = await loadRecoveredAssetQuality(sessionId, completedResult?.parent_id);
        if (!disposed) setAssetQualityResult(quality);
      } catch {
        if (!disposed) setAssetQualityResult(null);
      }
    };
    void loadAssetQuality();
    return () => {
      disposed = true;
    };
  }, [completedResult?.parent_id, completedResult?.session_id, currentSessionId, savedSummary, status]);

  useEffect(() => {
    const sessionId = completedResult?.session_id || savedSummary?.sessionId || currentSessionId;
    const parentId = completedResult?.parent_id || null;
    if (!sessionId || status !== 'success') {
      setChapterIndexRuns([]);
      setChapterIndexRunError(null);
      setChapterIndexRunsLoading(false);
      return;
    }

    let disposed = false;
    setChapterIndexRunsLoading(true);
    setChapterIndexRunError(null);
    const loadChapterIndexRuns = async () => {
      try {
        const runs = await chapterIndexRunService.list({ sessionId, parentId, limit: 5 });
        if (!disposed) setChapterIndexRuns(runs);
      } catch (error) {
        if (!disposed) {
          setChapterIndexRuns([]);
          setChapterIndexRunError(error instanceof Error ? error.message : '章节索引运行记录读取失败');
        }
      } finally {
        if (!disposed) setChapterIndexRunsLoading(false);
      }
    };
    void loadChapterIndexRuns();
    return () => {
      disposed = true;
    };
  }, [completedResult?.parent_id, completedResult?.session_id, currentSessionId, savedSummary?.sessionId, status]);

  useSessionTaskEvents({
    sessionId: currentSessionId,
    onCompleted: (detail) => {
      if (detail.taskType !== 'novel_import') return;
      if (activeTaskId && detail.taskId !== activeTaskId) return;
      void finalizeCompletedTask(detail.taskId, detail.sessionId, detail.result, detail.message);
    },
    onFailed: (detail) => {
      if (detail.taskType !== 'novel_import') return;
      if (activeTaskId && detail.taskId !== activeTaskId) return;
      finalizeFailedTask(detail.taskId, detail.message, detail.error);
    },
    onCancelled: (detail) => {
      if (detail.taskType !== 'novel_import') return;
      if (activeTaskId && detail.taskId !== activeTaskId) return;
      finalizeFailedTask(detail.taskId, '导入任务已取消', null);
    },
  });

  useEffect(() => {
    if (!activeTaskId) return;
    const currentStatus = normalizeTaskStatus(currentTask?.status);
    if (currentStatus === 'COMPLETED' || currentStatus === 'FAILED' || currentStatus === 'CANCELLED') return;
    let disposed = false;
    const syncTaskStatus = async () => {
      try {
        const remoteTask = await taskService.getTaskStatus(activeTaskId);
        if (disposed) return;
        updateTask(activeTaskId, {
          status: normalizeTaskStatus(remoteTask.status),
          progress: remoteTask.progress,
          message: remoteTask.message,
          result: remoteTask.result,
          error: remoteTask.error,
        });
      } catch {
        // 当前轮询失败时保持现状，下一轮继续。
      }
    };
    void syncTaskStatus();
    const timer = window.setInterval(() => void syncTaskStatus(), 3000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [activeTaskId, currentTask?.status, updateTask]);

  const processFile = async (selectedFile: File) => {
    if (!hasAcceptedExtension(selectedFile.name)) {
      setFile(selectedFile);
      setStatus('error');
      setProgress(0);
      setSavedSummary(null);
      setCompletedResult(null);
      setErrorMessage(`暂时仅支持 ${ACCEPTED_EXTENSIONS.join(', ')} 文件。`);
      setStatusMessage('文件格式不受支持');
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setFile(selectedFile);
      setStatus('error');
      setProgress(0);
      setSavedSummary(null);
      setCompletedResult(null);
      setErrorMessage(`文件过大，当前上限 ${(MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0)}MB，请先分卷后导入。`);
      setStatusMessage('文件大小超出限制');
      return;
    }

    setFile(selectedFile);
    setStatus('uploading');
    setProgress(10);
    setErrorMessage(null);
    setSavedSummary(null);
    setCompletedResult(null);
    setStatusMessage('正在提交后台提取任务...');

    try {
      const sessionId = await ensureSessionId(selectedFile);
      const response = await textProcessingService.uploadAndProcess(
        selectedFile,
        {
          session_id: sessionId,
          detect_chapters: true,
          extract_metadata: true,
          normalize_paragraphs: true,
          remove_extra_whitespace: true,
          preserve_line_breaks: true,
        },
        openAIConfig
      );
      if (!response.success || !response.task_id) {
        throw new Error(response.message || '提取任务提交失败');
      }
      const responseResult =
        response.result && typeof response.result === 'object'
          ? response.result
          : { session_id: response.session_id || sessionId, parent_id: response.parent_id || null, file_name: selectedFile.name };
      const targetSessionId =
        response.session_id ||
        (responseResult && typeof responseResult === 'object' && typeof (responseResult as Record<string, unknown>).session_id === 'string'
          ? ((responseResult as Record<string, unknown>).session_id as string)
          : sessionId);
      addTask({
        id: response.task_id,
        type: 'novel_import',
        status: response.duplicate ? 'COMPLETED' : 'PENDING',
        progress: response.duplicate ? 1 : 0,
        message: response.message || '导入任务已提交，正在后台处理文件与资产写入。',
        result: responseResult,
      });
      setActiveTaskId(response.task_id);
      if (response.duplicate) {
        await finalizeCompletedTask(response.task_id, targetSessionId, responseResult, response.message);
        if (targetSessionId && targetSessionId !== currentSessionId) {
          switchSession(targetSessionId);
          void loadSessions();
        }
        return;
      }
      setStatus('extracting');
      setProgress(5);
      setStatusMessage('后台任务已提交，正在排队分析文本...');
    } catch (error) {
      setStatus('error');
      setProgress(0);
      setErrorMessage(error instanceof Error ? error.message : '提取失败，请稍后重试。');
      setStatusMessage('提取流程已中断');
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files?.[0]) void processFile(event.dataTransfer.files[0]);
  };
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.[0]) void processFile(event.target.files[0]);
  };

  const handlePasteImport = () => {
    const text = pastedText.trim();
    if (!text) {
      setStatus('error');
      setProgress(0);
      setErrorMessage('请先粘贴需要导入的小说文本。');
      setStatusMessage('缺少文本内容');
      return;
    }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const pastedFile = new File([blob], `粘贴文本-${new Date().toISOString().slice(0, 10)}.txt`, { type: 'text/plain' });
    void processFile(pastedFile);
  };

  useEffect(() => {
    const sessionId = completedResult?.session_id || savedSummary?.sessionId || currentSessionId;
    if (!sessionId || !completedResult?.parent_id) {
      setRepairChapters([]);
      setSelectedRepairChapterId('');
      return;
    }
    let disposed = false;
    const loadChapters = async () => {
      try {
        const result = await contentService.search({
          session_id: sessionId,
          parent_id: completedResult.parent_id,
          content_type: 'chapter',
          limit: 500,
          offset: 0,
        });
        if (disposed) return;
        const chapters = result.items.map((item) => ({ id: item.metadata.id, title: item.metadata.title }));
        setRepairChapters(chapters);
        setSelectedRepairChapterId((current) => current && chapters.some((chapter) => chapter.id === current) ? current : '');
      } catch {
        if (!disposed) {
          setRepairChapters([]);
          setSelectedRepairChapterId('');
        }
      }
    };
    void loadChapters();
    return () => {
      disposed = true;
    };
  }, [completedResult?.parent_id, completedResult?.session_id, currentSessionId, savedSummary?.sessionId]);

  const submitRepairTask = async (taskType: RepairTaskType, group?: QualityRepairGroup, rerunPayload?: Record<string, unknown>) => {
    const sessionId = completedResult?.session_id || savedSummary?.sessionId || currentSessionId;
    if (!sessionId) {
      setRepairMessage('请先选择或完成一个项目导入。');
      return;
    }
    setRepairSubmitting(taskType);
    setRepairMessage(null);
    try {
      const response = await taskService.submitTask(taskType, {
        session_id: sessionId,
        parent_id: completedResult?.parent_id || null,
        chapter_id: rerunPayload ? null : selectedRepairChapterId || null,
        ...(rerunPayload ?? {}),
        ...(taskType === 'chapter_index_rerun' && !selectedRepairChapterId && !rerunPayload
          ? buildChapterIndexRerunPayload(analysisResult, group)
          : {}),
        source: rerunPayload ? 'extract_chapter_index_run_history' : 'extract_quality_panel',
      });
      if (!response.success || !response.task_id) throw new Error(response.message || '重跑任务提交失败');
      addTask({
        id: response.task_id,
        type: taskType,
        status: 'PENDING',
        progress: 0,
        message: response.message || '质量修复任务已提交。',
        result: { session_id: sessionId, parent_id: completedResult?.parent_id || null },
      });
      setRepairMessage('重跑任务已提交，可在任务中心查看结果。');
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : '重跑任务提交失败');
    } finally {
      setRepairSubmitting(null);
    }
  };

  const projectLabel = currentSession?.title || '未选择项目，首次上传时会自动创建。';
  const isBusy = status === 'uploading' || status === 'extracting';
  const analysisResult = useMemo(
    () => mergeRecoveredAssetDiagnostics(completedResult, assetQualityResult),
    [assetQualityResult, completedResult]
  );
  const qualityRepairGroups = useMemo(() => buildQualityRepairGroups(analysisResult), [analysisResult]);
  const currentStep = resolveCurrentStep(status, analysisResult, savedSummary);
  const diagnosticAreas = useMemo(
    () => buildDiagnosticAreas(analysisResult, savedSummary, qualityRepairGroups),
    [analysisResult, qualityRepairGroups, savedSummary]
  );
  const modelRouteSummary = useMemo(() => getModelRouteSummary(analysisResult), [analysisResult]);
  const topQualityIssues = analysisResult?.analysis_quality_issues?.slice(0, 3) ?? [];
  const statusLabel = analysisResult?.analysis_status ? ANALYSIS_STATUS_LABELS[analysisResult.analysis_status] : status === 'error' ? '需要处理' : status === 'success' ? '已完成' : '等待导入';
  const progressStageLabel = status === 'uploading'
    ? '提交任务'
    : status === 'extracting'
      ? statusMessage
      : status === 'success'
        ? '提取完成'
        : status === 'error'
          ? '流程中断'
          : '等待文本';

  return (
    <div className="min-h-full overflow-x-hidden bg-[var(--nf-bg)] px-4 py-6 text-[var(--nf-text)] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="nf-panel nf-panel-pad">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="nf-kicker">Import Wizard</div>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-[var(--nf-text)] sm:text-3xl">
                导入小说并生成项目资产
              </h1>
              <p className="mt-3 text-sm leading-6 text-[var(--nf-text-muted)]">
                按四步完成导入：选择文本、观察提取进度、复核质量诊断，然后进入写作或修复。结果会写入当前项目的内容库。
              </p>
              <p className="mt-2 text-xs text-[var(--nf-text-subtle)]">当前项目：{projectLabel}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              {[
                { key: 'input' as const, label: '1 导入文本' },
                { key: 'progress' as const, label: '2 提取进度' },
                { key: 'diagnostics' as const, label: '3 质量诊断' },
                { key: 'next' as const, label: '4 下一步' },
              ].map((step) => {
                const active = currentStep === step.key;
                const done =
                  step.key === 'input'
                    ? status !== 'idle'
                    : step.key === 'progress'
                      ? status === 'success'
                      : step.key === 'diagnostics'
                        ? Boolean(savedSummary)
                        : false;
                return (
                  <span
                    key={step.key}
                    className={[
                      'inline-flex min-h-10 items-center justify-center rounded-xl border px-3 text-xs font-bold',
                      active
                        ? 'border-[color-mix(in_srgb,var(--nf-accent)_38%,transparent)] bg-[var(--nf-accent-soft)] text-[var(--nf-accent)]'
                        : done
                          ? 'border-[color-mix(in_srgb,var(--nf-success)_28%,transparent)] bg-[color-mix(in_srgb,var(--nf-success)_8%,transparent)] text-[var(--nf-text)]'
                          : 'border-[var(--nf-border)] bg-[var(--nf-panel-soft)] text-[var(--nf-text-muted)]',
                    ].join(' ')}
                  >
                    {step.label}
                  </span>
                );
              })}
            </div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
          <div className="nf-panel nf-panel-pad">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="nf-kicker">Step 1</div>
                <h2 className="mt-1 text-lg font-extrabold text-[var(--nf-text)]">选择或粘贴文本</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--nf-text-muted)]">
                  支持 {ACCEPTED_EXTENSIONS.join(', ')}。长篇建议优先上传文件；短文本或试写片段可以直接粘贴。
                </p>
              </div>
              <FileUp className="h-5 w-5 shrink-0 text-[var(--nf-accent)]" />
            </div>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={[
                'mt-5 rounded-2xl border border-dashed p-5 transition',
                isDragging
                  ? 'border-[color-mix(in_srgb,var(--nf-accent)_48%,transparent)] bg-[var(--nf-accent-soft)]'
                  : 'border-[var(--nf-border-strong)] bg-[var(--nf-panel-soft)]',
                isBusy ? 'opacity-70' : '',
              ].join(' ')}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--nf-surface)] text-[var(--nf-accent)]">
                    {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--nf-text)]">
                      {file ? file.name : '拖拽文件到这里，或选择文本文件'}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-[var(--nf-text-subtle)]">
                      {file ? formatFileSize(file.size) : `单文件上限 ${(MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0)}MB，导入后会自动保存章节并进入深度分析。`}
                    </p>
                  </div>
                </div>
                <label className="nf-button nf-button-primary w-full cursor-pointer sm:w-auto">
                  <input type="file" accept={ACCEPTED_EXTENSIONS.join(',')} className="hidden" onChange={handleFileChange} disabled={isBusy} />
                  选择文本文件
                </label>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] p-4">
              <label className="text-sm font-bold text-[var(--nf-text)]" htmlFor="extract-paste-text">
                粘贴文本导入
              </label>
              <textarea
                id="extract-paste-text"
                value={pastedText}
                onChange={(event) => setPastedText(event.target.value)}
                placeholder="粘贴小说正文或片段..."
                disabled={isBusy}
                className="mt-3 min-h-28 w-full resize-y rounded-xl border border-[var(--nf-border)] bg-[var(--nf-bg)] px-3 py-3 text-sm leading-6 text-[var(--nf-text)] outline-none transition focus:border-[color-mix(in_srgb,var(--nf-accent)_45%,transparent)]"
              />
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-[var(--nf-text-subtle)]">{pastedText.trim().length} 字符</p>
                <button type="button" className="nf-button" onClick={handlePasteImport} disabled={isBusy || pastedText.trim().length === 0}>
                  <ClipboardPaste className="h-4 w-4" />
                  用粘贴文本开始导入
                </button>
              </div>
            </div>

            {errorMessage ? (
              <div className="nf-alert mt-4 border-[color-mix(in_srgb,var(--nf-danger)_32%,transparent)] bg-[color-mix(in_srgb,var(--nf-danger)_8%,transparent)] text-[var(--nf-danger)]">
                {errorMessage}
              </div>
            ) : null}
          </div>

          <div className="nf-panel nf-panel-pad">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="nf-kicker">Step 2</div>
                <h2 className="mt-1 text-lg font-extrabold text-[var(--nf-text)]">提取进度</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--nf-text-muted)]">{progressStageLabel}</p>
              </div>
              {isBusy ? <Loader2 className="h-5 w-5 animate-spin text-[var(--nf-accent)]" /> : status === 'success' ? <CheckCircle2 className="h-5 w-5 text-[var(--nf-success)]" /> : <Clock className="h-5 w-5 text-[var(--nf-text-subtle)]" />}
            </div>
            <div className="mt-5">
              <div className="h-2 overflow-hidden rounded-full bg-[var(--nf-panel-soft)]">
                <div className="h-full rounded-full bg-[var(--nf-accent)] transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-[var(--nf-text-subtle)]">
                <span>{statusMessage}</span>
                <span>{progress}%</span>
              </div>
            </div>
            <div className="mt-5 grid gap-2">
              {[
                ['保存章节', progress > 10 || status === 'success'],
                ['章节索引', progress > 24 || status === 'success'],
                ['角色', progress > 42 || status === 'success'],
                ['关系', progress > 58 || status === 'success'],
                ['时间线', progress > 72 || status === 'success'],
                ['世界观', progress > 82 || status === 'success'],
                ['写入内容库', status === 'success'],
              ].map(([label, done]) => (
                <div key={String(label)} className="flex min-h-10 items-center justify-between rounded-xl border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] px-3 text-sm">
                  <span className="text-[var(--nf-text-muted)]">{label}</span>
                  {done ? <CheckCircle2 className="h-4 w-4 text-[var(--nf-success)]" /> : <span className="h-2 w-2 rounded-full bg-[var(--nf-text-subtle)]" />}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="nf-panel nf-panel-pad">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="nf-kicker">Step 3</div>
              <h2 className="mt-1 text-lg font-extrabold text-[var(--nf-text)]">质量诊断</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--nf-text-muted)]">
                “提取完成”表示资产已入库；“创作就绪”表示这些资产足够支撑更稳定的 AI 写作。低质量项会给出可执行修复入口。
              </p>
            </div>
            <span className="inline-flex min-h-10 items-center rounded-xl border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] px-3 text-xs font-bold text-[var(--nf-text-muted)]">
              {statusLabel}
            </span>
          </div>

          {savedSummary ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['角色', savedSummary.characters],
                ['世界观', savedSummary.world],
                ['时间线', savedSummary.timeline],
                ['关系', savedSummary.relationships],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] p-4">
                  <p className="text-xs text-[var(--nf-text-subtle)]">{label}</p>
                  <p className="mt-2 text-2xl font-black text-[var(--nf-text)]">{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="nf-alert mt-5">
              还没有可诊断的导入结果。先完成 Step 1 导入，或等待后台任务写入资产。
            </div>
          )}

          {analysisResult?.analysis_warning ? (
            <div className="nf-alert mt-4">{analysisResult.analysis_warning}</div>
          ) : null}

          {topQualityIssues.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-[color-mix(in_srgb,var(--nf-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--nf-warning)_8%,transparent)] p-4">
              <h3 className="text-sm font-bold text-[var(--nf-text)]">优先关注</h3>
              <ul className="mt-3 space-y-2 text-sm text-[var(--nf-text-muted)]">
                {topQualityIssues.map((issue, index) => (
                  <li key={`${issue}-${index}`}>• {issue}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {diagnosticAreas.map((area) => (
              <article key={area.key} className={['rounded-2xl border p-4', statusToneClass(area.status)].join(' ')}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={['h-2.5 w-2.5 rounded-full', statusDotClass(area.status)].join(' ')} />
                      <h3 className="text-sm font-black text-[var(--nf-text)]">{area.title}</h3>
                    </div>
                    <p className="mt-2 text-xl font-black text-[var(--nf-text)]">{area.stat}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--nf-text-muted)]">{area.detail}</p>
                <ul className="mt-3 space-y-1 text-xs leading-5 text-[var(--nf-text-subtle)]">
                  {area.actions.slice(0, 3).map((action) => (
                    <li key={action}>建议：{action}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <details className="mt-5 rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] p-4">
            <summary className="cursor-pointer text-sm font-bold text-[var(--nf-text)]">查看详细诊断日志</summary>
            <div className="mt-4 grid gap-4">
              {analysisResult?.analysis_stage_results ? (
                <div>
                  <h3 className="text-sm font-bold text-[var(--nf-text)]">阶段结果</h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {ANALYSIS_STAGE_ORDER.map((stageKey) => {
                      const stageStatus = analysisResult.analysis_stage_results?.[stageKey];
                      return (
                        <div key={stageKey} className="rounded-xl border border-[var(--nf-border)] bg-[var(--nf-surface)] px-3 py-2">
                          <p className="text-xs text-[var(--nf-text-subtle)]">{getNovelImportStageLabel(stageKey)}</p>
                          <p className="mt-1 text-sm font-bold text-[var(--nf-text)]">{getStageStatusLabel(stageStatus)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {modelRouteSummary ? (
                <div>
                  <h3 className="text-sm font-bold text-[var(--nf-text)]">模型路由诊断</h3>
                  <div className="mt-3 rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] p-4">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--nf-text-subtle)]">Selected</p>
                        <p className="mt-1 break-words text-sm font-black text-[var(--nf-text)]">{modelRouteSummary.selectedModel}</p>
                        <p className="mt-2 text-xs leading-5 text-[var(--nf-text-muted)]">
                          {modelRouteSummary.role} · {modelRouteSummary.reasonLabel}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--nf-text-subtle)]">Candidates</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(modelRouteSummary.candidates.length > 0 ? modelRouteSummary.candidates : [modelRouteSummary.selectedModel]).map((model) => (
                            <span key={model} className="nf-chip break-all">{model}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {modelRouteSummary.probeResults.length > 0 ? (
                      <div className="mt-4 grid gap-2 md:grid-cols-2">
                        {modelRouteSummary.probeResults.map((probe) => {
                          const statusLabel = getModelProbeStatusLabel(probe);
                          return (
                            <div key={probe.model} className="rounded-xl border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] px-3 py-2">
                              <div className="flex items-start justify-between gap-3">
                                <p className="break-all text-xs font-bold text-[var(--nf-text)]">{probe.model}</p>
                                <span className="shrink-0 rounded-full border border-[var(--nf-border)] px-2 py-0.5 text-[11px] text-[var(--nf-text-muted)]">{statusLabel}</span>
                              </div>
                              <p className="mt-2 text-xs leading-5 text-[var(--nf-text-subtle)]">
                                分数 {probe.score ?? 'n/a'} · 延迟 {probe.latencyMs !== null ? `${probe.latencyMs}ms` : 'n/a'} · JSON {probe.jsonCapable ? '通过' : '未通过'} · 提取信号 {probe.extractionRich ? '有' : '不足'}
                              </p>
                              {probe.error ? <p className="mt-1 line-clamp-2 text-xs text-[var(--nf-warning)]">{probe.error}</p> : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs leading-5 text-[var(--nf-text-subtle)]">本次没有执行模型探测，通常表示本地 mock、路由关闭或服务端复用了默认模型。</p>
                    )}
                  </div>
                </div>
              ) : null}

              {analysisResult?.candidate_counts && Object.keys(analysisResult.candidate_counts).length > 0 ? (
                <div>
                  <h3 className="text-sm font-bold text-[var(--nf-text)]">候选与合并统计</h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {Object.entries(analysisResult.candidate_counts).map(([key, value]) => (
                      <div key={key} className="rounded-xl border border-[var(--nf-border)] bg-[var(--nf-surface)] px-3 py-2">
                        <p className="text-xs text-[var(--nf-text-subtle)]">{CANDIDATE_COUNT_LABELS[key] || key}</p>
                        <p className="mt-1 text-sm font-bold text-[var(--nf-text)]">{formatDiagnosticValue(key, value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-bold text-[var(--nf-text)]">章节索引运行记录</h3>
                  <span className="text-xs text-[var(--nf-text-subtle)]">
                    {chapterIndexRunsLoading ? '正在读取...' : chapterIndexRuns.length ? `最近 ${chapterIndexRuns.length} 次` : '暂无历史 run'}
                  </span>
                </div>
                {chapterIndexRunError ? (
                  <div className="nf-alert mt-3">{chapterIndexRunError}</div>
                ) : chapterIndexRuns.length > 0 ? (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {chapterIndexRuns.map((run) => {
                      const counts = run.candidate_counts || {};
                      const retryableStatuses = getRetryableChapterIndexRunStatuses(run);
                      const retryCount = Math.max(counts.chapter_index_needs_retry ?? 0, retryableStatuses.length);
                      const failedCount = counts.chapter_index_failed_attempts ?? 0;
                      const successCount = counts.chapter_index_successful ?? 0;
                      const statusPreview = getChapterStatusPreview(run);
                      const runModelRoute = normalizeModelRoute(run.model_route);
                      return (
                        <article key={run.run_key} className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-sm font-bold text-[var(--nf-text)]">{run.task_type || 'chapter_index'} · {getRunTimestampLabel(run.updated_at || run.created_at)}</p>
                              <p className="mt-1 text-xs text-[var(--nf-text-subtle)]">{run.run_key}</p>
                            </div>
                            <span className={['inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-bold', retryCount > 0 || failedCount > 0 ? 'border-[color-mix(in_srgb,var(--nf-warning)_35%,transparent)] text-[var(--nf-warning)]' : 'border-[color-mix(in_srgb,var(--nf-success)_30%,transparent)] text-[var(--nf-success)]'].join(' ')}>
                              {retryCount > 0 ? `${retryCount} 章需重跑` : '无待重跑章'}
                            </span>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            {[
                              ['成功章', successCount],
                              ['失败尝试', failedCount],
                              ['索引快照', counts.chapter_indices ?? run.chapter_indices_summary.length],
                            ].map(([label, value]) => (
                              <div key={String(label)} className="rounded-xl border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] px-3 py-2">
                                <p className="text-xs text-[var(--nf-text-subtle)]">{label}</p>
                                <p className="mt-1 text-sm font-black text-[var(--nf-text)]">{String(value)}</p>
                              </div>
                            ))}
                          </div>
                          {statusPreview.length > 0 ? (
                            <ul className="mt-3 space-y-1 text-xs leading-5 text-[var(--nf-text-muted)]">
                              {statusPreview.map((line) => <li key={line}>{line}</li>)}
                              {run.chapter_index_status.length > statusPreview.length ? (
                                <li className="text-[var(--nf-text-subtle)]">还有 {run.chapter_index_status.length - statusPreview.length} 章状态记录</li>
                              ) : null}
                            </ul>
                          ) : null}
                          {runModelRoute ? (
                            <div className="mt-3 rounded-xl border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] px-3 py-2 text-xs leading-5 text-[var(--nf-text-muted)]">
                              <p className="font-semibold text-[var(--nf-text)]">模型：{runModelRoute.selectedModel}</p>
                              <p>{runModelRoute.role} · {runModelRoute.reasonLabel}</p>
                            </div>
                          ) : null}
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="nf-button"
                              disabled={repairSubmitting !== null || retryableStatuses.length === 0}
                              onClick={() => void submitRepairTask('chapter_index_rerun', undefined, buildChapterIndexRunRerunPayload(run))}
                            >
                              <RefreshCw className={['h-4 w-4', repairSubmitting === 'chapter_index_rerun' ? 'animate-spin' : ''].join(' ')} />
                              重跑该 run 失败章
                            </button>
                            {retryableStatuses.length === 0 ? (
                              <span className="inline-flex min-h-10 items-center text-xs text-[var(--nf-text-subtle)]">当前 run 没有待重跑章节</span>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="nf-alert mt-3">
                    当前项目还没有可查询的章节索引 run。新导入或修复 preview 完成后会在这里显示。
                  </div>
                )}
              </div>

              {qualityRepairGroups.length > 0 ? (
                <div>
                  <h3 className="text-sm font-bold text-[var(--nf-text)]">可修复问题</h3>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {qualityRepairGroups.map((group) => (
                      <div key={group.key} className={['rounded-2xl border p-4', severityClass(group.severity)].join(' ')}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h4 className="text-sm font-bold">{group.title}</h4>
                            <p className="mt-1 text-xs leading-5 text-[var(--nf-text-muted)]">{group.description}</p>
                          </div>
                          <button type="button" className="nf-button" disabled={repairSubmitting !== null} onClick={() => void submitRepairTask(group.recommendedTask, group)}>
                            <Wrench className="h-4 w-4" />
                            {repairTaskLabel(group.recommendedTask)}
                          </button>
                        </div>
                        <ul className="mt-3 space-y-2 text-sm text-[var(--nf-text-muted)]">
                          {group.items.slice(0, 3).map((item, index) => (
                            <li key={`${group.key}-${index}`} className="rounded-xl bg-[var(--nf-surface)] px-3 py-2">
                              {getIssuePreview(item)}
                            </li>
                          ))}
                          {group.items.length > 3 ? <li className="text-xs text-[var(--nf-text-subtle)]">还有 {group.items.length - 3} 项</li> : null}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </details>

          <div className="mt-5 rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-sm font-black text-[var(--nf-text)]">质量修复重跑</h3>
                <p className="mt-1 text-sm text-[var(--nf-text-muted)]">重跑会生成 preview 结果，先复核再进入资产替换。</p>
              </div>
              {repairChapters.length ? (
                <label className="flex min-w-52 flex-col gap-1 text-xs text-[var(--nf-text-subtle)]">
                  章节范围
                  <select
                    value={selectedRepairChapterId}
                    onChange={(event) => setSelectedRepairChapterId(event.target.value)}
                    className="min-h-10 rounded-xl border border-[var(--nf-border)] bg-[var(--nf-surface)] px-3 text-sm text-[var(--nf-text)] outline-none focus:border-[color-mix(in_srgb,var(--nf-accent)_45%,transparent)]"
                  >
                    <option value="">全部章节</option>
                    {repairChapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                { type: 'chapter_index_rerun' as const, label: '重跑章节索引' },
                { type: 'relationship_backfill' as const, label: '回补关系' },
                { type: 'timeline_rebuild' as const, label: '重建时间线' },
              ].map((item) => (
                <button key={item.type} type="button" className="nf-button" disabled={repairSubmitting !== null} onClick={() => void submitRepairTask(item.type)}>
                  <RefreshCw className={['h-4 w-4', repairSubmitting === item.type ? 'animate-spin' : ''].join(' ')} />
                  {item.label}
                </button>
              ))}
            </div>
            {repairMessage ? <div className="nf-alert mt-3">{repairMessage}</div> : null}
          </div>
        </section>

        <section className="nf-panel nf-panel-pad">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="nf-kicker">Step 4</div>
              <h2 className="mt-1 text-lg font-extrabold text-[var(--nf-text)]">下一步行动</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--nf-text-muted)]">
                导入完成后可以直接进入写作、章节整理或资产复核。若质量仍需修复，建议先补强关系、角色或世界观以提升生成文本的情绪张力。
              </p>
            </div>
            <ArrowRight className="hidden h-5 w-5 text-[var(--nf-accent)] md:block" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: '打开主工作台', icon: MessageSquareText, action: () => router.push('/') },
              { label: '项目质量总览', icon: LayoutDashboard, action: () => router.push('/analytics') },
              { label: '打开 editor', icon: BookOpen, action: () => router.push('/editor') },
              { label: '让 AI 写序章', icon: FileText, action: () => router.push('/?quickAction=prologue') },
              { label: '修复角色/关系', icon: Wrench, action: () => void submitRepairTask('relationship_backfill') },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.label} type="button" className="nf-button min-h-12 justify-start" onClick={item.action}>
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
