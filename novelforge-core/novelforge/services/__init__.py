"""
服务层 - AI服务、Tavern Card格式处理、角色去重和合并服务
"""

from novelforge.services.ai_service import AIService
from novelforge.services.tavern_converter import (
    TavernCardV2,
    TavernCardData,
    QualityScore,
    QualityGrade,
    CharacterQualityScore,
    WorldQualityScore,
    determine_grade,
    QUALITY_THRESHOLDS,
    TavernCardBuilder,
    QualityScoreBreakdown,
    TokenEstimate,
    FIELD_LENGTH_GUIDELINES
)
from novelforge.services.tavern_converter import (
    SillyTavernConverter,
    TavernCardV2,
    CharacterBook,
    CharacterBookEntry,
    to_tavern_card,
    to_character_book,
    to_character_book_entries,
)
from novelforge.services.character_deduplicator import (
    CharacterDeduplicator,
    MergeConflict,
    CharacterMergeResult,
    QualityAssessment,
    create_character_deduplicator
)
from novelforge.services.timeline_deduplicator import (
    TimelineDeduplicator,
    TimelineMergeConflict,
    TimelineMergeResult,
    TimelineQualityAssessment,
    create_timeline_deduplicator
)

__all__ = [
    # AI 服务
    "AIService",
    # Tavern Card
    "TavernCardV3",
    "TavernCardData",
    "QualityScore",
    "QualityGrade",
    "CharacterQualityScore",
    "WorldQualityScore",
    "QualityScoreBreakdown",
    "TokenEstimate",
    # 评分辅助
    "determine_grade",
    "QUALITY_THRESHOLDS",
    "FIELD_LENGTH_GUIDELINES",
    # 构建器
    "TavernCardBuilder",
    # SillyTavern 转换器
    "SillyTavernConverter",
    "TavernCardV2",
    "CharacterBook",
    "CharacterBookEntry",
    "to_tavern_card",
    "to_character_book",
    "to_character_book_entries",
    # 角色去重服务
    "CharacterDeduplicator",
    "MergeConflict",
    "CharacterMergeResult",
    "QualityAssessment",
    "create_character_deduplicator",
    # 时间线去重服务
    "TimelineDeduplicator",
    "TimelineMergeConflict",
    "TimelineMergeResult",
    "TimelineQualityAssessment",
    "create_timeline_deduplicator"
]
