# NovelForge Form Enhancement System

基于react-hook-form、Zod和自定义组件的增强表单系统，提供高级验证、自动保存、智能建议等功能。

## 🚀 核心特性

- **✅ 高级验证** - 基于Zod的模式验证，支持复杂业务规则
- **💾 自动保存** - 本地存储草稿，支持恢复和版本管理
- **🤖 智能建议** - AI驱动的表单字段建议
- **📊 实时验证** - 字段级和表单级实时验证反馈
- **🔄 状态管理** - 集中式表单状态管理
- **📱 响应式** - 移动端友好的表单交互
- **♿ 无障碍** - 完整的ARIA支持和键盘导航

## 📦 安装依赖

```bash
npm install react-hook-form @hookform/resolvers zod
```

## 🏗️ 核心组件

### 1. 增强版表单Hook (`useEnhancedForm`)

```tsx
import { useEnhancedForm } from '@/lib/hooks/use-enhanced-form'
import { storyOutlineSchema } from '@/lib/validation/form-schemas'

const form = useEnhancedForm<StoryOutlineFormData>({
  schema: storyOutlineSchema,
  storageKey: 'ai-planning-form',
  enableAutoSave: true,
  autoSaveDelay: 3000,
  onAutoSave: (data) => {
    console.log('Auto-saved:', data)
  },
  onSubmit: async (data) => {
    // 处理表单提交
    await submitFormData(data)
  }
})
```

**特性：**
- ✅ 基于Zod的模式验证
- 💾 自动保存到localStorage
- 🔄 表单状态管理
- 📊 错误汇总和显示
- ⚡ 防抖自动保存
- 🎯 字段级验证

### 2. Form组件

```tsx
import { Form, FormProvider } from '@/components/ui'

<FormProvider {...form.form}>
  <Form
    form={form.form}
    onSubmit={form.submitForm}
    title="故事创作表单"
    description="填写以下信息以开始AI故事生成"
    submitLabel="开始生成"
    enableAutoSave={true}
    autoSaveIndicator={true}
    errorSummary={true}
    className="space-y-6"
  >
    {/* 表单字段 */}
  </Form>
</FormProvider>
```

**特性：**
- 🎯 自动验证和错误显示
- 📊 错误汇总面板
- 💾 自动保存状态指示
- 🔄 表单重置和状态管理
- ⚡ 防抖提交处理

### 3. 表单字段组件

#### FormInput - 增强输入框

```tsx
import { FormInput } from '@/components/ui'

<FormInput
  name="theme"
  label="故事主题"
  placeholder="输入故事主题..."
  helpText="描述您故事的核心主题"
  required
  maxLength={200}
  showCharacterCount
  validateOnBlur={true}
  validateOnChange={false}
/>
```

#### FormTextarea - 增强文本域

```tsx
import { FormTextarea } from '@/components/ui'

<FormTextarea
  name="description"
  label="故事描述"
  placeholder="详细描述您的故事..."
  autoResize={true}
  maxLength={1000}
  showCharacterCount
  rows={4}
/>
```

#### FormSelect - 增强选择器

```tsx
import { FormSelect, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui'

<FormSelect
  name="novel_type"
  label="小说类型"
  placeholder="选择小说类型"
>
  <SelectTrigger>
    <SelectValue placeholder="选择小说类型" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="fantasy">奇幻</SelectItem>
    <SelectItem value="science_fiction">科幻</SelectItem>
  </SelectContent>
</FormSelect>
```

### 4. 智能输入组件

#### SmartInput - 智能输入建议

```tsx
import { SmartInput, createThemeSuggestionsGenerator } from '@/components/ui'

<SmartInput
  value={theme}
  onChange={setTheme}
  placeholder="输入故事主题..."
  generateSuggestions={createThemeSuggestionsGenerator()}
  maxSuggestions={5}
  loading={isGenerating}
  helpText="输入关键词获取AI生成的主题建议"
/>
```

#### ThemeSuggestions - 主题建议面板

