"""
提取器层 - 角色、世界书、时间线、关系网络、多窗口提取器
重构版本：模块化架构，保持向后兼容性
"""

# 基础提取器（使用新模块化架构）
from .character_extractor import CharacterExtractor
from .world_extractor import WorldExtractor
from .timeline_extractor import TimelineExtractor
from .relationship_extractor import RelationshipExtractor
from .unified_extractor import UnifiedExtractor

# 多窗口并发提取器（保持向后兼容）
from .multi_window_orchestrator import (
    MultiWindowOrchestrator as MultiWindowExtractor,
    MultiWindowConfig,
    MultiWindowOrchestrator,
)
from .character_extractor import SmartChunker, Chunk

# 新增重构模块
from .base_extractor import (
    BaseExtractor,
    CharacterExtractorInterface,
    WorldExtractorInterface,
    TimelineExtractorInterface,
    RelationshipExtractorInterface,
    ExtractionConfig,
    ExtractorFactory,
)

from .character_extractor import CharacterExtractor as NewCharacterExtractor
from .world_extractor import WorldExtractor as NewWorldExtractor
from .timeline_extractor import TimelineExtractor as NewTimelineExtractor
from .relationship_extractor import RelationshipExtractor as NewRelationshipExtractor
from .enhanced_character_extractor import EnhancedCharacterExtractor
from .enhanced_world_extractor import EnhancedWorldExtractor
from .enhanced_timeline_extractor import EnhancedTimelineExtractor
from .enhanced_orchestrator import EnhancedMultiWindowOrchestrator
from .tavern_converter import TavernConverter
from .multi_window_orchestrator import (
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
    "UnifiedExtractor",
]