# NovelForge Error Handling & Recovery System

完整的错误处理、恢复和重试系统，提供企业级的错误管理能力。

## 🚀 核心特性

- **🛡️ 错误边界** - React错误边界捕获组件级错误
- **🔄 智能重试** - 指数退避重试策略，支持网络错误恢复
- **📊 错误分类** - 自动错误分类和严重程度评估
- **💾 错误恢复** - 自动错误恢复和状态管理
- **📈 错误报告** - 错误收集和报告机制
- **🎯 用户友好** - 用户友好的错误消息显示
- **♿ 无障碍** - 完整的ARIA支持和键盘导航

## 📦 核心组件

### 1. 错误边界 (Error Boundary)

```tsx
import { AppErrorBoundary, withErrorBoundary } from '@/components/error'

// 基础错误边界
<AppErrorBoundary>
  <YourComponent />
</AppErrorBoundary>

// 带自定义回退的组件
const SafeComponent = withErrorBoundary(YourComponent, {
  fallback: ({ error, errorInfo, reset }) => (
    <div>
      <h2>组件出错啦！</h2>
      <button onClick={reset}>重试</button>
    </div>
  ),
  onError: (error, errorInfo) => {
    console.error('Component error:', error)
  }
})
```

### 2. API错误处理

```tsx
import { APIErrorHandler, useAPIErrorHandler } from '@/components/error'

// 组件内使用
const { handleAPIError, retryCount, isRetrying } = useAPIErrorHandler({
  maxRetries: 3,
  retryDelay: 1000
})

// 处理API错误
try {
  await fetchData()
} catch (error) {
  handleAPIError(error, '数据获取失败')
}

// 渲染错误组件
<APIErrorHandler
  error={apiError}
  onRetry={retryFetch}
  retryCount={retryCount}
  maxRetries={3}
/>
```

### 3. 错误消息组件

```tsx
import { ErrorMessage, APIErrorMessage, ValidationErrorMessage } from '@/components/error'

// 通用错误消息
<ErrorMessage
  title="操作失败"
  message="无法完成请求，请稍后重试"
  type="error"
  onRetry={handleRetry}
  onClose={handleClose}
  showDetails={true}
/>

// API错误消息
<APIErrorMessage
  error={{ message: '服务器错误', status: 500 }}
  onRetry={retryRequest}
  retryCount={2}
  maxRetries={3}
/>

// 验证错误消息
<ValidationErrorMessage
  errors={{ username: '用户名已存在', email: '邮箱格式不正确' }}
  onFieldClick={scrollToField}
/>
```

### 4. 重试指示器

```tsx
import { RetryIndicator, useRetry } from '@/components/error'

// 使用重试Hook
const { retryState, strategy, executeWithRetry } = useRetry({
  maxRetries: 3,
  baseDelay: 1000,
  backoffMultiplier: 2,
  jitter: true
})

// 执行带重试的操作
const result = await executeWithRetry(async () => {
  return await fetchData()
}, (error, attempt) => {
  console.log(`Retry attempt ${attempt} failed:`, error)
})

// 渲染重试指示器
<RetryIndicator
  retryState={retryState}
  strategy={strategy}
  onRetry={manualRetry}
  onCancel={cancelRetry}
  autoRetry={true}
/>
```

## 🔧 错误处理Hook

### 基础错误处理

```tsx
import { useErrorHandler } from '@/lib/hooks/use-error-handling'

const { 
  error, 
  isError, 
  isRetrying, 
  retryCount,
  handleError, 
  clearError, 
  retry, 
  executeWithErrorHandling 
} = useErrorHandler({
  maxRetries: 3,
  retryDelay: 1000,
  onError: (error) => {
    console.log('Error occurred:', error)
  },
  onRetry: (error, attempt) => {
    console.log(`Retry attempt ${attempt} for error:`, error)
  }
})

// 执行带错误处理的操作
const result = await executeWithErrorHandling(async () => {
  return await riskyOperation()
}, 'Operation context')

// 手动处理错误
try {
  await someOperation()
} catch (error) {
  handleError(error, 'Custom context')
}
```

### API错误处理

```tsx
import { useAPIError } from '@/lib/hooks/use-error-handling'

const { handleAPIError, error, isError, isRetrying } = useAPIError({
  endpoint: '/api/story-outline',
  maxRetries: 3,
  onError: (error) => {
    // 自定义错误处理
  }
})

// 处理API响应错误
try {
  const response = await fetch('/api/data')
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return await response.json()
} catch (error) {
  handleAPIError(error, '数据获取失败')
}
```

