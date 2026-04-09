# NovelForge AI 提取引擎 (Extractors) 模块逻辑架构文档

本目录是本应用的核心车间，主要存放具体的提示词拼装流程与算法结构。它们的主要职责是从海量的文本段落里，像剥洋葱一样剥离出有价值的结构化要素（如人物、时间、地点、关系）。

## 重构说明 (2026-03-25)

### 架构升级
- **移除旧提取器**: 已删除 `character_extractor.py`, `world_extractor.py`, `timeline_extractor.py`, `relationship_extractor.py` 等旧版提取器
- **移除增强版提取器**: 已删除 `enhanced_*.py` 系列（增强版虽然名为"增强"，但实际效果不如基础版）
- **统一提取器架构**: 所有提取任务现在使用 `unified_*_extractor.py` 系列
- **旧代码备份**: 所有删除的文件已备份到 `archives/old_extractors_backup/`

### 核心改进
1. **批量提取**: 每批合并5个文本片段一次性提取，减少80% API调用
2. **智能去重**: AI只返回分组索引，合并逻辑完全程序化，确保100%信息保留
3. **充分利用上下文**: 支持100k+上下文窗口，单次可处理大量文本
4. **统一接口**: 所有提取器遵循相同的接口规范

---

## 1. 内部代码内联逻辑图 (Internal Logic Flow)

```text
                              [ 待处理的长文本块 ]
                                        |
                    +---------------------------------------+
                    |     UnifiedExtractor                  |  <--- 统一提取器入口
                    |     (unified_extractor.py)            |
                    +---------------------------------------+
                      /                 |                   \
        [ unified_character_    [ unified_world_     [ unified_timeline_
          extractor.py ]           extractor.py ]         extractor.py ]
                |                       |                     |
      (角色信息提取)              (世界设定提取)          (时间线提取)
                |                       |                     |
                +-----------------------+---------------------+
                                        |
                  [ unified_relationship_ ]
                  [    extractor.py     ] <--- 关系网络提取
                                        |
                  [ ai_service 发往大模型处理 -> 返回统一结构化结果 ]
```

---

## 2. 核心文件职责说明

| 文件名 | 职责描述 |
| :--- | :--- |
| **`unified_extractor.py`** | **统一提取器入口**: 提供标准化的提取API，将所有统一提取器（角色、世界、时间线、关系）封装为统一接口。是上层服务调用提取功能的唯一入口点。 |
| **`unified_character_extractor.py`** | **统一角色提取器**: 批量提取角色信息，包含完整的人物档案（描述、背景、外貌、性格、能力、别名、原文上下文、对话示例、行为示例）。支持智能去重合并。 |
| **`unified_world_extractor.py`** | **统一世界设定提取器**: 批量提取世界设定，包含地点、历史、文化、规则等。每个地点保留原文上下文、文化示例、历史示例。 |
| **`unified_timeline_extractor.py`** | **统一时间线提取器**: 批量提取时间线事件，包含事件类型、时间、涉及角色、地点、后果、原文证据。 |
| **`unified_relationship_extractor.py`** | **统一关系网络提取器**: 批量提取角色关系，包含关系类型、描述、强度、状态、原文证据。 |
| **`base_extractor.py`** | **基础接口和工具**: 设计所有提取器的基础类架构，提供统一的提取接口、错误处理、SmartChunker文本分片工具。 |
| **`tavern_converter.py`** | **Tavern格式转换器**: 将提取的角色转换为SillyTavern角色卡格式。 |

---

## 3. 统一提取器架构详解

### 3.1 批量提取策略

```python
# 配置参数
MAX_CHUNKS_PER_BATCH = 5      # 每批合并5个文本片段
MAX_CHARS_PER_BATCH = 30      # 每批最多处理30个角色去重
MAX_CONTEXT_TOKENS = 100000   # 最大上下文长度
```

**优势**:
- 减少80% API调用次数
- 充分利用大模型长上下文能力
- 提高提取质量和连贯性

### 3.2 智能去重策略

```python
# AI分组示例输出
{
    "groups": [
        [0, 2],    # 索引0和2的角色是同一人
        [1],       # 索引1的角色是独立的
        [3, 4, 5]  # 索引3、4、5的角色是同一人
    ]
}
```

**优势**:
- AI只返回分组索引，不生成角色对象
- 合并逻辑完全程序化，100%保留字段信息
- 避免AI生成JSON导致的字段丢失问题

### 3.3 标准化使用示例

```python
# 统一调用方式
from novelforge.services.extraction_service import ExtractionService
from novelforge.services.ai_service import AIService
from novelforge.core.config import Config

# 创建服务和配置
config = Config.from_env()
ai_service = AIService(config)
extraction_service = ExtractionService(ai_service, config)

# 执行提取（并行执行所有任务）
result = await extraction_service.extract_all(text=content)

# 访问提取结果
characters = result["characters"]           # 角色列表
world_setting = result["world_setting"]     # 世界设定
timeline_events = result["timeline_events"] # 时间线事件
relationships = result["relationships"]     # 关系网络
```

