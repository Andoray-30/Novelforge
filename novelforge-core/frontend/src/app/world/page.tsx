'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  Compass,
  Database,
  Flag,
  Globe2,
  Landmark,
  Map,
  RefreshCw,
  Route,
  Scale,
  Sparkles,
} from 'lucide-react';
import { contentService } from '@/lib/api';
import { ArtifactPanel } from '@/components/chat/ArtifactPanel';
import {
  resolveContentItemReopen,
  saveReopenedContentItem,
  type ContentItemArtifactData,
} from '@/lib/content-item-reopen';
import { useAppStore } from '@/lib/hooks/use-app-store';
import { getContentAssetPayload, getContentAssetTitle } from '@/lib/content-contract';
import {
  bindContentItemToNovel,
  isUnassignedNovelScopedContentItem,
} from '@/lib/content-item-binding';
import { useSessionTaskEvents } from '@/lib/hooks/use-session-task-events';
import { useSessions } from '@/lib/hooks/use-sessions';
import { shouldRefreshWorldLibrary } from '@/lib/task-refresh-scope';
import type { ContentItem, Culture, Location, TimelineEvent, WorldRule, WorldSetting } from '@/types';
import type { ToolCall } from '@/lib/chat-parser';

type ArtifactData = ContentItemArtifactData & { toolCall?: ToolCall };

type WorldFactGroup = {
  key: string;
  title: string;
  icon: typeof Globe2;
  description: string;
  facts: Array<{
    id: string;
    title: string;
    category: string;
    summary: string;
    detail?: string;
    usage?: string;
    source?: ContentItem | null;
  }>;
};

function sortByUpdatedAt(items: ContentItem[]): ContentItem[] {
  return [...items].sort((left, right) => right.metadata.updated_at.localeCompare(left.metadata.updated_at));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function parseLocation(value: unknown): Location | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    name: asString(record.name),
    type: asString(record.type),
    description: asString(record.description),
    geography: asString(record.geography) || undefined,
    culture: asString(record.culture) || undefined,
    history: asString(record.history) || undefined,
    notable_features: asStringArray(record.notable_features),
  };
}

function parseCulture(value: unknown): Culture | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    name: asString(record.name),
    description: asString(record.description),
    beliefs: asStringArray(record.beliefs),
    values: asStringArray(record.values),
    customs: asStringArray(record.customs),
  };
}

function parseRule(value: unknown): WorldRule | null {
  const record = asRecord(value);
  if (!record) return null;
  const importance = record.importance;
  return {
    name: asString(record.name),
    description: asString(record.description),
    category: asString(record.category),
    importance:
      importance === 'critical' || importance === 'high' || importance === 'medium' || importance === 'low'
        ? importance
        : 'medium',
  };
}

function parseWorldSetting(item: ContentItem): WorldSetting | null {
  const payload = getContentAssetPayload(item);
  if (Object.keys(payload).length === 0 && !item.content) {
    return null;
  }

  const locations = Array.isArray(payload.locations)
    ? payload.locations.map(parseLocation).filter((location): location is Location => location !== null)
    : [];
  const cultures = Array.isArray(payload.cultures)
    ? payload.cultures.map(parseCulture).filter((culture): culture is Culture => culture !== null)
    : [];
  const rules = Array.isArray(payload.rules)
    ? payload.rules.map(parseRule).filter((rule): rule is WorldRule => rule !== null)
    : [];

  return {
    name: asString(payload.name) || item.metadata.title,
    description: asString(payload.description) || item.content,
    geography: asString(payload.geography),
    social_structure: asString(payload.social_structure),
    culture: asString(payload.culture),
    technology_magic: asString(payload.technology_magic),
    history: asString(payload.history),
    core_conflicts: asStringArray(payload.core_conflicts),
    locations,
    cultures,
    rules,
  };
}

