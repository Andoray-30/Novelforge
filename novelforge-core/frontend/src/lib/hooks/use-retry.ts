'use client'

import { useState, useCallback, useMemo } from 'react'

interface RetryStrategy {
  maxRetries: number
  baseDelay: number
  backoffMultiplier: number
  jitter: boolean
}

interface RetryState {
  isRetrying: boolean
  attempt: number
  lastError: Error | null
}

interface UseRetryOptions {
  maxRetries?: number
  baseDelay?: number
  backoffMultiplier?: number
  jitter?: boolean
  onRetry?: (error: Error, attempt: number) => void
}

export function useRetry(options: UseRetryOptions = {}) {
  const strategy: RetryStrategy = useMemo(() => ({
    maxRetries: options.maxRetries ?? 3,
    baseDelay: options.baseDelay ?? 1000,
    backoffMultiplier: options.backoffMultiplier ?? 2,
    jitter: options.jitter ?? true
  }), [options.maxRetries, options.baseDelay, options.backoffMultiplier, options.jitter])

  const [retryState, setRetryState] = useState<RetryState>({
    isRetrying: false,
    attempt: 0,
    lastError: null
  })

  const executeWithRetry = useCallback(async <T>(
    operation: () => Promise<T>
  ): Promise<T> => {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= strategy.maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          // Calculate retry delay.
          let delay = strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attempt - 1)

          // Add jitter.
          if (strategy.jitter) {
            delay = delay * (0.5 + Math.random() * 0.5)
          }

          setRetryState({
            isRetrying: true,
            attempt,
            lastError
          })

          if (options.onRetry) {
            options.onRetry(lastError!, attempt)
          }

          await new Promise(resolve => setTimeout(resolve, delay))
        }

        const result = await operation()
        setRetryState({
          isRetrying: false,
          attempt: 0,
          lastError: null
        })
        return result

      } catch (error) {
        lastError = error as Error

        if (attempt === strategy.maxRetries) {
          setRetryState({
            isRetrying: false,
            attempt: 0,
            lastError
          })
          throw error
        }
      }
    }

    throw lastError || new Error('Max retries reached')
  }, [strategy, options])

  return {
    retryState,
    strategy,
    executeWithRetry
  }
}
