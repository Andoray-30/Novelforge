'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { contentService } from '@/lib/api';
import { useAppStore } from '@/lib/hooks/use-app-store';
import { buildContentCreateRequest, getContentAssetPayload, getContentAssetText } from '@/lib/content-contract';
import {
  buildManualChapterPayload,
  buildPromotedAIChapterPayload,
  buildPromotedAIChapterTags,
  buildUpdatedChapterPayload,
  findMostRecentlyUpdatedChapter,
  getNextManualChapterIndex,
  resolveChapterDirectoryMetadata,
  sortChaptersByDirectory,
} from '@/lib/chapter-metadata';
import {
  buildEditorChapterArchiveRequest,
  buildEditorChapterChatHandoff,
  buildEditorChapterRestoreRequest,
  EDITOR_CHAPTER_FILTERS,
  filterEditorChapters,
  getEditorChapterWorkflowState,
  resolveEditorChapterSelection,
  type EditorChapterAction,
  type EditorChapterFilter,
} from '@/lib/editor-chapter-workflow';
import type { PromotableChapterDestination } from '@/lib/chapter-metadata';
import {
  formatNovelImportStageSummary,
  parseNovelImportTaskResult,
} from '@/lib/task-events';
import { useSessionTaskEvents } from '@/lib/hooks/use-session-task-events';
import {
  DEFAULT_PROJECT_PREFERENCES,
  loadProjectPreferences,
  PROJECT_PREFERENCES_CHANGED_EVENT,
  type ProjectPreferences,
} from '@/lib/project-preferences';
import { useSessions } from '@/lib/hooks/use-sessions';
import { Archive, BookOpen, FilePlus2, FileText, MessageSquareText, RefreshCw, RotateCcw, Save, Sparkles, Trash2 } from 'lucide-react';
import type { ContentItem } from '@/types';