function parseTimelineEvent(value: unknown, fallbackId: string): TimelineEvent | null {
  const record = asRecord(value);
  if (!record) return null;

  const importance = record.importance;
  const eventType = record.event_type;
  const date = asString(record.date) || asString(record.absolute_time) || asString(record.relative_time);

  return {
    id: asString(record.id) || fallbackId,
    title: asString(record.title),
    description: asString(record.description),
    event_type:
      eventType === 'historical' ||
      eventType === 'political' ||
      eventType === 'cultural' ||
      eventType === 'technological' ||
      eventType === 'natural' ||
      eventType === 'social'
        ? eventType
        : 'historical',
    characters: asStringArray(record.characters),
    locations: asStringArray(record.locations),
    importance:
      importance === 'critical' || importance === 'high' || importance === 'medium' || importance === 'low'
        ? importance
        : 'medium',
    date: date || undefined,
  };
}

function parseTimelineItem(item: ContentItem): TimelineEvent[] {
  const payload = getContentAssetPayload(item);
  if (Array.isArray(payload.events)) {
    return payload.events
      .map((event, index) => parseTimelineEvent(event, `${item.metadata.id}-${index}`))
      .filter((event): event is TimelineEvent => event !== null);
  }

  const event = parseTimelineEvent(
    {
      ...payload,
      id: payload.id ?? item.metadata.id,
      title: payload.title ?? item.metadata.title,
      description: payload.description ?? item.content,
    },
    item.metadata.id,
  );
  return event ? [event] : [];
}

function compactText(...values: Array<string | undefined>): string {
  return values.find((value) => value && value.trim().length > 0)?.trim() || '';
}

function buildWorldFactGroups(worldSettings: WorldSetting[], worldItems: ContentItem[], timeline: TimelineEvent[], timelineItem: ContentItem | null): WorldFactGroup[] {
  const latestWorldItem = worldItems[0] ?? null;
  const locations = worldSettings.flatMap((setting, settingIndex) =>
    setting.locations.map((location, index) => ({
      id: `location-${settingIndex}-${index}-${location.name}`,
      title: location.name || '未命名地点',
      category: location.type || '地点',
      summary: compactText(location.description, location.geography, location.history, '这个地点还缺少可写摘要。'),
      detail: compactText(location.geography, location.culture, location.history),
      usage: location.notable_features[0] ? `可写场景：${location.notable_features[0]}` : '可作为人物行动、秘密交换或冲突发生的场所。',
      source: latestWorldItem,
    })),
  );

  const rules = worldSettings.flatMap((setting, settingIndex) =>
    setting.rules.map((rule, index) => ({
      id: `rule-${settingIndex}-${index}-${rule.name}`,
      title: rule.name || '未命名规则',
      category: rule.category || '规则',
      summary: rule.description || '这个规则还缺少代价、禁忌或例外说明。',
      detail: `重要性：${rule.importance}`,
      usage: '可用于制造限制、误解、选择代价或危机反转。',
      source: latestWorldItem,
    })),
  );

  const cultures = worldSettings.flatMap((setting, settingIndex) =>
    setting.cultures.map((culture, index) => ({
      id: `culture-${settingIndex}-${index}-${culture.name}`,
      title: culture.name || '未命名组织/文化',
      category: '组织 / 文化',
      summary: culture.description || culture.beliefs[0] || culture.values[0] || '这个文化条目还缺少价值观和行为方式。',
      detail: [...culture.beliefs, ...culture.values, ...culture.customs].slice(0, 3).join(' / '),
      usage: '可用于塑造人物选择、阵营冲突和社会压力。',
      source: latestWorldItem,
    })),
  );

  const history = [
    ...worldSettings
      .map((setting, index) => ({
        id: `history-${index}-${setting.name}`,
        title: setting.name || '世界历史',
        category: '历史',
        summary: compactText(setting.history, setting.description, '这个世界还缺少历史背景。'),
        detail: setting.core_conflicts.join(' / '),
        usage: '可作为序章悬念、遗留债务或人物命运压力。',
        source: worldItems[index] ?? latestWorldItem,
      }))
      .filter((item) => item.summary),
    ...timeline.slice(0, 6).map((event) => ({
      id: `timeline-${event.id}`,
      title: event.title || '未命名事件',
      category: event.date || '时间线',
      summary: event.description || '这个事件还缺少行动描述。',
      detail: [...event.characters, ...event.locations].slice(0, 4).join(' / '),
      usage: '可用于保持剧情顺序，并为下一章提供因果线。',
      source: timelineItem,
    })),
  ];

  const motifs = worldSettings.flatMap((setting, index) => [
    setting.technology_magic
      ? {
          id: `motif-tech-${index}`,
          title: '技术 / 魔法机制',
          category: '特殊概念',
          summary: setting.technology_magic,
          detail: setting.core_conflicts.join(' / '),
          usage: '适合转化为规则、代价、禁忌或视觉意象。',
          source: worldItems[index] ?? latestWorldItem,
        }
      : null,
    setting.social_structure
      ? {
          id: `motif-social-${index}`,
          title: '社会结构',
          category: '秩序',
          summary: setting.social_structure,
          detail: setting.culture,
          usage: '适合制造身份压力、阶层冲突和选择困境。',
          source: worldItems[index] ?? latestWorldItem,
        }
      : null,
  ]).filter((item): item is NonNullable<typeof item> => item !== null);

  return [
    { key: 'locations', title: '地点', icon: Map, description: '角色移动、秘密交换和冲突发生的具体空间。', facts: locations },
    { key: 'rules', title: '规则', icon: Scale, description: '限制、代价、禁忌和例外，决定剧情能否成立。', facts: rules },
    { key: 'cultures', title: '组织与文化', icon: Landmark, description: '阵营、价值观、风俗和社会压力。', facts: cultures },
    { key: 'history', title: '历史与时间线', icon: Route, description: '过去发生了什么，以及它如何压到现在。', facts: history },
    { key: 'motifs', title: '意象与特殊概念', icon: Sparkles, description: '能让小说变得独特的视觉、机制和象征。', facts: motifs },
  ];
}

