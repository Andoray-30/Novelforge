"""
世界书提取器模块
从multi_window_v5.py中提取的世界书相关功能
"""

import asyncio
import re
from typing import List, Optional
from pathlib import Path
from novelforge.services.ai_service import AIService
from novelforge.extractors.character_extractor import SmartChunker, Chunk
from novelforge.core.models import Location, LocationType, WorldSetting, Importance
from novelforge.extractors.base_extractor import (
    WorldExtractorInterface, 
    ExtractionConfig
)


class WorldExtractor(WorldExtractorInterface):
    """世界书提取器实现"""
    
    def __init__(self, config: ExtractionConfig, ai_service: Optional[AIService] = None):
        self.config = config
        self.ai_service = ai_service
    async def extract_world(self, text: str) -> WorldSetting:
        """
        从文本中提取世界设定
        
        Args:
            text: 输入文本
            
        Returns:
            WorldSetting: 提取的世界设定
        """
        if not self.ai_service:
            raise ValueError("AI service is required for world extraction")

        # 创建智能分片器
        chunker = SmartChunker(
            chunk_size=self.config.chunk_size,
            chunk_overlap=self.config.chunk_overlap
        )

        # 分片文本
        chunks = chunker.chunk(text)
        if not chunks:
            return WorldSetting(name="", history="", locations=[], cultures=[], rules=[], themes=[])

        # 提取所有片段中的世界信息
        all_world_info = []
        all_locations = []

        for chunk in chunks:
            # 提取世界设定
            world_info = await self._extract_world_info_from_chunk(chunk)
            if world_info:
                all_world_info.append(world_info)

            # 提取地点
            locations = await self._extract_locations_from_chunk(chunk)
            all_locations.extend(locations)

        # 合并世界信息
        combined_history = " ".join(all_world_info).strip()

        # 合并和去重地点
        merged_locations = await self._hierarchical_merge_locations(all_locations)

        return WorldSetting(
            name="",
            history=combined_history,
            locations=merged_locations,
            cultures=[],  # TODO: 实现文化提取
            rules=[],     # TODO: 实现规则提取
            themes=[]     # TODO: 实现主题提取
        )
    
    async def extract_locations(self, text: str) -> List[Location]:
        """
        从文本中提取地点信息
        
        Args:
            text: 输入文本
            
        Returns:
            List[Location]: 提取的地点列表
        """
        if not self.ai_service:
            raise ValueError("AI service is required for location extraction")

        # 创建智能分片器
        chunker = SmartChunker(
            chunk_size=self.config.chunk_size,
            chunk_overlap=self.config.chunk_overlap
        )

        # 分片文本
        chunks = chunker.chunk(text)
        if not chunks:
            return []

        # 提取所有片段中的地点
        all_locations = []
        for chunk in chunks:
            locations = await self._extract_locations_from_chunk(chunk)
            all_locations.extend(locations)

        # 合并和去重
        if len(all_locations) <= 1:
            return all_locations

        merged_locations = await self._hierarchical_merge_locations(all_locations)
        return merged_locations
    
    def _map_location_type(self, type_str: str) -> LocationType:
        """映射地点类型"""
        if not type_str:
            return LocationType.OTHER
        
        type_lower = type_str.lower()
        if type_lower in ['city', '城市', '都市', '城镇']:
            return LocationType.CITY
        elif type_lower in ['town', '镇', '小镇']:
            return LocationType.TOWN
        elif type_lower in ['village', '村庄', '村落', '村']:
            return LocationType.VILLAGE
        elif type_lower in ['forest', '森林', '树林', '丛林']:
            return LocationType.FOREST
        elif type_lower in ['mountain', '山脉', '山', '高山']:
            return LocationType.MOUNTAIN
        elif type_lower in ['river', '河流', '河', '江']:
            return LocationType.RIVER
        elif type_lower in ['ocean', '海洋', '大海', '海']:
            return LocationType.OCEAN
        elif type_lower in ['desert', '沙漠', '荒漠']:
            return LocationType.DESERT
        elif type_lower in ['building', '建筑', '房屋', '大厦', '建筑物']:
            return LocationType.BUILDING
        elif type_lower in ['room', '房间', '室', '屋']:
            return LocationType.ROOM
        elif type_lower in ['country', '国家', '王国', '帝国']:
            return LocationType.CITY
        elif type_lower in ['natural', '自然']:
            return LocationType.FOREST
        elif type_lower in ['fantasy', '幻想', '魔法', '异世界']:
            return LocationType.OTHER
        else:
            return LocationType.OTHER
    
    def _map_importance(self, importance_str: str) -> Importance:
        """映射重要性等级"""
        if not importance_str:
            return Importance.MEDIUM
        
        importance_lower = str(importance_str).lower()
        if importance_lower in ['low', '低', '不重要']:
            return Importance.LOW
        elif importance_lower in ['high', '高', '重要']:
            return Importance.HIGH
        elif importance_lower in ['critical', '关键', '致命', '转折']:
            return Importance.CRITICAL
        else:
            return Importance.MEDIUM
    async def _hierarchical_merge_locations(self, all_locations: List[Location]) -> List[Location]:
        """分层合并地点"""
        # 这里将实现分层合并逻辑
        # 目前返回原列表，后续会从原文件迁移具体实现
        return all_locations
    
    async def _ai_enhanced_merge_locations(self, locations: List[Location], ai_service) -> List[Location]:
        """AI增强的地点合并"""
        # 这里将实现AI增强合并逻辑
        # 目前返回原列表，后续会从原文件迁移具体实现
        return locations


    async def _extract_world_info_from_chunk(self, chunk: 'Chunk') -> str:
        """从单个片段中提取世界设定信息"""
        prompt = f"""快速提取以下文本中的世界设定：", "", "{chunk.content}", "", "请简洁地描述这个世界的基本设定，包括：", "- 时代背景", "- 世界观特点", "- 社会结构", "- 技术水平", "- 魔法/超能力体系（如果存在）", "- 地理环境", "- 主要势力", "", "请以段落形式输出，不要使用列表格式。"""

        for attempt in range(self.config.max_retries):
            try:
                response = await self.ai_service.chat(prompt, max_tokens=2000, timeout=self.config.timeout)
                return response.strip()
            except Exception as e:
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(self.config.retry_delay)
                else:
                    print(f"世界设定提取失败: {e}")
                    return ""


    async def _extract_locations_from_chunk(self, chunk: 'Chunk') -> List[Location]:
        """从单个片段中提取地点信息"""
        # 黑名单词汇定义
        PURE_OBJECT_WORDS = {
            "电线杆", "柱子", "墙壁", "地板", "天花板",
            "桌子", "椅子", "床", "门", "窗户"
        }
        
        DIRECTION_WORDS = {
            "路上", "隔壁", "旁边", "对面", "前方", "后方"
        }
        
        CELESTIAL_WORDS = {
            "月亮", "月球", "地球", "太阳", "星星"
        }
        
        GAME_TERMS = {
            "上路", "中路", "下路", "野区", "泉水"
        }
        
        BLACKLIST = PURE_OBJECT_WORDS | DIRECTION_WORDS | CELESTIAL_WORDS | GAME_TERMS
        
        prompt = f"""你是一个专业的小说分析师。请仔细分析以下文本片段，提取地点信息并收集相关的原文上下文。", "", "文本片段：", "{chunk.content}", "", "## 任务说明", "- 提取所有重要地点的信息，包括地点名称、类型、描述、地理特征、文化背景等", "- 忽略明显不属于地点的实体（如物品、人物、抽象概念等）", "- 对于每个地点，除了基本信息外，还需要提取原文中的相关上下文信息：", "  - 上下文片段 (contexts) - 包含地点的关键描述或场景的原文片段", "  - 文化示例 (cultural_examples) - 展现地点文化特色的原文片段", "  - 历史示例 (historical_examples) - 展现地点历史背景的原文片段", "", "## 黑名单过滤", "请忽略以下类型的实体：", "- 纯物品：{', '.join(PURE_OBJECT_WORDS)}", "- 方向词：{', '.join(DIRECTION_WORDS)}", "- 天体：{', '.join(CELESTIAL_WORDS)}", "- 游戏术语：{', '.join(GAME_TERMS)}", "", "## 详细要求", "- 每个地点至少提取1-3个上下文片段，每个片段不超过200字符", "- 提取1-3个文化示例，展现地点的文化特色", "- 提取1-2个历史示例，展现地点的历史背景", "", "## 输出格式", "请以JSON格式输出，结构如下：", "{{", "    \"locations\": [", "        {{", "            \"name\": \"地点名称\",", "            \"type\": \"地点类型（city, country, building, natural, fantasy等）\",", "            \"description\": \"地点描述\",", "            \"geography\": \"地理特征\",", "            \"culture\": \"文化背景\",", "            \"landmarks\": [\"地标1\", \"地标2\"],", "            \"contexts\": [", "                \"包含地点的关键描述或场景的原文片段1\",", "                \"包含地点的关键描述或场景的原文片段2\"", "            ],", "            \"cultural_examples\": [", "                \"展现地点文化特色的原文片段1\",", "                \"展现地点文化特色的原文片段2\"", "            ],", "            \"historical_examples\": [", "                \"展现地点历史背景的原文片段1\",", "                \"展现地点历史背景的原文片段2\"", "            ]", "        }}", "    ]", "}}", "", "请注意：只输出JSON，不要添加其他解释文字。"""

        for attempt in range(self.config.max_retries):
            try:
                response = await self.ai_service.chat(prompt, max_tokens=4000, timeout=self.config.timeout)
                data = self.ai_service._parse_json(response, dict)

                locations = []
                loc_list = data.get("locations", []) if isinstance(data, dict) else data

                for loc_data in loc_list:
                    if not isinstance(loc_data, dict):
                        continue

                    # 映射地点类型
                    type_data = loc_data.get("type", "other")
                    location_type = self._map_location_type(type_data)

                    # 处理列表字段
                    landmarks = loc_data.get("landmarks", [])
                    if isinstance(landmarks, str):
                        landmarks = [landmarks] if landmarks else []
                    elif not isinstance(landmarks, list):
                        landmarks = []

                    contexts = loc_data.get("contexts", [])
                    if isinstance(contexts, str):
                        contexts = [contexts] if contexts else []
                    elif not isinstance(contexts, list):
                        contexts = []

                    cultural_examples = loc_data.get("cultural_examples", [])
                    if isinstance(cultural_examples, str):
                        cultural_examples = [cultural_examples] if cultural_examples else []
                    elif not isinstance(cultural_examples, list):
                        cultural_examples = []

                    historical_examples = loc_data.get("historical_examples", [])
                    if isinstance(historical_examples, str):
                        historical_examples = [historical_examples] if historical_examples else []
                    elif not isinstance(historical_examples, list):
                        historical_examples = []

                    # 创建地点对象
                    location = Location(
                        name=str(loc_data.get("name", "Unknown")),
                        type=location_type,
                        description=str(loc_data.get("description", "")),
                        geography=str(loc_data.get("geography", "")),
                        culture=str(loc_data.get("culture", "")),
                        landmarks=landmarks,
                        source_contexts=contexts,
                        cultural_examples=cultural_examples,
                        historical_examples=historical_examples,
                        importance=self._map_importance(loc_data.get("importance", "medium")),
                        climate=str(loc_data.get("climate", "")),
                        features=loc_data.get("features", []),
                        related_locations=loc_data.get("related_locations", []),
                        characters=loc_data.get("characters", [])
                    )
                    locations.append(location)

                return locations

            except Exception as e:
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(self.config.retry_delay)
                else:
                    print(f"地点提取失败: {e}")
                    return []