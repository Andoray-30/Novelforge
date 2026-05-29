'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  Gauge,
  GitBranch,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import { contentService, taskService } from '@/lib/api';
import { getContentAssetPayload, getContentAssetText, getContentAssetTitle } from '@/lib/content-contract';
import {
  resolveContentItemReopen,
  saveReopenedContentItem,
  type ContentItemArtifactData,
} from '@/lib/content-item-reopen';
import { ArtifactPanel } from '@/components/chat/ArtifactPanel';
import { useSessionTaskEvents } from '@/lib/hooks/use-session-task-events';
import { useSessions } from '@/lib/hooks/use-sessions';
import { useAppStore } from '@/lib/hooks/use-app-store';
import {
  bindContentItemToNovel,
  isUnassignedNovelScopedContentItem,
} from '@/lib/content-item-binding';
import { formatDate } from '@/lib/utils';
import { buildProjectQualitySummary } from '@/lib/project-quality-summary';
import type { AITask, ContentItem } from '@/types';
import type { ToolCall } from '@/lib/chat-parser';

type ArtifactData = ContentItemArtifactData & { toolCall?: ToolCall };

function countChapterCharacters(items: ContentItem[]): number {
  return items.reduce((total, item) => total + getContentAssetText(item).replace(/\s+/g, '').length, 0);
}

function countWorldElements(items: ContentItem[]): number {
  return items.reduce((total, item) => {
    const payload = getContentAssetPayload(item);
    const locations = Array.isArray(payload.locations) ? payload.locations.length : 0;
    const cultures = Array.isArray(payload.cultures) ? payload.cultures.length : 0;
    const rules = Array.isArray(payload.rules) ? payload.rules.length : 0;
    const conflicts = Array.isArray(payload.core_conflicts) ? payload.core_conflicts.length : 0;
    return total + locations + cultures + rules + conflicts;
  }, 0);
}

function sortByUpdatedAt(items: ContentItem[]): ContentItem[] {
  return [...items].sort((left, right) => right.metadata.updated_at.localeCompare(left.metadata.updated_at));
}

function readMetadataString(item: ContentItem, key: string): string {
  const metadata = item.metadata as unknown as Record<string, unknown>;
  const extracted = item.extracted_data ?? {};
  return typeof metadata[key] === 'string'
    ? metadata[key]
    : typeof extracted[key] === 'string'
      ? extracted[key]
      : '';
}

function isAIGeneratedChapter(item: ContentItem): boolean {
  const sourceType = readMetadataString(item, 'source_type');
  const saveDestination = readMetadataString(item, 'save_destination');
  const tags = item.metadata.tags ?? [];
  return (
    sourceType.includes('ai') ||
    saveDestination.includes('candidate') ||
    tags.some((tag) => ['ai_draft', 'candidate_version', 'formal_prologue'].includes(tag))
  );
}

function getChapterRoleLabel(item: ContentItem): string {
  const role = readMetadataString(item, 'chapter_role');
  const destination = readMetadataString(item, 'save_destination');
  if (role === 'prologue' || destination === 'formal_prologue') return '正式序章';
  if (destination === 'candidate') return '候选版本';
  if (destination === 'draft') return 'AI 草稿';
  if (item.metadata.status === 'archived') return '已归档';
  return '正文';
}

function statusTone(status: string): string {
  if (status === 'ready') return 'text-[var(--nf-success)]';
  if (status === 'needs_repair') return 'text-[var(--nf-warning)]';
  if (status === 'insufficient') return 'text-[var(--nf-danger)]';
  return 'text-[var(--nf-text-muted)]';
}

function qualityStatusLabel(status: string): string {
  if (status === 'ready') return '可写';
  if (status === 'needs_repair') return '需要修复';
  if (status === 'insufficient') return '资料不足';
  return '未知';
}

