import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppErrorBoundary } from '@/components/error/error-boundary'
import { APIErrorHandler, useAPIErrorHandler } from '@/components/error/api-error-handler'
import { ErrorMessage, APIErrorMessage, ValidationErrorMessage } from '@/components/error/error-message'
import { RetryIndicator, useRetry } from '@/components/error/retry-indicator'
import { ApplicationError, ErrorCategory, ErrorSeverity } from '@/lib/error-handling/error-types'
import React from 'react'

// 测试工具函数
const createTestError = (message = 'Test error', status?: number) => {
  return new ApplicationError(message, {
    status,
    category: status ? ErrorCategory.SERVER : ErrorCategory.UNKNOWN,
    severity: ErrorSeverity.MEDIUM
  })
}

describe('Error Boundary', () => {
  it('should catch and display component errors', () => {
    const ThrowError = () => {
      throw new Error('Component error')
    }

    render(
      <AppErrorBoundary>
        <ThrowError />
      </AppErrorBoundary>
    )

    expect(screen.getByText('应用出现错误')).toBeInTheDocument()
    expect(screen.getByText('Component error')).toBeInTheDocument()
  })

  it('should reset error state on retry', () => {
    let shouldThrow = true
    const ThrowError = () => {
      if (shouldThrow) {
        shouldThrow = false
        throw new Error('Component error')
      }
      return <div>Component working</div>
    }

    const { rerender } = render(
      <AppErrorBoundary>
        <ThrowError />
      </AppErrorBoundary>
    )

    expect(screen.getByText('应用出现错误')).toBeInTheDocument()

    // 点击重试按钮
    const retryButton = screen.getByRole('button', { name: /重试/i })
    fireEvent.click(retryButton)

    // 重新渲染以触发组件重新挂载
    rerender(
      <AppErrorBoundary>
        <ThrowError />
      </AppErrorBoundary>
    )

    expect(screen.getByText('Component working')).toBeInTheDocument()
  })
})

describe('API Error Handler', () => {
  it('should display API error with correct status', () => {
    const error = {
      message: 'Server error',
      status: 500
    }

    render(
      <APIErrorHandler
        error={error}
        onRetry={vi.fn()}
        retryCount={0}
        maxRetries={3}
      />
    )

    expect(screen.getByText('服务器内部错误')).toBeInTheDocument()
    expect(screen.getByText('Server error')).toBeInTheDocument()
  })

  it('should show retry button when retryable', () => {
    const error = {
      message: 'Network error',
      status: 503
    }

    render(
      <APIErrorHandler
        error={error}
        onRetry={vi.fn()}
        retryCount={0}
        maxRetries={3}
      />
    )

    expect(screen.getByRole('button', { name: /重试/i })).toBeInTheDocument()
  })

  it('should show max retries message when limit reached', () => {
    const error = {
      message: 'Network error',
      status: 503
    }

    render(
      <APIErrorHandler
        error={error}
        onRetry={vi.fn()}
        retryCount={3}
        maxRetries={3}
      />
    )

    expect(screen.getByText('重试次数已达上限')).toBeInTheDocument()
  })
})

