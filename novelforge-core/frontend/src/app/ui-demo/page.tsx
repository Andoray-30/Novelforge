'use client'

import { useState } from 'react'
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent,
  Input,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Button,
  Spinner,
  Alert,
  Badge,
  StatusIndicator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Progress,
  toast,
  useToast,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui'
import { Info, HelpCircle } from 'lucide-react'

export default function UIComponentDemo() {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showDialog, setShowDialog] = useState(false)
  const { toast: showToast } = useToast()

  const handleTestToast = () => {
    showToast({
      title: "测试通知",
      description: "这是一个测试通知消息",
      variant: "success",
    })
  }

  const handleTestLoading = () => {
    setIsLoading(true)
    setProgress(0)
    
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          setIsLoading(false)
          showToast({
            title: "加载完成",
            description: "数据加载成功",
            variant: "success",
          })
          return 100
        }
        return prev + 10
      })
    }, 500)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">UI组件库演示</h1>
          <p className="text-lg text-gray-600">NovelForge UI组件库完整展示</p>
        </div>

        {/* 表单组件演示 */}
        <Card>
          <CardHeader>
            <CardTitle>表单组件</CardTitle>
            <CardDescription>输入框、文本域、选择器等表单组件</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="用户名"
                placeholder="请输入用户名"
                helpText="用户名长度3-20个字符"
                required
                leftIcon={<span className="text-gray-400">@</span>}
              />
              
              <Input
                label="邮箱"
                type="email"
                placeholder="请输入邮箱地址"
                error="邮箱格式不正确"
                rightIcon={<Info className="h-4 w-4 text-red-500" />}
              />
            </div>

            <Textarea
              label="故事简介"
              placeholder="请输入故事简介..."
              helpText="简要描述你的故事内容"
              autoResize
              maxLength={500}
              showCharacterCount
              className="min-h-[100px]"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  小说类型
                </label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="选择小说类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fantasy">奇幻</SelectItem>
                    <SelectItem value="science_fiction">科幻</SelectItem>
                    <SelectItem value="romance">言情</SelectItem>
                    <SelectItem value="mystery">悬疑</SelectItem>
                    <SelectItem value="historical">历史</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  目标长度
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="inline-block ml-1 h-4 w-4 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>短篇: &lt; 5万字<br/>中篇: 5-15万字<br/>长篇: &gt; 15万字</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="选择长度" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">短篇 (&lt; 5万字)</SelectItem>
                    <SelectItem value="medium">中篇 (5-15万字)</SelectItem>
                    <SelectItem value="long">长篇 (&gt; 15万字)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 反馈组件演示 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>加载状态</CardTitle>
              <CardDescription>加载指示器和进度条</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Spinner />
                <span>默认加载中...</span>
              </div>
              
              <div className="flex items-center gap-4">
                <Spinner size="lg" variant="primary" />
                <span>主要加载状态</span>
              </div>

              <div className="flex items-center gap-4">
                <Spinner size="xl" variant="success" label="正在处理..." />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>处理进度</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} max={100} animated />
              </div>

              <Button onClick={handleTestLoading} disabled={isLoading}>
                {isLoading ? '处理中...' : '开始测试'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>状态指示</CardTitle>
              <CardDescription>状态指示器和徽章</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <StatusIndicator variant="success" label="在线" />
                <StatusIndicator variant="warning" label="处理中" animated />
                <StatusIndicator variant="destructive" label="错误" />
                <StatusIndicator variant="info" label="信息" />
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge>默认</Badge>
                <Badge variant="secondary">次要</Badge>
                <Badge variant="success" dot>成功</Badge>
                <Badge variant="warning">警告</Badge>
                <Badge variant="destructive">错误</Badge>
                <Badge variant="info">信息</Badge>
              </div>

              <div className="space-y-2">
                <Alert variant="success">
                  <strong>成功!</strong> 操作已完成。
                </Alert>
                <Alert variant="warning">
                  <strong>注意!</strong> 请检查您的输入。
                </Alert>
                <Alert variant="destructive">
                  <strong>错误!</strong> 发生了一个问题。
                </Alert>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 交互组件演示 */}
        <Card>
          <CardHeader>
            <CardTitle>交互组件</CardTitle>
            <CardDescription>对话框和交互元素</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Button onClick={handleTestToast}>显示通知</Button>
              <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline">打开对话框</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>确认操作</DialogTitle>
                    <DialogDescription>
                      您确定要执行此操作吗？此操作无法撤销。
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setShowDialog(false)}>
                      取消
                    </Button>
                    <Button onClick={() => {
                      setShowDialog(false)
                      showToast({
                        title: "操作完成",
                        description: "您的操作已成功执行",
                        variant: "success",
                      })
                    }}>
                      确认
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        {/* 组件状态展示 */}
        <Card>
          <CardHeader>
            <CardTitle>组件状态</CardTitle>
            <CardDescription>各种组件状态展示</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">输入框状态</h4>
                <Input placeholder="正常状态" />
                <Input placeholder="禁用状态" disabled />
                <Input placeholder="错误状态" error="这是一个错误信息" />
              </div>
              
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">按钮状态</h4>
                <Button>主要按钮</Button>
                <Button variant="outline">轮廓按钮</Button>
                <Button variant="destructive">危险按钮</Button>
                <Button disabled>禁用按钮</Button>
              </div>
              
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">进度状态</h4>
                <Progress value={25} showLabel />
                <Progress value={50} color="success" />
                <Progress value={75} color="warning" />
                <Progress value={100} color="success" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}