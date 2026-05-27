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
import { Archive, BookOpen, ChevronDown, FilePlus2, FileText, MessageSquareText, RefreshCw, RotateCcw, Save, Sparkles, Trash2 } from 'lucide-react';
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
  const [requestedChapterId, setRequestedChapterId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('chapterId');
  });
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingChapter, setIsCreatingChapter] = useState(false);
  const [isDeletingChapter, setIsDeletingChapter] = useState(false);
  const [isRefreshingChapters, setIsRefreshingChapters] = useState(false);
  const [isDirectoryOpen, setIsDirectoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [projectPreferences, setProjectPreferences] = useState<ProjectPreferences>(() => loadProjectPreferences(currentSessionId));
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        return resolveEditorChapterSelection({
          items,
          preferredChapterId: options?.preferredChapterId,
          preferLatestItem: options?.preferLatest ? latestItem : null,
          currentSelectedId: currentSelected,
          requestedChapterId,
        });
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载章节资产失败');
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
    setIsDirectoryOpen(false);
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
      setSaveMessage(mode === 'auto' ? '章节已自动保存。' : '章节已保存到内容库。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存章节失败');
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
      setError(promoteError instanceof Error ? promoteError.message : '更新章节状态失败');
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
      setError(archiveError instanceof Error ? archiveError.message : '归档章节失败');
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
      setError(restoreError instanceof Error ? restoreError.message : '恢复上一版失败');
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
      const confirmed = window.confirm('当前章节还有未保存修改。确定创建新章节并丢弃这些本地编辑吗？');
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
        const createdSession = await createSession('手写章节');
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
      setError(createError instanceof Error ? createError.message : '创建新章节失败');
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
      setError(deleteError instanceof Error ? deleteError.message : '删除章节失败');
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
  const selectedChapterMeta = selectedChapter ? resolveChapterDirectoryMetadata(selectedChapter) : null;
  const selectedStatusLine = selectedChapterWorkflow
    ? `${selectedChapterWorkflow.sourceLabel} · ${selectedChapterWorkflow.saveDestinationLabel} · ${selectedChapterWorkflow.wordCount} 字`
    : '请选择章节';

  if (isLoading) {
    return (
      <div className="nf-editor-shell">
        <div className="nf-editor-page nf-editor-loading">
          <div>
            <div className="nf-editor-spinner" />
            <p className="nf-muted">正在加载章节资产...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="nf-editor-shell">
      <div className="nf-editor-page">
        <header className="nf-editor-hero">
          <div className="min-w-0">
            <h1 className="nf-editor-title">
              <BookOpen className="h-8 w-8" />
              章节编辑器
            </h1>
            <p className="nf-editor-subline">写作、整理和确认 AI 候选章节。</p>
            <p className="nf-editor-meta">当前项目：{currentSession?.title || '当前没有激活项目'}</p>
          </div>

          <div className="nf-editor-actions">
            <button
              type="button"
              onClick={() => {
                void loadChapters({ preferredChapterId: selectedChapterId, silent: true });
              }}
              disabled={isRefreshingChapters}
              className="nf-button"
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
              className="nf-button"
            >
              <FilePlus2 className="mr-2 h-4 w-4" />
              {isCreatingChapter ? '创建中...' : '新章节'}
            </button>
            <button
              type="button"
              onClick={handleDeleteChapter}
              disabled={!selectedChapter || isDeletingChapter || isSaving}
              className="nf-button nf-button-danger"
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
              className="nf-button nf-button-primary"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? '保存中...' : '保存章节'}
            </button>
          </div>
        </header>

        {selectedChapter ? (
          <div className="nf-editor-mobile-current">
            <strong>{selectedChapterMeta?.displayTitle || selectedChapter.metadata.title}</strong>
            <span>{selectedStatusLine}</span>
          </div>
        ) : null}

        {error ? <div className="nf-editor-alert">{error}</div> : null}
        {saveMessage ? <div className="nf-editor-alert success">{saveMessage}</div> : null}

        {chapters.length === 0 ? (
          <div className="nf-panel nf-panel-pad nf-editor-empty">
            <div>
              <FileText className="mx-auto mb-5 h-14 w-14 nf-muted" />
              <h2 className="nf-panel-title">暂时还没有章节资产</h2>
              <p className="nf-panel-subtitle">可以先创建第一章，或回到导入页写入原文资产。</p>
            <button
              type="button"
              onClick={() => {
                void handleCreateChapter();
              }}
              disabled={isCreatingChapter}
                className="nf-button nf-button-primary mt-6"
            >
              <FilePlus2 className="mr-2 h-4 w-4" />
              {isCreatingChapter ? '正在创建第一章...' : '创建第一章'}
            </button>
            </div>
          </div>
        ) : (
          <div className="nf-editor-layout">
            <aside className={`nf-panel nf-editor-directory ${isDirectoryOpen ? 'is-open' : ''}`}>
              <div className="nf-editor-panel-header">
                <div className="min-w-0">
                  <h2 className="nf-panel-title">章节目录</h2>
                  <p className="nf-panel-subtitle">{filteredChapters.length}/{chapters.length} 个资产</p>
                </div>
                <button
                  type="button"
                  className="nf-icon-button nf-editor-mobile-toggle"
                  onClick={() => setIsDirectoryOpen((current) => !current)}
                  aria-label="展开或收起章节目录"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              <div className="nf-editor-directory-body">
                <div className="nf-editor-filter-row">
                {EDITOR_CHAPTER_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setChapterFilter(filter.value)}
                      className={`nf-editor-filter ${chapterFilter === filter.value ? 'is-active' : ''}`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

                {filteredChapters.length === 0 ? (
                  <div className="nf-panel nf-panel-pad nf-muted nf-small">
                    当前筛选下没有章节。
                  </div>
                ) : null}

                <div className="nf-editor-chapter-list">
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
                        'nf-editor-chapter-card',
                        isActive ? 'is-active' : '',
                        chapterMeta.isDecorative ? 'is-decorative' : '',
                        workflowState.isArchived ? 'is-archived' : '',
                      ].join(' ')}
                        title={chapterMeta.displayTitle}
                    >
                        <div className="nf-editor-chapter-topline">
                          <div className="min-w-0">
                            <p className="nf-editor-chapter-structure">{chapterMeta.structureLabel}</p>
                            <h3 className="nf-editor-chapter-title">
                            {chapterMeta.displayTitle}
                          </h3>
                          {chapterMeta.isSplitSegment && chapterMeta.originalTitle !== chapterMeta.displayTitle ? (
                              <p className="nf-editor-chapter-source">源自：{chapterMeta.originalTitle}</p>
                          ) : null}
                            <div className="nf-editor-tag-row">
                              <span className="nf-editor-tag">{chapterMeta.sourceLabel}</span>
                            {chapterMeta.saveDestinationLabel ? (
                                <span className="nf-editor-tag primary">
                                {chapterMeta.saveDestinationLabel}
                              </span>
                            ) : null}
                              <span className="nf-editor-tag">
                              {chapterMeta.roleLabel}
                            </span>
                              <span className="nf-editor-tag">{chapterMeta.wordCount} 字</span>
                            {workflowState.isArchived ? (
                                <span className="nf-editor-tag">已归档</span>
                            ) : null}
                            {workflowState.hasPreviousSnapshot ? (
                                <span className="nf-editor-tag warning">可恢复</span>
                            ) : null}
                            {chapterMeta.qualityFlagLabels.map((flag) => (
                                <span key={flag} className="nf-editor-tag warning">
                                {flag}
                              </span>
                            ))}
                          </div>
                            <p className="nf-editor-chapter-preview">{preview || '暂无正文内容。'}</p>
                        </div>
                          <Sparkles className="mt-1 h-4 w-4 shrink-0" />
                      </div>
                    </button>
                  );
                })}
              </div>
              </div>
            </aside>

            <section className="nf-editor-reader">
              {selectedChapter ? (
                <div>
                  <div className="nf-editor-title-row">
                    <div className="min-w-0">
                      <label className="nf-editor-label">章节标题</label>
                      <input
                        type="text"
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        className="nf-editor-title-input"
                      />
                    </div>

                    <div className="nf-editor-stats-card">
                      <p className="nf-small nf-muted">正文统计</p>
                      <strong>{currentWordCount}</strong>
                      <p className="nf-small nf-muted">目标 {targetWordCount} · {targetProgress}%</p>
                      <div className="nf-editor-progress" aria-label={`目标进度 ${targetProgress}%`}>
                        <span style={{ width: `${targetProgress}%` }} />
                      </div>
                      {hasUnsavedChanges ? <p className="nf-small" style={{ color: 'var(--nf-warning)', marginTop: 8 }}>有未保存修改</p> : null}
                    </div>
                  </div>

                  <div className="nf-editor-inline-status">
                    <span>最后更新：{selectedChapter.metadata.updated_at}</span>
                    {selectedChapterMeta?.saveDestinationLabel ? <span>{selectedChapterMeta.saveDestinationLabel}</span> : null}
                    {selectedChapterMeta?.roleLabel ? <span>{selectedChapterMeta.roleLabel}</span> : null}
                  </div>

                  <div className="nf-editor-body-area">
                    <label className="nf-editor-label">正文</label>
                    <textarea
                      value={draftContent}
                      onChange={(event) => setDraftContent(event.target.value)}
                      className="nf-editor-textarea"
                      placeholder="在这里继续写这一章..."
                    />
                  </div>
                </div>
              ) : (
                <div className="nf-editor-empty-selection">选择一个章节开始写作。</div>
              )}
            </section>

            <aside className="nf-panel nf-editor-inspector">
              <div className="nf-editor-panel-header">
                <div>
                  <h2 className="nf-panel-title">章节状态</h2>
                  <p className="nf-panel-subtitle">{selectedChapterWorkflow ? selectedStatusLine : '暂无选中章节'}</p>
                </div>
              </div>

              <div className="nf-editor-inspector-body">
                {selectedChapterWorkflow ? (
                  <>
                    <details className="nf-editor-action-card" open>
                      <summary>
                        <span>资产信息</span>
                        <ChevronDown className="h-4 w-4" />
                      </summary>
                      <div className="nf-editor-action-body">
                        <div className="nf-editor-info-grid">
                          <div className="nf-editor-info-row"><span>来源</span><strong>{selectedChapterWorkflow.sourceLabel}</strong></div>
                          <div className="nf-editor-info-row"><span>保存目的</span><strong>{selectedChapterWorkflow.saveDestinationLabel}</strong></div>
                          <div className="nf-editor-info-row"><span>章节角色</span><strong>{selectedChapterWorkflow.chapterRoleLabel}</strong></div>
                          <div className="nf-editor-info-row"><span>字数</span><strong>{selectedChapterWorkflow.wordCount}</strong></div>
                          <div className="nf-editor-info-row"><span>AI 生成</span><strong>{selectedChapterWorkflow.isAIGenerated ? '是' : '否'}</strong></div>
                          <div className="nf-editor-info-row"><span>候选版本</span><strong>{selectedChapterWorkflow.isCandidate ? '是' : '否'}</strong></div>
                          <div className="nf-editor-info-row"><span>快照</span><strong>{selectedChapterWorkflow.hasPreviousSnapshot ? '可恢复' : '无'}</strong></div>
                          <div className="nf-editor-info-row"><span>归档</span><strong>{selectedChapterWorkflow.isArchived ? '已归档' : '未归档'}</strong></div>
                        </div>
                      </div>
                    </details>

                    <details className="nf-editor-action-card" open>
                      <summary>
                        <span>继续创作</span>
                        <ChevronDown className="h-4 w-4" />
                      </summary>
                      <div className="nf-editor-action-body">
                        <div className="nf-editor-action-buttons">
                          {(['continue', 'rewrite', 'polish'] as EditorChapterAction[]).map((action) => (
                            <button
                              key={action}
                              type="button"
                              onClick={() => handleChatHandoff(action)}
                              className="nf-button"
                            >
                              <MessageSquareText className="h-4 w-4" />
                              {action === 'continue' ? '继续写' : action === 'rewrite' ? '改写' : '润色'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </details>

                    {canPromoteSelectedChapter ? (
                      <details className="nf-editor-action-card" open>
                        <summary>
                          <span>AI 候选管理</span>
                          <ChevronDown className="h-4 w-4" />
                        </summary>
                        <div className="nf-editor-action-body">
                          <p className="nf-small nf-muted">只调整目录标签和保存目的，不修改正文。</p>
                          <div className="nf-editor-action-buttons">
                            {[
                              ['formal_body', '转为正式正文'],
                              ['formal_prologue', '转为正式序章'],
                              ['extra', '转为番外'],
                              ['alternate_version', '保留候选'],
                            ].map(([destination, label]) => (
                              <button
                                key={destination}
                                type="button"
                                onClick={() => {
                                  void handlePromoteAIChapter(destination as PromotableChapterDestination);
                                }}
                                disabled={isSaving}
                                className="nf-button nf-button-primary"
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
                              className="nf-button"
                            >
                              <Archive className="h-4 w-4" />
                              归档候选
                            </button>
                          </div>
                        </div>
                      </details>
                    ) : null}

                    {selectedChapterWorkflow.previousSnapshot ? (
                      <details className="nf-editor-action-card warning" open>
                        <summary>
                          <span>previous_snapshot</span>
                          <ChevronDown className="h-4 w-4" />
                        </summary>
                        <div className="nf-editor-action-body">
                          <div className="nf-editor-info-grid">
                            <div className="nf-editor-info-row"><span>旧标题</span><strong>{selectedChapterWorkflow.previousSnapshot.oldTitle || '未记录'}</strong></div>
                            <div className="nf-editor-info-row"><span>旧更新时间</span><strong>{selectedChapterWorkflow.previousSnapshot.oldUpdatedAt || '未记录'}</strong></div>
                          </div>
                          <div className="nf-editor-snapshot-preview">
                            {selectedChapterWorkflow.previousSnapshot.oldContent || '没有旧正文摘要。'}
                          </div>
                          {selectedChapterWorkflow.previousSnapshot.oldExtractedData ? (
                            <pre className="nf-editor-json-preview">
                              {JSON.stringify(selectedChapterWorkflow.previousSnapshot.oldExtractedData, null, 2).slice(0, 1200)}
                            </pre>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              void handleRestorePreviousSnapshot();
                            }}
                            disabled={isSaving}
                            className="nf-button nf-button-danger"
                          >
                            <RotateCcw className="h-4 w-4" />
                            恢复上一版
                          </button>
                        </div>
                      </details>
                    ) : null}
                  </>
                ) : (
                  <div className="nf-panel nf-panel-pad nf-muted nf-small">选择章节后显示状态和版本操作。</div>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
