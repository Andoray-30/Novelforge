'use client'

import { useState, useCallback } from 'react'
import { ApplicationError, ErrorCategory, ErrorSeverity } from '@/lib/error-handling/error-types'

interface UseErrorHandlerOptions {
  maxRetries?: number
  retryDelay?: number
  onError?: (error: ApplicationError) => void
}

export function useErrorHandler(options: UseErrorHandlerOptions = {}) {
  const [error, setError] = useState<ApplicationError | null>(null)
  const [isError, setIsError] = useState(false)

  const handleError = useCallback((error: any) => {
    const appError = error instanceof ApplicationError
      ? error
      : new ApplicationError(
          error?.message || 'Unknown error',
          ErrorCategory.UNKNOWN,
          ErrorSeverity.MEDIUM
        )

    setError(appError)
    setIsError(true)

    if (options.onError) {
      options.onError(appError)
    }
  }, [options])

  const clearError = useCallback(() => {
    setError(null)
    setIsError(false)
  }, [])

  const executeWithErrorHandling = useCallback(async <T>(
    operation: () => Promise<T>,
    context?: string
  ): Promise<T> => {
    try {
      const result = await operation()
      clearError()
      return result
    } catch (err) {
      handleError(err)
      throw err
    }
  }, [handleError, clearError])

  return {
    error,
    isError,
    handleError,
    clearError,
    executeWithErrorHandling
  }
}
