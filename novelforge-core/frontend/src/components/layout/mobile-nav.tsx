'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, Menu, BookOpen, FolderKanban, Library, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppSidebar } from './app-sidebar';
import { useAppStore } from '@/lib/hooks/use-app-store';
import { contentService } from '@/lib/api/novelforge-api';
import type { Novel } from '@/types';

export interface MobileNavProps {
  className?: string;
  isOpen: boolean;
  onClose: () => void;
  currentSessionTitle?: string | null;
  currentSessionId?: string | null;
  projects?: Array<{ id: string; title: string }>;
  onProjectChange?: (id: string) => void;
  onCreateProject?: () => void;
}

export function MobileNav({
  className,
  isOpen,
  onClose,
  currentSessionTitle,
  currentSessionId,
  projects = [],
  onProjectChange,
  onCreateProject,
}: MobileNavProps) {
  const selectedNovelId = useAppStore((state) => state.selectedNovelId);
  const setSelectedNovelId = useAppStore((state) => state.setSelectedNovelId);
  const [novels, setNovels] = React.useState<Novel[]>([]);

  React.useEffect(() => {
    if (!currentSessionId) {
      setNovels([]);
      return;
    }

    let cancelled = false;
    contentService.getNovels(currentSessionId).then((res) => {
      if (cancelled) {
        return;
      }
      setNovels(res.novels);
      if (res.novels.length === 1 && !selectedNovelId) {
        setSelectedNovelId(res.novels[0].id);
      }
    }).catch(() => {
      if (!cancelled) {
        setNovels([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentSessionId, selectedNovelId, setSelectedNovelId]);

  const novelOptions = React.useMemo(() => [{ id: '', title: '全部小说' }, ...novels], [novels]);

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={onClose}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          className={cn('fixed left-0 top-0 z-50 flex h-full w-80 flex-col bg-white shadow-xl', className)}
        >
          <DialogPrimitive.Title className="sr-only">移动端导航</DialogPrimitive.Title>
          <div className="flex items-center justify-between border-b border-gray-200 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">NovelForge</h2>
            </div>
            <DialogPrimitive.Close className="rounded-md p-2 transition-colors hover:bg-gray-100">
              <X className="h-5 w-5 text-gray-500" />
              <span className="sr-only">关闭菜单</span>
            </DialogPrimitive.Close>
          </div>

          <div className="space-y-3 border-b border-gray-200 p-4">
            {projects.length > 0 ? (
              <label className="block space-y-2">
                <span className="flex items-center gap-2 text-xs font-medium text-gray-500">
                  <FolderKanban className="h-4 w-4" />
                  当前项目
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={currentSessionId ?? ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value && onProjectChange) {
                        onProjectChange(value);
                        onClose();
                      }
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500"
                    aria-label="切换当前项目"
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </select>
                  {onCreateProject ? (
                    <button
                      type="button"
                      onClick={() => {
                        onCreateProject();
                        onClose();
                      }}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-700 transition-colors hover:bg-gray-100"
                      aria-label="新建项目"
                      title="新建项目"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </label>
            ) : currentSessionTitle ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                  <FolderKanban className="h-4 w-4" />
                  当前项目
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
                  {currentSessionTitle}
                </div>
              </div>
            ) : null}

            {currentSessionId && novels.length > 0 ? (
              <label className="block space-y-2">
                <span className="flex items-center gap-2 text-xs font-medium text-gray-500">
                  <Library className="h-4 w-4" />
                  当前小说
                </span>
                <select
                  value={selectedNovelId ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedNovelId(value || null);
                    onClose();
                  }}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500"
                  aria-label="切换当前小说"
                >
                  {novelOptions.map((novel) => (
                    <option key={novel.id} value={novel.id}>
                      {novel.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <nav className="flex-1 overflow-y-auto p-4">
            <AppSidebar
              isCollapsed={false}
              onNavigate={onClose}
              showBrand={false}
              className="border-0 bg-transparent"
            />
          </nav>

          <div className="border-t border-gray-200 p-4">
            <div className="text-sm text-gray-600">移动端导航已接入统一工作区与小说切换。</div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface MobileNavTriggerProps {
  className?: string;
  onClick: () => void;
  isOpen?: boolean;
}

export function MobileNavTrigger({ className, onClick, isOpen = false }: MobileNavTriggerProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500',
        className
      )}
      aria-label="打开菜单"
      aria-expanded={isOpen}
    >
      {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
    </button>
  );
}
