'use client'

import * as React from 'react'
import { ErrorMessage } from './error-message'
import { Button } from './button'
import { RotateCcw, WifiOff, Server } from 'lucide-react'

interface APIErrorMessageProps {
  error: any
  onRetry?: () => void
  retryCount?: number
  maxRetries?: number
  compact?: boolean
  className?: string
}

export function APIErrorMessage({
  error,
  onRetry,
  retryCount = 0,
  maxRetries = 3,
  compact = false,
  className = ''
}: APIErrorMessageProps) {
  const canRetry = retryCount < maxRetries
  
  // 确定错误类型和消息
  let title = 'API错误'
  let message = '请求失败，请稍后重试'
  let type: 'error' | 'warning' | 'info' = 'error'
  
  if (error?.category === 'NETWORK') {
    title = '网络连接错误'
    message = '无法连接到服务器，请检查网络连接'
    type = 'warning'
  } else if (error?.category === 'SERVER') {
    title = '服务器错误'
    message = '服务器暂时不可用，请稍后重试'
    type = 'error'
  } else if (error?.status === 429) {
    title = '请求频率限制'
    message = '请求过于频繁，请稍后再试'
    type = 'warning'
  } else if (error?.message) {
    message = error.message
  }
  
  // 添加重试信息
  if (retryCount > 0) {
    message += ` (已重试 ${retryCount} 次)`
  }
  
  return (
    <ErrorMessage
      title={title}
      message={message}
      type={type}
      onRetry={onRetry}
      showRetry={canRetry && !!onRetry}
      showDetails={!compact}
      details={error?.stack || JSON.stringify(error, null, 2)}
      className={className}
    />
  )
}