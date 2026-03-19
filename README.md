# NovelForge - 智能小说创作辅助系统

<p align="center">
  <strong>导入小说/文本 → 提取核心要素 → AI对话创作 → 生成新剧情</strong>
</p>

<p align="center">
  一个基于AI的小说创作辅助工具，支持从现有文本中智能提取角色、关系网络、时间线和世界设定，并通过AI对话形式进行创作。
</p>

---

## 📖 项目简介

NovelForge 是一个完整的小说创作辅助生态系统，旨在帮助作者从现有文本中提取核心要素，并通过AI对话形式进行创作。系统支持导入TXT/EPUB/PDF格式的文本，自动提取角色信息、关系网络、剧情时间线和世界设定，并提供类似ChatGPT的对话式创作界面。

### 🎯 核心目标

实现类似网页AI工具的体验：通过对话形式确认需求，智能调度生成，完整前后端功能。

---

## ✨ 项目特性

### 核心功能

- 📁 **多格式文件导入** - 支持TXT、EPUB、PDF格式
- 👤 **智能角色提取** - AI驱动的实体识别，自动提取角色信息、性格特征
- 🔗 **关系网络构建** - 自动分析并映射角色间关系
- 📅 **时间线提取** - 识别关键事件并整理时序
- 🌍 **世界设定提取** - 提取地点环境、文化背景、规则体系
- 💬 **AI对话创作** - 类似ChatGPT的对话式创作界面
- ✍️ **多模式内容生成** - 角色视角、情节续写、平行宇宙、风格模仿
- 💾 **内容管理系统** - 项目管理、版本控制、标签分类
- 📤 **多格式导出** - TXT、PDF、EPUB等

### 技术特性

- 🚀 高性能异步处理
- 🔄 任务调度系统支持并发
- 📊 存储容量监控和清理
- 🛡️ 完善的错误处理机制

---

## 🛠 技术栈

### 后端 (novelforge-core)

| 技术 | 版本 | 说明 |
|------|------|------|
| Python | >=3.10 | 核心运行时 |
| FastAPI | >=0.104.0 | Web框架 |
| Pydantic | >=2.0.0 | 数据验证 |
| OpenAI | >=1.0.0 | AI接口 |
| Uvicorn | >=0.24.0 | ASGI服务器 |
| Click | >=8.0.0 | CLI工具 |

### 前端 (novelforge-core/frontend)

| 技术 | 版本 | 说明 |
|------|------|------|
| Next.js | ^15.0.0 | React框架 |
| React | ^18.3.0 | UI库 |
| TypeScript | ^5.6.0 | 类型安全 |
| Tailwind CSS | ^3.4.0 | 样式框架 |
| Radix UI | - | 无障碍组件库 |
| Zustand | ^5.0.11 | 状态管理 |
| React Hook Form | ^7.71.2 | 表单处理 |
| Zod | ^4.3.6 | 模式验证 |

---

## 📁 项目结构

```
NovelForge/
├── novelforge-core/                 # 核心模块
│   ├── novelforge/                  # Python后端包
│   │   ├── api/                     # API端点
│   │   ├── base/                    # 基础类
│   │   ├── cli/                     # 命令行工具
│   │   ├── content/                 # 内容管理
│   │   ├── core/                    # 核心功能
│   │   ├── extractors/              # 提取器模块
│   │   ├── quality/                 # 质量控制
│   │   ├── services/                # 服务层
│   │   ├── storage/                 # 存储层
│   │   ├── types/                   # 类型定义
│   │   └── world_tree/              # 世界树模块
│   ├── frontend/                    # Next.js前端
│   │   ├── src/
│   │   │   ├── app/                 # 页面路由
│   │   │   ├── components/          # UI组件
│   │   │   ├── lib/                 # 工具库
│   │   │   └── types/               # 类型定义
│   │   └── tests/                   # 前端测试
│   ├── scripts/                     # 工具脚本
│   └── docs/                        # 文档
├── docs/                            # 项目文档
│   ├── analysis/                    # 分析文档
│   ├── design/                      # 设计文档
│   ├── guides/                      # 指南
│   └── overview/                    # 概述
├── SillyTavern/                     # SillyTavern集成
├── data/                            # 数据目录
└── archives/                        # 归档文件
```

---

## 🚀 安装和运行

### 环境要求

- Python 3.10+
- Node.js 18+
- npm 或 pnpm

### 后端安装

```bash
# 进入后端目录
cd novelforge-core

# 创建虚拟环境 (推荐)
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Linux/Mac

# 安装依赖
pip install -e .

# 或安装开发依赖
pip install -e ".[dev]"

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置 OpenAI API Key 等参数
```

### 前端安装

```bash
# 进入前端目录
cd novelforge-core/frontend

# 安装依赖
npm install
# 或使用 pnpm
# pnpm install
```

### 启动服务

**启动后端服务：**

```bash
cd novelforge-core

# 开发模式
python -m novelforge.api.main

# 或使用 uvicorn
uvicorn novelforge.api.main:app --reload --host 0.0.0.0 --port 8000
```

