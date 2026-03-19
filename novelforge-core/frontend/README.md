# NovelForge 前端

> 基于 Next.js 15 的小说创作辅助工具前端界面  
> 最后更新：2026-03-20

---

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | ^15.0.0 | React 框架 (App Router) |
| React | ^18.3.0 | UI 框架 |
| TypeScript | ^5.6.0 | 类型安全 |
| Tailwind CSS | ^3.4.0 | 样式 |
| Radix UI | latest | 无障碍组件基础 |
| Zustand | ^5.0.11 | 全局状态管理 |
| React Hook Form | ^7.71.2 | 表单处理 |
| Zod | ^4.3.6 | 数据校验 |
| Lucide React | ^0.454.0 | 图标库 |

---

## 快速启动

```bash
cd novelforge-core/frontend

# 安装依赖
npm install

# 开发模式
npm run dev
# 访问：http://localhost:3000

# 生产构建
npm run build && npm start

# 代码检查
npm run lint
```

---

## 目录结构

```
frontend/
├── src/
│   ├── app/                      # Next.js App Router 页面
│   │   ├── globals.css           # 全局样式
│   │   ├── layout.tsx            # 根布局（含 Sidebar、Header、Footer）
│   │   ├── page.tsx              # 首页
│   │   ├── ai-planning/          # AI 规划页面 ✅
│   │   ├── novel-editor/         # 小说编辑器 ✅
│   │   ├── ui-demo/              # UI 组件演示 ✅
│   │   ├── characters/           # 角色管理 🔄（目录存在，页面待完善）
│   │   ├── world/                # 世界设定 🔄（目录存在，页面待完善）
│   │   ├── editor/               # 富文本编辑器 🔄（目录存在，页面待完善）
│   │   ├── analytics/            # 数据分析 🔄（目录存在，页面待完善）
│   │   ├── settings/             # 系统设置 🔄（目录存在，页面待完善）
│   │   └── workflow/             # 工作流 ⏳（待开发）
│   ├── components/
│   │   ├── layout/               # 布局组件
│   │   │   ├── app-sidebar.tsx   # 侧边栏导航
│   │   │   ├── app-header.tsx    # 顶部导航栏
│   │   │   ├── app-footer.tsx    # 页脚
│   │   │   ├── app-breadcrumb.tsx# 面包屑
│   │   │   └── layout-utils.tsx  # Container / Grid 等布局工具
│   │   ├── ui/                   # 基础 UI 组件（基于 Radix UI）
│   │   │   ├── button.tsx, card.tsx, input.tsx, textarea.tsx
│   │   │   ├── dialog.tsx, alert.tsx, toast.tsx, tooltip.tsx
│   │   │   ├── select.tsx, badge.tsx, spinner.tsx
│   │   │   └── progress-bar.tsx, status-indicator.tsx
│   │   ├── Character/            # 角色相关组件
│   │   ├── Plot/                 # 剧情相关组件
│   │   ├── World/                # 世界设定相关组件
│   │   └── TextUpload/           # 文件上传组件
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts         # 基础 APIClient（fetch 封装，含超时控制）
│   │   │   └── sillytavern.ts    # SillyTavern API 集成
│   │   ├── hooks/                # 自定义 React Hooks
│   │   ├── utils/                # 工具函数
│   │   ├── error-handling/       # 错误分类、错误边界、重试逻辑
│   │   └── validation/           # Zod Schema 数据验证
│   └── types/                    # TypeScript 全局类型定义
├── tests/
│   └── error-handling.test.tsx   # 错误处理组件单元测试（Vitest）
├── docs/
│   ├── LAYOUT_SYSTEM.md          # 布局系统设计说明
│   ├── ERROR_HANDLING.md         # 错误处理机制说明
│   └── FORM_ENHANCEMENT.md       # 表单增强方案说明
├── .env.local                    # 本地环境变量（需自行创建）
├── .env.local.example            # 环境变量模板
├── next.config.js
├── tailwind.config.js
└── tsconfig.json
```

---

## 环境变量配置

复制 `.env.local.example` 为 `.env.local` 并填写：

```env
# NovelForge 后端 API 地址
NEXT_PUBLIC_API_URL=http://localhost:8000

# SillyTavern 地址
NEXT_PUBLIC_SILLYTAVERN_URL=http://localhost:8000
```

---

## API 客户端使用

`src/lib/api/client.ts` 提供了基础 `APIClient` 类，支持 GET/POST/PUT/DELETE，内置 30秒 超时控制：

```typescript
import { APIClient } from '@/lib/api/client'

const client = new APIClient('http://localhost:8000')

// GET 请求
const data = await client.get<ResponseType>('/api/ai/generate-story-outline')

// POST 请求
const result = await client.post<ResponseType>('/api/ai/design-characters', {
  context: '故事背景...',
  roles: ['protagonist', 'antagonist']
})
```

---

## 当前页面状态

| 页面 | 路由 | 状态 |
|------|------|------|
| 首页 | `/` | ✅ 完成 |
| AI 规划 | `/ai-planning` | ✅ 完成 |
| 小说编辑器 | `/novel-editor` | ✅ 完成 |
| UI 演示 | `/ui-demo` | ✅ 完成 |
| 角色管理 | `/characters` | 🔄 开发中 |
| 世界设定 | `/world` | 🔄 开发中 |
| 编辑器 | `/editor` | 🔄 开发中 |
| 数据分析 | `/analytics` | 🔄 开发中 |
| 系统设置 | `/settings` | 🔄 开发中 |
| 工作流管理 | `/workflow` | ⏳ 待开发 |

---

## 测试

```bash
# 前端 lint 检查
npm run lint

# TypeScript 类型检查
npx tsc --noEmit

# 单元测试（需安装 vitest 和 @testing-library/react）
npx vitest tests/
```

> **注意**：`tests/error-handling.test.tsx` 依赖 `vitest` 和 `@testing-library/react`，
> 如果尚未安装开发依赖，运行 `npm install --save-dev vitest @testing-library/react @testing-library/user-event` 后再执行测试。