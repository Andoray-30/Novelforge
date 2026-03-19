"""
增强版提取器基类模块

定义增强版提取器的通用接口和抽象基类，为各种特定提取器提供统一的架构和规范。

主要特性：
1. 提供增强版提取器通用协议和基类
2. 定义标准化的提取、验证和保存接口
3. 支持提取结果的统计和评估功能
4. 提供工厂模式创建各种类型的增强提取器
5. 保持与基础提取器接口的兼容性
"""
import asyncio
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional, Protocol
from dataclasses import dataclass

from novelforge.core.models import (
    Character,
    Location, 
    TimelineEvent,
    NetworkEdge,
    WorldSetting
)
from novelforge.extractors.base_extractor import (
    BaseExtractor,
    CharacterExtractorInterface,
    WorldExtractorInterface,
    TimelineExtractorInterface,
    RelationshipExtractorInterface,
    ExtractionConfig
)


class EnhancedExtractionResult(Protocol):
    """增强版提取结果协议"""
    characters: List[Character]
    locations: List[Location]
    timeline_events: List[TimelineEvent]
    relationships: List[NetworkEdge]
    world_setting: Optional[WorldSetting]
    extraction_stats: Dict[str, Any]  # 增加提取统计信息


class EnhancedBaseExtractor(BaseExtractor):
    """增强版提取器基类

    提供增强功能的基础实现，包括：
    1. 扩展的提取方法
    2. 结果验证功能
    3. 结果保存功能
    4. 提取统计信息
    """
    
    def __init__(self, config: ExtractionConfig):
        super().__init__(config)
    
    @abstractmethod
    async def extract(self, text: str) -> EnhancedExtractionResult:
        """
        从文本中提取信息的核心方法
        """
        pass
    
    @abstractmethod
    def validate(self, data: Any) -> bool:
        """
        验证提取结果的有效性
        """
        pass
    
    @abstractmethod
    def save(self, data: EnhancedExtractionResult, output_path: Path) -> None:
        """
        保存提取结果
        """
        pass
    
    async def extract_with_validation(self, text: str) -> Optional[EnhancedExtractionResult]:
        """
        提取并验证结果
        """
        result = await self.extract(text)
        if self.validate(result):
            return result
        return None


class EnhancedCharacterExtractorInterface(CharacterExtractorInterface):
    """增强版角色提取器接口

    扩展基础角色提取器接口，增加：
    1. 智能合并和去重功能
    2. 上下文信息提取
    3. 批量处理能力
    """
    
    @abstractmethod
    async def extract_characters(self, text: str) -> List[Character]:
        """提取角色信息，具有增强的合并和去重功能"""
        pass


class EnhancedWorldExtractorInterface(WorldExtractorInterface):
    """增强版世界书提取器接口"""
    
    @abstractmethod
    async def extract_world(self, text: str) -> WorldSetting:
        """提取世界设定，具有增强的世界设定完善功能"""
        pass


class EnhancedTimelineExtractorInterface(TimelineExtractorInterface):
    """增强版时间线提取器接口"""
    
    @abstractmethod
    async def extract_timeline(self, text: str) -> List[TimelineEvent]:
        """提取时间线事件，具有增强的时间线优化功能"""
        pass


class EnhancedRelationshipExtractorInterface(RelationshipExtractorInterface):
    """增强版关系网络提取器接口"""
    
    @abstractmethod
    async def extract_relationships(self, text: str) -> List[NetworkEdge]:
        """提取角色关系，具有增强的关系分析功能"""
        pass


class EnhancedExtractorFactory:
    """增强版提取器工厂类"""
    
    @staticmethod
    def create_character_extractor(config: ExtractionConfig) -> EnhancedCharacterExtractorInterface:
        """创建增强版角色提取器"""
        from novelforge.extractors.enhanced_character_extractor import EnhancedCharacterExtractor
        return EnhancedCharacterExtractor(config)
    
    @staticmethod
    def create_world_extractor(config: ExtractionConfig) -> EnhancedWorldExtractorInterface:
        """创建增强版世界书提取器"""
        from novelforge.extractors.enhanced_world_extractor import EnhancedWorldExtractor
        return EnhancedWorldExtractor(config)
    
    @staticmethod
    def create_timeline_extractor(config: ExtractionConfig) -> EnhancedTimelineExtractorInterface:
        """创建增强版时间线提取器"""
        from novelforge.extractors.enhanced_timeline_extractor import EnhancedTimelineExtractor
        return EnhancedTimelineExtractor(config)
    
    @staticmethod
    def create_relationship_extractor(config: ExtractionConfig) -> EnhancedRelationshipExtractorInterface:
        """创建增强版关系网络提取器"""
        from novelforge.extractors.relationship_extractor import RelationshipExtractor
        return RelationshipExtractor(config)