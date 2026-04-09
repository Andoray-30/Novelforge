'use client'

import { useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Alert,
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
    isLoading: isGenerating,
    error,
    generateStoryOutline,
    designCharacter,
    buildWorld
  } = useAIPlanning()

  const [step, setStep] = useState(1)
  const [isExporting, setIsExporting] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [currentOutline, setCurrentOutline] = useState<StoryOutlineFormData | null>(null)

  // 错误处理Hook
  const { handleError } = useErrorHandler()

  // API错误处理Hook
  const { handleError: handleAPIError } = useAPIErrorHandler()

  // 重试Hook
  const { retry } = useRetry()

  // 表单设置
  const form = useForm<StoryOutlineFormData>({
    resolver: zodResolver(storyOutlineSchema),
    defaultValues: {
      novel_type: 'fantasy',
      theme: '',
      length: 'medium',
      constraints: [],
      target_audience: 'general'
    }
  })

  // 处理表单提交
  const onSubmit: SubmitHandler<StoryOutlineFormData> = async (data) => {
    try {
      const result = await retry(() => generateStoryOutline(data))
      if (result) {
        setCurrentOutline(data)
        setShowResults(true)
        setStep(2)
      }
    } catch (err) {
      handleAPIError(err)
    }
  }

  // 处理导出
  const handleExport = async () => {
    setIsExporting(true)
    try {
      // 导出逻辑
      await new Promise(resolve => setTimeout(resolve, 1000))
      setIsExporting(false)
    } catch (err) {
      handleError(err)
      setIsExporting(false)
    }
  }

  // 重置规划
  const resetPlanning = () => {
    setStep(1)
    setShowResults(false)
    setCurrentOutline(null)
    form.reset()
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            AI故事规划
          </CardTitle>
          <CardDescription>
            使用AI辅助生成完整的故事大纲、角色设定和世界构建
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="w-4 h-4" />
              <div className="ml-2">
                <div className="font-medium">发生错误</div>
                <div className="text-sm">{error}</div>
              </div>
            </Alert>
          )}

          {step === 1 && (
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">小说类型</label>
                <select
                  {...form.register('novel_type')}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">请选择类型</option>
                  <option value="fantasy">奇幻</option>
                  <option value="science_fiction">科幻</option>
                  <option value="romance">言情</option>
                  <option value="mystery">悬疑</option>
                  <option value="historical">历史</option>
                  <option value="wuxia">武侠</option>
                </select>
                {form.formState.errors.novel_type && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.novel_type.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">核心主题</label>
                <input
                  {...form.register('theme')}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="描述故事的核心主题"
                />
                {form.formState.errors.theme && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.theme.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">长度类型</label>
                <select
                  {...form.register('length')}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="short">短篇</option>
                  <option value="medium">中篇</option>
                  <option value="long">长篇</option>
                </select>
                {form.formState.errors.length && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.length.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">目标受众</label>
                <select
                  {...form.register('target_audience')}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">请选择受众</option>
                  <option value="young_adult">青少年</option>
                  <option value="adult">成年</option>
                  <option value="general">大众</option>
                </select>
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={isGenerating}
                  className="flex-1"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-4 h-4 mr-2" />
                      生成故事大纲
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}

          {step === 2 && showResults && currentOutline && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">生成结果</h3>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleExport}
                    disabled={isExporting}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {isExporting ? '导出中...' : '导出'}
                  </Button>
                  <Button variant="outline" onClick={resetPlanning}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    重新开始
                  </Button>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">故事信息</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">类型：</span>
                    <Badge variant="secondary">{currentOutline.novel_type}</Badge>
                  </div>
                  <div>
                    <span className="text-gray-500">长度：</span>
                    <Badge variant="secondary">{currentOutline.length}</Badge>
                  </div>
                  <div>
                    <span className="text-gray-500">受众：</span>
                    <Badge variant="secondary">{currentOutline.target_audience || '未设置'}</Badge>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">核心主题</h4>
                <p className="text-sm text-gray-700">{currentOutline.theme}</p>
              </div>

              {currentOutline.constraints && currentOutline.constraints.length > 0 && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium mb-2">约束条件</h4>
                  <ul className="list-disc list-inside text-sm text-gray-700">
                    {currentOutline.constraints.map((constraint, index) => (
                      <li key={index}>{constraint}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