function qualitySemanticCopy(status: string): string {
  if (status === 'ready') {
    return '提取完成代表资产已写入内容库；当前资产质量也达到创作就绪，可以进入 AI 写作、生成候选并确认写回。';
  }
  if (status === 'needs_repair') {
    return '提取完成代表资产已写入内容库；当前可以开始写作，但建议先修复关系、角色或世界观以提升序章质量。';
  }
  if (status === 'insufficient') {
    return '提取完成不等于创作就绪；当前缺少关键资产，AI 仍可聊天，但不建议直接生成正式候选。';
  }
  return '项目还没有足够资产可判断。先导入小说或生成基础章节，再查看创作就绪状态。';
}

function formatAssetType(type: string): string {
  const labels: Record<string, string> = {
    outline: '大纲',
    chapter: '章节',
    character: '角色',
    relationship: '关系',
    world: '世界观',
    timeline: '时间线',
    novel: '小说容器',
  };
  return labels[type] ?? type;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { currentSession, currentSessionId } = useSessions();
  const selectedNovelId = useAppStore((state) => state.selectedNovelId);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [tasks, setTasks] = useState<AITask[]>([]);
  const [activeArtifacts, setActiveArtifacts] = useState<ArtifactData[]>([]);
  const [artifactPanelVisible, setArtifactPanelVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const loadDashboard = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [assetResult, activeTasks] = await Promise.all([
          contentService.searchContent({
            query: '',
            session_id: currentSessionId || undefined,
            parent_id: selectedNovelId || undefined,
            limit: 500,
          }),
          currentSessionId ? taskService.getActiveTasks(currentSessionId) : Promise.resolve([]),
        ]);
        setItems(sortByUpdatedAt(assetResult.items));
        setTasks(activeTasks);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : '加载项目状态失败');
      } finally {
        setIsLoading(false);
      }
    };

    void loadDashboard();
  }, [currentSessionId, selectedNovelId, refreshTick]);

  useSessionTaskEvents({
    sessionId: currentSessionId,
    onCompleted: () => setRefreshTick((current) => current + 1),
    onFailed: (detail) => {
      setError(`后台任务失败，项目状态可能尚未完全更新：${detail.error || detail.message || '未知错误'}`);
      setRefreshTick((current) => current + 1);
    },
    onCancelled: () => setRefreshTick((current) => current + 1),
  });

  const chapters = useMemo(() => items.filter((item) => item.metadata.type === 'chapter'), [items]);
  const characters = useMemo(() => items.filter((item) => item.metadata.type === 'character'), [items]);
  const worlds = useMemo(() => items.filter((item) => item.metadata.type === 'world'), [items]);
  const timelines = useMemo(() => items.filter((item) => item.metadata.type === 'timeline'), [items]);
  const relationships = useMemo(() => items.filter((item) => item.metadata.type === 'relationship'), [items]);
  const outlines = useMemo(() => items.filter((item) => item.metadata.type === 'outline'), [items]);

  const projectQualitySummary = useMemo(
    () => buildProjectQualitySummary({ chapters, characters, worlds, timelines, relationships, outlines }),
    [chapters, characters, outlines, relationships, timelines, worlds],
  );
  const totalWordCount = useMemo(() => countChapterCharacters(chapters), [chapters]);
  const worldElementCount = useMemo(() => countWorldElements(worlds), [worlds]);
  const activeTaskCount = useMemo(
    () => tasks.filter((task) => ['PENDING', 'RUNNING'].includes(String(task.status).toUpperCase())).length,
    [tasks],
  );
  const recentAssets = useMemo(() => items.slice(0, 8), [items]);
  const recentAIDrafts = useMemo(
    () => chapters.filter(isAIGeneratedChapter).slice(0, 5),
    [chapters],
  );

  const nextSuggestions = useMemo(() => {
    const suggestions: Array<{ title: string; detail: string; action: string; onClick: () => void }> = [];
    if (chapters.length === 0) {
      suggestions.push({
        title: '先导入或生成章节',
        detail: '章节是后续提取、续写和 editor 工作流的基础。',
        action: '去导入',
        onClick: () => router.push('/extract'),
      });
    }
    if (characters.length < 8) {
      suggestions.push({
        title: '补强角色召回',
        detail: '长篇项目角色过少时，序章会缺少人物选择和情绪张力。',
        action: '查看角色',
        onClick: () => router.push('/characters'),
      });
    }
    if (relationships.length < 8) {
      suggestions.push({
        title: '补强人物关系',
        detail: '关系不足会让 AI 更容易只写氛围，而不是写出牵动人心的选择。',
        action: '打开工作台',
        onClick: () => router.push('/'),
      });
    }
    if (worlds.length === 0) {
      suggestions.push({
        title: '补齐世界观资料',
        detail: '地点、规则和代价能帮助 AI 写出更有质感的场景。',
        action: '查看世界',
        onClick: () => router.push('/world'),
      });
    }
    if (suggestions.length === 0) {
      if (projectQualitySummary.overall_status === 'ready') {
        suggestions.push({
          title: '进入 AI 写作闭环',
          detail: '当前资产已经足够开始生成候选序章，再由用户确认写回。',
          action: '开始写作',
          onClick: () => router.push('/'),
        });
      } else {
        suggestions.push({
          title: '可以写作，建议先修复质量',
          detail: '提取完成说明资产已入库；创作就绪要求更高，薄弱关系、低信息角色和弱世界观会影响文本张力。',
          action: '查看诊断',
          onClick: () => router.push('/extract'),
        });
      }
    }
    return suggestions.slice(0, 4);
  }, [chapters.length, characters.length, projectQualitySummary.overall_status, relationships.length, router, worlds.length]);

  const openRecentAsset = (item: ContentItem) => {
    const result = resolveContentItemReopen(item, selectedNovelId);
    if (result.kind === 'error') {
      setError(result.message);
      return;
    }
    if (result.kind === 'route') {
      router.push(result.href);
      return;
    }
    setActiveArtifacts([result.artifact]);
    setArtifactPanelVisible(true);
    setSaveMessage(result.message);
  };

  const bindRecentAssetToSelectedNovel = async (item: ContentItem) => {
    if (!selectedNovelId || !isUnassignedNovelScopedContentItem(item)) {
      return;
    }

    setError(null);
    try {
      await bindContentItemToNovel(item, selectedNovelId);
      setSaveMessage(`已将「${getContentAssetTitle(item)}」绑定到当前小说。`);
      setRefreshTick((current) => current + 1);
    } catch (bindError) {
      setError(bindError instanceof Error ? bindError.message : '绑定资产失败');
    }
  };

  const handleSaveArtifact = async (artifact: ArtifactData, updatedData: Record<string, unknown>) => {
    setError(null);
    try {
      const result = await saveReopenedContentItem({
        items,
        artifact,
        updatedData,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setSaveMessage(`已保存「${result.title}」的修改。`);
      setRefreshTick((current) => current + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存资产失败');
    }
  };

  if (isLoading) {
    return (
      <div className="nf-editor-shell">
        <div className="nf-editor-loading">
          <div className="nf-editor-spinner" />
          <p>正在加载项目状态...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nf-editor-shell">
      <div className="nf-editor-page">
        <section className="nf-editor-hero">
          <div>
            <div className="nf-kicker">Project Dashboard</div>
            <h1 className="nf-editor-title">
              <Gauge size={28} />
              项目状态总览
            </h1>
            <p className="nf-editor-subline">
              这里不是数据大屏，而是内测前的项目首页：看质量、看资产、看最近候选，并决定下一步该导入、修复还是开始写作。
            </p>
            <p className="nf-editor-meta">
              当前项目：{currentSession?.title || '未选择项目，显示当前会话可读取资产'}
            </p>
          </div>
          <div className="nf-editor-actions">
            <button type="button" className="nf-button" onClick={() => router.push('/')}>
              <ArrowLeft size={16} />
              返回工作台
            </button>
            <button type="button" className="nf-button" onClick={() => setRefreshTick((current) => current + 1)}>
              <RefreshCw size={16} />
              刷新
            </button>
            <button type="button" className="nf-button nf-button-primary" onClick={() => router.push('/extract')}>
              <Wand2 size={16} />
              导入/提取
            </button>
          </div>
        </section>

        {error ? <div className="nf-editor-alert">{error}</div> : null}
        {saveMessage ? <div className="nf-editor-alert success">{saveMessage}</div> : null}

        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {[
            { label: '章节', value: chapters.length, icon: FileText },
            { label: '字数', value: totalWordCount, icon: BookOpen },
            { label: '角色', value: characters.length, icon: Users },
            { label: '关系', value: relationships.length, icon: GitBranch },
            { label: '世界观要素', value: worldElementCount, icon: CheckCircle2 },
            { label: '后台任务', value: activeTaskCount, icon: Clock3 },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="nf-stat">
                <span className="flex items-center gap-2"><Icon size={15} />{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            );
          })}
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <main className="space-y-5">
            <section className="nf-panel nf-panel-pad">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="nf-kicker">Quality</div>
                  <h2 className="text-2xl font-semibold text-[var(--nf-text)]">项目质量状态</h2>
                  <p className="mt-2 text-sm leading-7 text-[var(--nf-text-muted)]">
                    {qualitySemanticCopy(projectQualitySummary.overall_status)}
                  </p>
                </div>
                <span className={`rounded-full border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] px-3 py-1 text-xs font-semibold ${statusTone(projectQualitySummary.overall_status)}`}>
                  {qualityStatusLabel(projectQualitySummary.overall_status)}
                </span>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {[
                  { label: '章节', section: projectQualitySummary.chapter },
                  { label: '角色', section: projectQualitySummary.character },
                  { label: '关系', section: projectQualitySummary.relationship },
                  { label: '世界观', section: projectQualitySummary.world },
                  { label: '结构', section: projectQualitySummary.structure },
                  { label: '写作准备度', section: projectQualitySummary.writing_readiness },
                ].map((entry) => (
                  <div key={entry.label} className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-[var(--nf-text)]">{entry.label}</div>
                      <span className={`text-xs font-semibold ${statusTone(entry.section.status)}`}>{qualityStatusLabel(entry.section.status)}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--nf-text-muted)]">
                      {entry.section.issues[0] || '当前分项没有明显阻塞问题。'}
                    </p>
                    {entry.section.actions.length > 0 ? (
                      <p className="mt-2 text-xs leading-5 text-[var(--nf-text-subtle)]">
                        建议：{entry.section.actions[0]}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="nf-panel nf-panel-pad">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="nf-panel-title">最近 AI 草稿 / 候选</div>
                  <p className="nf-panel-subtitle">优先处理最新生成内容，避免候选版本堆积污染项目。</p>
                </div>
                <button type="button" className="nf-button" onClick={() => router.push('/editor')}>
                  打开 editor
                </button>
              </div>
              {recentAIDrafts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--nf-border)] bg-[var(--nf-panel-soft)] px-4 py-6 text-sm text-[var(--nf-text-muted)]">
                  暂无 AI 草稿或候选章节。可以回到主工作台生成序章候选。
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {recentAIDrafts.map((item) => {
                    const title = getContentAssetTitle(item);
                    const text = getContentAssetText(item);
                    return (
                      <article key={item.metadata.id} className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="nf-kicker">{getChapterRoleLabel(item)}</div>
                            <h3 className="mt-1 font-semibold text-[var(--nf-text)]">{title}</h3>
                          </div>
                          <button type="button" className="nf-chip" onClick={() => router.push(`/editor?chapterId=${item.metadata.id}`)}>
                            打开
                          </button>
                        </div>
                        <p className="mt-3 line-clamp-4 text-sm leading-6 text-[var(--nf-text-muted)]">{text || '暂无正文预览。'}</p>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="nf-panel nf-panel-pad">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="nf-panel-title">最近更新资产</div>
                  <p className="nf-panel-subtitle">从内容库快速回到刚变化的角色、章节、关系或世界观。</p>
                </div>
              </div>
              {recentAssets.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--nf-border)] bg-[var(--nf-panel-soft)] px-4 py-6 text-sm text-[var(--nf-text-muted)]">
                  当前项目还没有可展示资产。
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {recentAssets.map((item) => {
                    const canBindToCurrentNovel = Boolean(selectedNovelId && isUnassignedNovelScopedContentItem(item));
                    return (
                      <article key={item.metadata.id} className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] p-4">
                        <button type="button" className="w-full text-left" onClick={() => openRecentAsset(item)}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="nf-kicker">{formatAssetType(item.metadata.type)}</div>
                              <h3 className="mt-1 font-semibold text-[var(--nf-text)]">{getContentAssetTitle(item)}</h3>
                              <p className="mt-1 text-xs text-[var(--nf-text-subtle)]">{formatDate(item.metadata.updated_at)}</p>
                            </div>
                            <span className="nf-chip">查看</span>
                          </div>
                        </button>
                        {canBindToCurrentNovel ? (
                          <button
                            type="button"
                            onClick={() => void bindRecentAssetToSelectedNovel(item)}
                            className="nf-button mt-3"
                          >
                            绑定到当前小说
                          </button>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </main>

          <aside className="space-y-4">
            <div className="nf-panel nf-panel-pad">
              <div className="nf-panel-title">
                <Sparkles size={16} />
                下一步建议
              </div>
              <div className="mt-3 grid gap-3">
                {nextSuggestions.map((suggestion) => (
                  <div key={suggestion.title} className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] p-4">
                    <div className="font-semibold text-[var(--nf-text)]">{suggestion.title}</div>
                    <p className="mt-2 text-sm leading-6 text-[var(--nf-text-muted)]">{suggestion.detail}</p>
                    <button type="button" className="nf-button mt-3" onClick={suggestion.onClick}>
                      {suggestion.action}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="nf-panel nf-panel-pad">
              <div className="nf-panel-title">
                <MessageSquareText size={16} />
                快捷入口
              </div>
              <div className="mt-3 grid gap-2">
                <button type="button" className="nf-button" onClick={() => router.push('/extract')}>
                  导入小说
                </button>
                <button type="button" className="nf-button" onClick={() => router.push('/editor')}>
                  打开 editor
                </button>
                <button type="button" className="nf-button" onClick={() => router.push('/')}>
                  AI 写作聊天
                </button>
                <button type="button" className="nf-button" onClick={() => router.push('/characters')}>
                  角色档案馆
                </button>
              </div>
            </div>

            <details className="nf-panel nf-panel-pad">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--nf-text)]">
                后台任务
              </summary>
              <div className="mt-3 space-y-2">
                {tasks.length === 0 ? (
                  <p className="text-sm text-[var(--nf-text-muted)]">当前没有活跃后台任务。</p>
                ) : (
                  tasks.map((task) => (
                    <div key={task.id} className="rounded-xl border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] px-3 py-2 text-sm">
                      <div className="font-semibold text-[var(--nf-text)]">{task.type}</div>
                      <div className="mt-1 text-xs text-[var(--nf-text-subtle)]">{task.message || '任务执行中'} · {task.status}</div>
                    </div>
                  ))
                )}
              </div>
            </details>
          </aside>
        </div>

        <ArtifactPanel
          visible={artifactPanelVisible}
          onClose={() => setArtifactPanelVisible(false)}
          artifacts={activeArtifacts}
          onSaveToProject={(artifact, updatedData) => {
            void handleSaveArtifact(artifact, updatedData);
          }}
          onSaveAll={async (payload) => {
            for (const item of payload) {
              await handleSaveArtifact(item.artifact, item.data);
            }
          }}
        />
      </div>
    </div>
  );
}
