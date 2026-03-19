"""
提取器抽象基类模块
定义所有提取器的通用接口和抽象基类
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


class ExtractionResult(Protocol):
    """提取结果协议"""
    characters: List[Character]
    locations: List[Location]
    timeline_events: List[TimelineEvent]
    relationships: List[NetworkEdge]
    world_setting: Optional[WorldSetting]


@dataclass
class ExtractionConfig:
    """提取器配置"""
    timeout: float = 300.0
    max_retries: int = 3
    retry_delay: float = 1.0
    chunk_size: int = 2000
    chunk_overlap: int = 500
    

class BaseExtractor(ABC):
    """所有提取器的抽象基类"""
    
    def __init__(self, config: ExtractionConfig):
        self.config = config
    
    @abstractmethod
    async def extract(self, text: str) -> ExtractionResult:
        """
        从文本中提取信息的核心方法
        
        Args:
            text: 输入文本
            
        Returns:
            ExtractionResult: 提取结果
        """
        pass
    
    @abstractmethod
    def validate(self, data: Any) -> bool:
        """
        验证提取结果的有效性
        
        Args:
            data: 要验证的数据
            
        Returns:
            bool: 是否有效
        """
        pass
    
    @abstractmethod
    def save(self, data: ExtractionResult, output_path: Path) -> None:
        """
        保存提取结果
        
        Args:
            data: 提取结果
            output_path: 输出路径
        """
        pass
    
    async def extract_with_validation(self, text: str) -> Optional[ExtractionResult]:
        """
        提取并验证结果
        
        Args:
            text: 输入文本
            
        Returns:
            Optional[ExtractionResult]: 验证通过的提取结果
        """
        result = await self.extract(text)
        if self.validate(result):
            return result
        return None


class CharacterExtractorInterface(ABC):
    """角色提取器接口"""
    
    @abstractmethod
    async def extract_characters(self, text: str) -> List[Character]:
        """提取角色信息"""
        pass


class WorldExtractorInterface(ABC):
    """世界书提取器接口"""
    
    @abstractmethod
    async def extract_world(self, text: str) -> WorldSetting:
        """提取世界设定"""
        pass


class TimelineExtractorInterface(ABC):
    """时间线提取器接口"""
    
    @abstractmethod
    async def extract_timeline(self, text: str) -> List[TimelineEvent]:
        """提取时间线事件"""
        pass


class RelationshipExtractorInterface(ABC):
    """关系网络提取器接口"""
    
    @abstractmethod
    async def extract_relationships(self, text: str) -> List[NetworkEdge]:
        """提取角色关系"""
        pass


class ExtractorFactory:
    """提取器工厂类"""
    
    @staticmethod
    def create_character_extractor(config: ExtractionConfig) -> CharacterExtractorInterface:
        """创建角色提取器"""
        from novelforge.extractors.character_extractor import CharacterExtractor
        return CharacterExtractor(config)
    
    @staticmethod
    def create_world_extractor(config: ExtractionConfig) -> WorldExtractorInterface:
        """创建世界书提取器"""
        from novelforge.extractors.world_extractor import WorldExtractor
        return WorldExtractor(config)
    
    @staticmethod
    def create_timeline_extractor(config: ExtractionConfig) -> TimelineExtractorInterface:
        """创建时间线提取器"""
        from novelforge.extractors.timeline_extractor import TimelineExtractor
        return TimelineExtractor(config)
    
    @staticmethod
    def create_relationship_extractor(config: ExtractionConfig) -> RelationshipExtractorInterface:
        """创建关系网络提取器"""
        from novelforge.extractors.relationship_extractor import RelationshipExtractor
        return RelationshipExtractor(config)