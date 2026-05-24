'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { MainLayout } from '@/components/layout/main-layout';
import { useSessions } from '@/lib/hooks/use-sessions';
import { authService, contentService } from '@/lib/api/novelforge-api';
import {
  EMPTY_PROJECT_STATS,
  buildVisibleProjectSummaries,
  type ProjectAssetStats,
} from '@/lib/project-summary';

type RouteMeta = {
  title: string;
  description: string;
};

function getRouteMeta(pathname: string): RouteMeta {
  if (pathname.startsWith('/characters/')) {
    return {
      title: '角色详情',
      description: '查看当前项目中已保存的角色资产。',
    };
  }

  switch (pathname) {
    case '/':
      return {
        title: '创作工作区',
        description: '聊天、保存资产，并管理当前项目。',
      };
    case '/ai-planning':
      return {
        title: 'AI 规划',
        description: '生成大纲、角色和世界观资产。',
      };
    case '/extract':
      return {
        title: '导入与提取',
        description: '把原始文本转成统一项目资产。',
      };
    case '/characters':
      return {
        title: '角色',
        description: '查看和管理结构化角色资产。',
      };
    case '/world':
      return {
        title: '世界观',
        description: '查看世界设定、时间线和设定资料。',
      };
    case '/editor':
      return {
        title: '编辑器',
        description: '打开并续写章节资产。',
      };
    case '/analytics':
      return {
        title: '分析',
        description: '查看真实项目指标与任务状态。',
      };
    case '/settings':
      return {
        title: '设置',
        description: '管理模型托管与项目偏好。',
      };
    default:
      return {
        title: 'NovelForge',
        description: '统一的规划、创作与资产管理工作区。',
      };
  }
}

function sumNovelStats(stats: Record<string, number> | undefined, key: keyof ProjectAssetStats): number {
  if (!stats) {
    return 0;
  }
  const direct = stats[key];
  return typeof direct === 'number' && Number.isFinite(direct) ? direct : 0;
}

function mergeProjectAssetStats(left: ProjectAssetStats, right: ProjectAssetStats): ProjectAssetStats {
  return {
    novels: Math.max(left.novels, right.novels),
    chapters: Math.max(left.chapters, right.chapters),
    characters: Math.max(left.characters, right.characters),
    worlds: Math.max(left.worlds, right.worlds),
    timelines: Math.max(left.timelines, right.timelines),
    relationships: Math.max(left.relationships, right.relationships),
  };
}

