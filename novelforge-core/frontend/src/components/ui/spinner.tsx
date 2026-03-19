import * as React from 'react'
import { cn } from '@/lib/utils'

const SpinnerVariants = {
  default: 'border-gray-300 border-t-blue-600',
  primary: 'border-gray-300 border-t-blue-600',
  secondary: 'border-gray-300 border-t-gray-600',
  destructive: 'border-gray-300 border-t-red-600',
  success: 'border-gray-300 border-t-green-600',
}

const SpinnerSizes = {
  sm: 'h-4 w-4 border-2',
  default: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[3px]',
  xl: 'h-12 w-12 border-[3px]',
}

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: keyof typeof SpinnerSizes
  variant?: keyof typeof SpinnerVariants
  label?: string
}

const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, size = 'default', variant = 'default', label, ...props }, ref) => {
    return (
      <div className="flex items-center gap-2">
        <div
          ref={ref}
          className={cn(
            'animate-spin rounded-full',
            SpinnerSizes[size],
            SpinnerVariants[variant],
            className
          )}
          {...props}
        />
        {label && (
          <span className="text-sm text-gray-600">{label}</span>
        )}
      </div>
    )
  }
)
Spinner.displayName = "Spinner"

export { Spinner }