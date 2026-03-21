# NovelForge API 模块逻辑架构文档

本目录包含 NovelForge 的 FastAPI Web 接口层，负责将核心 AI 提取与规划能力通过 HTTP 端点暴露给前端和外部调用者。

## 1. 内部代码内联逻辑图 (Internal Logic Flow)

该图描述了本文件夹内各文件之间的依赖与数据流转关系：

```text
       [  main.py  ] <--- (Uvicorn 启动入口)
             |
             v (from . import app)
       +--------------------------------------------+
       |             __init__.py                    | (FastAPI 枢纽 / 单例中心)
       +--------------------------------------------+
             |               |               |
             | (from .types) | (from .ai_...) | (router.include)
             v               v               v
       [  types.py  ] <==== [ ai_planning_service.py ]  [ text_processing.py ]
       (Pydantic 模型)      (创意规划逻辑封装)           (文本预处理端点)
             ^               |                       |
             |               |                       |
       +--------------------------------------------------------------------+
       |  外部核心依赖 (通过相对导入 .. 访问)                                |
       +--------------------------------------------------------------------+
       | [ ..core.config ] <--- 读取全局配置                                |
       | [ ..services.ai_service ] <--- 获取 AI 实例处理 Planning 需求      |
       | [ ..services.text_processing_service ] <--- 处理 TextProc 业务     |
       +--------------------------------------------------------------------+

数据流向:
[ 用户请求 ] --(HTTP)--> [ __init__.py ] --(分发)--> [ 业务文件 ] --(AI/处理)--> [ 结果返回 ]
```

## 2. 核心文件职责说明

| 文件名 | 职责描述 | 交互逻辑 |
| :--- | :--- | :--- |
| **`__init__.py`** | **全局调度中心**。负责实例化全局 Config、AIService 和存储管理器，配置 CORS 以及注册所有 API 端点。集成统一错误处理中间件。 | 初始化其他模块所需的所有单例 (Singleton)，并配置错误处理器。 |
| **`types.py`** | **数据契约层**。定义了所有的 Request 和 Response Pydantic 模型，以及枚举常量。 | 为其他所有文件提供统一的数据校验标准。 |
| **`ai_planning_service.py`** | **创意中台**。封装了小说大纲生成、角色设计、世界观构建的具体 Prompt 逻辑。 | 调用 `services.ai_service` 执行 AI 提取并返回结构化数据。 |
| **`text_processing.py`** | **预处理网关**。提供文本上传、清洗、章节识别的 API 端点。 | 将繁重的正则表达式和文件解析工作分发给 `services.text_processing_service`。 |
| **`error_handler.py`** | **统一错误处理**。提供标准化的API错误响应格式和异常处理中间件，支持错误分类、重试建议和详细上下文。集成Core模块的自定义异常体系，确保端到端的一致性。 | 捕获所有异常并转换为统一的JSON错误响应格式。 |
| **`main.py`** | **运行脚本**。主要用于通过 `uvicorn` 工具直接启动 API 服务。 | 极简封装，仅导出 `app` 实例。 |

## 3. 跨包寻址逻辑 (Cross-package Addressing)

项目已全部重构为**相对导入 (Relative Imports)**：

- **向上引用**：使用 `..services` 或 `..core` 访问父目录组件，确保了包的独立性。
- **同级引用**：使用 `.types` 或 `.ai_planning_service` 建立本地连接。

## 4. 数据处理流转过程

1. **接收层 (`__init__.py`)**：通过 FastAPI 接收 HTTP 请求。
2. **验证层 (`types.py`)**：Pydantic 自动检查 JSON 字段合法性。
3. **逻辑层 (`planning/text_proc`)**：根据业务类型分发，准备 Prompt 或处理文件。
4. **服务层 (`services/core`)**：调用底层 AI 模型或执行提取算法。
5. **返回层**：将统一的 Pydantic 模型序列化为 JSON 响应给用户。

## 5. API路由说明

### 5.1 主要端点

