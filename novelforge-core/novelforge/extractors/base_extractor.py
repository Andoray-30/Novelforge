"""
提取器抽象基类模块
定义所有提取器的通用接口和抽象基类
"""

import asyncio
import re
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional, Protocol, NamedTuple
from dataclasses import dataclass

from ..core.models import (
    Character,
    Location,
    TimelineEvent,
    NetworkEdge,
    WorldSetting,
    Timeline,
    RelationshipNetwork
)


class Chunk(NamedTuple):
    """文本片段"""
    content: str
    index: int
    start: int
    end: int


class SmartChunker:
    """智能文本分片器"""

    def __init__(self, chunk_size: int = 2000, chunk_overlap: int = 200):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def chunk(self, text: str) -> List[Chunk]:
        """将文本分片"""
        if not text:
            return []

        # 如果文本长度小于chunk_size，直接返回一个片段
        if len(text) <= self.chunk_size:
            return [Chunk(content=text, index=0, start=0, end=len(text))]

        chunks = []
        start = 0
        index = 0

        while start < len(text):
            # 计算片段结束位置
            end = start + self.chunk_size

            # 如果超出文本长度，直接到结尾
            if end >= len(text):
                chunks.append(Chunk(
                    content=text[start:],
                    index=index,
                    start=start,
                    end=len(text)
                ))
                break

            # 尝试在句子边界处分割
            chunk_text = text[start:end]

            # 寻找最后一个句子结束符
            sentence_end = -1
            for i in range(len(chunk_text) - 1, -1, -1):
                if chunk_text[i] in '。！？.!?\n':
                    sentence_end = i + 1
                    break

            if sentence_end > 0 and sentence_end > self.chunk_size * 0.5:
                # 在句子边界处分割
                actual_end = start + sentence_end
            else:
                # 寻找最后一个空格或标点
                for i in range(len(chunk_text) - 1, -1, -1):
                    if chunk_text[i] in ' \t，,；;：:':
                        actual_end = start + i + 1
                        break
                else:
                    actual_end = end

            chunks.append(Chunk(
                content=text[start:actual_end],
                index=index,
                start=start,
                end=actual_end
            ))

            # 下一个片段的起始位置（考虑重叠）
            start = actual_end - self.chunk_overlap
            if start <= chunks[-1].start:
                start = actual_end

            index += 1

        return chunks


class ExtractionResult(Protocol):
    """提取结果协议"""
    characters: list[Character]
    world: Optional[WorldSetting]
    timeline: Optional[Timeline]
    relationships: Optional[RelationshipNetwork]
    success: bool
    errors: list[str]


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
    def create_character_extractor(config: ExtractionConfig, ai_service=None) -> CharacterExtractorInterface:
        """创建角色提取器"""
        from novelforge.extractors.unified_character_extractor import UnifiedCharacterExtractor
        return UnifiedCharacterExtractor(config=config, ai_service=ai_service)

    @staticmethod
    def create_world_extractor(config: ExtractionConfig, ai_service=None) -> WorldExtractorInterface:
        """创建世界书提取器"""
        from novelforge.extractors.unified_world_extractor import UnifiedWorldExtractor
        return UnifiedWorldExtractor(config=config, ai_service=ai_service)

    @staticmethod
    def create_timeline_extractor(config: ExtractionConfig, ai_service=None) -> TimelineExtractorInterface:
        """创建时间线提取器"""
        from novelforge.extractors.unified_timeline_extractor import UnifiedTimelineExtractor
        return UnifiedTimelineExtractor(config=config, ai_service=ai_service)

    @staticmethod
    def create_relationship_extractor(config: ExtractionConfig, ai_service=None) -> RelationshipExtractorInterface:
        """创建关系网络提取器"""
        from novelforge.extractors.unified_relationship_extractor import UnifiedRelationshipExtractor
        return UnifiedRelationshipExtractor(config=config, ai_service=ai_service)