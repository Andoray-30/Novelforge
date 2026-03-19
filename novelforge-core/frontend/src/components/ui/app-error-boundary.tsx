'use client'

import * as React from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './card'
import { AlertTriangle } from 'lucide-react'
import { Button } from './button'

interface AppErrorBoundaryProps {
  children: React.ReactNode
  fallback?: (props: { error: Error; reset: () => void }) => React.ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('AppErrorBoundary caught an error:', error, errorInfo)
  }

  reset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback({ error: this.state.error!, reset: this.reset })
      }
      
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <Card className="max-w-md">
            <CardHeader>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <CardTitle className="text-red-600 text-center">应用组件出错</CardTitle>
              <CardDescription className="text-center">
                组件遇到了技术问题，请重试或返回首页
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md bg-gray-50 p-4">
                <p className="text-sm text-gray-600 mb-2">错误信息：</p>
                <p className="text-sm font-mono text-gray-800">{this.state.error?.message}</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={this.reset} className="flex-1">
                  重试组件
                </Button>
                <Button variant="outline" onClick={() => window.location.href = '/'}>
                  返回首页
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}