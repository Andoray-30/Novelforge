import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { AppBreadcrumb } from '@/components/layout/app-breadcrumb'
import { Container } from '@/components/layout/layout-utils'
import { Toaster } from '@/components/ui/toast'

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'NovelForge - AI故事创作助手',
  description: '基于AI的小说创作辅助工具，提供故事架构生成、角色设计、世界构建等功能',
  keywords: 'AI,小说创作,故事生成,角色设计,世界构建,NovelForge',
  authors: [{ name: 'NovelForge Team' }],
  viewport: 'width=device-width, initial-scale=1',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50 flex">
          {/* Sidebar - Hidden on mobile, visible on desktop */}
          <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0">
            <AppSidebar />
          </div>

          {/* Main content area */}
          <div className="flex-1 flex flex-col lg:ml-64">
            {/* Header */}
            <AppHeader 
              title="NovelForge"
              showMenuButton={true}
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
        </div>

        {/* Toast Notifications */}
        <Toaster />
      </body>
    </html>
  );
}