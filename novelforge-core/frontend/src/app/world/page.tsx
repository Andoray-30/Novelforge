'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Book, Clock, Database, DatabaseZap, Globe2, Map, Scale } from 'lucide-react';
import LocationMap from '@/components/World/LocationMap';
import CulturePanel from '@/components/World/CulturePanel';
import HistoricalTimeline from '@/components/World/HistoricalTimeline';
import RuleHierarchyTree from '@/components/World/RuleHierarchyTree';
import type { ContentItem, Culture, TimelineEvent, Location, WorldRule, WorldSetting } from '@/types';
import type { ToolCall } from '@/lib/chat-parser';

type ArtifactData = ContentItemArtifactData & { toolCall?: ToolCall };

type WorldTab = 'timeline' | 'locations' | 'cultures' | 'rules';

function sortByUpdatedAt(items: ContentItem[]): ContentItem[] {
  return [...items].sort((left, right) => right.metadata.updated_at.localeCompare(left.metadata.updated_at));
}

function pickLatestItem(items: ContentItem[]): ContentItem | null {
  return sortByUpdatedAt(items)[0] ?? null;
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
  if (!record) {
    return null;
  }

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
  if (!record) {
    return null;
  }

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
  if (!record) {
    return null;
  }

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
  if (!record) {
    return null;
  }

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
    item.metadata.id
  );

  return event ? [event] : [];
}

function buildEventContentItem(event: TimelineEvent): ContentItem {
  return {
    metadata: {
      id: event.id,
      title: event.title,
      type: 'timeline',
      status: 'draft',
      author: undefined,
      tags: [],
      created_at: '',
      updated_at: '',
      version: 1,
      parent_id: undefined,
      children_ids: [],
      session_id: undefined,
    },
    content: event.description,
    extracted_data: {
      id: event.id,
      title: event.title,
      description: event.description,
      event_type: event.event_type,
      characters: event.characters,
      locations: event.locations,
      importance: event.importance,
      date: event.date,
    },
    stats: null,
    relations: null,
  };
}