### 表单错误处理

```tsx
import { useFormError } from '@/lib/hooks/use-error-handling'

const { handleFormError, error, isError } = useFormError({
  formName: 'story-outline-form',
  onError: (error) => {
    // 处理表单验证错误
  }
})

// 处理表单提交错误
try {
  await submitForm(data)
} catch (error) {
  handleFormError(error, '表单提交')
}
```

### 错误恢复

```tsx
import { useErrorRecovery } from '@/lib/hooks/use-error-handling'

const { recoveryState, recover } = useErrorRecovery({
  maxRetries: 3,
  retryDelay: 2000,
  backoffMultiplier: 2,
  onRetry: (error, attempt) => {
    console.log(`Recovery attempt ${attempt} for:`, error)
  },
  onMaxRetriesReached: (error) => {
    console.log('Max retries reached for:', error)
  }
})

// 执行错误恢复
const success = await recover(async () => {
  // 恢复操作
  await recoverData()
}, error)
```

## 📋 错误类型系统

### 错误分类

```ts
import { ErrorCategory, ErrorSeverity, ApplicationError } from '@/lib/error-handling/error-types'

// 创建分类错误
const error = new ApplicationError('网络请求失败', {
  category: ErrorCategory.NETWORK,
  severity: ErrorSeverity.MEDIUM,
  status: 503,
  retryable: true
})

// 自动分类
const category = categorizeError(error)
const severity = assessErrorSeverity(error)
```

### 自定义错误类型

```ts
export class ValidationError extends ApplicationError {
  constructor(message: string, field: string, details?: any) {
    super(message, {
      code: 'VALIDATION_ERROR',
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.LOW,
      details: { field, ...details },
      context: `Field validation failed: ${field}`
    })
  }
}

export class NetworkError extends ApplicationError {
  constructor(message: string, status?: number) {
    super(message, {
      code: 'NETWORK_ERROR',
      status,
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.MEDIUM,
      retryable: true
    })
  }
}
```

## 🔄 重试策略

### 指数退避重试

```ts
const retryStrategy = {
  maxRetries: 5,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true // 添加随机性避免重试风暴
}

const { executeWithRetry } = useRetry(retryStrategy)

const result = await executeWithRetry(async () => {
  return await fetchData()
}, (error, attempt) => {
  console.log(`Retry attempt ${attempt} failed:`, error)
})
```

### 错误恢复管理器

```ts
const recoveryManager = new ErrorRecoveryManager({
  maxRetries: 3,
  retryDelay: 1000,
  backoffMultiplier: 2
})

const result = await recoveryManager.executeWithRecovery(async () => {
  return await criticalOperation()
}, 'Critical operation context')
```

## 📊 错误报告和监控

### 错误报告

```ts
const errorReport = createErrorReport(appError)
console.log('Error Report:', errorReport)

// 发送到后端
await fetch('/api/errors', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(errorReport)
})
```

### 错误统计

```ts
const stats = ErrorHandlingUtils.getErrorStats()
console.log('Error Statistics:', stats)

// 日志记录
ErrorHandlingUtils.logError(error, 'Operation context')
```

## 🎨 自定义错误UI

### 自定义错误回退

```tsx
function CustomErrorFallback({ error, errorInfo, reset }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>😅 出错了！</CardTitle>
          <CardDescription>别担心，我们正在处理这个问题</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">{error.message}</p>
          <div className="flex gap-2">
            <Button onClick={reset}>重试</Button>
            <Button variant="outline" onClick={() => window.location.href = '/'}>
              返回首页
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// 使用自定义回退
<AppErrorBoundary fallback={CustomErrorFallback}>
  <YourComponent />
</AppErrorBoundary>
```

### 主题化错误消息

```tsx
<ErrorMessage
  title="操作失败"
  message="无法完成请求"
  type="error"
  className="border-red-500 bg-red-50 dark:bg-red-900 dark:border-red-700"
  showDetails={true}
/>
```

## ⚡ 性能优化

### 错误边界优化

```tsx
// 避免不必要的重渲染
const ErrorBoundaryComponent = React.memo(({ children }) => {
  return (
    <AppErrorBoundary>
      {children}
    </AppErrorBoundary>
  )
})

// 只在必要时显示错误边界
const ConditionalErrorBoundary = ({ children, enableBoundary }) => {
  if (!enableBoundary) return children
  
  return (
    <AppErrorBoundary>
      {children}
    </AppErrorBoundary>
  )
}
```

