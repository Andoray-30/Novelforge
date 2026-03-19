import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X, Menu, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppSidebar, NavigationItem } from './app-sidebar'

export interface MobileNavProps {
  className?: string
  isOpen: boolean
  onClose: () => void
}

export function MobileNav({ className, isOpen, onClose }: MobileNavProps) {
  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={onClose}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className={cn(
          "fixed left-0 top-0 z-50 flex h-full w-80 flex-col bg-white shadow-xl",
          className
        )}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 bg-blue-600 rounded-lg">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">NovelForge</h2>
            </div>
            <DialogPrimitive.Close className="p-2 rounded-md hover:bg-gray-100 transition-colors">
              <X className="h-5 w-5 text-gray-500" />
              <span className="sr-only">关闭菜单</span>
            </DialogPrimitive.Close>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <AppSidebar isCollapsed={false} onToggle={onClose} />
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-gray-600">U</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">用户</p>
                <p className="text-xs text-gray-500 truncate">user@example.com</p>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export interface MobileNavTriggerProps {
  className?: string
  onClick: () => void
  isOpen?: boolean
}

export function MobileNavTrigger({ className, onClick, isOpen = false }: MobileNavTriggerProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500",
        className
      )}
      aria-label="打开菜单"
      aria-expanded={isOpen}
    >
      {isOpen ? (
        <X className="h-6 w-6" />
      ) : (
        <Menu className="h-6 w-6" />
      )}
    </button>
  )
}