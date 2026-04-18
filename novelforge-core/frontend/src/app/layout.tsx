import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import './globals.css'

export const metadata: Metadata = {
  title: 'NovelForge - AI 小说工作区',
  description: '统一的 AI 小说规划、创作与项目资产管理工作区。',
  keywords: 'AI, 小说创作, 故事规划, NovelForge, 世界观, 角色设计',
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
