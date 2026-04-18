'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  FileSearch,
  FileText,
  Globe,
  Home,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';

export interface NavigationItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

const navigationItems: NavigationItem[] = [
  {
    title: '主页',
    href: '/',
    icon: Home,
    description: '工作区首页与项目仪表盘。',
  },
  {
    title: 'AI 规划',
    href: '/ai-planning',
    icon: Sparkles,
    description: '生成大纲、角色和世界观资产。',
  },
  {
    title: '提取',
    href: '/extract',
    icon: FileSearch,
    description: '导入文本并提取统一资产。',
  },
  {
    title: '角色',
    href: '/characters',
    icon: Users,
    description: '查看和管理角色资产。',
  },
  {
    title: '世界',
    href: '/world',
    icon: Globe,
    description: '查看世界观与时间线资产。',
  },
  {
    title: '编辑器',
    href: '/editor',
    icon: FileText,
    description: '打开并编辑章节资产。',
  },
  {
    title: '分析',
    href: '/analytics',
    icon: BarChart3,
    description: '查看真实项目指标。',
  },
  {
    title: '设置',
    href: '/settings',
    icon: Settings,
    description: '管理模型与项目偏好。',
  },
];

export interface AppSidebarProps {
  className?: string;
  isCollapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  showBrand?: boolean;
}

export function AppSidebar({
  className,
  isCollapsed = false,
  onToggle,
  onNavigate,
  showBrand = true,
}: AppSidebarProps) {
  const pathname = usePathname();

  const isActiveRoute = React.useCallback(
    (href: string) => {
      if (href === '/') {
        return pathname === '/';
      }
      return pathname === href || pathname?.startsWith(`${href}/`);
    },
    [pathname]
  );

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-white/10 bg-[var(--bg-surface)] text-[var(--text-primary)]',
        isCollapsed ? 'w-16' : 'w-64',
        'transition-all duration-300 ease-in-out',
        className
      )}
    >
      {showBrand ? (
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div className={cn('transition-opacity duration-300', isCollapsed ? 'opacity-0' : 'opacity-100')}>
            <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">NovelForge</div>
            <div className="text-lg font-semibold text-white">工作区</div>
          </div>
          {!isCollapsed && onToggle ? (
            <button
              onClick={onToggle}
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
            >
              <span className="sr-only">切换导航栏</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {navigationItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActiveRoute(item.href)
                    ? 'bg-violet-500/15 text-violet-100'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                )}
              >
                <item.icon className={cn('h-5 w-5 flex-shrink-0', isCollapsed ? 'mx-auto' : '')} />
                <span className={cn('transition-opacity duration-300', isCollapsed ? 'hidden opacity-0' : 'opacity-100')}>
                  {item.title}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {!isCollapsed ? (
        <div className="border-t border-white/10 px-4 py-3 text-xs text-zinc-500">
          共享导航、项目上下文和后台任务现在都集中在一个界面中。
        </div>
      ) : null}
    </aside>
  );
}

export default AppSidebar;
