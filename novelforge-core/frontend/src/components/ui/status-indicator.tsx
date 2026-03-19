'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const statusIndicatorVariants = cva(
  'inline-flex items-center justify-center rounded-full',
  {
    variants: {
      variant: {
        default: 'bg-gray-500',
        primary: 'bg-blue-500',
        success: 'bg-green-500',
        warning: 'bg-yellow-500',
        destructive: 'bg-red-500',
        info: 'bg-blue-400',
      },
      size: {
        sm: 'h-2 w-2',
        default: 'h-3 w-3',
        lg: 'h-4 w-4',
      },
      animated: {
        true: 'animate-pulse',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      animated: false,
    },
  }
)

export interface StatusIndicatorProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statusIndicatorVariants> {
  label?: string
  pulse?: boolean
}

const StatusIndicator = React.forwardRef<HTMLDivElement, StatusIndicatorProps>(
  ({ className, variant, size, animated, pulse = false, label, ...props }, ref) => {
    const finalAnimated = animated || pulse
    
    return (
      <div className="inline-flex items-center gap-2">
        <div
          ref={ref}
          className={cn(
            statusIndicatorVariants({ variant, size, animated: finalAnimated }),
            className
          )}
          {...props}
        />
        {label && (
          <span className={cn(
            'text-sm font-medium',
            variant === 'default' && 'text-gray-700',
            variant === 'primary' && 'text-blue-700',
            variant === 'success' && 'text-green-700',
            variant === 'warning' && 'text-yellow-700',
            variant === 'destructive' && 'text-red-700',
            variant === 'info' && 'text-blue-600'
          )}>
            {label}
          </span>
        )}
      </div>
    )
  }
)
StatusIndicator.displayName = 'StatusIndicator'

export { StatusIndicator, statusIndicatorVariants }