### 错误处理性能

```ts
// 防抖错误处理
const debouncedErrorHandler = debounce((error) => {
  handleError(error)
}, 300)

// 批量错误处理
const handleErrors = (errors: any[]) => {
  errors.forEach(error => {
    const enhancedError = globalErrorHandler.handleError(error)
    // 批量处理
  })
}
```

## 🧪 测试

### 错误边界测试

```tsx
import { render, screen } from '@testing-library/react'
import { AppErrorBoundary } from '@/components/error'

test('error boundary catches errors', () => {
  const ThrowError = () => {
    throw new Error('Test error')
  }

  render(
    <AppErrorBoundary>
      <ThrowError />
    </AppErrorBoundary>
  )

  expect(screen.getByText('应用出现错误')).toBeInTheDocument()
})
```

### 重试逻辑测试

```tsx
import { renderHook, act } from '@testing-library/react'
import { useRetry } from '@/components/error'

test('retry hook works correctly', async () => {
  const { result } = renderHook(() => useRetry({ maxRetries: 2 }))
  
  let attempt = 0
  const operation = jest.fn().mockImplementation(() => {
    attempt++
    if (attempt < 3) throw new Error('Test error')
    return 'success'
  })
  
  const result = await result.current.executeWithRetry(operation)
  
  expect(result).toBe('success')
  expect(operation).toHaveBeenCalledTimes(3)
  expect(result.current.retryState.attempt).toBe(2)
})
```

## 📚 最佳实践

### 1. 错误处理层次

```tsx
// 应用级别错误边界
<AppErrorBoundary>
  <App />
</AppErrorBoundary>

// 页面级别错误边界
const Page = withErrorBoundary(PageComponent, {
  fallback: PageErrorFallback
})

// 组件级别错误边界
const Component = withErrorBoundary(Component, {
  fallback: ComponentErrorFallback
})
```

### 2. 错误处理策略

```ts
// 网络请求错误处理
const fetchData = async () => {
  return await executeWithErrorHandling(async () => {
    const response = await fetch('/api/data')
    if (!response.ok) {
      throw new NetworkError(`HTTP ${response.status}`, response.status)
    }
    return await response.json()
  }, 'Data fetching')
}

// 表单错误处理
const handleFormSubmit = async (data) => {
  try {
    await executeWithErrorHandling(async () => {
      await validateFormData(data)
      await submitForm(data)
    }, 'Form submission')
  } catch (error) {
    if (error.category === ErrorCategory.VALIDATION) {
      // 显示验证错误
      showValidationErrors(error.details)
    } else {
      // 显示通用错误
      showGenericError(error)
    }
  }
}
```

### 3. 错误恢复策略

```ts
// 自动恢复
const { recover } = useErrorRecovery({
  maxRetries: 3,
  onMaxRetriesReached: (error) => {
    // 降级处理或用户通知
    notifyUser('无法恢复，请联系技术支持')
  }
})

// 手动恢复
const handleRecovery = async () => {
  const success = await recover(async () => {
    await restoreUserData()
    await recoverFormState()
  }, error)
  
  if (success) {
    notifyUser('数据已恢复')
  } else {
    notifyUser('数据恢复失败，请手动处理')
  }
}
```

## 🔧 配置和定制

### 默认配置

```ts
export const defaultErrorHandlingConfig = {
  errorBoundary: {
    fallback: ErrorMessage,
    onError: (error: Error, errorInfo: React.ErrorInfo) => {
      console.error('Error Boundary caught an error:', error, errorInfo)
    }
  },
  
  apiRetry: {
    maxRetries: 3,
    retryDelay: 1000,
    backoffMultiplier: 2
  },
  
  errorReporting: {
    enabled: true,
    endpoint: '/api/errors',
    sampleRate: 1.0
  }
}
```

### 自定义错误报告器

```ts
const customErrorReporter = async (errorReport: ErrorReport) => {
  // 发送到自定义错误服务
  await fetch('https://your-error-service.com/api/errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(errorReport)
  })
}

globalErrorHandler.setErrorReporter(customErrorReporter)
```

---

这个错误处理系统为NovelForge提供了企业级的错误管理能力，确保应用的稳定性和用户体验。