```tsx
import { ThemeSuggestions } from '@/components/ui'

<ThemeSuggestions
  genre={selectedGenre}
  onSelectTheme={(theme) => setTheme(theme)}
  maxSuggestions={6}
/>
```

### 5. 表单数组组件

#### FormFieldArray - 动态字段数组

```tsx
import { FormFieldArray } from '@/components/ui'

<FormFieldArray
  name="constraints"
  values={constraints}
  onChange={(values) => setConstraints(values)}
  placeholder="例如：包含魔法元素..."
  itemLabel="约束条件"
  addButtonLabel="添加约束"
  maxItems={10}
  validateItem={(item) => item.length >= 2 && item.length <= 100}
  itemErrorMessage="约束条件应为2-100个字符"
/>
```

#### FormSuggestions - 建议选择面板

```tsx
import { FormSuggestions } from '@/components/ui'

<FormSuggestions
  suggestions={suggestions}
  onSelect={handleSelectSuggestion}
  placeholder="搜索建议..."
  maxSuggestions={10}
  categories={['基础', '高级', '专业']}
  filterable={true}
/>
```

## 📋 验证模式

### 故事大纲验证

```ts
// 定义验证模式
export const storyOutlineSchema = z.object({
  novel_type: z.enum(['fantasy', 'science_fiction', 'romance', 'mystery', 'historical', 'wuxia']),
  theme: z.string()
    .min(2, '最少需要2个字符')
    .max(200, '最多允许200个字符'),
  length: z.enum(['short', 'medium', 'long']),
  target_audience: z.enum(['general', 'young_adult', 'adult']),
  constraints: z.array(z.string()).max(10).optional()
})

// 使用验证
const form = useEnhancedForm<StoryOutlineFormData>({
  schema: storyOutlineSchema,
  // ...其他配置
})
```

### 自定义验证规则

```ts
// 字段级验证
<FormInput
  name="username"
  rules={{
    required: '用户名为必填项',
    minLength: { value: 3, message: '用户名至少3个字符' },
    pattern: { value: /^[a-zA-Z0-9_]+$/, message: '用户名只能包含字母、数字和下划线' }
  }}
/>

// 异步验证
<FormInput
  name="email"
  rules={{
    required: '邮箱为必填项',
    validate: async (value) => {
      const isAvailable = await checkEmailAvailability(value)
      return isAvailable || '该邮箱已被注册'
    }
  }}
/>
```

## 🔄 自动保存系统

### 基本自动保存

```tsx
const form = useEnhancedForm({
  storageKey: 'my-form-data',
  enableAutoSave: true,
  autoSaveDelay: 3000, // 3秒后自动保存
  onAutoSave: (data) => {
    console.log('Auto-saved:', data)
  }
})
```

### 独立的自动保存Hook

```tsx
import { useAutoSave } from '@/lib/hooks/use-enhanced-form'

const { isAutoSaving, lastSaved, restoreAutoSave, clearAutoSave } = useAutoSave(
  form,
  {
    storageKey: 'my-form-autosave',
    delay: 2000,
    onSave: (data) => console.log('Saved:', data),
    onError: (error) => console.error('Save error:', error)
  }
)
```

## 🎨 自定义样式

### 主题定制

```tsx
// 自定义样式
<FormInput
  className="custom-input"
  labelClassName="custom-label"
  errorClassName="custom-error"
/>

// Tailwind样式
<FormInput
  className="border-2 border-purple-500 focus:border-purple-600"
  label="自定义样式输入"
/>
```

### 错误状态样式

```tsx
// 错误状态
<FormInput
  name="email"
  error={errors.email}
  className={cn(
    errors.email && "border-red-500 focus:ring-red-500",
    "custom-error-class"
  )}
/>
```

## 🧪 测试

### 表单测试示例

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

