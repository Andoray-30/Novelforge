import * as React from 'react'
import { cn } from '@/lib/utils'

export interface AppFooterProps {
  className?: string
  showVersion?: boolean
  links?: Array<{
    title: string
    href: string
  }>
}

export function AppFooter({ 
  className, 
  showVersion = true,
  links = [
    { title: '关于我们', href: '/about' },
    { title: '文档', href: '/docs' },
    { title: 'GitHub', href: 'https://github.com/your-username/novelforge' },
    { title: '反馈', href: '/feedback' }
  ]
}: AppFooterProps) {
  return (
    <footer className={cn(
      "bg-white border-t border-gray-200",
      className
    )}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Brand Section */}
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center w-8 h-8 bg-blue-600 rounded-lg">
                  <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">NovelForge</h3>
              </div>
              <p className="text-gray-600 mb-4 max-w-md">
                AI驱动的故事创作辅助工具，帮助作者构建引人入胜的故事架构、设计鲜明的角色和创造丰富的世界观。
              </p>
              {showVersion && (
                <p className="text-sm text-gray-500">
                  版本 v1.0.0
                </p>
              )}
            </div>

            {/* Links Section */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">
                快速链接
              </h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-gray-600 hover:text-gray-900 transition-colors"
                      target={link.href.startsWith('http') ? '_blank' : undefined}
                      rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    >
                      {link.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Technology Section */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">
                技术栈
              </h4>
              <ul className="space-y-2 text-gray-600">
                <li>Next.js 15</li>
                <li>TypeScript</li>
                <li>Tailwind CSS</li>
                <li>FastAPI</li>
                <li>Radix UI</li>
              </ul>
            </div>
          </div>

          {/* Bottom Section */}
          <div className="mt-8 pt-8 border-t border-gray-200">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-sm text-gray-500">
                © 2024 NovelForge. 保留所有权利。
              </p>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>由 AI 和 ❤️ 驱动</span>
                <span>•</span>
                <span>开源项目</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}