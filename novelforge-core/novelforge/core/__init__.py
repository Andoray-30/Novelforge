"""
核心层 - 数据模型和配置
"""

from novelforge.core.models import (
    Gender,
    CharacterRole,
    RelationshipType,
    CharacterRelationship,
    Character,
    LocationType,
    Importance,
    Location,
    Culture,
    WorldSetting,
    ExtractionResult,
)
from novelforge.core.config import Config

__all__ = [
    # 枚举
    "Gender",
    "CharacterRole",
    "RelationshipType",
    "LocationType",
    "Importance",
    # 数据模型
    "CharacterRelationship",
    "Character",
    "Location",
    "Culture",
    "WorldSetting",
    "ExtractionResult",
    # 配置
    "Config",
]
