import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent,
  PageHeader,
  PageContent,
  Grid,
  Container,
  Button,
  Badge,
  StatusIndicator
} from '@/components/ui'
import { cn } from '@/lib/utils'
import { 
  Users, 
  BookOpen, 
  Globe, 
  Settings, 
  Home, 
  Sparkles,
  FileText,
  BarChart3
} from 'lucide-react'

export default function HomePage() {
  const features = [
    {
      title: 'AI故事规划',
      description: '使用先进的AI技术生成专业的故事架构、情节节点和角色关系',
      icon: <Sparkles className="h-8 w-8" />,
      href: '/ai-planning',
      action: '开始AI规划',
      features: ['故事架构生成', '角色设计', '世界构建', '智能推荐'],
      badge: 'AI驱动',
      variant: 'primary'
    },
    {
      title: '角色管理',
      description: '创建和管理小说角色，支持AI辅助角色生成和性格分析',
      icon: <Users className="h-8 w-8" />,
      href: '/characters',
      action: '管理角色',
      features: ['角色档案', '性格分析', '关系网络', '成长弧线'],
      variant: 'secondary'
    },
    {
      title: '世界设定',
      description: '构建完整的世界观，管理地点、文化、历史和规则设定',
      icon: <Globe className="h-8 w-8" />,
      href: '/world',
      action: '构建世界',
      features: ['地点管理', '文化设定', '历史时间线', '世界规则'],
      variant: 'outline'
    },
    {
      title: '小说编辑器',
      description: '功能强大的富文本编辑器，支持实时协作和版本管理',
      icon: <FileText className="h-8 w-8" />,
      href: '/editor',
      action: '开始写作',
      features: ['富文本编辑', '实时协作', '版本管理', '导出功能'],
      variant: 'outline'
    },
    {
      title: '数据分析',
      description: '分析创作数据，提供洞察和建议，优化创作过程',
      icon: <BarChart3 className="h-8 w-8" />,
      href: '/analytics',
      action: '查看分析',
      features: ['创作统计', '质量评估', '趋势分析', '改进建议'],
      variant: 'outline'
    },
    {
      title: '系统设置',
      description: '配置AI模型、集成设置和个性化选项',
      icon: <Settings className="h-8 w-8" />,
      href: '/settings',
      action: '系统设置',
      features: ['AI配置', '集成设置', '个性化选项', '导出配置'],
      variant: 'outline'
    },
  ];

  const getVariantStyles = (variant: string) => {
    switch (variant) {
      case 'primary':
        return 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200'
      case 'secondary':
        return 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200'
      default:
        return 'bg-white border-gray-200'
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader 
        title="NovelForge"
        description="AI驱动的小说创作辅助工具，帮助您构建引人入胜的故事架构、设计鲜明的角色和创造丰富的世界观。"
        className="text-center"
      />
      
      <PageContent>
        <section className="text-center mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            核心功能
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            基于先进的AI技术，为小说创作者提供全方位的创作支持
          </p>
        </section>
        
        <Grid cols={3} gap="lg" responsive>
          {features.map((feature) => (
            <Card key={feature.href} className={`hover:shadow-lg transition-all duration-300 hover:-translate-y-1 ${getVariantStyles(feature.variant || '')}`}>
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <div className={cn(
                    "p-3 rounded-lg",
                    feature.variant === 'primary' ? 'bg-blue-100 text-blue-600' :
                    feature.variant === 'secondary' ? 'bg-purple-100 text-purple-600' :
                    'bg-gray-100 text-gray-600'
                  )}>
                    {feature.icon}
                  </div>
                  {feature.badge && (
                    <Badge variant={feature.variant === 'primary' ? 'default' : 'secondary'}>
                      {feature.badge}
                    </Badge>
                  )}
                </div>
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-1">
                  {feature.features.map((item, index) => (
                    <Badge key={index} variant="outline" size="sm">
                      {item}
                    </Badge>
                  ))}
                </div>
              </CardContent>
              
              <div className="px-6 pb-6">
                <Button variant={feature.variant === 'primary' ? 'default' : 'outline'} className="w-full">
                  <a href={feature.href}>
                    {feature.action}
                  </a>
                </Button>
              </div>
            </Card>
          ))}
        </Grid>
        
        <section className="text-center mt-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            开始创作
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto mb-6">
            让AI成为您的创作伙伴，一起构建精彩的故事世界
          </p>
          <div className="flex justify-center gap-4">
            <a href="/ai-planning">
              <Button variant="default" size="lg">
                开始AI规划
              </Button>
            </a>
            <Button variant="outline" size="lg">
              <a href="/editor">
                开始写作
              </a>
            </Button>
          </div>
        </section>
        
        <section className="mt-16 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-8">
          <div className="text-center">
            <StatusIndicator variant="success" label="系统状态：正常运行" className="mx-auto mb-4" />
            
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              系统特性
            </h3>
            <div className="flex justify-center gap-6 mt-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">AI驱动</div>
                <div className="text-sm text-gray-600">智能生成</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">实时协作</div>
                <div className="text-sm text-gray-600">团队创作</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">多格式支持</div>
                <div className="text-sm text-gray-600">灵活导出</div>
              </div>
            </div>
          </div>
        </section>
      </PageContent>
    </div>
  );
}