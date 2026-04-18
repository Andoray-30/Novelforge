'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { contentService } from '@/lib/api';
import { buildContentCreateRequest, getContentAssetPayload, getContentAssetText, getContentAssetTitle } from '@/lib/content-contract';
import { useSessionTaskEvents } from '@/lib/hooks/use-session-task-events';
import {
  DEFAULT_PROJECT_PREFERENCES,
  loadProjectPreferences,
  PROJECT_PREFERENCES_CHANGED_EVENT,
  type ProjectPreferences,
} from '@/lib/project-preferences';
import { useSessions } from '@/lib/hooks/use-sessions';
import { BookOpen, FilePlus2, FileText, RefreshCw, Save, Sparkles, Trash2 } from 'lucide-react';
import type { ContentItem } from '@/types';

function sortByUpdatedAt(items: ContentItem[]): ContentItem[] {
  return [...items].sort((left, right) => right.metadata.updated_at.localeCompare(left.metadata.updated_at));
}

function getChapterIndex(item: ContentItem, fallbackIndex: number): number {
  const payload = getContentAssetPayload(item);
  const rawIndex = payload.chapter_index;
  return typeof rawIndex === 'number' && Number.isFinite(rawIndex) ? rawIndex : fallbackIndex;
}

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

function buildEmptyChapterPayload(title: string, chapterIndex: number) {
  return {
    title,
    chapter_title: title,
    content: '',
    chapter_index: chapterIndex,
    source: 'editor_manual',
  };
}

type LoadChaptersOptions = {
  preferredChapterId?: string | null;
  preferLatest?: boolean;
  silent?: boolean;
};

export default function NovelEditorPage() {
  const { currentSession, currentSessionId, createSession } = useSessions();

  const [chapters, setChapters] = useState<ContentItem[]>([]);
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
        limit: 200,
      });

      const items = sortByUpdatedAt(result.items);
      setChapters(items);

      setSelectedChapterId((currentSelected) => {
        const preferredChapterId = options?.preferredChapterId;
        const currentCandidate =
          preferredChapterId && items.some((item) => item.metadata.id === preferredChapterId)
            ? preferredChapterId
            : options?.preferLatest && items[0]
              ? items[0].metadata.id
              : currentSelected && items.some((item) => item.metadata.id === currentSelected)
                ? currentSelected
                : requestedChapterId && items.some((item) => item.metadata.id === requestedChapterId)
                  ? requestedChapterId
                  : items[0]?.metadata.id || null;

        return currentCandidate;
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
  }, [currentSessionId, requestedChapterId]);

  useEffect(() => {
    void loadChapters();
  }, [loadChapters]);

  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.metadata.id === selectedChapterId) || null,
    [chapters, selectedChapterId]
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
    setDraftTitle(getContentAssetTitle(selectedChapter, payload));
    setDraftContent(getContentAssetText(selectedChapter, payload));
    setSaveMessage(null);
  }, [selectedChapter]);

  const hasUnsavedChanges = useMemo(() => {
    if (!selectedChapter) {
      return false;
    }

    const payload = getContentAssetPayload(selectedChapter);
    return draftTitle !== getContentAssetTitle(selectedChapter, payload) || draftContent !== getContentAssetText(selectedChapter, payload);
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
      const result = detail.result as Record<string, unknown> | undefined;
      const chaptersCount = typeof result?.chapters_count === 'number' ? result.chapters_count : null;
      const warning = typeof result?.analysis_warning === 'string' ? result.analysis_warning : '';
      const baseMessage = detail.taskType === 'novel_import'
        ? `导入后的章节已经出现在编辑器列表中${chaptersCount !== null ? `（共 ${chaptersCount} 章）` : ''}。`
        : '新生成的章节已经出现在列表中。';
      setSaveMessage(warning ? `${baseMessage} ${warning}` : baseMessage);
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
      const payload = getContentAssetPayload(selectedChapter);
      const updatedPayload = {
        ...payload,
        title: nextTitle,
        chapter_title: nextTitle,
        content: draftContent,
      };

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

      const nextChapterIndex = chapters.reduce((maxIndex, chapter, index) => {
        return Math.max(maxIndex, getChapterIndex(chapter, index + 1));
      }, 0) + 1;

      const title = `第 ${nextChapterIndex} 章`;
      const request = buildContentCreateRequest({
        type: 'chapter',
        title,
        data: buildEmptyChapterPayload(title, nextChapterIndex),
        content: '',
        sessionId,
        tags: ['editor-manual'],
      });

      const created = await contentService.create(request);
      const createdChapter = await contentService.getById(created.content_id);

      setRequestedChapterId(createdChapter.metadata.id);
      setChapters((current) => sortByUpdatedAt([createdChapter, ...current.filter((chapter) => chapter.metadata.id !== createdChapter.metadata.id)]));
      setSelectedChapterId(createdChapter.metadata.id);
      setSaveMessage('新章节已创建，现在可以立即开始写作。');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create a new chapter');
    } finally {
      setIsCreatingChapter(false);
    }
  }, [chapters, createSession, currentSessionId, hasUnsavedChanges]);

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
                <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">{chapters.length} 章</span>
              </div>

              <div className="space-y-3">
                {chapters.map((chapter, index) => {
                  const payload = getContentAssetPayload(chapter);
                  const title = getContentAssetTitle(chapter, payload);
                  const preview = getContentAssetText(chapter, payload).slice(0, 90);
                  const isActive = chapter.metadata.id === selectedChapterId;
                  const chapterIndex = getChapterIndex(chapter, index + 1);

                  return (
                    <button
                      key={chapter.metadata.id}
                      type="button"
                      onClick={() => handleSelectChapter(chapter.metadata.id)}
                      className={[
                        'w-full rounded-2xl border p-4 text-left transition-all',
                        isActive
                          ? 'border-amber-400/40 bg-amber-400/10 shadow-[0_0_20px_rgba(251,191,36,0.08)]'
                          : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-900',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Chapter {chapterIndex}</p>
                          <h3 className="truncate font-semibold text-white">{title}</h3>
                          <p className="mt-2 line-clamp-3 text-sm text-slate-500">{preview || 'No body content yet.'}</p>
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
