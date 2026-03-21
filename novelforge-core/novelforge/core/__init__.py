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
from novelforge.core.exceptions import (
    NovelForgeError,
    ValidationError,
    NetworkError,
    APIError,
    StorageError,
    ProcessingError,
    ConfigurationError,
    ExternalServiceError,
    SystemError
)
from novelforge.core.logging_config import setup_logging, get_logger
from novelforge.core.error_utils import handle_errors, safe_call, log_and_raise, create_error_response

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
    # 异常
    "NovelForgeError",
    "ValidationError",
    "NetworkError",
    "APIError",
    "StorageError",
    "ProcessingError",
    "ConfigurationError",
    "ExternalServiceError",
    "SystemError",
    # 日志
    "setup_logging",
    "get_logger",
    # 错误处理工具
    "handle_errors",
    "safe_call",
    "log_and_raise",
    "create_error_response"
]
