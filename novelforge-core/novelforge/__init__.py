"""
NovelForge Core - 高质量角色卡和世界书提取核心模块

功能：
- 角色卡提取
- 世界书提取
- 时间线提取
- 关系网络提取
- 世界树构建和导出
- SillyTavern 格式转换
"""

# 核心层
from .core import Config
from .core.models import (
    Character,
    WorldSetting,
    Location,
    Culture,
    CharacterRelationship,
    CharacterRole,
    Gender,
    # 时间线和关系网络
    Timeline,
    TimelineEvent,
    EventType,
    TimePrecision,
    RelationshipNetwork,
    NetworkEdge,
    RelationshipStatus,
    # 提取结果
    ExtractionResult,
)

# 基础组件层
from .base import (
    ExtractionPhase,
    ExtractionStatus,
    TextChunk,
    TextSplitter,
    # 文档解析
    FileType,
    Chapter,
    ParsedDocument,
    DocumentParser,
    parse_document,
)

# 服务层
from .services import AIService
from .services.tavern_converter import (
    TavernCardV2,
    TavernCardData,
    QualityScore,
    QualityGrade,
    CharacterQualityScore,
    WorldQualityScore,
    determine_grade,
    QUALITY_THRESHOLDS,
    TavernCardBuilder,
)
from .services.character_deduplicator import (
    CharacterDeduplicator,
    MergeConflict,
    CharacterMergeResult,
    QualityAssessment,
    create_character_deduplicator
)
# API服务
from .api.ai_planning_service import get_ai_planning_service
from .api.types import (
    NovelType,
    LengthType,
    TargetAudience,
    ImportanceLevel,
    StoryOutlineParams,
    CharacterDesignRequest,
    WorldBuildingRequest,
    StoryOutline,
    CharacterDesign,
    WorldSetting,
    ErrorResponse
)

# 提取器层
from .extractors import (
    CharacterExtractor,
    WorldExtractor,
    TimelineExtractor,
    RelationshipExtractor,
    MultiWindowExtractor,
    MultiWindowConfig,
    SmartChunker,
    Chunk,
    BaseExtractor,
    CharacterExtractorInterface,
    WorldExtractorInterface,
    TimelineExtractorInterface,
    RelationshipExtractorInterface,
    ExtractionConfig,
    ExtractorFactory,
    NewCharacterExtractor,
    NewWorldExtractor,
    NewTimelineExtractor,
    NewRelationshipExtractor,
    TavernConverter,
    MultiWindowOrchestrator,
    NewMultiWindowConfig,
)

# 质量评估层
from .quality import QualityScorer, create_quality_scorer
from .quality import QualityEvaluator, create_quality_evaluator

# 世界树
from .world_tree import (
    WorldTree,
    WorldTreeBuilder,
    build_world_tree,
    WorldTreeExporter,
    export_world_tree,
    SillyTavernConverter,
    convert_to_sillytavern,
    # 分层数据模型
    Layer0Core,
    Layer1Scene,
    Layer2Deep,
    Layer3Reference,
)

# 动态并发控制
from .base import RateLimiter, RateUsage
from .base import AdaptiveConcurrency, ConcurrencyState, ConcurrencyStats
from .base import RetryPolicy, RetryStats, retry_with_policy

__version__ = "0.5.0"
__all__ = [
    # 配置和服务
    "Config",
    "AIService",
    # API服务
    "get_ai_planning_service",
    "NovelType",
    "LengthType",
    "TargetAudience",
    "ImportanceLevel",
    "StoryOutlineParams",
    "CharacterDesignRequest",
    "WorldBuildingRequest",
    "StoryOutline",
    "CharacterDesign",
    "WorldSetting",
    "ErrorResponse",
    # 基础组件
    "ExtractionPhase",
    "ExtractionStatus",
    "TextChunk",
    "TextSplitter",
    # 文档解析
    "FileType",
    "Chapter",
    "ParsedDocument",
    "DocumentParser",
    "parse_document",
    # 提取器
    "CharacterExtractor",
    "WorldExtractor",
    "TimelineExtractor",
    "RelationshipExtractor",
    "MultiWindowExtractor",
    "MultiWindowConfig",
    "SmartChunker",
    "Chunk",
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
    "TavernConverter",
    "MultiWindowOrchestrator",
    "NewMultiWindowConfig",
    # 质量评估
    "QualityScorer",
    "create_quality_scorer",
    "QualityEvaluator",
    "create_quality_evaluator",
    # 数据模型
    "Character",
    "WorldSetting",
    "Location",
    "Culture",
    "CharacterRelationship",
    "CharacterRole",
    "Gender",
    # 时间线和关系网络
    "Timeline",
    "TimelineEvent",
    "EventType",
    "TimePrecision",
    "RelationshipNetwork",
    "NetworkEdge",
    "RelationshipStatus",
    # 提取结果
    "ExtractionResult",
    # Tavern Card
    "TavernCardV2",
    "TavernCardData",
    "QualityScore",
    "QualityGrade",
    "CharacterQualityScore",
    "WorldQualityScore",
    # 评分辅助函数
    "determine_grade",
    "QUALITY_THRESHOLDS",
    # Tavern Card 构建器
    "TavernCardBuilder",
    # 角色去重服务
    "CharacterDeduplicator",
    "MergeConflict",
    "CharacterMergeResult",
    "QualityAssessment",
    "create_character_deduplicator",
    # 世界树
    "WorldTree",
    "WorldTreeBuilder",
    "build_world_tree",
    "WorldTreeExporter",
    "export_world_tree",
    "SillyTavernConverter",
    "convert_to_sillytavern",
    "Layer0Core",
    "Layer1Scene",
    "Layer2Deep",
    "Layer3Reference",
    # 动态并发控制
    "RateLimiter",
    "RateUsage",
    "AdaptiveConcurrency",
    "ConcurrencyState",
    "ConcurrencyStats",
    "RetryPolicy",
    "RetryStats",
    "retry_with_policy",
]