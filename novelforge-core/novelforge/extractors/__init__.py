"""
提取器层 - 统一提取器架构

重构说明：
- 2026-03-25: 移除了旧的提取器（character_extractor, world_extractor等）
- 2026-03-25: 统一使用 unified_*_extractor 系列
- 旧的提取器已备份到 archives/old_extractors_backup/
"""

# 统一提取器（新架构 - 批量处理，充分利用上下文）
from .unified_character_extractor import UnifiedCharacterExtractor
from .unified_world_extractor import UnifiedWorldExtractor
from .unified_timeline_extractor import UnifiedTimelineExtractor
from .unified_relationship_extractor import UnifiedRelationshipExtractor
from .unified_extractor import UnifiedExtractor

# 基础接口和配置
from .base_extractor import (
    BaseExtractor,
    CharacterExtractorInterface,
    WorldExtractorInterface,
    TimelineExtractorInterface,
    RelationshipExtractorInterface,
    ExtractionConfig,
    ExtractorFactory,
    SmartChunker,
    Chunk,
)

# 工具类
from .tavern_converter import TavernConverter

# 为了保持向后兼容，将统一提取器别名导出为原名称
CharacterExtractor = UnifiedCharacterExtractor
WorldExtractor = UnifiedWorldExtractor
TimelineExtractor = UnifiedTimelineExtractor
RelationshipExtractor = UnifiedRelationshipExtractor

__all__ = [
    # 统一提取器（新架构）
    "UnifiedCharacterExtractor",
    "UnifiedWorldExtractor",
    "UnifiedTimelineExtractor",
    "UnifiedRelationshipExtractor",
    "UnifiedExtractor",
    # 向后兼容别名
    "CharacterExtractor",
    "WorldExtractor",
    "TimelineExtractor",
    "RelationshipExtractor",
    # 基础接口
    "BaseExtractor",
    "CharacterExtractorInterface",
    "WorldExtractorInterface",
    "TimelineExtractorInterface",
    "RelationshipExtractorInterface",
    "ExtractionConfig",
    "ExtractorFactory",
    "SmartChunker",
    "Chunk",
    # 工具
    "TavernConverter",
]
