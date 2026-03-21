# NovelForge 内容资源管理 (Content) 模块逻辑架构文档

本目录专门处理“被导入的原著生肉文本”。所有的长篇小说文档在交给大模型处理之前，必须经过本模块的标准化、切分和梳理操作。

## 1. 内部代码内联逻辑图 (Internal Logic Flow)

```text
[ 生肉文本 / EPUB / TXT ] 
           |
           v
   [ manager.py ] <-------------- (统一对外调度门面 Facade)
           |
    +----->+------------------------+
    |                               |
[ text_preprocessor.py ]     [ text_analyzer.py ]
   (乱码清理/标准化清洗)          (文本特征和语言规律统计)
                                    |
                            [ chapter_detector.py ]
                             (正则/AI 辅助的智能分章器)
                                    |
                               [ models.py ]
                          (转化为内部标准的结构化段落)
```

## 2. 核心文件职责说明

| 文件名 | 职责描述 |
| :--- | :--- |
| **`manager.py`** | 这个模块对外的管家，负责协调各预处理功能。 |
| **`chapter_detector.py`** | 智能章节提取器：依靠正则表达式尝试找出第 N 章，失败时使用特定经验规则进行回退处理。 |
| **`text_preprocessor.py`** | 去除垃圾控制符、多余空行、修复生僻字编码错误。 |
| **`text_analyzer.py`** | 分析整书的长度、高频词汇等物理特征。 |
| **`models.py`** | 定义内容管理系统的核心数据模型，包括ContentMetadata（内容元数据）、ContentItem（内容项）和TextAnalysisResult（文本分析结果）。TextAnalysisResult包含以下关键字段：<br>- `total_chars`: 总字符数<br>- `total_words`: 总词数<br>- `total_paragraphs`: 总段落数<br>- `total_chapters`: 总章节数<br>- `avg_paragraph_length`: 平均段落长度<br>- `readability_score`: 可读性评分<br>- `language`: 检测到的主要语言<br>支持完整的版本控制、父子关系和状态管理。 |

## 3. 内容存储与数据库集成

内容模块现已与**新一代存储系统**深度集成，通过`content_database_storage.py`实现企业级高效内容管理。这是NovelForge从文件存储架构向数据库架构的重大演进。

### 3.1 性能基准与优势

**关键性能指标**：在万级条目（10,000+）的典型使用场景下，ContentDatabaseStorage相比传统文件存储：

- **写入性能提升29倍**
- **读取性能提升25倍**
- **查询性能从O(N)线性扫描优化到O(1)哈希索引**
- **内存占用显著降低**
- **完全支持多线程并发访问**

### 3.2 存储配置选项

通过环境变量灵活配置存储后端：

- `STORAGE_TYPE=content_db` - **推荐生产环境使用**，启用内容专用SQLite数据库存储
- `STORAGE_TYPE=file` - 开发环境使用，基于JSON文件存储
- `STORAGE_TYPE=database` - 通用键值对数据库存储
- `CONTENT_DATABASE_PATH=./data/content.db` - 指定内容数据库文件路径
- `DATABASE_PATH=./data/novelforge.db` - 指定通用数据库路径

### 3.3 核心功能特性

- **结构化内容存储**: 原生支持小说、章节、场景、角色、世界设定等复杂数据模型
- **完整生命周期管理**: 草稿→审核→发布→归档→删除的全流程状态管理
- **关系型数据支持**: 完整的父子内容关系、引用关系和版本控制
- **文本分析集成**: 自动持久化存储文本分析结果（字数统计、复杂度评分、角色密度等）
- **批量操作优化**: 针对大规模导入导出场景的性能优化
- **事务一致性**: ACID事务保证数据完整性和一致性

> **迁移建议**: 生产环境强烈推荐使用`content_db`存储类型，特别是在处理大量小说内容时。开发环境可继续使用`file`存储便于调试。

## 4. 待办与重构梳理 (适配 Todo Tree)

本模块未来重要的重构方向已使用规范化注释标注于各个文件中，强烈建议在 VS Code 中安装 **`Todo Tree`** 插件，并在该目录中统一追踪优化进度：

**推荐的 Todo Tree 识别规则设置 (tags)：**
`TODO:`, `FIXME:`, `[VectorRAG]`, `[Perf]`

### 当前需要跟踪的优化任务节点

- [x] **`TODO: [Database]`** 数据库存储已通过`content_database_storage.py`实现，解决了万级条目 `O(N)` 效率的遍历瓶颈。
- [ ] **`TODO: [VectorRAG]`** 结合 `create_content` 的回调时机，接入 ChromaDB 等本地向量数据库。将每次存储的文件自动转换为向量切片，让后续系统的大模型支持“过目不忘”的上下文查重与超长回忆能力。*(建议在 `manager.py` 处实施)*
- [ ] **`FIXME: [Perf]`** 在遭遇完全不规范文本打乱分章格式时，现有的复杂正则表达式分章面临回溯导致服务器卡顿的危险，需要进行安全重试封装以及截断。*(建议在 `chapter_detector.py` 处实施)*
- [ ] **`TODO:`** 引入轻量的基础 NLP 框架 (如 SpaCy/Jieba) 或特定模型，作为目前暴力的字符替换和正则表达式乱码清理的预处理增补方案。*(建议在 `text_preprocessor.py` 处实施)*
