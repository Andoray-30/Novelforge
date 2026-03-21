import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NovelForge — AI 小说设计师',
  description: '通过与 AI 智能体对话，协作设计你的小说世界。角色、世界观、时间线，一切由对话驱动。',
  keywords: 'AI,小说创作,对话创作,NovelForge,角色设计,世界观',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}