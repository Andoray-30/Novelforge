import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, Menu, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppSidebar } from './app-sidebar';

export interface MobileNavProps {
  className?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function MobileNav({ className, isOpen, onClose }: MobileNavProps) {
  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={onClose}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          className={cn('fixed left-0 top-0 z-50 flex h-full w-80 flex-col bg-white shadow-xl', className)}
        >
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

          <nav className="flex-1 overflow-y-auto p-4">
            <AppSidebar
              isCollapsed={false}
              onNavigate={onClose}
              showBrand={false}
              className="border-0 bg-transparent"
            />
          </nav>

          <div className="border-t border-gray-200 p-4">
            <div className="text-sm text-gray-600">移动端导航已接入统一工作区。</div>
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
