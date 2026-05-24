'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Globe2,
  Loader2,
  RefreshCw,
  UploadCloud,
  Users,
} from 'lucide-react';
import { contentService, taskService, textProcessingService } from '@/lib/api';
import { buildAssetQualityDiagnostics, type AssetQualityDiagnosticsResult } from '@/lib/asset-quality-diagnostics';
import { getNovelImportStageLabel, parseNovelImportTaskResult } from '@/lib/task-events';
import { useAppStore } from '@/lib/hooks/use-app-store';
import { useSessionTaskEvents } from '@/lib/hooks/use-session-task-events';
import { useSessions } from '@/lib/hooks/use-sessions';
import { formatFileSize } from '@/lib/utils';
import type { ImportAnalysisDiagnostics, NovelImportAnalysisStageKey, NovelImportTaskResult, OpenAIConfig } from '@/types';

const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.text', '.epub', '.pdf', '.docx'];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

type ExtractStatus = 'idle' | 'uploading' | 'extracting' | 'success' | 'error';
type RepairTaskType = 'chapter_index_rerun' | 'relationship_backfill' | 'timeline_rebuild';
type RepairSeverity = 'high' | 'medium' | 'low';

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
  if (!result?.analysis_status) return '提取完成，结构化资产已写入当前项目。';
  if (result.analysis_status === 'completed') return '章节已导入，结构化资产已完成。';
  return '导入已完成，但部分深度分析结果需要复核。';
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
    return String(payload.title || payload.name || payload.endpoint || payload.description_preview || payload.error || JSON.stringify(payload));
  }
  return String(value ?? '');
}

