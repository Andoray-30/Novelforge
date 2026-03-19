'use client'

import { useState } from 'react'
import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Form,
  FormInput,
  FormSelect,
  FormTextarea,
  Button,
  Spinner,
  Alert,
  StatusIndicator,
  Progress,
  PageHeader,
  PageContent,
  PageSection,
  AppErrorBoundary,
  ErrorMessage,
  APIErrorMessage,
  toast,
  useToast,
  Badge
} from '@/components/ui'
import {
  useAPIErrorHandler,
  useErrorHandler,
  useRetry
} from '@/lib/hooks'
import {
  ApplicationError,
  ErrorCategory,
  ErrorSeverity
} from '@/lib/error-handling/error-types'
import { BookOpen, Users, Globe, Download, RefreshCw, ArrowRight, WifiOff, AlertTriangle } from 'lucide-react'
import { useAIPlanning } from '@/lib/hooks/use-ai-planning'
import { storyOutlineSchema, type StoryOutlineFormData } from '@/lib/validation/form-schemas'

/**
 * 增强版AI规划表单 - 完整的错误处理演示
 * 展示如何在实际应用中使用错误处理系统
 */
export default function ComprehensiveAIPlanningForm() {
  const {
    isGenerating,
    error,
    currentOutline,
    generateStoryOutline,
    designCharacters,
    buildWorldSetting,
    resetPlanning,
    getPlanningStatus
  } = useAIPlanning()

  const [step, setStep] = useState(1)
  const [isExporting, setIsExporting] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const { toast: showToast } = useToast()

  // 错误处理Hook
  const { 
    error: formError, 
    isError: hasFormError, 
    handleError: handleFormError, 
    clearError: clearFormError,
    executeWithErrorHandling 
  } = useErrorHandler({
    maxRetries: 3,
    retryDelay: 1000,
    onError: (error) => {
      console.error('Form error:', error)
      showToast({
        title: '表单错误',
        description: error.message,
        variant: 'destructive'
      })
    }
  })

  // API错误处理Hook
  const { 
    handleAPIError, 
    error: apiError, 
    isError: hasAPIError 
  } = useAPIErrorHandler({
    endpoint: '/api/ai',
    maxRetries: 3,
    onError: (error) => {
      console.error('API error:', error)
      showToast({
        title: 'API错误',
        description: error.message,
        variant: 'destructive'
      })
    }
  })

  // 重试Hook
  const { 
    retryState, 
    strategy, 
    executeWithRetry 
  } = useRetry({
    maxRetries: 3,
    baseDelay: 2000,
    backoffMultiplier: 2,
    jitter: true,
    onRetry: (error, attempt) => {
      console.log(`Retry attempt ${attempt} for:`, error)
      showToast({
        title: '正在重试',
        description: `第 ${attempt} 次重试，${strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attempt - 1) / 1000}秒后进行`,
        variant: 'default'
      })
    }
  })

  const form = useForm<StoryOutlineFormData>({
    resolver: zodResolver(storyOutlineSchema),
    defaultValues: {
      novel_type: 'fantasy',
      theme: '',
      length: 'medium',
      target_audience: 'general',
      constraints: []
    }
  })

  const handleSubmit = async (data: StoryOutlineFormData) => {
    await executeWithErrorHandling(async () => {
      await executeWithRetry(async () => {
        try {
          // Step 1: Generate story outline
          setStep(2)
          const outline = await generateStoryOutline(data)
          
          // Step 2: Design characters
          setStep(3)
          const context = `Story: ${outline.title}, Theme: ${outline.theme}`
          await designCharacters(context, outline.characterRoles.map(r => r.role))
          
          // Step 3: Build world setting
          setStep(4)
          await buildWorldSetting(outline)
          
          setStep(5) // Complete
          setShowResults(true)
          
          showToast({
            title: '生成完成！',
            description: '您的故事架构、角色和世界设定已生成完成',
            variant: 'success',
          })
          
        } catch (error) {
          // 分类处理不同类型的错误
          if (error instanceof ApplicationError) {
            switch (error.category) {
              case ErrorCategory.NETWORK:
                throw new ApplicationError('网络连接失败，请检查网络连接', {
                  category: ErrorCategory.NETWORK,
                  severity: ErrorSeverity.MEDIUM,
                  retryable: true
                })
              case ErrorCategory.SERVER:
                throw new ApplicationError('AI服务暂时不可用，请稍后重试', {
                  category: ErrorCategory.SERVER,
                  severity: ErrorSeverity.HIGH,
                  retryable: true
                })
              case ErrorCategory.VALIDATION:
                throw new ApplicationError('输入数据验证失败，请检查表单', {
                  category: ErrorCategory.VALIDATION,
                  severity: ErrorSeverity.LOW,
                  retryable: false
                })
              default:
                throw error
            }
          } else {
            throw error
          }
        }
      })
    }, 'AI故事生成')
  }

  const handleExport = async () => {
    setIsExporting(true)
    
    await executeWithErrorHandling(async () => {
      await executeWithRetry(async () => {
        // 模拟导出过程
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        if (Math.random() > 0.7) {
          throw new ApplicationError('导出服务暂时不可用', {
            category: ErrorCategory.SERVER,
            severity: ErrorSeverity.MEDIUM,
            retryable: true
          })
        }
        
        showToast({
          title: '导出成功',
          description: '故事数据已导出为SillyTavern格式',
          variant: 'success',
        })
      })
    }, 'SillyTavern导出')
    
    setIsExporting(false)
  }

  const status = getPlanningStatus()
  const stepLabels = ['基本信息', '生成中', '角色设计', '世界构建', '完成']
  const stepIcons = [BookOpen, RefreshCw, Users, Globe, Download]

  // 网络状态监控
  const isOnline = navigator.onLine

  return (
    <AppErrorBoundary
      fallback={({ error, reset }) => (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <Card className="max-w-md">
            <CardHeader>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <CardTitle className="text-red-600 text-center">应用组件出错</CardTitle>
              <CardDescription className="text-center">
                AI规划组件遇到了技术问题，请重试或返回首页
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md bg-gray-50 p-4">
                <p className="text-sm text-gray-600 mb-2">错误信息：</p>
                <p className="text-sm font-mono text-gray-800">{error.message}</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={reset} className="flex-1">
                  重试组件
                </Button>
                <Button variant="outline" onClick={() => window.location.href = '/'}>
                  返回首页
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    >
      <PageContent>
        <PageHeader 
          title="AI 故事创作助手"
          description="使用 AI 生成专业的故事架构、角色和世界观 - 增强版错误处理演示"
          actions={
            <div className="flex items-center gap-4">
              {/* 网络状态指示器 */}
              {!isOnline && (
                <StatusIndicator
                  variant="destructive"
                  label="离线"
                />
              )}
              
              {/* 重试状态指示器 */}
              {retryState.isRetrying && (
                <StatusIndicator 
                  variant="warning" 
                  label={`重试中 (${retryState.attempt}/${strategy.maxRetries})`}
                  animated={true}
                />
              )}
              
              {/* 生成状态 */}
              <StatusIndicator 
                variant={isGenerating ? "warning" : "success"} 
                label={isGenerating ? "生成中" : "就绪"}
                animated={isGenerating}
              />
              
              {status.hasOutline && (
                <Button
                  variant="outline"
                  onClick={() => {
                    resetPlanning()
                    form.reset()
                    setStep(1)
                    setShowResults(false)
                    clearFormError()
                  }}
                >
                  重新开始
                </Button>
              )}
            </div>
          }
        />

        {/* 网络离线警告 */}
        {!isOnline && (
          <Alert variant="destructive" className="mb-6">
            <WifiOff className="h-4 w-4" />
            <div>
              <strong>网络连接已断开</strong>
              <p className="text-sm mt-1">
                您当前处于离线状态。某些功能可能无法正常使用。请检查网络连接。
              </p>
            </div>
          </Alert>
        )}

        {/* 重试指示器 */}
        {retryState.isRetrying && (
          <div className="mb-6">
            <Alert variant="warning">
              <div>
                <strong>正在重试 ({retryState.attempt}/{strategy.maxRetries})</strong>
                <p className="text-sm mt-1">
                  正在尝试重新连接，请稍候...
                </p>
              </div>
            </Alert>
          </div>
        )}

        {/* API错误显示 */}
        {hasAPIError && (
          <div className="mb-6">
            <APIErrorMessage
              error={apiError}
              onRetry={() => {
                // 手动重试逻辑
                if (form.getValues().theme) {
                  handleSubmit(form.getValues())
                }
              }}
              retryCount={retryState.attempt}
              maxRetries={strategy.maxRetries}
              compact={false}
            />
          </div>
        )}

        {/* Progress Steps */}
        <PageSection>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                {stepLabels.map((label, index) => {
                  const IconComponent = stepIcons[index]
                  const isCompleted = step > index + 1
                  const isActive = step === index + 1
                  
                  return (
                    <div key={index} className="flex items-center">
                      <div className="flex flex-col items-center">
                        <div className={`
                          w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium
                          ${isCompleted ? 'bg-green-500 text-white' : 
                            isActive ? 'bg-blue-500 text-white' : 
                            'bg-gray-200 text-gray-600'}
                        `}>
                          {isCompleted ? (
                            <span className="text-white">✓</span>
                          ) : (
                            <IconComponent className={`h-5 w-5 ${isActive ? 'animate-spin' : ''}`} />
                          )}
                        </div>
                        <span className={`mt-2 text-sm font-medium text-center max-w-20 ${
                          isActive || isCompleted ? 'text-gray-900' : 'text-gray-500'
                        }`}>
                          {label}
                        </span>
                      </div>
                      {index < 4 && (
                        <div className={`w-16 h-1 mx-2 ${
                          isCompleted ? 'bg-green-500' : 'bg-gray-200'
                        }`} />
                      )}
                    </div>
                  )
                })}
              </div>
              
              {step >= 2 && step < 5 && (
                <div className="mt-6">
                  <Progress value={step * 20} max={100} animated showLabel color="primary" />
                </div>
              )}
            </CardContent>
          </Card>
        </PageSection>

        {/* Form Section with Error Handling */}
        {step === 1 && (
          <PageSection title="设置基本信息" description="填写故事创作的基本信息，AI将为您生成专业的内容">
            <FormProvider {...form}>
              <Form
                onSubmit={handleSubmit}
                title="故事创作表单"
                description="AI将根据您提供的信息生成完整的故事架构"
                submitLabel="开始生成故事"
                enableAutoSave={true}
                autoSaveIndicator={true}
                errorSummary={true}
                className="space-y-6"
              >
                {/* 表单错误显示 */}
                {hasFormError && formError && (
                  <ErrorMessage
                    title="表单错误"
                    message={formError.message}
                    type="error"
                    onRetry={() => {
                      clearFormError()
                      form.trigger() // 重新验证表单
                    }}
                    showDetails={!!formError.details}
                    details={formError.details ? JSON.stringify(formError.details, null, 2) : ''}
                  />
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormSelect
                    name="novel_type"
                    label="小说类型"
                    placeholder="选择小说类型"
                  >
                    <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                      <option value="fantasy">奇幻</option>
                      <option value="science_fiction">科幻</option>
                      <option value="romance">言情</option>
                      <option value="mystery">悬疑</option>
                      <option value="historical">历史</option>
                      <option value="wuxia">武侠</option>
                    </select>
                  </FormSelect>

                  <FormSelect
                    name="target_audience"
                    label="目标受众"
                    placeholder="选择目标受众"
                  >
                    <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                      <option value="general">一般读者</option>
                      <option value="young_adult">青少年</option>
                      <option value="adult">成人</option>
                    </select>
                  </FormSelect>
                </div>

                <FormTextarea
                  name="theme"
                  label="故事主题"
                  placeholder="例如：友谊与背叛、成长与救赎、权力与责任..."
                  helpText="描述您故事的核心主题和想要探讨的问题"
                  required
                  maxLength={200}
                  showCharacterCount
                  className="min-h-[80px]"
                  rows={3}
                />

                <FormSelect
                  name="length"
                  label="预期长度"
                  placeholder="选择长度"
                >
                  <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="short">短篇 (&lt; 5万字)</option>
                    <option value="medium">中篇 (5-15万字)</option>
                    <option value="long">长篇 (&gt; 15万字)</option>
                  </select>
                </FormSelect>

                {/* 约束条件 - 动态数组字段 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    创作约束条件
                    <span className="text-gray-500 ml-2">(可选)</span>
                  </label>
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="例如：包含魔法元素、有龙的角色..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <div className="text-sm text-gray-500">
                      添加创作约束条件，帮助AI更好地理解您的需求
                    </div>
                  </div>
                </div>

                {error && (
                  <ErrorMessage
                    title="生成失败"
                    message={error}
                    type="error"
                    onRetry={() => {
                      // 重试整个生成过程
                      if (form.getValues().theme) {
                        handleSubmit(form.getValues())
                      }
                    }}
                    showRetry={true}
                  />
                )}

                {/* 提交按钮 - 带加载状态 */}
                <Button
                  type="submit"
                  disabled={isGenerating || !form.formState.isValid || !isOnline}
                  className="w-full"
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      正在生成故事架构...
                    </>
                  ) : !isOnline ? (
                    <>
                      <WifiOff className="h-4 w-4 mr-2" />
                      离线模式 - 无法生成
                    </>
                  ) : (
                    <>
                      <ArrowRight className="h-4 w-4 mr-2" />
                      开始生成故事
                    </>
                  )}
                </Button>
              </Form>
            </FormProvider>
            </PageSection>
          )}

          {/* Loading State with Error Handling */}
          {step >= 2 && step < 5 && (
            <PageSection title="正在生成中...">
              <Card>
                <CardContent className="p-8 text-center">
                  <Spinner size="xl" variant="primary" className="mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">
                    {step === 2 && '正在生成故事架构...'}
                    {step === 3 && '正在设计角色...'}
                    {step === 4 && '正在构建世界观...'}
                  </h3>
                  <p className="text-gray-500">这可能需要几秒钟时间</p>
                  
                  <div className="mt-6 max-w-md mx-auto">
                    <Progress 
                      value={step * 20} 
                      max={100} 
                      animated 
                      showLabel 
                      color="primary"
                    />
                  </div>
                </CardContent>
              </Card>
            </PageSection>
          )}

          {/* Results */}
          {step === 5 && currentOutline && showResults && (
            <div className="space-y-6">
              {/* Story Outline with Error Boundaries */}
              <AppErrorBoundary>
                <PageSection 
                  title="故事架构" 
                  description="AI生成的完整故事框架"
                  actions={
                    <div className="flex gap-2">
                      <Badge variant="outline">{currentOutline.genre}</Badge>
                      <Badge variant="secondary">{currentOutline.tone}</Badge>
                      <Badge>{form.getValues('length') === 'short' ? '短篇' : form.getValues('length') === 'medium' ? '中篇' : '长篇'}</Badge>
                    </div>
                  }
                >
                  <Card>
                    <CardContent className="space-y-6">
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">{currentOutline.title}</h3>
                        <p className="text-gray-600">{currentOutline.theme}</p>
                      </div>

                      <div>
                        <h4 className="text-lg font-semibold mb-4 flex items-center gap-2">
                          <BookOpen className="h-5 w-5" />
                          情节节点
                        </h4>
                        <div className="space-y-4">
                          {currentOutline.plotPoints.map((point, index) => (
                            <div key={point.id} className="border-l-4 border-blue-500 pl-4">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-gray-500">{index + 1}.</span>
                                <h5 className="font-medium">{point.title}</h5>
                                <Badge 
                                  variant={
                                    point.importance === 'critical' ? 'destructive' :
                                    point.importance === 'high' ? 'warning' :
                                    'outline'
                                  }
                                  size="sm"
                                >
                                  {point.importance}
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-600">{point.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </PageSection>
              </AppErrorBoundary>

              {/* Export Section with Error Handling */}
              <PageSection>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex gap-4">
                      <Button
                        variant="outline"
                        onClick={() => {
                          resetPlanning()
                          form.reset()
                          setStep(1)
                          setShowResults(false)
                          clearFormError()
                        }}
                        className="flex-1"
                      >
                        重新开始
                      </Button>
                      
                      <Button
                        className="flex-1"
                        disabled={isExporting || !isOnline}
                        onClick={handleExport}
                      >
                        {isExporting ? (
                          <>
                            <Spinner size="sm" className="mr-2" />
                            导出中...
                          </>
                        ) : (
                          '导出到 SillyTavern'
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </PageSection>
            </div>
          )}
        </PageContent>
      </AppErrorBoundary>
  )
}