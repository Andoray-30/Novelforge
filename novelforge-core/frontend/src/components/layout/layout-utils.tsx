import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ContainerProps {
  children: React.ReactNode
  className?: string
  size?: 'sm' | 'default' | 'lg' | 'xl' | 'full'
}

const containerSizes = {
  sm: 'max-w-2xl',
  default: 'max-w-4xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  full: 'max-w-full'
}

export function Container({ children, className, size = 'default' }: ContainerProps) {
  return (
    <div className={cn(
      'mx-auto px-4 sm:px-6 lg:px-8',
      containerSizes[size],
      className
    )}>
      {children}
    </div>
  )
}

export interface GridProps {
  children: React.ReactNode
  className?: string
  cols?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
  gap?: 'none' | 'sm' | 'default' | 'lg' | 'xl'
  responsive?: boolean
}

const gridGaps = {
  none: 'gap-0',
  sm: 'gap-2',
  default: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8'
}

export function Grid({ 
  children, 
  className, 
  cols = 1, 
  gap = 'default', 
  responsive = true 
}: GridProps) {
  const gridClass = responsive 
    ? `grid-cols-1 md:grid-cols-2 lg:grid-cols-${cols}`
    : `grid-cols-${cols}`

  return (
    <div className={cn(
      'grid',
      gridClass,
      gridGaps[gap],
      className
    )}>
      {children}
    </div>
  )
}

export interface FlexProps {
  children: React.ReactNode
  className?: string
  direction?: 'row' | 'col'
  align?: 'start' | 'center' | 'end' | 'stretch'
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'
  wrap?: boolean
  gap?: 'none' | 'sm' | 'default' | 'lg' | 'xl'
}

const flexAlign = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch'
}

const flexJustify = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly'
}

const flexGaps = {
  none: 'gap-0',
  sm: 'gap-2',
  default: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8'
}

export function Flex({ 
  children, 
  className, 
  direction = 'row', 
  align = 'stretch', 
  justify = 'start', 
  wrap = false, 
  gap = 'none' 
}: FlexProps) {
  return (
    <div className={cn(
      'flex',
      direction === 'col' ? 'flex-col' : 'flex-row',
      flexAlign[align],
      flexJustify[justify],
      wrap ? 'flex-wrap' : 'flex-nowrap',
      flexGaps[gap],
      className
    )}>
      {children}
    </div>
  )
}

export interface SpacerProps {
  size?: 'xs' | 'sm' | 'default' | 'lg' | 'xl' | '2xl'
  direction?: 'vertical' | 'horizontal'
  className?: string
}

const spacerSizes = {
  xs: 'h-1',
  sm: 'h-2',
  default: 'h-4',
  lg: 'h-6',
  xl: 'h-8',
  '2xl': 'h-12'
}

const horizontalSpacerSizes = {
  xs: 'w-1',
  sm: 'w-2',
  default: 'w-4',
  lg: 'w-6',
  xl: 'w-8',
  '2xl': 'w-12'
}

export function Spacer({ size = 'default', direction = 'vertical', className }: SpacerProps) {
  return (
    <div className={cn(
      direction === 'vertical' ? spacerSizes[size] : horizontalSpacerSizes[size],
      direction === 'horizontal' ? 'inline-block' : 'block',
      className
    )} />
  )
}