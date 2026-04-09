'use client';

import * as React from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Home } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BreadcrumbItem {
  title: string
  href: string
  icon?: React.ComponentType<{ className?: string }>
}

export interface AppBreadcrumbProps {
  className?: string
  items?: BreadcrumbItem[]
  homeLabel?: string
  showHome?: boolean
}

export function AppBreadcrumb({ 
  className, 
  items = [], 
  homeLabel = '首页',
  showHome = true 
}: AppBreadcrumbProps) {
  const pathname = usePathname()
  
  // Generate breadcrumb items from current path if not provided
  const breadcrumbItems = React.useMemo(() => {
    if (items.length > 0) return items
    
    if (!pathname || pathname === '/') return []
    
    const segments = pathname.split('/').filter(Boolean)
    const generatedItems: BreadcrumbItem[] = []
    
    if (showHome) {
      generatedItems.push({
        title: homeLabel,
        href: '/',
        icon: Home
      })
    }
    
    let currentPath = ''
    segments.forEach((segment, index) => {
      currentPath += `/${segment}`
      const title = segment
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
      
      generatedItems.push({
        title,
        href: currentPath
      })
    })
    
    return generatedItems
  }, [pathname, items, homeLabel, showHome])
  
  if (breadcrumbItems.length === 0) return null
  
  return (
    <nav className={cn("flex", className)} aria-label="面包屑导航">
      <ol className="flex items-center space-x-1 text-sm">
        {breadcrumbItems.map((item, index) => {
          const isLast = index === breadcrumbItems.length - 1
          const Icon = item.icon
          
          return (
            <React.Fragment key={item.href}>
              <li className="flex items-center">
                {Icon && (
                  <Icon className="h-4 w-4 mr-1" />
                )}
                {isLast ? (
                  <span className="text-gray-900 font-medium">
                    {item.title}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    className="text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {item.title}
                  </Link>
                )}
              </li>
              {!isLast && (
                <li className="text-gray-400">
                  /
                </li>
              )}
            </React.Fragment>
          )
        })}
      </ol>
    </nav>
  )
}