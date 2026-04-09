"""
提取服务 - 提供角色、时间线、世界设定、关系网络的单独和整合提取功能

修复记录:
- 2026-03-25: 从 EnhancedMultiWindowOrchestrator 切换到 MultiWindowOrchestrator
  原因: Enhanced版本虽然名为"增强"，但实际使用了复杂的AI合并逻辑，经常导致信息丢失
  基础版本的简单分层合并反而能保留更完整的角色信息

- 2026-03-25: 引入 UnifiedCharacterExtractor
  改进: 新的统一提取器合并了基础版和增强版的优点
  - 批量提取：一次处理多个片段，充分利用上下文窗口
  - 智能去重：AI只返回分组索引，合并逻辑完全程序化
  - 信息保留：合并时整合所有字段，不丢失任何信息

- 2026-03-25: 引入 UnifiedWorldExtractor, UnifiedRelationshipExtractor, UnifiedTimelineExtractor
  改进: 所有提取器统一使用批量提取策略，最大化上下文利用
"""
import asyncio
from typing import List, Dict, Any, Optional
from .ai_service import AIService
from ..extractors.unified_character_extractor import UnifiedCharacterExtractor
from ..extractors.unified_world_extractor import UnifiedWorldExtractor
from ..extractors.unified_relationship_extractor import UnifiedRelationshipExtractor
from ..extractors.unified_timeline_extractor import UnifiedTimelineExtractor
from ..extractors.base_extractor import ExtractionConfig
from ..core.models import Character, WorldSetting, Timeline, RelationshipNetwork, TimelineEvent, NetworkEdge
from ..core.config import Config


class ExtractionService:
    """提取服务类 - 提供精细化的提取功能"""

    def __init__(self, ai_service: AIService, config: Config):
        self.ai_service = ai_service
        self.config = config

        # 创建统一提取器配置
        unified_config = ExtractionConfig(
            timeout=300.0,
            max_retries=2,
            retry_delay=1.0,
            chunk_size=15000,
            chunk_overlap=500
        )

        # 新的统一提取器 - 充分利用大模型上下文
        self.unified_character_extractor = UnifiedCharacterExtractor(
            config=unified_config,
            ai_service=ai_service
        )

        self.unified_world_extractor = UnifiedWorldExtractor(
            config=unified_config,
            ai_service=ai_service
        )

        self.unified_relationship_extractor = UnifiedRelationshipExtractor(
            config=unified_config,
            ai_service=ai_service
        )

        self.unified_timeline_extractor = UnifiedTimelineExtractor(
            config=unified_config,
            ai_service=ai_service
        )

    async def extract_characters(self, text: str) -> List[Character]:
        """单独提取角色 - 使用统一提取器"""
        return await self.unified_character_extractor.extract_characters(text)

    async def extract_world_setting(self, text: str) -> WorldSetting:
        """单独提取世界设定 - 使用统一提取器"""
        return await self.unified_world_extractor.extract_world(text)

    async def extract_timeline(self, text: str) -> List[TimelineEvent]:
        """单独提取时间线事件 - 使用统一提取器"""
        return await self.unified_timeline_extractor.extract_timeline(text)

    async def extract_relationships(self, text: str) -> List[NetworkEdge]:
        """单独提取关系网络 - 使用统一提取器"""
        return await self.unified_relationship_extractor.extract_relationships(text)

    async def extract_all(self, text: str) -> Dict[str, Any]:
        """提取所有要素 - 使用统一提取器并行执行"""
        # 并行执行所有提取任务
        characters_task = self.unified_character_extractor.extract_characters(text)
        world_task = self.unified_world_extractor.extract_world(text)
        timeline_task = self.unified_timeline_extractor.extract_timeline(text)
        relationships_task = self.unified_relationship_extractor.extract_relationships(text)

        # 等待所有任务完成
        characters, world_setting, timeline_events, relationships = await asyncio.gather(
            characters_task, world_task, timeline_task, relationships_task
        )

        return {
            "characters": characters,
            "world_setting": world_setting,
            "timeline_events": timeline_events,
            "relationships": relationships
        }

    async def extract_specific_elements(self, text: str, elements: List[str]) -> Dict[str, Any]:
        """
        提取特定元素

        Args:
            text: 输入文本
            elements: 要提取的元素列表，可以包含: 'characters', 'world', 'timeline', 'relationships'
        """
        extracted = {}

        for element in elements:
            if element == 'characters':
                extracted['characters'] = await self.unified_character_extractor.extract_characters(text)
            elif element == 'world':
                extracted['world_setting'] = await self.unified_world_extractor.extract_world(text)
            elif element == 'timeline':
                extracted['timeline_events'] = await self.unified_timeline_extractor.extract_timeline(text)
            elif element == 'relationships':
                extracted['relationships'] = await self.unified_relationship_extractor.extract_relationships(text)

        return extracted

    async def enhance_character_data(self, characters: List[Character], text: str) -> List[Character]:
        """增强角色数据，添加原始上下文信息"""
        # 统一提取器已经包含了完整的上下文信息
        return characters

    async def enhance_timeline_data(self, timeline_events: List[TimelineEvent], text: str) -> List[TimelineEvent]:
        """增强时间线数据，添加原始上下文信息"""
        # 统一提取器已经包含了完整的上下文信息
        return timeline_events

    async def enhance_world_setting_data(self, world_setting: WorldSetting, text: str) -> WorldSetting:
        """增强世界设定数据，添加原始上下文信息"""
        # 统一提取器已经包含了完整的上下文信息
        return world_setting

    async def enhance_relationships_data(self, relationships: List[NetworkEdge], text: str) -> List[NetworkEdge]:
        """增强关系网络数据，添加原始上下文信息"""
        # 统一提取器已经包含了完整的上下文信息
        return relationships


# 全局提取服务实例
_extraction_service: Optional[ExtractionService] = None


def get_extraction_service(ai_service: AIService, config: Config) -> ExtractionService:
    """获取或创建提取服务实例"""
    return ExtractionService(ai_service, config)
