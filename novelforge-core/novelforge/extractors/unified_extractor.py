"""
统一提取器模块

该模块实现了继承BaseExtractor的统一提取器，内部使用各个具体提取器来完成完整的提取任务。
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
from .character_extractor import CharacterExtractor
from .world_extractor import WorldExtractor
from .timeline_extractor import TimelineExtractor
from .relationship_extractor import RelationshipExtractor


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
        
        # 创建各个具体提取器
        self.character_extractor = CharacterExtractor(config, ai_service)
        self.world_extractor = WorldExtractor(config, ai_service)
        self.timeline_extractor = TimelineExtractor(config, ai_service)
        self.relationship_extractor = RelationshipExtractor(config, ai_service)
    
    async def extract(self, text: str) -> ExtractionResult:
        """
        从文本中提取完整信息
        
        Args:
            text: 输入文本
            
        Returns:
            ExtractionResult: 完整的提取结果
        """
        if not self.ai_service:
            raise ValueError("AI service is required for extraction")
        
        # 并发执行所有提取任务
        tasks = [
            self.character_extractor.extract_characters(text),
            self.world_extractor.extract_world(text),
            self.timeline_extractor.extract_timeline(text),
            self.relationship_extractor.extract_relationships(text)
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 处理结果
        characters = results[0] if not isinstance(results[0], Exception) else []
        world_setting = results[1] if not isinstance(results[1], Exception) else WorldSetting(
            locations=[], cultures=[], rules=[], themes=[], history=""
        )
        timeline_events = results[2] if not isinstance(results[2], Exception) else []
        relationships = results[3] if not isinstance(results[3], Exception) else []
        
        # 构建Timeline对象
        timeline = Timeline(
            events=timeline_events,
            total_events=len(timeline_events)
        ) if timeline_events else None
        
        # 构建RelationshipNetwork对象
        relationship_network = RelationshipNetwork(
            edges=relationships,
            nodes=list(set([edge.source for edge in relationships] + 
                          [edge.target for edge in relationships])),
            total_relationships=len(relationships)
        ) if relationships else None
        
        return ExtractionResult(
            characters=characters,
            world=world_setting,
            timeline=timeline,
            relationships=relationship_network,
            success=True,
            errors=[]
        )
    
    def validate(self, data: Any) -> bool:
        """
        验证提取结果的有效性
        
        Args:
            data: 要验证的数据
            
        Returns:
            bool: 是否有效
        """
        if not isinstance(data, ExtractionResult):
            return False
        
        # 基本验证：至少有一个角色或世界设定
        has_content = (
            len(data.characters) > 0 or 
            (data.world is not None and len(data.world.locations) > 0) or
            (data.timeline is not None and len(data.timeline.events) > 0) or
            (data.relationships is not None and len(data.relationships.edges) > 0)
        )
        
        return has_content
    
    def save(self, data: ExtractionResult, output_path: Path) -> None:
        """
        保存提取结果
        
        Args:
            data: 提取结果
            output_path: 输出路径
        """
        import json
        
        # 确保输出目录存在
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # 保存为JSON格式
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data.model_dump(), f, ensure_ascii=False, indent=2)