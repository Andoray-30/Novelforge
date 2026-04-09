"""
统一提取器模块

该模块实现了继承BaseExtractor的统一提取器，内部使用各个具体提取器来完成完整的提取任务。

重构说明：
- 2026-03-25: 更新为使用新的统一提取器（unified_*_extractor）
- 旧的提取器已备份到 archives/old_extractors_backup/
"""

import asyncio
from pathlib import Path
from typing import Any, Dict, List, Optional
from dataclasses import dataclass

from ..core.models import (
    Character,
    Location,
    TimelineEvent,
    NetworkEdge,
    WorldSetting,
    Timeline,
    RelationshipNetwork,
    ExtractionResult
)
from .base_extractor import BaseExtractor, ExtractionConfig
from ..services.ai_service import AIService
from .unified_character_extractor import UnifiedCharacterExtractor
from .unified_world_extractor import UnifiedWorldExtractor
from .unified_timeline_extractor import UnifiedTimelineExtractor
from .unified_relationship_extractor import UnifiedRelationshipExtractor


class UnifiedExtractor(BaseExtractor):
    """统一提取器 - 继承BaseExtractor抽象基类"""

    def __init__(self, config: ExtractionConfig, ai_service: Optional[AIService] = None):
        """
        初始化统一提取器

        Args:
            config: 提取配置参数
            ai_service: AI服务实例
        """
        super().__init__(config)
        self.ai_service = ai_service

        # 创建各个统一提取器
        self.character_extractor = UnifiedCharacterExtractor(config, ai_service)
        self.world_extractor = UnifiedWorldExtractor(config, ai_service)
        self.timeline_extractor = UnifiedTimelineExtractor(config, ai_service)
        self.relationship_extractor = UnifiedRelationshipExtractor(config, ai_service)

    async def extract(self, text: str) -> ExtractionResult:
        """
        执行完整的提取流程

        Args:
            text: 输入文本

        Returns:
            ExtractionResult: 包含所有提取结果的统一结果对象
        """
        if not self.ai_service:
            raise ValueError("AI service is required for extraction")

        # 并行执行所有提取任务
        characters_task = self.character_extractor.extract_characters(text)
        world_task = self.world_extractor.extract_world(text)
        timeline_task = self.timeline_extractor.extract_timeline(text)
        relationships_task = self.relationship_extractor.extract_relationships(text)

        # 等待所有任务完成
        characters, world_setting, timeline_events, relationships = await asyncio.gather(
            characters_task, world_task, timeline_task, relationships_task
        )

        # 构建返回结果
        return ExtractionResult(
            characters=characters,
            world=world_setting,
            timeline=Timeline(
                events=timeline_events,
                total_events=len(timeline_events)
            ),
            relationships=RelationshipNetwork(
                edges=relationships,
                nodes=list(set([edge.source for edge in relationships] +
                              [edge.target for edge in relationships])),
                total_relationships=len(relationships)
            ),
            success=True
        )

    async def extract_characters(self, text: str) -> List[Character]:
        """提取角色信息"""
        return await self.character_extractor.extract_characters(text)

    async def extract_world(self, text: str) -> WorldSetting:
        """提取世界设定"""
        return await self.world_extractor.extract_world(text)

    async def extract_timeline(self, text: str) -> List[TimelineEvent]:
        """提取时间线事件"""
        return await self.timeline_extractor.extract_timeline(text)

    async def extract_relationships(self, text: str) -> List[NetworkEdge]:
        """提取关系网络"""
        return await self.relationship_extractor.extract_relationships(text)


    def validate(self, item: Any) -> bool:
        """验证数据"""
        return True

    def save(self, item: Any) -> bool:
        """保存数据"""
        return True

