# NovelForge Core - 后端模块

> Python FastAPI 后端，提供文本提取、AI 规划和内容管理服务  
> 最后更新：2026-03-20

---

## 功能概览

- 🎭 **角色提取**：从小说文本中识别和提取角色信息、性格、关系
- 🌍 **世界书提取**：提取地点、文化、规则体系、历史背景
- ⏳ **时间线提取**：自动识别关键事件并整理时序
- 🔗 **关系网络**：构建角色之间的关系网络图
- 🤖 **AI 对话创作**：对话式 AI 生成界面，支持续写、角色视角等模式
- 📋 **SillyTavern 兼容**：生成标准 Tavern Card V3 格式和 World Info 格式
- ⚡ **任务调度系统**：异步任务队列，支持并发控制和优先级管理
- 🔒 **安全提取**：带超时控制、内存管理、指数退避重试的安全提取器

---

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Python | >=3.10 | 后端语言 |
| FastAPI | >=0.104.0 | Web 框架 |
| Pydantic | >=2.0.0 | 数据验证 |
| Uvicorn | >=0.24.0 | ASGI 服务器 |
| OpenAI SDK | >=1.0.0 | AI 接口（OpenAI 兼容） |

---

## 安装与启动

### 环境配置

```bash
cd novelforge-core

# 创建虚拟环境
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # Linux/Mac

# 安装依赖
pip install -e .
# 或安装含开发依赖版本
pip install -e ".[dev]"

# 复制环境变量模板
copy .env.example .env
# 编辑 .env 填写 API Key 等参数
```

### 环境变量（`.env`）

```env
# AI 服务配置
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.siliconflow.cn/v1
OPENAI_MODEL=Pro/deepseek-ai/DeepSeek-V3.2

# 提取配置
MAX_TEXT_LENGTH=500000
MAX_CHARACTERS=20

# 并发配置
MIN_CONCURRENCY=2
MAX_CONCURRENCY=10
RPM_LIMIT=500
TPM_LIMIT=2000000
```

### 启动后端服务

```bash
# 开发模式（自动重载）
uvicorn novelforge.api.main:app --reload --host 0.0.0.0 --port 8000

# 或
python -m novelforge.api.main
```

访问：
- API 服务：http://localhost:8000
- Swagger 文档：http://localhost:8000/docs

---

## 目录结构

```
novelforge-core/
├── novelforge/               # 后端主包
│   ├── api/                  # FastAPI 端点
│   │   ├── main.py           # 服务入口
│   │   ├── ai_planning_service.py  # AI 规划服务
│   │   └── text_processing.py      # 文本处理端点
│   ├── core/                 # 核心层（数据模型、配置）
│   │   ├── config.py         # 配置管理
│   │   └── models.py         # 数据模型（Character, WorldSetting 等）
│   ├── base/                 # 基础组件（限流、重试、并发控制）
│   ├── services/             # 业务服务层
│   │   ├── ai_service.py     # AI 服务封装（chat、extract）
│   │   └── ai_scheduler.py   # 任务调度器
│   ├── extractors/           # 提取器
│   │   ├── character_extractor.py
│   │   ├── world_extractor.py
│   │   ├── timeline_extractor.py
│   │   ├── relationship_extractor.py
│   │   └── multi_window_orchestrator.py
│   ├── content/              # 内容管理
│   ├── quality/              # 质量评估
│   ├── storage/              # 存储层
│   ├── types/                # 类型定义
│   └── world_tree/           # 世界树系统
├── frontend/                 # Next.js 前端（见 frontend/README.md）
├── scripts/                  # 工具脚本
│   ├── test_api.py           # API 冒烟测试（需后端运行在 :8000）
│   ├── test_api_rate_limit.py# OpenAI API 速率测试工具
│   ├── start_api.py          # 快速启动脚本
│   └── ...                   # 其他工具脚本
├── test_backend_features.py  # 后端功能集成测试（需 AI 配置）
├── test_text_processing.py   # 文本处理模块单元测试
├── pyproject.toml            # 项目配置
└── .env                      # 本地环境变量（不提交）
```

---

## API 端点

### 核心

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/docs` | Swagger API 文档 |

### AI 规划

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/ai/generate-story-outline` | 生成故事架构 |
| POST | `/api/ai/design-characters` | 设计角色 |
| POST | `/api/ai/build-world-setting` | 构建世界设定 |

### 文本处理与提取

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/text-processing/upload-and-process` | 上传并处理文件（TXT/EPUB/PDF/DOCX）|
| POST | `/api/text-processing/process-text` | 直接处理文本内容 |
| GET | `/api/text-processing/supported-formats` | 获取支持的文件格式 |
| POST | `/api/extract/text` | 从文本提取全量信息 |
| POST | `/api/extract/characters` | 单独提取角色 |
| POST | `/api/extract/world-setting` | 单独提取世界设定 |
| POST | `/api/extract/timeline` | 单独提取时间线 |
| POST | `/api/extract/relationships` | 单独提取关系网络 |

### AI 对话

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/chat/start-conversation` | 开始新对话 |
| POST | `/api/chat/send-message` | 发送消息 |
| GET | `/api/chat/conversation/{id}` | 获取对话历史 |

### 内容管理与调度

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/generate/novel` | 生成新小说内容 |
| POST | `/api/scheduler/submit` | 提交任务 |
| GET | `/api/scheduler/task/{id}` | 查询任务状态 |
| CRUD | `/api/content/*` | 内容管理 |

---

## 命令行工具（CLI）

```bash
# 从小说中提取角色卡（SillyTavern 格式）
novelforge extract novel.txt -o output/

# 提取世界书
novelforge world novel.txt -o world.json

# 提取时间线
novelforge timeline novel.txt -o timeline.json

# 提取角色关系网络
novelforge relationships novel.txt

# 构建世界树（整合所有信息）
novelforge world-tree build novel.txt -a

# 转换为 SillyTavern 格式（角色卡 + World Info）
novelforge world-tree to-st world_tree.json -o ./st_output
```

---

## 测试

```bash
cd novelforge-core

# 文本处理模块单元测试（不需要 AI 配置）
python test_text_processing.py

# 完整后端功能集成测试（需要 AI API 配置）
python test_backend_features.py

# API 冒烟测试（需要后端服务运行在 :8000）
python scripts/test_api.py

# pytest 运行所有测试
pytest -v
pytest --cov=novelforge  # 含覆盖率
```

---

## 质量评分系统

基于 [aicharactercards.com](https://aicharactercards.com) 标准，对提取的角色卡进行评分：

| 等级 | 分数 | 说明 |
|------|------|------|
| S | 90-105 | 精英，近乎完美 |
| A | 80-89 | 优秀，可直接使用 |
| B | 60-79 | 良好，扎实可用 |
| C | 40-59 | 平均，功能完整 |
| D | 30-39 | 较弱，有结构问题 |
| F | 0-29 | 损坏，质量差 |

---

## 安全特性

- **超时控制**：API 调用 60 秒超时，总提取 10 分钟超时
- **内存管理**：文本大小限制 50 万字符，分片数量限制 50 个
- **动态并发控制**：根据 API 响应自动调整并发数（2~10）
- **智能限流**：RPM/TPM 限流，防止触发 API 限制
- **指数退避重试**：失败时自动重试，带随机抖动
