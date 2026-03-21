# NovelForge 系统核心 (Core) 模块逻辑架构文档

本目录是这整个 Python 后端项目中**最底层、依赖度最高**的领域驱动设计核心层。它完全不包含具体的业务逻辑，只定义了“是什么”以及“系统的基础开关”。

## 1. 内部代码内联逻辑图 (Internal Logic Flow)

```text
+-----------------------------------------------------+
|                  [ config.py ]                      |
| (负责所有 .env 的读取、全系统配置管理)              |
+-------------------------------+---------------------+
                                 ^依赖
                [ 全系统其它任意模块的初始化 ]

+-----------------------------------------------------+
|                  [ models.py ]                      |
|       (Pydantic 核心领域数据模型 / Entity)          |
+-----------------------------------------------------+
|  [ error_handler.py ]  [ error_utils.py ]           |
|    (统一错误处理)        (错误工具函数)             |
+-----------------------------------------------------+
|            [ exceptions.py ]                        |
|         (自定义异常类定义)                          |
+-----------------------------------------------------+
|            [ logging_config.py ]                    |
|         (结构化日志配置)                            |
+-----------------------------------------------------+
```

## 2. 核心文件职责说明

| 文件名 | 职责描述 |
| :--- | :--- |
| **`config.py`** | 封装了全局通用静态配置，包括：<br>- AI服务配置（API密钥、基础URL、模型）<br>- 提取配置（最大文本长度、最大角色数）<br>- 动态并发配置（最小/最大并发数、目标成功率）<br>- 限流配置（RPM/TPM限制）<br>- 重试配置（最大重试次数、延迟策略）<br>- 存储配置（存储类型、数据库路径） |
| **`models.py`** | 最核心的业务骨骼文件。定义了到底什么才叫作一个“角色卡”，什么才叫作一个“地点实体”。项目内任何接口传递的数据结构最终都继承或映射自此类。 |
| **`error_handler.py`** | 提供统一的错误处理装饰器和函数，支持错误分类、上下文记录和自动重抛。 |
| **`error_utils.py`** | 错误处理工具函数，用于错误转换、日志记录和状态码映射。 |
| **`exceptions.py`** | 自定义异常类定义，包括NovelForgeError（基类）、APIError（API调用错误）、ValidationError（数据验证错误）、ProcessingError（处理错误）、StorageError（存储错误）等，支持错误分类和上下文传递。 |
| **`logging_config.py`** | 结构化日志配置，支持JSON格式日志输出和多级日志级别控制。 |

## 3. 配置选项说明

系统通过环境变量进行配置，主要配置项包括：

### 3.1 AI服务配置

- **AI服务**: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`

### 3.2 提取与处理参数

- **提取参数**: `MAX_TEXT_LENGTH`, `MAX_CHARACTERS`, `EXTRACTION_TEMPERATURE`, `CREATIVE_TEMPERATURE`

### 3.3 性能优化配置

- **动态并发**: `MIN_CONCURRENCY=2`, `MAX_CONCURRENCY=10`, `TARGET_SUCCESS_RATE=0.95`, `TARGET_RESPONSE_TIME=5.0`

### 3.4 限流与重试配置

- **限流控制**: `RPM_LIMIT=500`, `TPM_LIMIT=2000000`
- **重试策略**: `MAX_RETRIES=5`, `RETRY_BASE_DELAY=2.0`, `RETRY_MAX_DELAY=120.0`

### 3.5 存储配置

- **存储配置**: `STORAGE_TYPE=file` (可选值: file/memory/database/content_db), `DATABASE_PATH=./data/novelforge.db`

### 3.6 日志配置

- **日志配置**: `LOG_LEVEL=INFO`, `LOG_FILE=./logs/novelforge.log`, `STRUCTURED_LOGGING=true`

## 4. 统一错误处理机制

Core模块提供了**端到端的统一错误处理体系**，这是NovelForge架构的核心支柱之一：

- **自定义异常层次**: 所有异常继承自`NovelForgeError`基类，形成完整的异常层次结构：
  - `APIError`: AI服务调用错误（超时、限流、认证失败）
  - `ValidationError`: 数据验证和格式错误
  - `ProcessingError`: 内容处理和提取错误
  - `StorageError`: 存储操作错误（文件IO、数据库连接）
  - `ConfigurationError`: 配置缺失或无效

- **错误上下文传递**: 每个异常都携带完整的上下文信息，包括操作类型、输入数据摘要、时间戳、堆栈跟踪等，支持跨模块错误追踪

- **标准化错误响应**: 通过`error_handler.py`提供统一的错误处理装饰器，自动转换为标准JSON格式响应，包含错误类型、详细信息、重试建议和严重级别

- **自动日志记录**: 集成`logging_config.py`的结构化日志系统，所有错误自动记录为JSON格式，便于监控和分析

- **智能重试集成**: 与Base模块的重试策略深度集成，对可恢复错误自动应用指数退避重试

- **HTTP状态码映射**: 自动将异常类型映射到相应的HTTP状态码（400、422、429、500、503等），确保API层一致性

该机制确保了从API层到存储层的**全链路错误处理一致性**，显著提高了系统的可观测性、可维护性和用户体验。

- **AI服务**: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`
- **提取参数**: `MAX_TEXT_LENGTH`, `MAX_CHARACTERS`, `EXTRACTION_TEMPERATURE`, `CREATIVE_TEMPERATURE`
- **性能优化**: `MIN_CONCURRENCY`, `MAX_CONCURRENCY`, `TARGET_SUCCESS_RATE`, `TARGET_RESPONSE_TIME`
- **限流控制**: `RPM_LIMIT`, `TPM_LIMIT`
- **重试策略**: `MAX_RETRIES`, `RETRY_BASE_DELAY`, `RETRY_MAX_DELAY`
- **存储配置**: `STORAGE_TYPE`, `DATABASE_PATH`
- **日志配置**: `LOG_LEVEL`, `LOG_FILE`, `STRUCTURED_LOGGING`
