"""
提取器层 - 角色、世界书、时间线、关系网络、多窗口提取器
重构版本：模块化架构，保持向后兼容性
"""

# 基础提取器（使用新模块化架构）
from novelforge.extractors.character_extractor import CharacterExtractor
from novelforge.extractors.world_extractor import WorldExtractor
from novelforge.extractors.timeline_extractor import TimelineExtractor
from novelforge.extractors.relationship_extractor import RelationshipExtractor

# 多窗口并发提取器（保持向后兼容）
from novelforge.extractors.multi_window_orchestrator import (
    MultiWindowOrchestrator as MultiWindowExtractor,
    MultiWindowConfig,
    MultiWindowOrchestrator,
)
from novelforge.extractors.character_extractor import SmartChunker, Chunk

# 新增重构模块
from novelforge.extractors.base_extractor import (
    BaseExtractor,
    CharacterExtractorInterface,
    WorldExtractorInterface,
    TimelineExtractorInterface,
    RelationshipExtractorInterface,
    ExtractionConfig,
    ExtractorFactory,
)

from novelforge.extractors.character_extractor import CharacterExtractor as NewCharacterExtractor
from novelforge.extractors.world_extractor import WorldExtractor as NewWorldExtractor
from novelforge.extractors.timeline_extractor import TimelineExtractor as NewTimelineExtractor
from novelforge.extractors.relationship_extractor import RelationshipExtractor as NewRelationshipExtractor
from novelforge.extractors.enhanced_character_extractor import EnhancedCharacterExtractor
from novelforge.extractors.enhanced_world_extractor import EnhancedWorldExtractor
from novelforge.extractors.enhanced_timeline_extractor import EnhancedTimelineExtractor
from novelforge.extractors.enhanced_orchestrator import EnhancedMultiWindowOrchestrator
from novelforge.extractors.tavern_converter import TavernConverter
from novelforge.extractors.multi_window_orchestrator import (
    MultiWindowOrchestrator,
    MultiWindowConfig as NewMultiWindowConfig,
)

__all__ = [
    # 基础提取器（使用新模块化架构）
    "CharacterExtractor",
    "WorldExtractor",
    "TimelineExtractor",
    "RelationshipExtractor",
    # 多窗口并发提取器（推荐 - 稳定高效）
    "MultiWindowExtractor",
    "MultiWindowConfig",
    "SmartChunker",
    "Chunk",
    # 新增重构模块
    "BaseExtractor",
    "CharacterExtractorInterface",
    "WorldExtractorInterface",
    "TimelineExtractorInterface",
    "RelationshipExtractorInterface",
    "ExtractionConfig",
    "ExtractorFactory",
    "NewCharacterExtractor",
    "NewWorldExtractor",
    "NewTimelineExtractor",
    "NewRelationshipExtractor",
    "EnhancedCharacterExtractor",
    "EnhancedWorldExtractor",
    "EnhancedTimelineExtractor",
    "EnhancedMultiWindowOrchestrator",
    "TavernConverter",
    "MultiWindowOrchestrator",
    "NewMultiWindowConfig",
]