describe('Error Message', () => {
  it('should render error message with title and content', () => {
    render(
      <ErrorMessage
        title="Test Error"
        message="This is a test error message"
        type="error"
      />
    )

    expect(screen.getByText('Test Error')).toBeInTheDocument()
    expect(screen.getByText('This is a test error message')).toBeInTheDocument()
  })

  it('should render compact error message', () => {
    render(
      <ErrorMessage
        title="Test Error"
        message="This is a test error message"
        type="error"
        compact={true}
      />
    )

    expect(screen.getByText('Test Error')).toBeInTheDocument()
    expect(screen.getByText('This is a test error message')).toBeInTheDocument()
  })

  it('should call onRetry when retry button is clicked', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    render(
      <ErrorMessage
        title="Test Error"
        message="This is a test error message"
        type="error"
        onRetry={onRetry}
      />
    )

    const retryButton = screen.getByRole('button', { name: /重试/i })
    await user.click(retryButton)

    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('Validation Error Message', () => {
  it('should render validation errors', () => {
    const errors = {
      username: '用户名不能为空',
      email: '邮箱格式不正确'
    }

    render(
      <ValidationErrorMessage
        errors={errors}
        onFieldClick={vi.fn()}
      />
    )

    expect(screen.getByText('表单包含 2 个错误')).toBeInTheDocument()
    expect(screen.getByText('用户名: 用户名不能为空')).toBeInTheDocument()
    expect(screen.getByText('邮箱: 邮箱格式不正确')).toBeInTheDocument()
  })

  it('should call onFieldClick when error is clicked', async () => {
    const user = userEvent.setup()
    const onFieldClick = vi.fn()

    const errors = {
      username: '用户名不能为空'
    }

    render(
      <ValidationErrorMessage
        errors={errors}
        onFieldClick={onFieldClick}
      />
    )

    const errorElement = screen.getByText('用户名: 用户名不能为空')
    await user.click(errorElement)

    expect(onFieldClick).toHaveBeenCalledWith('username')
  })
})

describe('Retry Hook', () => {
  it('should retry operation on failure', async () => {
    const { result } = renderHook(() => useRetry({
      maxRetries: 2,
      baseDelay: 100,
      backoffMultiplier: 2
    }))

    let attempt = 0
    const operation = vi.fn().mockImplementation(async () => {
      attempt++
      if (attempt < 3) throw new Error('Test error')
      return 'success'
    })

    const retryResult = await result.current.executeWithRetry(operation)

    expect(retryResult).toBe('success')
    expect(operation).toHaveBeenCalledTimes(3)
    expect(result.current.retryState.attempt).toBe(2)
  })

  it('should use exponential backoff', async () => {
    const { result } = renderHook(() => useRetry({
      maxRetries: 3,
      baseDelay: 100,
      backoffMultiplier: 2
    }))

    const delays: number[] = []
    const originalSetTimeout = global.setTimeout
    
    global.setTimeout = vi.fn((callback, delay) => {
      if (delay) delays.push(delay)
      return originalSetTimeout(callback, 0) // 立即执行以加快测试
    })

    const operation = vi.fn().mockRejectedValue(new Error('Test error'))

    try {
      await result.current.executeWithRetry(operation)
    } catch {
      // 预期会失败
    }

    // 验证退避策略
    expect(delays[0]).toBe(100)   // 第一次重试：100ms
    expect(delays[1]).toBe(200)   // 第二次重试：100 * 2 = 200ms
    expect(delays[2]).toBe(400)   // 第三次重试：200 * 2 = 400ms

    global.setTimeout = originalSetTimeout
  })
})

describe('Error Handling Hooks', () => {
  it('should handle errors with useErrorHandler', async () => {
    const { result } = renderHook(() => useErrorHandler({
      maxRetries: 2,
      retryDelay: 100
    }))

    const testError = new Error('Test error')
    const handledError = result.current.handleError(testError, 'Test context')

    expect(result.current.error).toBe(handledError)
    expect(result.current.isError).toBe(true)
    expect(handledError.message).toBe('Test error')
    expect(handledError.context).toBe('Test context')
  })

  it('should execute operations with error handling', async () => {
    const { result } = renderHook(() => useErrorHandler())

    const operation = vi.fn().mockResolvedValue('success')
    const successResult = await result.current.executeWithErrorHandling(operation, 'Test')

    expect(successResult).toBe('success')
    expect(result.current.error).toBe(null)
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('should handle operation failures', async () => {
    const { result } = renderHook(() => useErrorHandler())

    const operation = vi.fn().mockRejectedValue(new Error('Operation failed'))
    
    try {
      await result.current.executeWithErrorHandling(operation, 'Test')
    } catch (error) {
      expect(result.current.error).toBe(error)
      expect(result.current.isError).toBe(true)
    }
  })

  it('should handle API errors with useAPIError', async () => {
    const { result } = renderHook(() => useAPIError({
      endpoint: '/api/test'
    }))

    const apiError = {
      response: {
        status: 500,
        statusText: 'Internal Server Error',
        data: { message: 'Server error' }
      }
    }

    const handledError = result.current.handleAPIError(apiError, 'API test')

    expect(result.current.error).toBe(handledError)
    expect(handledError.status).toBe(500)
    expect(handledError.message).toBe('Server error')
  })

  it('should handle form errors with useFormError', async () => {
    const { result } = renderHook(() => useFormError({
      formName: 'test-form'
    }))

    const validationError = {
      name: 'ValidationError',
      errors: {
        username: 'Username is required',
        email: 'Email is invalid'
      }
    }

    const handledError = result.current.handleFormError(validationError)

    expect(result.current.error).toBe(handledError)
    expect(handledError.category).toBe(ErrorCategory.VALIDATION)
    expect(handledError.details).toEqual({
      username: 'Username is required',
      email: 'Email is invalid'
    })
  })
})

describe('Error Recovery', () => {
  it('should recover from errors', async () => {
    const { result } = renderHook(() => useErrorRecovery({
      maxRetries: 2,
      retryDelay: 100,
      backoffMultiplier: 2
    }))

    let attempt = 0
    const recoveryOperation = vi.fn().mockImplementation(async () => {
      attempt++
      if (attempt < 2) throw new Error('Recovery failed')
      return 'recovered'
    })

    const error = new ApplicationError('Initial error')
    const success = await result.current.recover(recoveryOperation, error)

    expect(success).toBe(true)
    expect(recoveryOperation).toHaveBeenCalledTimes(2)
  })

  it('should fail after max retries', async () => {
    const { result } = renderHook(() => useErrorRecovery({
      maxRetries: 2,
      retryDelay: 100
    }))

    const recoveryOperation = vi.fn().mockRejectedValue(new Error('Always fails'))
    const error = new ApplicationError('Initial error')
    const onMaxRetriesReached = vi.fn()

    result.current.recoveryState.onMaxRetriesReached = onMaxRetriesReached

    const success = await result.current.recover(recoveryOperation, error)

    expect(success).toBe(false)
    expect(recoveryOperation).toHaveBeenCalledTimes(2)
    expect(onMaxRetriesReached).toHaveBeenCalled()
  })
})

describe('Error Types and Utilities', () => {
  it('should categorize errors correctly', () => {
    const networkError = { name: 'TypeError', message: 'fetch failed' }
    const validationError = { name: 'ValidationError', message: 'Invalid data' }
    const serverError = { status: 500, message: 'Server error' }

    expect(categorizeError(networkError)).toBe(ErrorCategory.NETWORK)
    expect(categorizeError(validationError)).toBe(ErrorCategory.VALIDATION)
    expect(categorizeError(serverError)).toBe(ErrorCategory.SERVER)
  })

  it('should assess error severity correctly', () => {
    const criticalError = { status: 500 }
    const mediumError = { status: 401 }
    const lowError = { status: 400 }

    expect(assessErrorSeverity(criticalError)).toBe(ErrorSeverity.HIGH)
    expect(assessErrorSeverity(mediumError)).toBe(ErrorSeverity.MEDIUM)
    expect(assessErrorSeverity(lowError)).toBe(ErrorSeverity.LOW)
  })

  it('should create error reports', () => {
    const error = new ApplicationError('Test error', {
      status: 500,
      code: 'TEST_ERROR',
      context: 'Test context'
    })

    const report = createErrorReport(error)

    expect(report.message).toBe('Test error')
    expect(report.status).toBe(500)
    expect(report.code).toBe('TEST_ERROR')
    expect(report.context).toBe('Test context')
    expect(report.url).toBe(window.location.href)
    expect(report.userAgent).toBe(navigator.userAgent)
    expect(report.appVersion).toBeDefined()
    expect(report.environment).toBeDefined()
  })
})

// 集成测试
describe('Integration Tests', () => {
  it('should handle complete error flow', async () => {
    const user = userEvent.setup()
    
    // 渲染包含错误边界的组件
    const ThrowError = () => {
      throw new Error('Integration test error')
    }

    render(
      <AppErrorBoundary>
        <ThrowError />
      </AppErrorBoundary>
    )

    // 验证错误显示
    expect(screen.getByText('应用出现错误')).toBeInTheDocument()
    expect(screen.getByText('Integration test error')).toBeInTheDocument()

    // 测试错误报告功能
    const reportButton = screen.getByRole('button', { name: /报告错误/i })
    await user.click(reportButton)

    // 验证报告状态
    await waitFor(() => {
      expect(screen.getByText('错误报告已发送')).toBeInTheDocument()
    })
  })

  it('should handle API retry flow', async () => {
    const onRetry = vi.fn().mockResolvedValue('success')
    const error = {
      message: 'Network error',
      status: 503
    }

    const { rerender } = render(
      <APIErrorHandler
        error={error}
        onRetry={onRetry}
        retryCount={0}
        maxRetries={3}
      />
    )

    // 初始状态显示重试按钮
    const retryButton = screen.getByRole('button', { name: /重试/i })
    expect(retryButton).toBeInTheDocument()

    // 模拟重试成功
    await userEvent.click(retryButton)
    expect(onRetry).toHaveBeenCalledTimes(1)

    // 模拟重试失败并达到最大重试次数
    rerender(
      <APIErrorHandler
        error={error}
        onRetry={onRetry}
        retryCount={3}
        maxRetries={3}
      />
    )

    expect(screen.getByText('重试次数已达上限')).toBeInTheDocument()
  })
})