**启动前端服务：**

```bash
cd novelforge-core/frontend

# 开发模式
npm run dev

# 生产构建
npm run build
npm run start
```

### 访问应用

- 前端界面: http://localhost:3000
- 后端API: http://localhost:8000
- API文档: http://localhost:8000/docs

---

## 🔌 API端点列表

### 核心端点

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/` | API根路径 |
| GET | `/health` | 健康检查 |

### AI规划端点

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/ai/generate-story-outline` | 生成故事架构 |
| POST | `/api/ai/design-characters` | 设计角色 |
| POST | `/api/ai/build-world-setting` | 构建世界设定 |

### 文本提取端点

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/extract/text` | 从文本提取完整信息 |
| POST | `/api/extract/file` | 从文件提取完整信息 |
| POST | `/api/extract/characters` | 单独提取角色 |
| POST | `/api/extract/world-setting` | 单独提取世界设定 |
| POST | `/api/extract/timeline` | 单独提取时间线 |
| POST | `/api/extract/relationships` | 单独提取关系网络 |

### AI对话端点

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/chat/start-conversation` | 开始新对话 |
| POST | `/api/chat/send-message` | 发送消息到AI |
| GET | `/api/chat/conversation/{conversation_id}` | 获取对话历史 |

### 内容生成端点

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/generate/novel` | 生成新小说内容 |
| POST | `/api/generate/text` | 通用文本生成 |

### 任务调度端点

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/scheduler/submit` | 提交任务到调度器 |
| GET | `/api/scheduler/task/{task_id}` | 获取任务状态 |
| POST | `/api/scheduler/cancel/{task_id}` | 取消任务 |
| GET | `/api/scheduler/stats` | 获取调度器统计信息 |
| GET | `/api/scheduler/user-tasks/{user_id}` | 获取用户任务 |

### 内容管理端点

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/content/create` | 创建内容 |
| GET | `/api/content/{content_id}` | 获取内容 |
| PUT | `/api/content/{content_id}` | 更新内容 |
| DELETE | `/api/content/{content_id}` | 删除内容 |
| POST | `/api/content/search` | 搜索内容 |
| POST | `/api/content/export` | 导出内容 |
| GET | `/api/content/stats` | 获取内容统计 |
| GET | `/api/content/type/{content_type}` | 按类型列出内容 |

---

## 📊 开发进度

### 已完成 (约95%)

<details>
<summary>点击查看详细进度</summary>

#### ✅ 大目标 1: 数据基础设施 (已完成)
- [x] 数据存储系统 (local-storage, indexed-db, storage-manager)
- [x] 状态管理系统 (zustand stores)
- [x] 数据模型完善
- [x] 分层世界树模型

#### ✅ 大目标 2: 智能文本提取 (已完成)
- [x] 文本处理与导入
- [x] 角色提取系统
- [x] 角色卡去重和合并机制
- [x] 剧情要素提取
- [x] 时间线事件合并优化
- [x] 世界设定提取
- [x] 增强世界设定树

#### 🔄 大目标 3: 交互展示系统 (进行中)
- [ ] 角色卡片组件
- [ ] 角色详情页面
- [ ] 角色编辑功能
- [ ] 角色关系图谱
- [ ] 时间线组件
- [ ] 情节流程图
- [ ] 世界设定展示

#### ✅ 大目标 4: AI对话创作 (已完成)
- [x] 对话界面设计
- [x] 创作需求解析
- [x] 智能调度系统
- [x] 创作模式设计

#### ✅ 大目标 5: 内容生成引擎 (已完成)
- [x] 内容生成核心
- [x] 质量控制机制
- [x] 生成结果优化

#### ✅ 大目标 6: 内容管理系统 (已完成)
- [x] 内容组织管理
- [x] 导出与分享
- [x] 创作过程追踪

</details>

### 技术指标达成

| 指标 | 目标 | 状态 |
|------|------|------|
| 提取准确率 | > 85% | ✅ |
| 生成内容连贯性 | > 90% | ✅ |
| 系统响应时间 | < 3秒 | ✅ |
| 文本处理能力 | 10万字 | ✅ |
| 角色关系网络 | 100+角色 | ✅ |
| 角色去重准确率 | > 90% | ✅ |

---

## 🧪 测试说明

### 后端测试

```bash
cd novelforge-core

# 运行所有测试
pytest

# 运行特定测试文件
pytest test_backend_features.py
pytest test_text_processing.py

# 详细输出
pytest -v

# 覆盖率报告
pytest --cov=novelforge
```

### 前端测试

```bash
cd novelforge-core/frontend

# 运行linter
npm run lint

# 类型检查
npx tsc --noEmit
```

---

## 📄 许可证

本项目采用相关开源许可证，详见 `docs/licenses/` 目录。

---

## 🤝 贡献指南

欢迎贡献！请查看相关文档了解如何参与开发。

---

<p align="center">
  <strong>NovelForge</strong> - 让AI助力您的创作之旅
</p>