export default function WorldSettingsPage() {
  const router = useRouter();
  const { currentSession, currentSessionId } = useSessions();
  const selectedNovelId = useAppStore((s) => s.selectedNovelId);
  const [activeTab, setActiveTab] = useState<WorldTab>('timeline');
  const [worldSetting, setWorldSetting] = useState<WorldSetting | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [latestWorldItem, setLatestWorldItem] = useState<ContentItem | null>(null);
  const [latestTimelineItem, setLatestTimelineItem] = useState<ContentItem | null>(null);
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
            limit: 50,
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

        const latestWorldItem = pickLatestItem(worldResult.items);
        const latestTimelineItem = pickLatestItem(timelineResult.items);
        const latestWorld = sortByUpdatedAt(worldResult.items).map(parseWorldSetting).find((item) => item !== null) ?? null;
        const parsedTimeline = sortByUpdatedAt(timelineResult.items)
          .flatMap(parseTimelineItem)
          .sort((left, right) => (left.date || '').localeCompare(right.date || ''));

        setLatestWorldItem(latestWorldItem);
        setLatestTimelineItem(latestTimelineItem);
        setWorldSetting(latestWorld);
        setTimeline(parsedTimeline);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : '加载世界资产失败');
      } finally {
        setIsLoading(false);
      }
    };

    void loadWorldAssets();
  }, [currentSessionId, selectedNovelId, refreshTick]);

  useSessionTaskEvents({
    sessionId: currentSessionId,
    onCompleted: (detail) => {
      if (!['novel_import', 'extraction', 'world_building', 'timeline_generation'].includes(detail.taskType)) {
        return;
      }
      setRefreshTick((current) => current + 1);
    },
    onFailed: (detail) => {
      if (!['novel_import', 'extraction', 'world_building', 'timeline_generation'].includes(detail.taskType)) {
        return;
      }
      setError(`后台任务失败，世界资产未完成更新：${detail.error || detail.message || 'unknown error'}`);
    },
  });

  const tabs = useMemo(
    () =>
      [
        { id: 'timeline', label: '编年史', icon: Clock, count: timeline.length },
        { id: 'locations', label: '地貌与坐标', icon: Map, count: worldSetting?.locations.length || 0 },
        { id: 'cultures', label: '文明图鉴', icon: Book, count: worldSetting?.cultures.length || 0 },
        { id: 'rules', label: '真理之树', icon: Scale, count: worldSetting?.rules.length || 0 },
      ] satisfies Array<{ id: WorldTab; label: string; icon: typeof Clock; count: number }>,
    [timeline.length, worldSetting]
  );

  const openWorldAsset = (item: ContentItem) => {
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
    const candidates = [latestWorldItem, latestTimelineItem].filter((item): item is ContentItem => item !== null);

    setError(null);
    try {
      const result = await saveReopenedContentItem({
        items: candidates,
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

  const selectedTimelineAsset = useMemo(() => {
    if (!latestTimelineItem) {
      return timeline[0] ? buildEventContentItem(timeline[0]) : null;
    }
    return latestTimelineItem;
  }, [latestTimelineItem, timeline]);

  const bindableWorldAssets = useMemo(
    () => [latestWorldItem, latestTimelineItem].filter(
      (item): item is ContentItem => Boolean(selectedNovelId && item && isUnassignedNovelScopedContentItem(item)),
    ),
    [latestTimelineItem, latestWorldItem, selectedNovelId],
  );

  const isEmpty = !worldSetting && timeline.length === 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200">
        <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6 py-12">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-400" />
            <p className="text-slate-400">正在载入当前项目的世界资产...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-emerald-900/20 to-transparent pointer-events-none" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-12">
        <div className="mb-8 flex flex-col items-start justify-between gap-6 border-b border-slate-800 pb-8 md:flex-row md:items-end">
          <div>
            <h1 className="mb-4 flex items-center bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-4xl font-black tracking-tight text-transparent md:text-5xl">
              <Globe2 className="mr-4 h-10 w-10 text-emerald-500" />
              世界观测仓
            </h1>
            <p className="max-w-2xl text-lg text-slate-400">
              这里展示当前项目中已保存的世界观、时间线、地点、文化与规则资产，而不是临时内存状态。
            </p>
            <p className="mt-3 text-sm text-slate-500">当前项目: {currentSession?.title || '未选择，默认显示全部世界资产'}</p>
            <p className="mt-2 text-sm text-slate-500">当前小说: {selectedNovelId ? '已按当前小说容器收敛展示' : '当前展示全部小说聚合世界资产'}</p>
            {worldSetting?.name && <p className="mt-3 font-medium text-emerald-400">当前世界: {worldSetting.name}</p>}
            {worldSetting?.description && <p className="mt-2 max-w-3xl text-sm text-slate-500">{worldSetting.description}</p>}
          </div>

          <button
            type="button"
            onClick={() => setRefreshTick((current) => current + 1)}
            className="mt-2 flex items-center whitespace-nowrap rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-white shadow-lg transition-all hover:border-emerald-500/50 hover:bg-slate-800"
          >
            <DatabaseZap className="mr-2 h-4 w-4 text-emerald-400" />
            刷新世界资产
          </button>
        </div>

        {error && <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-200">{error}</div>}
        {saveMessage && <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-emerald-200">{saveMessage}</div>}
        {bindableWorldAssets.length > 0 && (
          <div className="mb-6 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-5 py-4 text-indigo-100">
            <div className="mb-3 text-sm font-semibold">发现未绑定到当前小说的世界资产</div>
            <div className="flex flex-wrap gap-2">
              {bindableWorldAssets.map((item) => (
                <button
                  key={item.metadata.id}
                  type="button"
                  onClick={() => {
                    void bindWorldAssetToSelectedNovel(item);
                  }}
                  className="rounded-full border border-indigo-300/30 bg-indigo-400/10 px-3 py-1 text-xs font-medium text-indigo-100 transition hover:border-indigo-200/60 hover:bg-indigo-400/20"
                >
                  绑定「{getContentAssetTitle(item)}」到当前小说
                </button>
              ))}
            </div>
          </div>
        )}

        {isEmpty ? (
          <div className="mt-12 flex flex-1 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-800 bg-slate-900/20 py-24 backdrop-blur-sm">
            <Database className="mb-6 h-16 w-16 text-slate-700" />
            <h3 className="mb-2 text-2xl font-bold text-slate-300">混沌虚无之地</h3>
            <p className="max-w-md text-center text-slate-500">
              当前项目下还没有可用的世界观资产。你可以通过 AI 规划、文本提取或聊天生成来填充这片空间。
            </p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-8 lg:flex-row">
            <div className="flex w-full shrink-0 flex-col gap-2 lg:w-64">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                      'relative flex w-full items-center justify-between rounded-2xl px-5 py-4 text-left transition-all duration-300',
                      isActive
                        ? 'border border-blue-500/30 bg-gradient-to-r from-blue-600/20 to-emerald-600/20 text-white shadow-[0_0_20px_rgba(59,130,246,0.1)]'
                        : 'border border-transparent bg-slate-900/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200',
                    ].join(' ')}
                  >
                    <div className="flex items-center">
                      <Icon className={`mr-3 h-5 w-5 ${isActive ? 'font-bold text-cyan-400' : ''}`} />
                      <span className={`font-semibold ${isActive ? 'tracking-wide' : ''}`}>{tab.label}</span>
                    </div>
                    {tab.count > 0 && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${isActive ? 'bg-cyan-500/20 font-bold text-cyan-300' : 'bg-slate-800 text-slate-500'}`}
                      >
                        {tab.count}
                      </span>
                    )}
                    {isActive && <div className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]" />}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 rounded-3xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-500">
              <style
                dangerouslySetInnerHTML={{
                  __html: `
                    .world-panel-container .bg-card { background-color: transparent !important; border: none !important; box-shadow: none !important; color: #f1f5f9; }
                    .world-panel-container .text-card-foreground { color: #f8fafc; }
                    .world-panel-container .text-muted-foreground { color: #94a3b8; }
                    .world-panel-container .border { border-color: #1e293b; }
                    .world-panel-container .bg-muted { background-color: #0f172a; }
                    .world-panel-container .bg-background { background-color: #020617; color: white; }
                    .world-panel-container select { background-color: #0f172a; border-color: #1e293b; }
                  `,
                }}
              />

              <div className="world-panel-container h-full">
                {activeTab === 'timeline' && <HistoricalTimeline events={timeline} onEventClick={() => {
                  if (selectedTimelineAsset) {
                    openWorldAsset(selectedTimelineAsset);
                  }
                }} />}
                {activeTab === 'locations' && <LocationMap locations={worldSetting?.locations || []} onLocationClick={() => {
                  if (latestWorldItem) {
                    openWorldAsset(latestWorldItem);
                  }
                }} />}
                {activeTab === 'cultures' && <CulturePanel cultures={worldSetting?.cultures || []} onCultureClick={() => {
                  if (latestWorldItem) {
                    openWorldAsset(latestWorldItem);
                  }
                }} />}
                {activeTab === 'rules' && <RuleHierarchyTree rules={worldSetting?.rules || []} onRuleClick={() => {
                  if (latestWorldItem) {
                    openWorldAsset(latestWorldItem);
                  }
                }} />}
              </div>
            </div>
          </div>
        )}
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
  );
}
