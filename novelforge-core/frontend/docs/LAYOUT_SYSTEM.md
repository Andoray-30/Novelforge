# NovelForge Layout System

NovelForge使用了一套完整的布局系统，提供一致的导航、响应式设计和组件化布局。

## 核心组件

### MainLayout
主要的布局容器，管理侧边栏、头部、内容和页脚的排列。

```tsx
import { MainLayout } from '@/components/layout'
import { AppSidebar } from '@/components/layout'

export default function Page() {
  return (
    <MainLayout sidebar={<AppSidebar />}>
      <YourPageContent />
    </MainLayout>
  )
}
```

### AppSidebar
应用侧边栏，包含导航菜单和用户信息显示。

```tsx
import { AppSidebar } from '@/components/layout'

// 基础用法
<AppSidebar />

// 折叠状态
<AppSidebar isCollapsed={true} onToggle={() => {}} />
```

### AppHeader
应用头部，包含logo、搜索、通知和用户菜单。

```tsx
import { AppHeader } from '@/components/layout'

<AppHeader 
  title="页面标题"
  showMenuButton={true}
  onMenuClick={() => {}}
/>
```

### AppFooter
应用页脚，包含版权信息和相关链接。

```tsx
import { AppFooter } from '@/components/layout'

<AppFooter 
  showVersion={true}
  links={[
    { title: '关于我们', href: '/about' },
    { title: '文档', href: '/docs' }
  ]}
/>
```

### AppBreadcrumb
面包屑导航，显示当前页面在网站层次结构中的位置。

```tsx
import { AppBreadcrumb } from '@/components/layout'

// 自动生成面包屑
<AppBreadcrumb />

// 自定义面包屑
<AppBreadcrumb 
  items={[
    { title: '首页', href: '/' },
    { title: 'AI规划', href: '/ai-planning' }
  ]}
/>
```

## 页面布局组件

### PageHeader
页面头部组件，统一页面标题、描述和操作按钮的样式。

```tsx
import { PageHeader } from '@/components/layout'

<PageHeader
  title="AI故事创作助手"
  description="使用AI生成专业的故事架构"
  actions={
    <div className="flex gap-2">
      <Button>主要操作</Button>
      <Button variant="outline">次要操作</Button>
    </div>
  }
  breadcrumb={<AppBreadcrumb />}
/>
```

### PageContent
页面内容容器，提供一致的间距和内容包装。

```tsx
import { PageContent, PageSection } from '@/components/layout'

<PageContent>
  <PageSection title="第一部分" description="这部分的描述">
    {/* 内容 */}
  </PageSection>
  
  <PageSection title="第二部分">
    {/* 内容 */}
  </PageSection>
</PageContent>
```

## 布局工具组件

### Container
响应式容器，提供最大宽度和内边距。

```tsx
import { Container } from '@/components/layout'

<Container size="lg" className="py-8">
  {/* 内容 */}
</Container>
```

尺寸选项：
- `sm`: max-w-2xl
- `default`: max-w-4xl
- `lg`: max-w-6xl
- `xl`: max-w-7xl
- `full`: max-w-full

### Grid
响应式网格布局组件。

```tsx
import { Grid } from '@/components/layout'

<Grid cols={3} gap="lg" responsive>
  <div>项目1</div>
  <div>项目2</div>
  <div>项目3</div>
</Grid>
```

### Flex
灵活的Flexbox布局组件。

```tsx
import { Flex } from '@/components/layout'

<Flex 
  direction="row" 
  align="center" 
  justify="between" 
  gap="md"
  wrap={true}
>
  <div>左侧内容</div>
  <div>右侧内容</div>
</Flex>
```

### Spacer
间距组件，用于创建垂直或水平间距。

```tsx
import { Spacer } from '@/components/layout'

<Spacer size="lg" direction="vertical" />
<Spacer size="md" direction="horizontal" />
```

## 响应式设计

### 断点
- 移动端: < 768px
- 平板端: 768px - 1024px
- 桌面端: ≥ 1024px

### 响应式工具类
```tsx
// 隐藏元素
hidden sm:block     // 移动端隐藏，平板及以上显示
lg:hidden          // 桌面端隐藏

// 布局调整
grid-cols-1 md:grid-cols-2 lg:grid-cols-3
flex-col md:flex-row
```

### 响应式Hook
```tsx
import { useResponsive } from '@/lib/hooks/use-responsive'

const { isMobile, isTablet, isDesktop } = useResponsive()

if (isMobile) {
  // 移动端特定逻辑
}
```

## 移动导航

### MobileNav
移动端导航抽屉组件。

```tsx
import { MobileNav, MobileNavTrigger } from '@/components/layout'

const [isOpen, setIsOpen] = useState(false)

<MobileNavTrigger onClick={() => setIsOpen(true)} />
<MobileNav 
  isOpen={isOpen} 
  onClose={() => setIsOpen(false)} 
/>
```

## 最佳实践

### 1. 页面结构
```tsx
export default function Page() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="页面标题"
        description="页面描述"
        breadcrumb={<AppBreadcrumb />}
      />
      
      <PageContent>
        <PageSection title="第一部分">
          <Card>
            <CardContent>
              {/* 内容 */}
            </CardContent>
          </Card>
        </PageSection>
      </PageContent>
    </div>
  )
}
```

### 2. 响应式布局
```tsx
<Grid cols={3} gap="lg" responsive>
  <Card>内容1</Card>
  <Card>内容2</Card>
  <Card>内容3</Card>
</Grid>
```

### 3. 移动端优化
```tsx
// 移动端隐藏侧边栏
<div className="hidden lg:block">
  <AppSidebar />
</div>

// 移动端显示菜单按钮
<button className="lg:hidden" onClick={() => setIsOpen(true)}>
  <Menu className="h-6 w-6" />
</button>
```

## 主题和定制

布局系统完全基于Tailwind CSS，可以通过修改tailwind.config.js来定制颜色、间距等设计令牌。

### 颜色定制
```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        }
      }
    }
  }
}
```

### 间距定制
```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      }
    }
  }
}
```

## 可访问性

所有布局组件都遵循Web可访问性标准：
- 语义化HTML结构
- ARIA标签和属性
- 键盘导航支持
- 屏幕阅读器兼容
- 高对比度支持

## 性能优化

- 组件懒加载
- 响应式图片
- CSS优化
- 减少重渲染
- 移动端优先策略