- **`POST /api/extract/text`**: 执行文本内容提取（角色、世界、时间线）
- **`POST /api/extract/file`**: 从文件执行内容提取
- **`POST /api/workflow/start-process`**: 启动完整工作流处理
- **`GET /api/workflow/status/{task_id}`**: 查询任务状态
- **`POST /api/ai/generate-story-outline`**: 生成故事大纲
- **`POST /api/ai/design-characters`**: 角色设计
- **`POST /api/ai/build-world-setting`**: 世界设定构建
- **`GET /health`**: 健康检查端点

### 5.2 路由特性

- **版本控制**: API端点使用`/api/`前缀，未来版本演进将通过路径版本化实现
- **请求验证**: 自动验证请求体格式，返回详细的验证错误
- **速率限制**: 集成Base模块的限流器，防止API滥用
- **异步处理**: 长时间运行的任务返回任务ID，客户端可轮询状态

## 6. 统一错误响应与配置管理

API层实现了**端到端的统一错误处理体系**，并与Core模块的异常体系深度集成。

### 6.1 标准错误响应结构

所有API错误响应遵循严格的JSON Schema标准：

```json
{
  "error": "错误信息",
  "detail": "详细错误信息",
  "timestamp": "2026-03-20T18:03:39Z"
}
```

### 6.2 HTTP状态码映射策略

- **400 Bad Request**: 输入验证错误、无效参数、格式错误
- **422 Unprocessable Entity**: 语义验证失败、业务规则冲突
- **429 Too Many Requests**: 速率限制触发（RPM/TPM双重限制）
- **500 Internal Server Error**: 服务器内部错误、未预期异常
- **503 Service Unavailable**: 服务暂时不可用（AI服务超载、存储不可用等）

### 6.3 企业级错误处理特性

- **全链路错误分类**: 完整继承Core模块的异常层次结构，支持精确的错误分类和处理
- **智能重试建议**: 对可恢复错误提供明确的重试建议、重试时间和指数退避策略
- **完整上下文传递**: 包含操作上下文、输入数据摘要、用户ID、追踪ID等完整调试信息
- **用户友好体验**: 向用户提供清晰的错误描述、可能原因和解决方案建议
- **结构化日志集成**: 所有错误自动记录为JSON格式结构化日志，支持ELK等日志分析系统
- **监控指标暴露**: 错误类型和频率自动暴露为Prometheus指标，便于监控告警

### 6.4 配置管理与存储集成

系统配置通过`core.config`模块统一管理，支持动态调整关键参数：

#### 核心配置选项

```bash
# AI服务配置
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4-turbo

# 存储配置 - 关键性能影响
STORAGE_TYPE=content_db          # 生产环境必须使用content_db
CONTENT_DATABASE_PATH=./data/content.db
DATABASE_PATH=./data/novelforge.db

# 性能优化配置
MIN_CONCURRENCY=2
MAX_CONCURRENCY=10
TARGET_SUCCESS_RATE=0.95
RPM_LIMIT=500
TPM_LIMIT=2000000

# 提取参数
MAX_TEXT_LENGTH=100000
MAX_CHARACTERS=50
EXTRACTION_TEMPERATURE=0.3
CREATIVE_TEMPERATURE=0.8
```

#### 存储性能影响

- **开发环境**: `STORAGE_TYPE=file` - 便于调试，性能基准
- **生产环境**: `STORAGE_TYPE=content_db` - **获得29倍端到端性能提升**，支持万级条目高效处理

API层通过统一的配置管理和错误处理体系，确保了NovelForge在各种部署环境下都能提供稳定、可靠、高性能的服务。

- 所有异常都被捕获并转换为标准化的错误响应
- 支持错误分类（validation_error, processing_error, api_error等）
- 提供重试建议和详细错误上下文
- 通过环境变量配置日志级别和结构化日志输出

系统配置通过`core.config`模块统一管理，支持动态调整AI参数、并发控制、存储后端等选项。
