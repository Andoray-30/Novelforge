# NovelForge AI 提取引擎 (Extractors) 模块逻辑架构文档

本目录是本应用的核心车间，主要存放具体的提示词拼装流程与算法结构。它们的主要职责是从海量的文本段落里，像剥洋葱一样剥离出有价值的结构化要素（如人物、时间）。

## 1. 内部代码内联逻辑图 (Internal Logic Flow)

```text
                              [ 待处理的长文本块 ]
                                        |
                    +---------------------------------------+
                    | EnhancedMultiWindowOrchestrator /     |
                    | multi_window_orchestrator.py          |  <--- 增强协调器与滑动窗口调度
                    +---------------------------------------+
                      /                 |                   \
        [ enhanced_character_    [ enhanced_world_     [ enhanced_timeline_
          extractor.py ]           extractor.py ]         extractor.py ]
                |                       |                     |
      (增强角色信息提取)        (增强世界设定提取)       (增强时间线提取)
                |                       |                     |
                +-----------------------+---------------------+
                                        |
                  [ unified_extractor.py ] <--- 统一提取接口
                                        |
                  [ ai_service 发往大模型处理 -> 返回统一结构化结果 ]
```

## 2. 核心文件职责说明

| 文件名 | 职责描述 |
| :--- | :--- |
| **`EnhancedMultiWindowOrchestrator` / `multi_window_orchestrator.py`** | 增强协调器。因为一本小说无法一次性塞入 AI，它使用了**滑动切割窗口**的方法并发地一块块文本调用子提取器，并且负责后期缝合。集成动态并发控制和错误恢复机制。 |
| **`base_extractor.py`** | 设计所有专属逻辑提取器的基础类架构 (提炼公共代码模板)，提供统一的提取接口和错误处理。 |
| **`enhanced_base_extractor.py`** | 增强基础提取器，提供更强大的提示词工程和结果验证能力。 |
| **`character_extractor.py`** | 基础角色提取器：致力于通过 Prompt 使 AI 聚焦于人名、动机、性格的结构化抓取工具。 |
| **`enhanced_character_extractor.py`** | 增强角色提取器：提供更详细的属性提取、关系识别和语义一致性验证。 |
| **`world_extractor.py`** | 基础世界设定提取器：提取地点、文化、规则等世界构建要素。 |
| **`enhanced_world_extractor.py`** | 增强世界设定提取器：支持层次化世界构建和跨文档一致性维护。 |
| **`timeline_extractor.py`** | 基础时间线提取器：提取事件的时间顺序和因果关系。 |
| **`enhanced_timeline_extractor.py`** | 增强时间线提取器：支持复杂时间关系和多时间轴处理。 |
| **`relationship_extractor.py`** | 关系网络提取器：专门用于提取"人与人的网状关系"。 |
| **`unified_extractor.py`** | **统一提取接口**: 提供标准化的提取API，将所有增强提取器（角色、世界、时间线）封装为统一接口。是上层服务调用提取功能的唯一入口点。 |

## 3. 接口统一与UnifiedExtractor

### 3.1 统一接口架构

`UnifiedExtractor` 是提取模块的核心组件，实现了真正的提取服务标准化：

- **简单输入协议**: 接收单一文本字符串作为输入
- **标准化输出契约**: 返回统一的 `ExtractionResult` 对象，包含：
  - `characters`: 提取的角色列表
  - `world`: 世界设定信息
  - `timeline`: 时间线事件
  - `relationships`: 关系网络
  - `success`: 任务状态
  - `errors`: 错误信息列表（如适用）

- **端到端错误处理**: 集成Core模块的统一错误处理机制
- **并发处理**: 内部自动并发执行所有提取任务（角色、世界、时间线、关系）
- **结果验证**: 对提取结果进行有效性验证

### 3.2 标准化使用示例

```python
# 统一调用方式
from novelforge.extractors.unified_extractor import UnifiedExtractor
from novelforge.extractors.base_extractor import ExtractionConfig
from novelforge.services.ai_service import AIService

# 创建配置和AI服务
config = ExtractionConfig()
ai_service = AIService()

# 初始化统一提取器
unified_extractor = UnifiedExtractor(config=config, ai_service=ai_service)

# 执行提取
result = await unified_extractor.extract(text=content)

# 访问提取结果
characters = result.characters
world_setting = result.world
timeline = result.timeline
relationships = result.relationships
```

### 3.3 性能与质量保障体系

提取引擎集成了**企业级的性能和质量保障体系**：

- **动态并发控制**: 集成Base模块的自适应并发算法，根据系统负载和成功率自动调整提取并发数
- **智能重试机制**: 对网络超时、限流等可恢复错误自动应用指数退避重试策略
- **结果验证与修复**: 对AI返回的结果进行双重验证（格式验证 + 语义一致性验证），并尝试自动修复
- **增强提示词工程**: 使用经过A/B测试验证的精确提示词模板，显著提高提取准确率
- **存储集成优化**: 提取结果直接通过StorageManager持久化到ContentDatabaseStorage，支持自动去重和合并
- **监控与指标**: 内置完整的性能监控指标（成功率、响应时间、token效率等）

### 3.4 架构演进价值

UnifiedExtractor的引入标志着NovelForge提取引擎从**功能导向**向**服务导向**的重大转变：

- **简化上层调用**: Services层只需对接单一接口，无需关心底层提取器细节
- **提高可维护性**: 新增提取类型只需实现标准接口，无需修改调用逻辑
- **保证一致性**: 所有提取任务遵循相同的错误处理、日志记录和监控标准
- **支持扩展性**: 为未来新增提取类型（如情感分析、主题提取等）提供标准化框架

该统一接口确保了NovelForge在处理复杂多样的内容提取需求时，仍能保持架构的简洁性和可维护性。

## 4. 存储集成

提取结果现在可以直接通过StorageManager持久化到ContentDatabaseStorage，支持：

- 自动结果去重和合并
- 提取任务状态跟踪
- 批量结果存储优化
- 与内容元数据关联存储