test('form validation works correctly', async () => {
  render(<YourFormComponent />)
  
  const submitButton = screen.getByRole('button', { name: /提交/i })
  
  // 提交空表单
  fireEvent.click(submitButton)
  
  await waitFor(() => {
    expect(screen.getByText('此字段为必填项')).toBeInTheDocument()
  })
  
  // 填写表单并提交
  await userEvent.type(screen.getByLabelText('故事主题'), '友谊与背叛')
  
  fireEvent.click(submitButton)
  
  await waitFor(() => {
    expect(screen.queryByText('此字段为必填项')).not.toBeInTheDocument()
  })
})
```

## 📚 最佳实践

### 1. 表单结构

```tsx
// 良好的表单结构
<Form onSubmit={handleSubmit}>
  <div className="space-y-6">
    <PageSection title="基本信息">
      <FormInput name="title" label="标题" required />
      <FormTextarea name="description" label="描述" />
    </PageSection>
    
    <PageSection title="高级设置">
      <FormSelect name="category" label="分类" />
      <FormFieldArray name="tags" label="标签" />
    </PageSection>
  </div>
</Form>
```

### 2. 验证策略

```tsx
// 渐进式验证
<FormInput
  name="email"
  validateOnBlur={true}
  validateOnChange={false} // 避免过度验证
/>

// 异步验证优化
<FormInput
  name="username"
  rules={{
    validate: debounce(async (value) => {
      if (!value) return true
      const isAvailable = await checkAvailability(value)
      return isAvailable || '用户名已被使用'
    }, 500)
  }}
/>
```

### 3. 性能优化

```tsx
// 避免不必要的重渲染
const FormComponent = React.memo(({ initialData }) => {
  const form = useEnhancedForm({
    defaultValues: initialData,
    // 其他配置
  })
  
  return <Form>...</Form>
})

// 使用React Hook Form的优化
const { watch } = form
const watchedValues = watch(['field1', 'field2']) // 只监听需要的字段
```

### 4. 错误处理

```tsx
// 统一的错误处理
const handleSubmit = async (data) => {
  try {
    await api.submit(data)
    toast({ title: '提交成功', variant: 'success' })
  } catch (error) {
    if (error.response?.data?.errors) {
      // 服务器验证错误
      Object.entries(error.response.data.errors).forEach(([field, message]) => {
        form.setError(field, { message: message as string })
      })
    } else {
      // 网络或其他错误
      toast({ title: '提交失败', description: error.message, variant: 'destructive' })
    }
  }
}
```

## 🔧 故障排除

### 常见问题

1. **表单不验证**
   - 确保在FormProvider内使用表单组件
   - 检查schema定义是否正确
   - 验证resolver配置

2. **自动保存不工作**
   - 确认storageKey已设置
   - 检查localStorage权限
   - 验证onAutoSave回调

3. **智能建议不显示**
   - 检查generateSuggestions函数
   - 确认网络请求正常
   - 验证数据格式

## 📖 API参考

### useEnhancedForm Hook

```tsx
const form = useEnhancedForm({
  schema: zodSchema,           // Zod验证模式
  onSubmit: (data) => {},      // 提交处理函数
  onError: (error) => {},      // 错误处理函数
  enableAutoSave: true,        // 启用自动保存
  autoSaveDelay: 3000,         // 自动保存延迟（毫秒）
  storageKey: 'form-key',      // 存储键名
  onAutoSave: (data) => {},    // 自动保存回调
  defaultValues: {},           // 默认值
  validateOnMount: false       // 挂载时验证
})
```

### Form组件Props

```tsx
<Form
  form={form}                  // react-hook-form实例
  onSubmit={handleSubmit}      // 提交处理函数
  title="表单标题"             // 表单标题
  description="表单描述"       // 表单描述
  submitLabel="提交"           // 提交按钮文本
  enableAutoSave={true}        // 启用自动保存
  autoSaveIndicator={true}     // 显示自动保存指示器
  errorSummary={true}          // 显示错误汇总
  validateOnMount={false}      // 挂载时验证
/>
```

---

这个表单增强系统为NovelForge提供了企业级的表单处理能力，支持复杂验证、自动保存、智能建议等高级功能。