export default function WorldSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const directAssetId = searchParams.get('assetId');
  const { currentSession, currentSessionId } = useSessions();
  const selectedNovelId = useAppStore((state) => state.selectedNovelId);
  const [worldItems, setWorldItems] = useState<ContentItem[]>([]);
  const [timelineItems, setTimelineItems] = useState<ContentItem[]>([]);
  const [worldSettings, setWorldSettings] = useState<WorldSetting[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [activeArtifacts, setActiveArtifacts] = useState<ArtifactData[]>([]);
  const [artifactPanelVisible, setArtifactPanelVisible] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const loadWorldAssets = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [worldResult, timelineResult] = await Promise.all([
          contentService.searchContent({
            query: '',
            content_type: 'world',
            session_id: currentSessionId || undefined,
            parent_id: selectedNovelId || undefined,
            limit: 100,
            include_content: false,
          }),
          contentService.searchContent({
            query: '',
            content_type: 'timeline',
            session_id: currentSessionId || undefined,
            parent_id: selectedNovelId || undefined,
            limit: 200,
            include_content: false,
          }),
        ]);

        const sortedWorldItems = sortByUpdatedAt(worldResult.items);
        const sortedTimelineItems = sortByUpdatedAt(timelineResult.items);
        setWorldItems(sortedWorldItems);
        setTimelineItems(sortedTimelineItems);
        setWorldSettings(sortedWorldItems.map(parseWorldSetting).filter((item): item is WorldSetting => item !== null));
        setTimeline(
          sortedTimelineItems
            .flatMap(parseTimelineItem)
            .sort((left, right) => (left.date || '').localeCompare(right.date || '')),
        );
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : '加载世界观资产失败');
      } finally {
        setIsLoading(false);
      }
    };

    void loadWorldAssets();
  }, [currentSessionId, selectedNovelId, refreshTick]);

  useSessionTaskEvents({
    sessionId: currentSessionId,
    onCompleted: (detail) => {
      if (!shouldRefreshWorldLibrary(detail.taskType)) {
        return;
      }
      setRefreshTick((current) => current + 1);
    },
    onFailed: (detail) => {
      if (!shouldRefreshWorldLibrary(detail.taskType)) {
        return;
      }
      setError(`后台任务失败，世界观资料库可能未完全更新：${detail.error || detail.message || '未知错误'}`);
    },
  });

  const latestWorld = worldSettings[0] ?? null;
  const factGroups = useMemo(
    () => buildWorldFactGroups(worldSettings, worldItems, timeline, timelineItems[0] ?? null),
    [timeline, timelineItems, worldItems, worldSettings],
  );
  const totalFacts = factGroups.reduce((total, group) => total + group.facts.length, 0);
  const isEmpty = worldSettings.length === 0 && timeline.length === 0;
  const bindableWorldAssets = useMemo(
    () => [...worldItems, ...timelineItems].filter(
      (item) => Boolean(selectedNovelId && isUnassignedNovelScopedContentItem(item)),
    ),
    [selectedNovelId, timelineItems, worldItems],
  );

  const openWorldAsset = useCallback((item: ContentItem | null | undefined) => {
    if (!item) return;
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
  }, [router, selectedNovelId]);

  useEffect(() => {
    if (!directAssetId) return;
    let disposed = false;

    const openDirectAsset = async () => {
      try {
        const item = await contentService.getById(directAssetId);
        if (disposed) return;
        if (currentSessionId && item.metadata.session_id && item.metadata.session_id !== currentSessionId) {
          setError('该资产不属于当前项目，请先切换到对应项目后再查看。');
          return;
        }
        openWorldAsset(item);
      } catch (openError) {
        if (!disposed) setError(openError instanceof Error ? openError.message : '打开写回资产失败');
      }
    };

    void openDirectAsset();
    return () => {
      disposed = true;
    };
  }, [currentSessionId, directAssetId, openWorldAsset, selectedNovelId]);

  const bindWorldAssetToSelectedNovel = async (item: ContentItem) => {
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
        items: [...worldItems, ...timelineItems],
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
          <p>正在加载世界观资料库...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nf-editor-shell">
      <div className="nf-editor-page">
        <section className="nf-editor-hero">
          <div>
            <div className="nf-kicker">World Library</div>
            <h1 className="nf-editor-title">
              <Globe2 size={28} />
              世界观资料库
            </h1>
            <p className="nf-editor-subline">
              把地点、规则、组织、历史和意象整理成能被写作调用的资料。世界观不是图谱装饰，而是人物选择和剧情代价的来源。
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
              <Compass size={16} />
              导入/重建
            </button>
          </div>
        </section>

        {error ? <div className="nf-editor-alert">{error}</div> : null}
        {saveMessage ? <div className="nf-editor-alert success">{saveMessage}</div> : null}

        {bindableWorldAssets.length > 0 ? (
          <div className="nf-panel nf-panel-pad">
            <div className="nf-panel-title">发现未绑定到当前小说的世界观资产</div>
            <div className="nf-panel-subtitle">绑定后，AI 检索当前小说资产时会更稳定地读取这些设定。</div>
            <div className="nf-pill-row" style={{ marginTop: 12 }}>
              {bindableWorldAssets.slice(0, 8).map((item) => (
                <button
                  key={item.metadata.id}
                  type="button"
                  className="nf-chip"
                  onClick={() => void bindWorldAssetToSelectedNovel(item)}
                >
                  绑定「{getContentAssetTitle(item)}」
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-5">
          {[
            { label: '世界观资产', value: worldItems.length },
            { label: '地点', value: factGroups.find((group) => group.key === 'locations')?.facts.length ?? 0 },
            { label: '规则', value: factGroups.find((group) => group.key === 'rules')?.facts.length ?? 0 },
            { label: '组织/文化', value: factGroups.find((group) => group.key === 'cultures')?.facts.length ?? 0 },
            { label: '时间线', value: timeline.length },
          ].map((stat) => (
            <div key={stat.label} className="nf-stat">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </section>

        {isEmpty ? (
          <div className="nf-editor-empty">
            <Database size={34} />
            <h3>还没有世界观资料</h3>
            <p>先导入小说文本，或在主工作台让 AI 创建世界观并保存到项目内容库。</p>
            <div className="nf-pill-row" style={{ justifyContent: 'center' }}>
              <button type="button" className="nf-button nf-button-primary" onClick={() => router.push('/extract')}>
                去导入
              </button>
              <button type="button" className="nf-button" onClick={() => router.push('/')}>
                打开主工作台
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <main className="space-y-5">
              <section className="nf-panel nf-panel-pad">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="nf-kicker">Overview</div>
                    <h2 className="text-2xl font-semibold text-[var(--nf-text)]">
                      {latestWorld?.name || '当前世界观'}
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--nf-text-muted)]">
                      {latestWorld?.description || '已读取世界观资产，但概览描述不足。建议补充世界规则、代价、禁忌和关键场景用途。'}
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] px-3 py-1 text-xs font-semibold text-[var(--nf-text-muted)]">
                    {totalFacts} 条可写设定
                  </span>
                </div>
              </section>

              {factGroups.map((group) => {
                const Icon = group.icon;
                return (
                  <section key={group.key} className="nf-panel nf-panel-pad">
                    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="nf-panel-title">
                          <Icon size={17} />
                          {group.title}
                        </div>
                        <p className="nf-panel-subtitle mt-1">{group.description}</p>
                      </div>
                      <span className="nf-chip">{group.facts.length} 条</span>
                    </div>

                    {group.facts.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[var(--nf-border)] bg-[var(--nf-panel-soft)] px-4 py-5 text-sm text-[var(--nf-text-muted)]">
                        暂无{group.title}资料。后续可以通过重新提取或 AI 规划补齐。
                      </div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {group.facts.map((fact) => (
                          <article key={fact.id} className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--nf-text-subtle)]">
                                  {fact.category}
                                </div>
                                <h3 className="mt-1 text-base font-semibold text-[var(--nf-text)]">{fact.title}</h3>
                              </div>
                              {fact.source ? (
                                <button type="button" className="nf-chip" onClick={() => openWorldAsset(fact.source)}>
                                  编辑
                                </button>
                              ) : null}
                            </div>
                            <p className="mt-3 line-clamp-4 text-sm leading-6 text-[var(--nf-text-muted)]">{fact.summary}</p>
                            {fact.detail ? (
                              <p className="mt-3 rounded-xl border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] px-3 py-2 text-xs leading-5 text-[var(--nf-text-subtle)]">
                                {fact.detail}
                              </p>
                            ) : null}
                            {fact.usage ? (
                              <p className="mt-2 text-xs leading-5 text-[var(--nf-text-subtle)]">{fact.usage}</p>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </main>

            <aside className="space-y-4">
              <div className="nf-panel nf-panel-pad">
                <div className="nf-panel-title">
                  <Flag size={16} />
                  可写场景提示
                </div>
                <div className="mt-3 space-y-3 text-sm leading-6 text-[var(--nf-text-muted)]">
                  <p>优先把世界观转化为“限制 + 代价 + 选择”。只有名词设定还不够支撑动人的序章。</p>
                  <p>如果一个规则不能影响人物行动，它就应该被标记为待补强。</p>
                </div>
              </div>
              <div className="nf-panel nf-panel-pad">
                <div className="nf-panel-title">
                  <BookOpen size={16} />
                  下一步
                </div>
                <div className="mt-3 grid gap-2">
                  <button type="button" className="nf-button" onClick={() => router.push('/extract')}>
                    重建世界观提取
                  </button>
                  <button type="button" className="nf-button" onClick={() => router.push('/analytics')}>
                    查看项目状态
                  </button>
                  <button type="button" className="nf-button" onClick={() => router.push('/')}>
                    让 AI 基于设定写作
                  </button>
                </div>
              </div>
              <details className="nf-panel nf-panel-pad">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--nf-text)]">
                  世界树/图谱说明
                </summary>
                <p className="mt-3 text-sm leading-6 text-[var(--nf-text-muted)]">
                  本轮先把世界观首页收敛为资料库。复杂拓扑仍可后续作为次级检查工具重做，不再作为第一视觉中心。
                </p>
              </details>
            </aside>
          </div>
        )}

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
