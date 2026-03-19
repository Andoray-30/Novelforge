'use client'

import * as React from 'react'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { AppBreadcrumb } from '@/components/layout/app-breadcrumb'
import { Container } from '@/components/layout/layout-utils'
import { Toaster } from '@/components/ui/toast'
import { MobileNav } from '@/components/layout/mobile-nav'

export interface MainLayoutProps {
  children: React.ReactNode
  sidebar: React.ReactNode
}

export function MainLayout({ children, sidebar }: MainLayoutProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = React.useState(false)

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile Navigation */}
      <MobileNav 
        isOpen={isMobileNavOpen} 
        onClose={() => setIsMobileNavOpen(false)} 
      />

      {/* Sidebar - Hidden on mobile, visible on desktop */}
      <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0">
        {sidebar}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col lg:ml-64">
        {/* Header */}
        <AppHeader 
          title="NovelForge"
          showMenuButton={true}
          onMenuClick={() => setIsMobileNavOpen(true)}
        />

        {/* Main Content */}
        <main className="flex-1">
          <Container className="py-6">
            {/* Breadcrumb */}
            <AppBreadcrumb className="mb-6" />
            
            {/* Page Content */}
            {children}
          </Container>
        </main>

        {/* Footer */}
        <AppFooter />
      </div>

      {/* Toast Notifications */}
      <Toaster />
    </div>
  )
}