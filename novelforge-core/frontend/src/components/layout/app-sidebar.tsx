'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BookOpen, Users, Globe, Settings, Home, Sparkles, FileText, BarChart3 } from 'lucide-react';

export interface NavigationItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  badge?: string;
}

const navigationItems: NavigationItem[] = [
  {
    title: '首页',
    href: '/',
    icon: Home,
    description: '系统概览和快速导航'
  },
  {
    title: 'AI规划',
    href: '/ai-planning',
    icon: Sparkles,
    description: '使用AI生成故事架构、角色和世界观'
  },
  {
    title: '角色管理',
    href: '/characters',
    icon: Users,
    description: '创建和管理小说角色档案'
  },
  {
    title: '世界设定',
    href: '/world',
    icon: Globe,
    description: '构建完整的世界观和设定'
  },
  {
    title: '小说编辑',
    href: '/editor',
    icon: FileText,
    description: '富文本编辑器和实时协作'
  },
  {
    title: '数据分析',
    href: '/analytics',
    icon: BarChart3,
    description: '创作数据统计和分析'
  },
  {
    title: '系统设置',
    href: '/settings',
    icon: Settings,
    description: '配置AI模型和集成设置'
  }
];

export interface AppSidebarProps {
  className?: string;
  isCollapsed?: boolean;
  onToggle?: () => void;
}

export function AppSidebar({ 
  className, 
  isCollapsed = false, 
  onToggle 
}: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className={cn(
      "flex flex-col h-full bg-white border-r border-gray-200",
      isCollapsed ? "w-16" : "w-64",
      "transition-all duration-300 ease-in-out",
      className
    )}>
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className={cn(
          "font-semibold text-lg transition-opacity duration-300",
          isCollapsed ? "opacity-0" : "opacity-100"
        )}>
          NovelForge
        </div>
        {!isCollapsed && (
          <button
            onClick={onToggle}
            className="p-1 rounded-md hover:bg-gray-100"
          >
            <span className="sr-only">切换侧边栏</span>
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {navigationItems.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  pathname === item.href
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100"
                )}
              >
                <item.icon className={cn(
                  "h-5 w-5 flex-shrink-0",
                  isCollapsed ? "mx-auto" : ""
                )} />
                <span className={cn(
                  "transition-opacity duration-300",
                  isCollapsed ? "opacity-0 hidden" : "opacity-100"
                )}>
                  {item.title}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

export default AppSidebar;