function severityClass(severity: RepairSeverity): string {
  if (severity === 'high') return 'border-red-500/30 bg-red-500/10 text-red-100';
  if (severity === 'medium') return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  return 'border-slate-700 bg-slate-900/80 text-slate-200';
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
      items: normalizeRepairItems(result.failed_chapters || diagnostics?.failed_chapters),
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

  const submitRepairTask = async (taskType: RepairTaskType) => {
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
        chapter_id: selectedRepairChapterId || null,
        source: 'extract_quality_panel',
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

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <h1 className="bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
            智能文本提取引擎
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-base text-slate-300">
            上传小说文本，让系统提取角色、世界观、时间线与关系网，并写入当前项目的统一资产库。
          </p>
          <p className="mt-3 text-sm text-slate-500">当前项目：{projectLabel}</p>
        </div>

        <div className="relative">
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-sky-500/30 via-cyan-500/20 to-emerald-500/30 blur-2xl" />
          <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={[
                'rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-all duration-300',
                isDragging ? 'scale-[1.01] border-sky-400 bg-sky-500/10' : 'border-slate-700 bg-slate-950/40',
                status === 'error' ? 'border-red-500/60 bg-red-500/5' : '',
              ].join(' ')}
            >
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-800 shadow-inner">
                {isBusy ? (
                  <Loader2 className="h-10 w-10 animate-spin text-sky-300" />
                ) : status === 'success' ? (
                  <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                ) : (
                  <UploadCloud className={`h-10 w-10 ${isDragging ? 'text-sky-300' : 'text-slate-400'}`} />
                )}
              </div>
              <h2 className="text-2xl font-semibold text-white">
                {status === 'success' ? '提取完成' : '拖拽文本文件到这里，或点击选择文件'}
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
                支持 {ACCEPTED_EXTENSIONS.join(', ')}，进度与完成状态会跟随真实后台任务更新。
              </p>
              <label className="mt-8 inline-flex cursor-pointer items-center justify-center rounded-full bg-sky-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400">
                <input type="file" accept={ACCEPTED_EXTENSIONS.join(',')} className="hidden" onChange={handleFileChange} />
                选择文本文件
              </label>

              {file ? (
                <div className="mx-auto mt-6 flex max-w-md items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-left">
                  <FileText className="h-5 w-5 text-sky-300" />
                  <div>
                    <p className="text-sm font-medium text-slate-100">{file.name}</p>
                    <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
                  </div>
                </div>
              ) : null}

              {status !== 'idle' || errorMessage ? (
                <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-left">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-200">
                    {status === 'error' ? <AlertCircle className="h-4 w-4 text-red-400" /> : <Clock className="h-4 w-4 text-sky-300" />}
                    <span>{statusMessage}</span>
                  </div>
                  {status !== 'error' ? (
                    <div className="mt-3">
                      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-500" style={{ width: `${progress}%` }} />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">进度 {progress}%</p>
                    </div>
                  ) : null}
                  {errorMessage ? <p className="mt-3 text-sm text-red-400">{errorMessage}</p> : null}
                </div>
              ) : null}
            </div>

            {savedSummary ? (
              <div className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
                <div className="flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="h-5 w-5" />
                  <h3 className="text-lg font-semibold">已保存到项目资产库</h3>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-4">
                  {[
                    ['角色', savedSummary.characters],
                    ['世界观', savedSummary.world],
                    ['时间线', savedSummary.timeline],
                    ['关系网', savedSummary.relationships],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
                    </div>
                  ))}
                </div>

                {analysisResult ? (
                  <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-white">导入分析结果</h4>
                        <p className="mt-1 text-sm text-slate-400">{getAnalysisStatusCopy(analysisResult)}</p>
                      </div>
                      {analysisResult.analysis_status ? (
                        <span className={['inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium', ANALYSIS_STATUS_STYLES[analysisResult.analysis_status]].join(' ')}>
                          {ANALYSIS_STATUS_LABELS[analysisResult.analysis_status]}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {ANALYSIS_STAGE_ORDER.map((stageKey) => {
                        const stageStatus = analysisResult.analysis_stage_results?.[stageKey];
                        return (
                          <div key={stageKey} className={['rounded-2xl border px-4 py-3', getStageStatusStyle(stageStatus)].join(' ')}>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium">{getNovelImportStageLabel(stageKey)}</span>
                              <span className="text-xs font-semibold">{getStageStatusLabel(stageStatus)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {analysisResult.analysis_warning ? (
                      <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{analysisResult.analysis_warning}</div>
                    ) : null}
                    {analysisResult.analysis_quality_issues?.length ? (
                      <div className="mt-4 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4">
                        <h5 className="text-sm font-semibold text-yellow-100">质量问题</h5>
                        <ul className="mt-2 space-y-2 text-sm text-yellow-50/90">
                          {analysisResult.analysis_quality_issues.slice(0, 6).map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {analysisResult.candidate_counts && Object.keys(analysisResult.candidate_counts).length > 0 ? (
                      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                        <h5 className="text-sm font-semibold text-white">候选与合并诊断</h5>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {Object.entries(analysisResult.candidate_counts).map(([key, value]) => (
                            <div key={key} className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                              <p className="text-xs text-slate-500">{CANDIDATE_COUNT_LABELS[key] || key}</p>
                              <p className="mt-1 text-sm font-semibold text-slate-100">{formatDiagnosticValue(key, value)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h5 className="text-sm font-semibold text-white">质量修复重跑</h5>
                          <p className="mt-1 text-sm text-slate-400">重跑会生成 preview 结果，先复核再进入资产替换。</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { type: 'chapter_index_rerun' as const, label: '单章/章节索引' },
                            { type: 'relationship_backfill' as const, label: '关系回补' },
                            { type: 'timeline_rebuild' as const, label: '时间线重建' },
                          ].map((item) => (
                            <button
                              key={item.type}
                              type="button"
                              disabled={repairSubmitting !== null}
                              onClick={() => void submitRepairTask(item.type)}
                              className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-100 transition hover:border-cyan-400 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <RefreshCw className={['mr-2 h-3.5 w-3.5', repairSubmitting === item.type ? 'animate-spin' : ''].join(' ')} />
                              {item.label}
                            </button>
                          ))}
                        </div>
                        {repairChapters.length ? (
                          <label className="flex flex-col gap-1 text-xs text-slate-400">
                            章节范围
                            <select
                              value={selectedRepairChapterId}
                              onChange={(event) => setSelectedRepairChapterId(event.target.value)}
                              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none transition focus:border-cyan-400"
                            >
                              <option value="">全部章节</option>
                              {repairChapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
                            </select>
                          </label>
                        ) : null}
                      </div>
                      {repairMessage ? <p className="mt-3 text-sm text-slate-300">{repairMessage}</p> : null}
                    </div>
                    {qualityRepairGroups.length > 0 ? (
                      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <h5 className="text-sm font-semibold text-white">可解释质量修复面板</h5>
                            <p className="mt-1 text-sm text-slate-400">下面的问题会影响资产可信度和 AI 写作稳定性。优先处理高风险项。</p>
                          </div>
                          <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300">
                            {qualityRepairGroups.length} 类问题
                          </span>
                        </div>
                        <div className="mt-4 grid gap-3 lg:grid-cols-2">
                          {qualityRepairGroups.map((group) => (
                            <div key={group.key} className={['rounded-2xl border p-4', severityClass(group.severity)].join(' ')}>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <h6 className="text-sm font-semibold">{group.title}</h6>
                                  <p className="mt-1 text-xs leading-5 opacity-80">{group.description}</p>
                                </div>
                                <button
                                  type="button"
                                  disabled={repairSubmitting !== null}
                                  onClick={() => void submitRepairTask(group.recommendedTask)}
                                  className="shrink-0 rounded-full border border-white/10 bg-slate-950/40 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-950/70 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {repairTaskLabel(group.recommendedTask)}
                                </button>
                              </div>
                              <ul className="mt-3 space-y-2 text-sm">
                                {group.items.slice(0, 5).map((item, index) => (
                                  <li key={`${group.key}-${index}`} className="rounded-xl bg-slate-950/35 px-3 py-2 leading-6">
                                    {getIssuePreview(item)}
                                  </li>
                                ))}
                                {group.items.length > 5 ? (
                                  <li className="text-xs opacity-70">还有 {group.items.length - 5} 项未展示</li>
                                ) : null}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : analysisResult.analysis_status && analysisResult.analysis_status !== 'completed' ? (
                      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
                        当前状态不是 completed，但没有可展示的结构化 diagnostics。建议重新运行导入或查看任务中心错误详情。
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap gap-3">
                  <button type="button" onClick={() => router.push('/characters')} className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-sky-400 hover:text-sky-300">
                    <Users className="mr-2 h-4 w-4" />
                    查看角色
                  </button>
                  <button type="button" onClick={() => router.push('/world')} className="inline-flex items-center rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300">
                    <Globe2 className="mr-2 h-4 w-4" />
                    查看世界观
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <Users className="h-8 w-8 text-sky-300" />
            <h3 className="mt-4 text-lg font-semibold text-white">角色提取</h3>
            <p className="mt-2 text-sm text-slate-400">提取任务走统一后台调度链路，角色结果会持续写入当前项目。</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <Globe2 className="h-8 w-8 text-emerald-300" />
            <h3 className="mt-4 text-lg font-semibold text-white">真实进度</h3>
            <p className="mt-2 text-sm text-slate-400">页面进度直接读取后台任务的真实 progress 与 message。</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <Clock className="h-8 w-8 text-cyan-300" />
            <h3 className="mt-4 text-lg font-semibold text-white">项目闭环</h3>
            <p className="mt-2 text-sm text-slate-400">提取完成后，结果会进入资产库，并被角色页、世界页和聊天工作台复用。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
