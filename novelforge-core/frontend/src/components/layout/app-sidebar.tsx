'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FileSearch,
  FileText,
  Globe,
  Home,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NavigationItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

const navigationItems: NavigationItem[] = [
  {
    title: '工作台',
    href: '/',
    icon: Home,
    description: '聊天、保存资产并管理当前项目。',
  },
  {
    title: '导入',
    href: '/extract',
    icon: FileSearch,
    description: '导入文本并提取统一资产。',
  },
  {
    title: '编辑器',
    href: '/editor',
    icon: FileText,
    description: '打开并编辑章节资产。',
  },
  {
    title: '角色',
    href: '/characters',
    icon: Users,
    description: '查看和管理角色资料库。',
  },
  {
    title: '世界观',
    href: '/world',
    icon: Globe,
    description: '查看世界观、时间线和设定资料。',
  },
  {
    title: '项目状态',
    href: '/analytics',
    icon: LayoutDashboard,
    description: '查看项目质量、资产和下一步建议。',
  },
  {
    title: '设置',
    href: '/settings',
    icon: Settings,
    description: '管理部署状态和项目偏好。',
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
      if (href === '/') return pathname === '/';
      if (href === '/analytics') return pathname === '/analytics' || pathname === '/dashboard';
      return pathname === href || pathname?.startsWith(`${href}/`);
    },
    [pathname],
  );

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-[var(--nf-border)] bg-[var(--nf-bg-subtle)] text-[var(--nf-text)]',
        isCollapsed ? 'w-16' : 'w-64',
        'transition-all duration-300 ease-in-out',
        className,
      )}
    >
      {showBrand ? (
        <div className="flex items-center justify-between border-b border-[var(--nf-border)] p-4">
          <div className={cn('transition-opacity duration-300', isCollapsed ? 'opacity-0' : 'opacity-100')}>
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--nf-text-subtle)]">NovelForge</div>
            <div className="text-lg font-semibold text-[var(--nf-text)]">工作区</div>
          </div>
          {!isCollapsed && onToggle ? (
            <button
              onClick={onToggle}
              className="rounded-md p-1 text-[var(--nf-text-subtle)] transition-colors hover:bg-[var(--nf-panel-soft)] hover:text-[var(--nf-text)]"
            >
              <span className="sr-only">切换导航栏</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {navigationItems.map((item) => {
            const active = isActiveRoute(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  title={item.description}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-[var(--nf-accent-soft)] text-[var(--nf-accent)]'
                      : 'text-[var(--nf-text-muted)] hover:bg-[var(--nf-panel-soft)] hover:text-[var(--nf-text)]',
                  )}
                >
                  <item.icon className={cn('h-5 w-5 flex-shrink-0', isCollapsed ? 'mx-auto' : '')} />
                  <span className={cn('transition-opacity duration-300', isCollapsed ? 'hidden opacity-0' : 'opacity-100')}>
                    {item.title}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {!isCollapsed ? (
        <div className="border-t border-[var(--nf-border)] px-4 py-3 text-xs text-[var(--nf-text-subtle)]">
          导航、项目上下文和后台任务集中在同一个界面中。
        </div>
      ) : null}
    </aside>
  );
}

export default AppSidebar;
