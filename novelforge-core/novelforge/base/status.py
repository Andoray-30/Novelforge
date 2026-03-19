"""
提取状态定义
"""

from dataclasses import dataclass
from enum import Enum


class ExtractionPhase(str, Enum):
    """提取阶段"""
    IDENTIFYING = "identifying"
    EXTRACTING = "extracting"
    SCORING = "scoring"
    COMPLETED = "completed"
    ERROR = "error"


@dataclass
class ExtractionStatus:
    """提取状态"""
    phase: ExtractionPhase
    message: str
    current: int = 0
    total: int = 0
    characters_found: int = 0
