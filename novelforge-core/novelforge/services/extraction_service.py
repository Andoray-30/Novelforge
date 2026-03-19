"""
提取服务 - 提供角色、时间线、世界设定、关系网络的单独和整合提取功能
"""
from typing import List, Dict, Any, Optional
from novelforge.services.ai_service import AIService
from novelforge.extractors.enhanced_orchestrator import EnhancedMultiWindowOrchestrator
from novelforge.core.models import Character, WorldSetting, Timeline, RelationshipNetwork, TimelineEvent, NetworkEdge
from novelforge.core.config import Config


class ExtractionService:
    """提取服务类 - 提供精细化的提取功能"""
    
    def __init__(self, ai_service: AIService, config: Config):
        self.ai_service = ai_service
        self.config = config
        self.orchestrator = EnhancedMultiWindowOrchestrator(ai_service, config)
    
    async def extract_characters(self, text: str) -> List[Character]:
        """单独提取角色"""
        result = await self.orchestrator.extract(text)
        return result.get("characters", [])
    
    async def extract_world_setting(self, text: str) -> WorldSetting:
        """单独提取世界设定"""
        result = await self.orchestrator.extract(text)
        return result.get("world_setting", WorldSetting(locations=[], cultures=[], rules=[], themes=[], history=""))
    
    async def extract_timeline(self, text: str) -> List[TimelineEvent]:
        """单独提取时间线事件"""
        result = await self.orchestrator.extract(text)
        return result.get("timeline_events", [])
    
    async def extract_relationships(self, text: str) -> List[NetworkEdge]:
        """单独提取关系网络"""
        result = await self.orchestrator.extract(text)
        return result.get("relationships", [])
    
    async def extract_all(self, text: str) -> Dict[str, Any]:
        """提取所有要素"""
        return await self.orchestrator.extract(text)
    
    async def extract_specific_elements(self, text: str, elements: List[str]) -> Dict[str, Any]:
        """
        提取特定元素
        
        Args:
            text: 输入文本
            elements: 要提取的元素列表，可以包含: 'characters', 'world', 'timeline', 'relationships'
        """
        result = await self.orchestrator.extract(text)
        
        extracted = {}
        for element in elements:
            if element == 'characters':
                extracted['characters'] = result.get("characters", [])
            elif element == 'world':
                extracted['world_setting'] = result.get("world_setting", 
                    WorldSetting(locations=[], cultures=[], rules=[], themes=[], history=""))
            elif element == 'timeline':
                extracted['timeline_events'] = result.get("timeline_events", [])
            elif element == 'relationships':
                extracted['relationships'] = result.get("relationships", [])
        
        return extracted
    
    async def enhance_character_data(self, characters: List[Character], text: str) -> List[Character]:
        """增强角色数据，添加原始上下文信息"""
        # 目前只是返回原始数据，但未来可以实现更复杂的增强逻辑
        for character in characters:
            # 可以在这里添加更多上下文提取逻辑
            pass
        return characters
    
    async def enhance_timeline_data(self, timeline_events: List[TimelineEvent], text: str) -> List[TimelineEvent]:
        """增强时间线数据，添加原始上下文信息"""
        # 目前只是返回原始数据，但未来可以实现更复杂的增强逻辑
        for event in timeline_events:
            # 可以在这里添加更多上下文提取逻辑
            pass
        return timeline_events
    
    async def enhance_world_setting_data(self, world_setting: WorldSetting, text: str) -> WorldSetting:
        """增强世界设定数据，添加原始上下文信息"""
        # 目前只是返回原始数据，但未来可以实现更复杂的增强逻辑
        return world_setting
    
    async def enhance_relationships_data(self, relationships: List[NetworkEdge], text: str) -> List[NetworkEdge]:
        """增强关系网络数据，添加原始上下文信息"""
        # 目前只是返回原始数据，但未来可以实现更复杂的增强逻辑
        for relationship in relationships:
            # 可以在这里添加更多上下文提取逻辑
            pass
        return relationships


# 全局提取服务实例
_extraction_service: Optional[ExtractionService] = None


def get_extraction_service(ai_service: AIService, config: Config) -> ExtractionService:
    """获取或创建提取服务实例"""
    global _extraction_service
    if _extraction_service is None:
        _extraction_service = ExtractionService(ai_service, config)
    return _extraction_service