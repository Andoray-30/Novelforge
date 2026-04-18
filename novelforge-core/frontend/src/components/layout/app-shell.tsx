'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { MainLayout } from '@/components/layout/main-layout';
import { useSessions } from '@/lib/hooks/use-sessions';

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
        description: '管理模型配置与项目偏好。',
      };
    default:
      return {
        title: 'NovelForge',
        description: '统一的规划、创作与资产管理工作区。',
      };
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const { sessions, currentSession, currentSessionId, switchSession, createSession } = useSessions();

  const routeMeta = React.useMemo(() => getRouteMeta(pathname), [pathname]);
  const contentOverflow = pathname === '/' ? 'hidden' : 'auto';

  const projectOptions = React.useMemo(
    () => sessions.map((session) => ({ id: session.id, title: session.title || '未命名项目' })),
    [sessions]
  );

  const handleCreateProject = React.useCallback(async () => {
    await createSession('新建项目');
  }, [createSession]);

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
