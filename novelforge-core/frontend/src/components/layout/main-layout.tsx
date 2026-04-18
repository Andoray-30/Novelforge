'use client'

import * as React from 'react'
import { AppHeader } from '@/components/layout/app-header'
import { MobileNav } from '@/components/layout/mobile-nav'
import { Toaster } from '@/components/ui/toast'
import { TaskCenter } from './TaskCenter'

export interface MainLayoutProps {
  children: React.ReactNode
  sidebar: React.ReactNode
  title?: string
  description?: string
  currentSessionTitle?: string | null
  currentSessionId?: string | null
  projects?: Array<{ id: string; title: string }>
  onProjectChange?: (id: string) => void
  onCreateProject?: () => void
  actions?: React.ReactNode
  contentOverflow?: 'auto' | 'hidden'
}

export function MainLayout({
  children,
  sidebar,
  title,
  description,
  currentSessionTitle,
  currentSessionId,
  projects,
  onProjectChange,
  onCreateProject,
  actions,
  contentOverflow = 'auto',
}: MainLayoutProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = React.useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
      <MobileNav
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
      />

      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        {sidebar}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:ml-64">
        <AppHeader
          title={title}
          description={description}
          currentSessionTitle={currentSessionTitle}
          currentSessionId={currentSessionId}
          projects={projects}
          onProjectChange={onProjectChange}
          onCreateProject={onCreateProject}
          actions={actions}
          showMenuButton
          onMenuClick={() => setIsMobileNavOpen(true)}
        />
        <main
          className="flex-1 min-h-0"
          style={{ overflowY: contentOverflow, overflowX: 'hidden' }}
        >
          {children}
        </main>
      </div>

      <Toaster />
      <TaskCenter />
    </div>
  )
}