### 3.4 单独提取示例

```python
# 单独提取角色
characters = await extraction_service.extract_characters(text)

# 单独提取世界设定
world = await extraction_service.extract_world_setting(text)

# 单独提取时间线
events = await extraction_service.extract_timeline(text)

# 单独提取关系网络
relationships = await extraction_service.extract_relationships(text)
```

---

## 4. 提取结果数据结构

### 4.1 角色 (Character)

```python
{
    "name": "角色名称",
    "description": "详细描述（200-500字）",
    "personality": "性格特点（关键词列表）",
    "background": "背景故事（300-800字）",
    "appearance": "外貌描写（200-400字）",
    "age": 25,
    "gender": "male/female/unknown",
    "occupation": "职业",
    "role": "protagonist/antagonist/supporting/minor",
    "aliases": ["别名1", "别名2"],
    "abilities": ["能力1", "能力2"],
    "source_contexts": ["原文片段1", "原文片段2"],  # 原文证据
    "example_dialogues": ["对话1", "对话2"],        # 典型对话
    "behavior_examples": ["行为1", "行为2"]         # 行为示例
}
```

### 4.2 地点 (Location)

```python
{
    "name": "地点名称",
    "type": "city/country/building/natural/other",
    "description": "地点描述",
    "geography": "地理特征",
    "culture": "文化背景",
    "landmarks": ["地标1", "地标2"],
    "source_contexts": ["原文片段1", "原文片段2"],      # 原文证据
    "cultural_examples": ["文化示例1", "文化示例2"],    # 文化示例
    "historical_examples": ["历史示例1"]               # 历史示例
}
```

### 4.3 时间线事件 (TimelineEvent)

```python
{
    "id": "event_001",
    "title": "事件标题",
    "description": "事件描述",
    "event_type": "birth/death/battle/romance/other",
    "absolute_time": "绝对时间",
    "relative_time": "相对时间",
    "narrative_time": "叙事时间位置",
    "characters": ["角色1", "角色2"],
    "locations": ["地点1", "地点2"],
    "importance": "critical/high/medium/low",
    "consequences": ["后果1", "后果2"],
    "evidence": ["原文证据1", "原文证据2"]
}
```

### 4.4 关系 (NetworkEdge)

```python
{
    "source": "源角色",
    "target": "目标角色",
    "relationship_type": "family/friend/lover/enemy/mentor/rival/other",
    "description": "关系描述",
    "strength": 8,  # 1-10
    "status": "active/ended/dormant/evolving",
    "evidence": ["原文证据1", "原文证据2"]
}
```

---

## 5. 性能与质量保障体系

### 5.1 API调用优化

| 提取类型 | 旧方案调用次数 | 新方案调用次数 | 优化效果 |
|---------|--------------|--------------|---------|
| 角色提取 | N片段 × 1次 | N/5片段 × 1次 | 减少80% |
| 去重合并 | N(N-1)/2 次 | 1次批量分组 | 大幅减少 |
| 世界设定 | N片段 × 1次 | N/5片段 × 1次 | 减少80% |
| 时间线 | N片段 × 1次 | N/5片段 × 1次 | 减少80% |
| 关系网络 | N片段 × 1次 | N/5片段 × 1次 | 减少80% |

### 5.2 质量保障

- **完整信息保留**: 所有字段（包括原文上下文、示例）100%保留
- **智能去重**: AI识别同一角色的不同称呼，程序化合并确保不丢信息
- **批量处理**: 大模型一次看到更多上下文，提取更准确
- **错误处理**: 完善的异常处理和重试机制

---

## 6. 存储集成

提取结果通过 `ExtractionService` 自动持久化到数据库，支持：

- 自动结果去重和合并
- 提取任务状态跟踪
- 批量结果存储优化
- 与内容元数据关联存储

---

## 7. 向后兼容性

为了向后兼容，统一提取器提供了别名导出：

```python
# 旧代码仍然可以工作
from novelforge.extractors import CharacterExtractor, WorldExtractor

# 实际上使用的是新的统一提取器
CharacterExtractor = UnifiedCharacterExtractor
WorldExtractor = UnifiedWorldExtractor
```

---

## 8. 架构演进价值

统一提取器架构的引入标志着NovelForge提取引擎的重大升级：

- **简化上层调用**: Services层只需对接单一接口
- **提高可维护性**: 所有提取器遵循相同架构
- **保证一致性**: 统一的错误处理、日志记录标准
- **最大化性能**: 批量处理减少API调用，充分利用上下文
- **信息完整性**: 程序化合并确保100%字段保留

该架构确保了NovelForge在处理复杂多样的内容提取需求时，仍能保持高效、准确和可维护性。
