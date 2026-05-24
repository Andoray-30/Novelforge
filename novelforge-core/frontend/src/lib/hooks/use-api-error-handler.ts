'use client'

import { useState, useCallback } from 'react'
import { ApplicationError, ErrorCategory, ErrorSeverity } from '@/lib/error-handling/error-types'

interface UseAPIErrorHandlerOptions {
  endpoint?: string
  maxRetries?: number
  onError?: (error: ApplicationError) => void
}

export function useAPIErrorHandler(options: UseAPIErrorHandlerOptions = {}) {
  const [error, setError] = useState<ApplicationError | null>(null)
  const [isError, setIsError] = useState(false)

  const handleAPIError = useCallback((error: any) => {
    let category: ErrorCategory = ErrorCategory.SERVER
    let severity: ErrorSeverity = ErrorSeverity.HIGH

    // Classify errors by transport/status.
    if (error?.name === 'TypeError' && error.message.includes('fetch')) {
      category = ErrorCategory.NETWORK
      severity = ErrorSeverity.MEDIUM
    } else if (error?.status === 401) {
      category = ErrorCategory.UNAUTHORIZED
      severity = ErrorSeverity.MEDIUM
    } else if (error?.status === 403) {
      category = ErrorCategory.FORBIDDEN
      severity = ErrorSeverity.MEDIUM
    } else if (error?.status === 429) {
      category = ErrorCategory.API
      severity = ErrorSeverity.LOW
    } else if (error?.status >= 500) {
      category = ErrorCategory.SERVER
      severity = ErrorSeverity.HIGH
    } else if (error?.status >= 400) {
      category = ErrorCategory.API
      severity = ErrorSeverity.LOW
    }

    const appError = error instanceof ApplicationError
      ? error
      : new ApplicationError(
          error?.message || 'API 请求失败',
          category,
          severity,
          {
            code: error?.code,
            status: error?.status,
            details: error?.details,
            context: options.endpoint,
          }
        )

    setError(appError)
    setIsError(true)

    if (options.onError) {
      options.onError(appError)
    }
  }, [options])

  return {
    handleAPIError,
    error,
    isError
  }
}
