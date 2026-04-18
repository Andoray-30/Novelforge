'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { BookOpen, FolderKanban, Menu, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

type ProjectOption = {
  id: string;
  title: string;
};

export interface AppHeaderProps {
  className?: string;
  title?: string;
  description?: string;
  currentSessionTitle?: string | null;
  currentSessionId?: string | null;
  projects?: ProjectOption[];
  onProjectChange?: (id: string) => void;
  onCreateProject?: () => void;
  onMenuClick?: () => void;
  showMenuButton?: boolean;
  actions?: ReactNode;
}

export function AppHeader({
  className,
  title = 'NovelForge',
  description,
  currentSessionTitle,
  currentSessionId,
  projects = [],
  onProjectChange,
  onCreateProject,
  onMenuClick,
  showMenuButton = true,
  actions,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b border-white/10 bg-[rgba(9,9,11,0.82)] backdrop-blur-md',
        className
      )}
    >
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          {showMenuButton ? (
            <button
              onClick={onMenuClick}
              className="rounded-lg border border-white/10 p-2 text-zinc-300 transition-colors hover:bg-white/5 lg:hidden"
              aria-label="打开导航"
            >
              <Menu className="h-5 w-5" />
            </button>
          ) : null}

          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-lg shadow-violet-500/20">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="hidden sm:block">
              <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">NovelForge</div>
              <div className="text-sm font-semibold text-white">工作区</div>
            </div>
          </Link>

          <div className="hidden h-8 w-px bg-white/10 md:block" />

          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{title}</div>
            {description ? (
              <div className="hidden truncate text-xs text-zinc-400 md:block">{description}</div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {projects.length > 0 ? (
            <div className="hidden items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-100 md:flex">
              <FolderKanban className="ml-1 h-4 w-4 flex-shrink-0" />
              <select
                value={currentSessionId ?? ''}
                onChange={(event) => {
                  if (event.target.value && onProjectChange) {
                    onProjectChange(event.target.value);
                  }
                }}
                className="max-w-56 truncate bg-transparent text-xs font-medium text-emerald-50 outline-none"
                aria-label="切换当前项目"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id} className="bg-zinc-950 text-zinc-100">
                    {project.title}
                  </option>
                ))}
              </select>
              {onCreateProject ? (
                <button
                  type="button"
                  onClick={onCreateProject}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-emerald-50 transition-colors hover:bg-white/10"
                  aria-label="新建项目"
                  title="新建项目"
                >
                  <Plus className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ) : currentSessionTitle ? (
            <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-100 md:flex">
              <FolderKanban className="h-4 w-4" />
              <span className="max-w-56 truncate">{currentSessionTitle}</span>
            </div>
          ) : (
            <div className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 md:block">
              当前没有激活项目
            </div>
          )}

          {actions}

          <Link
            href="/settings"
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/10"
          >
            设置
          </Link>
        </div>
      </div>
    </header>
  );
}
