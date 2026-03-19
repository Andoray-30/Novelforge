'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const progressVariants = cva(
  'w-full bg-gray-200 rounded-full overflow-hidden',
  {
    variants: {
      size: {
        sm: 'h-1',
        default: 'h-2',
        lg: 'h-4',
      },
      color: {
        default: 'bg-gray-200',
        primary: 'bg-blue-100',
        success: 'bg-green-100',
        warning: 'bg-yellow-100',
        destructive: 'bg-red-100',
      },
    },
    defaultVariants: {
      size: 'default',
      color: 'default',
    },
  }
)

const progressBarVariants = cva(
  'h-full transition-all duration-300 ease-out',
  {
    variants: {
      color: {
        default: 'bg-gray-600',
        primary: 'bg-blue-600',
        success: 'bg-green-600',
        warning: 'bg-yellow-600',
        destructive: 'bg-red-600',
      },
      animated: {
        true: 'animate-pulse',
        false: '',
      },
    },
    defaultVariants: {
      color: 'primary',
      animated: false,
    },
  }
)

export interface ProgressProps
  extends React.HTMLAttributes<HTMLDivElement> {
  value: number
  max?: number
  showLabel?: boolean
  animated?: boolean
  size?: 'sm' | 'default' | 'lg'
  color?: 'default' | 'primary' | 'success' | 'warning' | 'destructive'
  barColor?: 'default' | 'primary' | 'success' | 'warning' | 'destructive'
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ 
    className, 
    value, 
    max = 100, 
    size, 
    color, 
    showLabel = false,
    animated = false,
    barColor,
    ...props 
  }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
    
    return (
      <div className="space-y-2">
        <div
          ref={ref}
          className={cn(progressVariants({ size, color }), className)}
          {...props}
        >
          <div
            className={cn(progressBarVariants({ color: barColor, animated }))}
            style={{ width: `${percentage}%` }}
          />
        </div>
        
        {showLabel && (
          <div className="flex justify-between text-xs text-gray-600">
            <span>{value}</span>
            <span>{max}</span>
          </div>
        )}
      </div>
    )
  }
)
Progress.displayName = 'Progress'

export { Progress }