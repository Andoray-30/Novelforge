import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'NovelForge - AI 小说创作工作区',
  description: '统一的 AI 小说规划、创作与项目资产管理工作区。',
  keywords: 'AI, 小说创作, 故事规划, NovelForge, 世界观, 角色设计',
};

const themeInitScript = `
try {
  var key = 'novelforge.theme';
  var queryTheme = new URLSearchParams(window.location.search).get('theme');
  var choice = queryTheme || localStorage.getItem(key) || 'system';
  if (choice !== 'system' && choice !== 'light' && choice !== 'dark') choice = 'system';
  var resolved = choice === 'system'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : choice;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeChoice = choice;
  document.documentElement.style.colorScheme = resolved;
} catch (_) {
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.dataset.themeChoice = 'system';
}
`.trim();

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