async function loadProjectAssetStats(sessionId: string): Promise<ProjectAssetStats> {
  let stats: ProjectAssetStats = { ...EMPTY_PROJECT_STATS };

  try {
    const novels = await contentService.getNovels(sessionId);
    if (novels.novels.length > 0) {
      stats = novels.novels.reduce<ProjectAssetStats>((acc, novel) => {
        const stats = novel.stats || {};
        acc.novels += 1;
        acc.chapters += sumNovelStats(stats, 'chapters');
        acc.characters += sumNovelStats(stats, 'characters');
        acc.worlds += sumNovelStats(stats, 'worlds');
        acc.timelines += sumNovelStats(stats, 'timelines');
        acc.relationships += sumNovelStats(stats, 'relationships');
        return acc;
      }, { ...EMPTY_PROJECT_STATS });
    }
  } catch {
    // Direct content search below still gives a useful project-level summary.
  }

  try {
    const result = await contentService.search({
      session_id: sessionId,
      content_types: ['novel', 'chapter', 'character', 'world', 'timeline', 'relationship'],
      limit: 500,
    });

    const directStats = result.items.reduce<ProjectAssetStats>((acc, item) => {
      switch (item.metadata.type) {
        case 'novel':
          acc.novels += 1;
          break;
        case 'chapter':
          acc.chapters += 1;
          break;
        case 'character':
          acc.characters += 1;
          break;
        case 'world':
          acc.worlds += 1;
          break;
        case 'timeline':
          acc.timelines += 1;
          break;
        case 'relationship':
          acc.relationships += 1;
          break;
      }
      return acc;
    }, { ...EMPTY_PROJECT_STATS });

    return mergeProjectAssetStats(stats, directStats);
  } catch {
    return stats;
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { sessions, currentSession, currentSessionId, switchSession, createSession } = useSessions();
  const [authChecked, setAuthChecked] = React.useState(false);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [projectAssetStats, setProjectAssetStats] = React.useState<Record<string, ProjectAssetStats>>({});

  const routeMeta = React.useMemo(() => getRouteMeta(pathname), [pathname]);
  const contentOverflow = pathname === '/' ? 'hidden' : 'auto';

  React.useEffect(() => {
    let disposed = false;
    const checkAuth = async () => {
      try {
        const status = await authService.me();
        if (disposed) return;

        const allowed = !status.auth_required || status.authenticated;
        setIsAuthenticated(allowed);
        setAuthChecked(true);
        if (!allowed && pathname !== '/login') {
          router.replace('/login');
        }
        if (allowed && pathname === '/login') {
          router.replace('/');
        }
      } catch {
        if (!disposed) {
          setIsAuthenticated(false);
          setAuthChecked(true);
          if (pathname !== '/login') {
            router.replace('/login');
          }
        }
      }
    };

    void checkAuth();
    return () => {
      disposed = true;
    };
  }, [pathname, router]);

  React.useEffect(() => {
    if (!isAuthenticated || sessions.length === 0) {
      setProjectAssetStats({});
      return;
    }

    let cancelled = false;
    const sessionIds = sessions.slice(0, 50).map((session) => session.id);

    const loadStats = async () => {
      const entries = await Promise.all(
        sessionIds.map(async (sessionId) => [sessionId, await loadProjectAssetStats(sessionId)] as const),
      );
      if (!cancelled) {
        setProjectAssetStats(Object.fromEntries(entries));
      }
    };

    void loadStats();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, sessions]);

  const allProjectSummaries = React.useMemo(
    () => buildVisibleProjectSummaries(sessions, projectAssetStats, currentSessionId, true),
    [currentSessionId, projectAssetStats, sessions],
  );

  React.useEffect(() => {
    if (sessions.length === 0 || Object.keys(projectAssetStats).length === 0) {
      return;
    }
    const currentSummary = allProjectSummaries.find((summary) => summary.id === currentSessionId);
    const firstUsable = allProjectSummaries.find((summary) => !summary.hiddenByDefault);
    if (currentSummary?.hiddenByDefault && firstUsable && firstUsable.id !== currentSummary.id) {
      switchSession(firstUsable.id);
    }
  }, [allProjectSummaries, currentSessionId, projectAssetStats, sessions.length, switchSession]);

  const projectOptions = React.useMemo(() => {
    return buildVisibleProjectSummaries(sessions, projectAssetStats, currentSessionId).map((summary) => ({
      id: summary.id,
      title: `${summary.displayTitle} · ${summary.statsLabel} · ${summary.statusLabel}`,
    }));
  }, [currentSessionId, projectAssetStats, sessions]);

  const handleCreateProject = React.useCallback(async () => {
    await createSession('新建项目');
  }, [createSession]);

  if (pathname === '/login') {
    return <>{children}</>;
  }

  if (!authChecked || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-200">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm">
          正在检查访问权限...
        </div>
      </div>
    );
  }

  return (
    <MainLayout
      title={routeMeta.title}
      description={routeMeta.description}
      currentSessionTitle={currentSession?.title ?? null}
      currentSessionId={currentSessionId}
      projects={projectOptions}
      onProjectChange={switchSession}
      onCreateProject={handleCreateProject}
      contentOverflow={contentOverflow}
      sidebar={<AppSidebar />}
    >
      {children}
    </MainLayout>
  );
}
