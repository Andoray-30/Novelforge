'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { contentService, taskService } from '@/lib/api';
import { getContentAssetPayload, getContentAssetText, getContentAssetTitle } from '@/lib/content-contract';
import { useSessionTaskEvents } from '@/lib/hooks/use-session-task-events';
import { useSessions } from '@/lib/hooks/use-sessions';
import { formatDate } from '@/lib/utils';
import { BarChart3, CheckCircle2, Clock3, FileText, RefreshCw, Users } from 'lucide-react';
import type { AITask, ContentItem } from '@/types';

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

export default function AnalyticsPage() {
  const { currentSession, currentSessionId } = useSessions();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [tasks, setTasks] = useState<AITask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const loadAnalytics = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const assetPromise = contentService.searchContent({
          query: '',
          session_id: currentSessionId || undefined,
          limit: 500,
        });
        const taskPromise = currentSessionId ? taskService.getActiveTasks(currentSessionId) : Promise.resolve([]);

        const [assetResult, activeTasks] = await Promise.all([assetPromise, taskPromise]);
        setItems(sortByUpdatedAt(assetResult.items));
        setTasks(activeTasks);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : '加载分析数据失败');
      } finally {
        setIsLoading(false);
      }
    };

    void loadAnalytics();
  }, [currentSessionId, refreshTick]);

  useSessionTaskEvents({
    sessionId: currentSessionId,
    onCompleted: () => {
      setRefreshTick((current) => current + 1);
    },
    onFailed: (detail) => {
      setError(`后台任务失败，分析页显示的项目进度可能尚未完全更新：${detail.error || detail.message || '未知错误'}`);
      setRefreshTick((current) => current + 1);
    },
    onCancelled: () => {
      setRefreshTick((current) => current + 1);
    },
  });

  const chapters = useMemo(() => items.filter((item) => item.metadata.type === 'chapter'), [items]);
  const characters = useMemo(() => items.filter((item) => item.metadata.type === 'character'), [items]);
  const worlds = useMemo(() => items.filter((item) => item.metadata.type === 'world'), [items]);
  const timelines = useMemo(() => items.filter((item) => item.metadata.type === 'timeline'), [items]);
  const relationships = useMemo(() => items.filter((item) => item.metadata.type === 'relationship'), [items]);
  const outlines = useMemo(() => items.filter((item) => item.metadata.type === 'outline'), [items]);

  const totalWordCount = useMemo(() => countChapterCharacters(chapters), [chapters]);
  const worldElementCount = useMemo(() => countWorldElements(worlds), [worlds]);
  const activeTaskCount = useMemo(
    () => tasks.filter((task) => ['PENDING', 'RUNNING'].includes(String(task.status).toUpperCase())).length,
    [tasks]
  );

  const statusCards = useMemo(
    () => [
      { label: '章节数', value: chapters.length, icon: <FileText className="h-5 w-5" /> },
      { label: '字数', value: totalWordCount, icon: <BarChart3 className="h-5 w-5" /> },
      { label: '角色数', value: characters.length, icon: <Users className="h-5 w-5" /> },
      { label: '世界要素', value: worldElementCount, icon: <CheckCircle2 className="h-5 w-5" /> },
      { label: '活跃任务', value: activeTaskCount, icon: <Clock3 className="h-5 w-5" /> },
    ],
    [activeTaskCount, chapters.length, totalWordCount, characters.length, worldElementCount]
  );

  const recentAssets = useMemo(() => items.slice(0, 6), [items]);
  const assetDistribution = useMemo(
    () => [
      { label: '大纲', value: outlines.length },
      { label: '章节', value: chapters.length },
      { label: '角色', value: characters.length },
      { label: '世界观', value: worlds.length },
      { label: '时间线', value: timelines.length },
      { label: '关系网', value: relationships.length },
    ],
    [outlines.length, chapters.length, characters.length, worlds.length, timelines.length, relationships.length]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-10">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-cyan-400" />
            <p className="text-slate-400">正在分析当前项目资产...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 border-b border-slate-800 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-white">数据分析</h1>
            <p className="mt-3 max-w-3xl text-slate-400">
              分析页 v1 已切换到真实项目资产统计。这里展示的章节数、字数、角色数、世界要素和活跃任务都来自当前内容库。
            </p>
            <p className="mt-3 text-sm text-slate-500">当前项目: {currentSession?.title || '未选择项目，默认统计全部资产'}</p>
          </div>

          <Button
            onClick={() => setRefreshTick((current) => current + 1)}
            className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
            variant="outline"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新分析
          </Button>
        </div>

        {error && <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-200">{error}</div>}

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
          {statusCards.map((stat) => (
            <Card key={stat.label} className="border-slate-800 bg-slate-900 text-slate-100">
              <CardContent className="p-6">
                <div className="mb-3 flex items-center justify-between text-slate-400">
                  {stat.icon}
                  <Badge variant="outline">{stat.label}</Badge>
                </div>
                <div className="text-3xl font-black text-white">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-slate-800 bg-slate-900 text-slate-100">
            <CardHeader>
              <CardTitle>资产分布</CardTitle>
              <CardDescription className="text-slate-400">当前项目中各类内容资产的真实数量</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {assetDistribution.map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-slate-300">{item.label}</span>
                    <span className="text-white">{item.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                      style={{ width: `${items.length > 0 ? (item.value / items.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900 text-slate-100">
            <CardHeader>
              <CardTitle>最近更新的资产</CardTitle>
              <CardDescription className="text-slate-400">帮助你快速回看最近发生变化的内容</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentAssets.length === 0 ? (
                <p className="text-sm text-slate-500">当前没有可分析资产。</p>
              ) : (
                recentAssets.map((item) => (
                  <div key={item.metadata.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{getContentAssetTitle(item)}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDate(item.metadata.updated_at)}</p>
                      </div>
                      <Badge variant="outline">{item.metadata.type}</Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="border-slate-800 bg-slate-900 text-slate-100">
            <CardHeader>
              <CardTitle>创作进展</CardTitle>
              <CardDescription className="text-slate-400">从大纲到章节的闭环完成度</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
                大纲资产: <span className="font-semibold text-white">{outlines.length}</span>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
                已保存章节: <span className="font-semibold text-white">{chapters.length}</span>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
                当前总字数: <span className="font-semibold text-white">{totalWordCount}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900 text-slate-100">
            <CardHeader>
              <CardTitle>最近任务状态</CardTitle>
              <CardDescription className="text-slate-400">显示当前项目正在执行的后台任务</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {tasks.length === 0 ? (
                <p className="text-sm text-slate-500">当前没有活跃后台任务。</p>
              ) : (
                tasks.map((task) => (
                  <div key={task.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{task.type}</p>
                        <p className="mt-1 text-xs text-slate-500">{task.message || '任务执行中'}</p>
                      </div>
                      <Badge variant="outline">{task.status}</Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
