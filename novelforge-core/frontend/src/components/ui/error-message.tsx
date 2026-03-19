'use client'

import * as React from 'react'
import { Alert } from './alert'
import { Button } from './button'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface ErrorMessageProps {
  title: string
  message: string
  type?: 'error' | 'warning' | 'info'
  onRetry?: () => void
  showRetry?: boolean
  showDetails?: boolean
  details?: string
  className?: string
}

export function ErrorMessage({
  title,
  message,
  type = 'error',
  onRetry,
  showRetry = false,
  showDetails = false,
  details,
  className = ''
}: ErrorMessageProps) {
  const variant = type === 'error' ? 'destructive' : type === 'warning' ? 'warning' : 'default'
  
  return (
    <Alert variant={variant} className={className}>
      <AlertTriangle className="h-4 w-4" />
      <div className="flex-1">
        <strong>{title}</strong>
        <p className="text-sm mt-1">{message}</p>
        
        {showDetails && details && (
          <div className="mt-2 p-2 bg-gray-50 rounded text-xs font-mono max-h-32 overflow-y-auto">
            {details}
          </div>
        )}
      </div>
      
      {showRetry && onRetry && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onRetry}
          className="ml-4"
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          重试
        </Button>
      )}
    </Alert>
  )
}