function syncChapterQueryParam(chapterId: string | null) {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  if (chapterId) {
    url.searchParams.set('chapterId', chapterId);
  } else {
    url.searchParams.delete('chapterId');
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}`);
}

type LoadChaptersOptions = {
  preferredChapterId?: string | null;
  preferLatest?: boolean;
  silent?: boolean;
};

export default function NovelEditorPage() {
  const { currentSession, currentSessionId, createSession } = useSessions();
  const selectedNovelId = useAppStore((s) => s.selectedNovelId);

  const [chapters, setChapters] = useState<ContentItem[]>([]);
  const [chapterFilter, setChapterFilter] = useState<EditorChapterFilter>('all');
  const [requestedChapterId, setRequestedChapterId] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingChapter, setIsCreatingChapter] = useState(false);
  const [isDeletingChapter, setIsDeletingChapter] = useState(false);
  const [isRefreshingChapters, setIsRefreshingChapters] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [projectPreferences, setProjectPreferences] = useState<ProjectPreferences>(() => loadProjectPreferences(currentSessionId));
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setRequestedChapterId(params.get('chapterId'));
  }, []);

  useEffect(() => {
    setProjectPreferences(loadProjectPreferences(currentSessionId));

    const handlePreferencesChanged = () => {
      setProjectPreferences(loadProjectPreferences(currentSessionId));
    };

    window.addEventListener(PROJECT_PREFERENCES_CHANGED_EVENT, handlePreferencesChanged as EventListener);
    return () => {
      window.removeEventListener(PROJECT_PREFERENCES_CHANGED_EVENT, handlePreferencesChanged as EventListener);
    };
  }, [currentSessionId]);

  const loadChapters = useCallback(async (options?: LoadChaptersOptions) => {
    const silent = options?.silent ?? false;

    if (silent) {
      setIsRefreshingChapters(true);
    } else {
      setIsLoading(true);
    }

    setError(null);

    try {
      const result = await contentService.searchContent({
        query: '',
        content_type: 'chapter',
        session_id: currentSessionId || undefined,
        parent_id: selectedNovelId || undefined,
        limit: 200,
      });

      const items = sortChaptersByDirectory(result.items);
      const latestItem = findMostRecentlyUpdatedChapter(result.items);
      setChapters(items);

      setSelectedChapterId((currentSelected) => {
        const preferredChapterId = options?.preferredChapterId;
        return resolveEditorChapterSelection({
          items,
          preferredChapterId: options?.preferredChapterId,
          preferLatestItem: options?.preferLatest ? latestItem : null,
          currentSelectedId: currentSelected,
          requestedChapterId,
        });
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load chapter assets');
    } finally {
      if (silent) {
        setIsRefreshingChapters(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [currentSessionId, selectedNovelId, requestedChapterId]);

  useEffect(() => {
    void loadChapters();
  }, [loadChapters]);

  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.metadata.id === selectedChapterId) || null,
    [chapters, selectedChapterId]
  );

  const selectedChapterWorkflow = useMemo(
    () => selectedChapter ? getEditorChapterWorkflowState(selectedChapter) : null,
    [selectedChapter],
  );

  const canPromoteSelectedChapter = selectedChapterWorkflow?.isCandidate ?? false;

  const filteredChapters = useMemo(
    () => filterEditorChapters(chapters, chapterFilter),
    [chapterFilter, chapters],
  );

  useEffect(() => {
    syncChapterQueryParam(selectedChapterId);
  }, [selectedChapterId]);

  useEffect(() => {
    if (!selectedChapter) {
      setDraftTitle('');
      setDraftContent('');
      return;
    }

    const payload = getContentAssetPayload(selectedChapter);
    setDraftTitle(resolveChapterDirectoryMetadata(selectedChapter).displayTitle);
    setDraftContent(getContentAssetText(selectedChapter, payload));
    setSaveMessage(null);
  }, [selectedChapter]);

  const hasUnsavedChanges = useMemo(() => {
    if (!selectedChapter) {
      return false;
    }

    const payload = getContentAssetPayload(selectedChapter);
    return draftTitle !== resolveChapterDirectoryMetadata(selectedChapter).displayTitle || draftContent !== getContentAssetText(selectedChapter, payload);
  }, [draftContent, draftTitle, selectedChapter]);

  useSessionTaskEvents({
    sessionId: currentSessionId,
    onCompleted: (detail) => {
      if (!['novel_import', 'text_generation'].includes(detail.taskType)) {
        return;
      }

      if (hasUnsavedChanges) {
        setSaveMessage('发现新的章节资产。请先保存当前草稿，再刷新章节列表。');
        return;
      }

      void loadChapters({ preferLatest: true, silent: true });
      const result = parseNovelImportTaskResult(detail.result);
      const chaptersCount = result?.chapters_count ?? null;
      const warning = result?.analysis_warning?.trim() || '';
      const stageSummary = formatNovelImportStageSummary(result) || '';
      const baseMessage = detail.taskType === 'novel_import'
        ? `${result?.analysis_status && result.analysis_status !== 'completed' ? '导入后的章节已经出现在编辑器列表中，但深度分析未完全完成' : '导入后的章节已经出现在编辑器列表中'}${chaptersCount !== null ? `（共 ${chaptersCount} 章）` : ''}。`
        : '新生成的章节已经出现在列表中。';
      const extras = [stageSummary, warning].filter(Boolean).join(' ');
      setSaveMessage(extras ? `${baseMessage} ${extras}` : baseMessage);
    },
    onFailed: (detail) => {
      if (!['novel_import', 'text_generation'].includes(detail.taskType)) {
        return;
      }
      setError(`后台任务失败，章节资产可能尚未完全更新：${detail.error || detail.message || '未知错误'}`);
    },
    onCancelled: (detail) => {
      if (!['novel_import', 'text_generation'].includes(detail.taskType)) {
        return;
      }
      setSaveMessage('后台任务在写入新章节前已被取消。');
    },
  });

  const handleSelectChapter = useCallback((chapterId: string) => {
    if (chapterId === selectedChapterId) {
      return;
    }

    if (hasUnsavedChanges) {
      const confirmed = window.confirm('当前章节还有未保存修改。确定切换章节并丢弃这些本地编辑吗？');
      if (!confirmed) {
        return;
      }
    }

    setSelectedChapterId(chapterId);
  }, [hasUnsavedChanges, selectedChapterId]);

  const handleSave = useCallback(async (mode: 'manual' | 'auto' = 'manual') => {
    if (!selectedChapter) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const nextTitle = draftTitle.trim() || selectedChapter.metadata.title || 'Untitled Chapter';
      const updatedPayload = buildUpdatedChapterPayload({
        item: selectedChapter,
        title: nextTitle,
        content: draftContent,
      });

      const request = buildContentCreateRequest({
        type: 'chapter',
        title: nextTitle,
        data: updatedPayload,
        content: draftContent,
        status: selectedChapter.metadata.status,
        author: selectedChapter.metadata.author,
        sessionId: selectedChapter.metadata.session_id ?? currentSessionId ?? undefined,
        parentId: selectedChapter.metadata.parent_id,
        childrenIds: selectedChapter.metadata.children_ids,
        tags: selectedChapter.metadata.tags,
      });

      await contentService.update(selectedChapter.metadata.id, request);

      const updatedAt = new Date().toISOString();
      setChapters((current) =>
        current.map((chapter) =>
          chapter.metadata.id === selectedChapter.metadata.id
            ? {
                ...chapter,
                metadata: {
                  ...chapter.metadata,
                  title: nextTitle,
                  updated_at: updatedAt,
                },
                content: draftContent,
                extracted_data: updatedPayload,
              }
            : chapter
        )
      );

      setDraftTitle(nextTitle);
      setSaveMessage(mode === 'auto' ? 'Chapter auto-saved.' : 'Chapter saved back to the content library.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save chapter');
    } finally {
      setIsSaving(false);
    }
  }, [currentSessionId, draftContent, draftTitle, selectedChapter]);

  const handlePromoteAIChapter = useCallback(async (destination: PromotableChapterDestination) => {
    if (!selectedChapter || !canPromoteSelectedChapter) {
      return;
    }

    if (hasUnsavedChanges) {
      setSaveMessage('请先保存当前正文修改，再调整章节保存位置。');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const promotedPayload = buildPromotedAIChapterPayload({
        item: selectedChapter,
        destination,
      });
      const title = typeof promotedPayload.display_title === 'string'
        ? promotedPayload.display_title
        : selectedChapter.metadata.title;
      const content = getContentAssetText(selectedChapter, promotedPayload);
      const tags = buildPromotedAIChapterTags(selectedChapter.metadata.tags, destination);

      const request = buildContentCreateRequest({
        type: 'chapter',
        title,
        data: promotedPayload,
        content,
        status: selectedChapter.metadata.status,
        author: selectedChapter.metadata.author,
        sessionId: selectedChapter.metadata.session_id ?? currentSessionId ?? undefined,
        parentId: selectedChapter.metadata.parent_id,
        childrenIds: selectedChapter.metadata.children_ids,
        tags,
      });

      await contentService.update(selectedChapter.metadata.id, request);

      const updatedAt = new Date().toISOString();
      setChapters((current) => sortChaptersByDirectory(current.map((chapter) =>
        chapter.metadata.id === selectedChapter.metadata.id
          ? {
              ...chapter,
              metadata: {
                ...chapter.metadata,
                title,
                tags,
                updated_at: updatedAt,
              },
              content,
              extracted_data: promotedPayload,
            }
          : chapter
      )));
      setDraftTitle(title);
      setDraftContent(content);
      setSaveMessage('章节保存位置已更新，正文内容保持不变。');
    } catch (promoteError) {
      setError(promoteError instanceof Error ? promoteError.message : 'Failed to update chapter metadata');
    } finally {
      setIsSaving(false);
    }
  }, [canPromoteSelectedChapter, currentSessionId, hasUnsavedChanges, selectedChapter]);

  const handleArchiveSelectedChapter = useCallback(async () => {
    if (!selectedChapter || !selectedChapterWorkflow?.isCandidate) {
      return;
    }

    if (hasUnsavedChanges) {
      setSaveMessage('请先保存当前正文修改，再归档候选。');
      return;
    }

    const confirmed = window.confirm('归档后不会删除内容，只会从默认列表隐藏，可在“已归档”筛选中查看。确定归档吗？');
    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const request = buildEditorChapterArchiveRequest(selectedChapter);
      await contentService.update(selectedChapter.metadata.id, request);
      const updatedAt = new Date().toISOString();
      setChapters((current) => sortChaptersByDirectory(current.map((chapter) =>
        chapter.metadata.id === selectedChapter.metadata.id
          ? {
              ...chapter,
              metadata: {
                ...chapter.metadata,
                title: request.metadata.title,
                tags: request.metadata.tags ?? chapter.metadata.tags,
                status: request.metadata.status ?? 'archived',
                updated_at: updatedAt,
              },
              content: request.content,
              extracted_data: request.extracted_data,
            }
          : chapter
      )));
      setChapterFilter('archived');
      setSaveMessage('候选已归档。内容没有删除，可在“已归档”中恢复查看。');
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Failed to archive chapter');
    } finally {
      setIsSaving(false);
    }
  }, [hasUnsavedChanges, selectedChapter, selectedChapterWorkflow?.isCandidate]);

  const handleRestorePreviousSnapshot = useCallback(async () => {
    if (!selectedChapter || !selectedChapterWorkflow?.hasPreviousSnapshot) {
      return;
    }

    if (hasUnsavedChanges) {
      setSaveMessage('请先保存或放弃当前本地修改，再恢复上一版。');
      return;
    }

    const confirmed = window.confirm('确定恢复 previous_snapshot 吗？当前版本会被保存为 recovery_snapshot，避免丢失。');
    if (!confirmed) {
      return;
    }

    const request = buildEditorChapterRestoreRequest(selectedChapter);
    if (!request) {
      setError('当前章节没有可恢复的 previous_snapshot。');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      await contentService.update(selectedChapter.metadata.id, request);
      const updatedAt = new Date().toISOString();
      setChapters((current) => sortChaptersByDirectory(current.map((chapter) =>
        chapter.metadata.id === selectedChapter.metadata.id
          ? {
              ...chapter,
              metadata: {
                ...chapter.metadata,
                title: request.metadata.title,
                tags: request.metadata.tags ?? chapter.metadata.tags,
                status: request.metadata.status ?? chapter.metadata.status,
                updated_at: updatedAt,
              },
              content: request.content,
              extracted_data: request.extracted_data,
            }
          : chapter
      )));
      setDraftTitle(request.metadata.title);
      setDraftContent(request.content);
      setSaveMessage('已恢复上一版，并把恢复前版本保存为 recovery_snapshot。');
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : 'Failed to restore previous snapshot');
    } finally {
      setIsSaving(false);
    }
  }, [hasUnsavedChanges, selectedChapter, selectedChapterWorkflow?.hasPreviousSnapshot]);

  const handleChatHandoff = useCallback((action: EditorChapterAction) => {
    if (!selectedChapter) {
      return;
    }
    const handoff = buildEditorChapterChatHandoff(selectedChapter, action);
    window.localStorage.setItem('novelforge.editorHandoff', JSON.stringify(handoff));
    window.location.assign('/');
  }, [selectedChapter]);

  const handleCreateChapter = useCallback(async () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('The current chapter has unsaved changes. Create a new chapter and discard those local edits?');
      if (!confirmed) {
        return;
      }
    }

    setIsCreatingChapter(true);
    setError(null);
    setSaveMessage(null);

    try {
      let sessionId = currentSessionId;
      if (!sessionId) {
        const createdSession = await createSession('Manual Drafting');
        sessionId = createdSession.id;
      }

      const nextChapterIndex = getNextManualChapterIndex(chapters);

      const title = `第 ${nextChapterIndex} 章`;
      const request = buildContentCreateRequest({
        type: 'chapter',
        title,
        data: buildManualChapterPayload({ title, chapterIndex: nextChapterIndex }),
        content: '',
        sessionId,
        parentId: selectedNovelId || undefined,
        tags: ['editor-manual'],
      });

      const created = await contentService.create(request);
      const createdChapter = await contentService.getById(created.content_id);

      setRequestedChapterId(createdChapter.metadata.id);
      setChapters((current) => sortChaptersByDirectory([createdChapter, ...current.filter((chapter) => chapter.metadata.id !== createdChapter.metadata.id)]));
      setSelectedChapterId(createdChapter.metadata.id);
      setSaveMessage('新章节已创建，现在可以立即开始写作。');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create a new chapter');
    } finally {
      setIsCreatingChapter(false);
    }
  }, [chapters, createSession, currentSessionId, hasUnsavedChanges, selectedNovelId]);

  const handleDeleteChapter = useCallback(async () => {
    if (!selectedChapter) {
      return;
    }

    const confirmationMessage = hasUnsavedChanges
      ? '当前章节有未保存修改。删除后，本地改动和已保存的章节内容都会一起丢失。确定继续删除吗？'
      : '确定要删除当前章节吗？此操作不可撤销。';
    const confirmed = window.confirm(confirmationMessage);
    if (!confirmed) {
      return;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    const deletingId = selectedChapter.metadata.id;
    const deletingIndex = chapters.findIndex((chapter) => chapter.metadata.id === deletingId);
    const nextSelectedId = deletingIndex >= 0
      ? chapters[deletingIndex + 1]?.metadata.id || chapters[deletingIndex - 1]?.metadata.id || null
      : null;

    setIsDeletingChapter(true);
    setError(null);
    setSaveMessage(null);

    try {
      await contentService.deleteContentItem(deletingId);
      setChapters((current) => current.filter((chapter) => chapter.metadata.id !== deletingId));
      setSelectedChapterId(nextSelectedId);
      setRequestedChapterId(nextSelectedId);
      if (!nextSelectedId) {
        setDraftTitle('');
        setDraftContent('');
      }
      setSaveMessage('章节已删除。');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete chapter');
    } finally {
      setIsDeletingChapter(false);
    }
  }, [autoSaveTimerRef, chapters, hasUnsavedChanges, selectedChapter]);

  useEffect(() => {
    if (!projectPreferences.auto_save || !selectedChapter || !hasUnsavedChanges || isSaving) {
      return;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      void handleSave('auto');
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [handleSave, hasUnsavedChanges, isSaving, projectPreferences.auto_save, selectedChapter]);

  const currentWordCount = draftContent.trim().length;
  const targetWordCount = Math.max(200, projectPreferences.chapter_target_words || DEFAULT_PROJECT_PREFERENCES.chapter_target_words);
  const targetProgress = Math.min(100, Math.round((currentWordCount / targetWordCount) * 100));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6 py-10">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-amber-400" />
            <p className="text-slate-400">正在加载章节资产...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 border-b border-slate-800 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="flex items-center text-4xl font-black tracking-tight text-white">
              <BookOpen className="mr-4 h-9 w-9 text-amber-400" />
              章节编辑器
            </h1>
            <p className="mt-3 max-w-2xl text-slate-400">
              编辑器现在支持创建新章节、切换章节时保护草稿，并在不离开页面的情况下刷新当前项目内容。
            </p>
            <p className="mt-3 text-sm text-slate-500">当前项目：{currentSession?.title || '当前没有激活项目'}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                void loadChapters({ preferredChapterId: selectedChapterId, silent: true });
              }}
              disabled={isRefreshingChapters}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshingChapters ? 'animate-spin' : ''}`} />
              刷新章节
            </button>
            <button
              type="button"
              onClick={() => {
                void handleCreateChapter();
              }}
              disabled={isCreatingChapter}
              className="inline-flex items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 px-5 py-3 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FilePlus2 className="mr-2 h-4 w-4" />
              {isCreatingChapter ? '创建中...' : '新章节'}
            </button>
            <button
              type="button"
              onClick={handleDeleteChapter}
              disabled={!selectedChapter || isDeletingChapter || isSaving}
              className="inline-flex items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {isDeletingChapter ? '删除中...' : '删除章节'}
            </button>
            <button
              type="button"
              onClick={() => {
                void handleSave();
              }}
              disabled={!selectedChapter || isSaving}
              className="inline-flex items-center justify-center rounded-2xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? '保存中...' : '保存章节'}
            </button>
          </div>
        </div>

        {error ? <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-200">{error}</div> : null}
        {saveMessage ? <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-emerald-200">{saveMessage}</div> : null}

        {chapters.length === 0 ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-800 bg-slate-900/20 text-center">
            <FileText className="mb-6 h-16 w-16 text-slate-700" />
            <h2 className="mb-2 text-2xl font-bold text-slate-200">暂时还没有章节资产</h2>
            <p className="max-w-md text-slate-500">
              你可以先通过 AI 生成、导入处理管道内容，或者直接在这里创建第一章，并持续写入统一内容库。
            </p>
            <button
              type="button"
              onClick={() => {
                void handleCreateChapter();
              }}
              disabled={isCreatingChapter}
              className="mt-6 inline-flex items-center justify-center rounded-2xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FilePlus2 className="mr-2 h-4 w-4" />
              {isCreatingChapter ? '正在创建第一章...' : '创建第一章'}
            </button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">章节列表</h2>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">{filteredChapters.length}/{chapters.length}</span>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {EDITOR_CHAPTER_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setChapterFilter(filter.value)}
                    className={[
                      'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                      chapterFilter === filter.value
                        ? 'border-amber-400/50 bg-amber-400/15 text-amber-100'
                        : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-200',
                    ].join(' ')}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

                {filteredChapters.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-500">
                    当前筛选下没有章节。
                  </div>
                ) : null}
              <div className="space-y-3">
                {filteredChapters.map((chapter, index) => {
                  const chapterMeta = resolveChapterDirectoryMetadata(chapter, index + 1);
                  const workflowState = getEditorChapterWorkflowState(chapter);
                  const payload = getContentAssetPayload(chapter);
                  const preview = getContentAssetText(chapter, payload).slice(0, 90);
                  const isActive = chapter.metadata.id === selectedChapterId;

                  return (
                    <button
                      key={chapter.metadata.id}
                      type="button"
                      onClick={() => handleSelectChapter(chapter.metadata.id)}
                      className={[
                        'w-full rounded-2xl border p-4 text-left transition-all',
                        chapterMeta.isDecorative ? 'opacity-60' : '',
                        isActive
                          ? chapterMeta.isDecorative
                            ? 'border-amber-400/30 bg-slate-950/80 shadow-[0_0_20px_rgba(251,191,36,0.06)]'
                            : 'border-amber-400/40 bg-amber-400/10 shadow-[0_0_20px_rgba(251,191,36,0.08)]'
                          : chapterMeta.isDecorative
                            ? 'border-dashed border-slate-800 bg-slate-950/30 hover:border-slate-700 hover:bg-slate-900/60'
                            : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-900',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] text-slate-500">{chapterMeta.structureLabel}</p>
                          <h3 className={`truncate font-semibold ${chapterMeta.isDecorative ? 'text-slate-300' : 'text-white'}`}>
                            {chapterMeta.displayTitle}
                          </h3>
                          {chapterMeta.isSplitSegment && chapterMeta.originalTitle !== chapterMeta.displayTitle ? (
                            <p className="mt-1 truncate text-xs text-slate-600">源自：{chapterMeta.originalTitle}</p>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                            <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">{chapterMeta.sourceLabel}</span>
                            {chapterMeta.saveDestinationLabel ? (
                              <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-violet-200">
                                {chapterMeta.saveDestinationLabel}
                              </span>
                            ) : null}
                            <span className={`rounded-full border px-2 py-1 ${chapterMeta.isDecorative ? 'border-slate-700 text-slate-500' : 'border-slate-700 text-slate-300'}`}>
                              {chapterMeta.roleLabel}
                            </span>
                            <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-400">{chapterMeta.wordCount} 字</span>
                            {workflowState.isArchived ? (
                              <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300">已归档</span>
                            ) : null}
                            {workflowState.hasPreviousSnapshot ? (
                              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-cyan-200">可恢复</span>
                            ) : null}
                            {chapterMeta.qualityFlagLabels.map((flag) => (
                              <span key={flag} className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-200">
                                {flag}
                              </span>
                            ))}
                          </div>
                          <p className="mt-2 line-clamp-3 text-sm text-slate-500">{preview || '暂无正文内容。'}</p>
                        </div>
                        <Sparkles className={`mt-1 h-4 w-4 shrink-0 ${isActive ? 'text-amber-300' : 'text-slate-600'}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
              {selectedChapter ? (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-400">Chapter title</label>
                      <input
                        type="text"
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-amber-400/50"
                      />
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Draft stats</p>
                      <p className="mt-2 text-2xl font-bold text-white">{currentWordCount}</p>
                      <p className="mt-2 text-xs text-slate-500">Target {targetWordCount} · Progress {targetProgress}%</p>
                      <p className="mt-2 text-xs text-slate-500">Last updated: {selectedChapter.metadata.updated_at}</p>
                      {hasUnsavedChanges ? <p className="mt-2 text-xs font-medium text-amber-300">Unsaved local edits</p> : null}
                    </div>
                  </div>

                  {selectedChapterWorkflow ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-100">章节状态</p>
                          <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-3">
                            <span>来源：{selectedChapterWorkflow.sourceLabel}</span>
                            <span>保存目的：{selectedChapterWorkflow.saveDestinationLabel}</span>
                            <span>章节角色：{selectedChapterWorkflow.chapterRoleLabel}</span>
                            <span>字数：{selectedChapterWorkflow.wordCount}</span>
                            <span>AI 生成：{selectedChapterWorkflow.isAIGenerated ? '是' : '否'}</span>
                            <span>候选版本：{selectedChapterWorkflow.isCandidate ? '是' : '否'}</span>
                            <span>快照：{selectedChapterWorkflow.hasPreviousSnapshot ? '有 previous_snapshot' : '无'}</span>
                            <span>归档：{selectedChapterWorkflow.isArchived ? '已归档' : '未归档'}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(['continue', 'rewrite', 'polish'] as EditorChapterAction[]).map((action) => (
                            <button
                              key={action}
                              type="button"
                              onClick={() => handleChatHandoff(action)}
                              className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                            >
                              <MessageSquareText className="mr-1.5 h-3.5 w-3.5" />
                              {action === 'continue' ? '继续写这一章' : action === 'rewrite' ? '改写这一章' : '润色这一章'}
                            </button>
                          ))}
                          {selectedChapterWorkflow.hasPreviousSnapshot ? (
                            <button
                              type="button"
                              onClick={() => {
                                void handleRestorePreviousSnapshot();
                              }}
                              disabled={isSaving}
                              className="inline-flex items-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                              恢复上一版
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {selectedChapterWorkflow.previousSnapshot ? (
                        <details className="mt-4 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                          <summary className="cursor-pointer text-xs font-semibold text-cyan-100">查看 previous_snapshot</summary>
                          <div className="mt-3 space-y-2 text-xs text-slate-400">
                            <p>旧标题：{selectedChapterWorkflow.previousSnapshot.oldTitle || '未记录'}</p>
                            <p>旧更新时间：{selectedChapterWorkflow.previousSnapshot.oldUpdatedAt || '未记录'}</p>
                            <p className="line-clamp-4 whitespace-pre-wrap">
                              {selectedChapterWorkflow.previousSnapshot.oldContent || '没有旧正文摘要。'}
                            </p>
                            {selectedChapterWorkflow.previousSnapshot.oldExtractedData ? (
                              <pre className="max-h-36 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-500">
                                {JSON.stringify(selectedChapterWorkflow.previousSnapshot.oldExtractedData, null, 2).slice(0, 1200)}
                              </pre>
                            ) : null}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  ) : null}

                  {canPromoteSelectedChapter ? (
                    <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-violet-100">AI 草稿/候选版本</p>
                          <p className="mt-1 text-xs text-violet-200/70">
                            只调整章节保存位置和目录标签，不修改正文内容，AI 来源会继续保留。
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[
                            ['formal_body', '转为正式正文'],
                            ['formal_prologue', '转为正式序章'],
                            ['extra', '转为番外'],
                            ['alternate_version', '保留为候选版本'],
                          ].map(([destination, label]) => (
                            <button
                              key={destination}
                              type="button"
                              onClick={() => {
                                void handlePromoteAIChapter(destination as PromotableChapterDestination);
                              }}
                              disabled={isSaving}
                              className="rounded-xl border border-violet-400/30 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {label}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              void handleArchiveSelectedChapter();
                            }}
                            disabled={isSaving}
                            className="inline-flex items-center rounded-xl border border-slate-600 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Archive className="mr-1.5 h-3.5 w-3.5" />
                            归档候选
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-400">Body content</label>
                    <textarea
                      value={draftContent}
                      onChange={(event) => setDraftContent(event.target.value)}
                      className="min-h-[520px] w-full rounded-3xl border border-slate-700 bg-slate-950 px-5 py-4 font-mono text-sm leading-7 text-slate-100 outline-none transition focus:border-amber-400/50"
                      placeholder="Continue writing this chapter here..."
                    />
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[520px] items-center justify-center text-slate-500">Choose a chapter to start writing.</div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
