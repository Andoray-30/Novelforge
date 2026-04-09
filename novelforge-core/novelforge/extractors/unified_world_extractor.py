"""
统一世界设定提取器 - 批量提取，充分利用大模型长上下文

设计原则：
1. 批量提取：合并多个片段一次性提取，减少API调用
2. 信息完整：保留所有字段，包括上下文、文化示例、历史示例
3. 智能合并：AI辅助分组，程序化合并确保信息不丢失
"""

import asyncio
import re
from typing import List, Dict, Optional, Set, Tuple
from dataclasses import dataclass
from novelforge.services.ai_service import AIService
from novelforge.extractors.base_extractor import (
    WorldExtractorInterface, ExtractionConfig, SmartChunker, Chunk
)
from novelforge.core.models import Location, LocationType, WorldSetting, Importance, Culture


@dataclass
class LocationGroup:
    """地点分组信息"""
    indices: List[int]
    canonical_name: str


class UnifiedWorldExtractor(WorldExtractorInterface):
    """
    统一世界设定提取器

    核心改进：
    1. 批量提取：一次处理多个片段，充分利用上下文窗口
    2. 完整信息保留：上下文、文化示例、历史示例全部保留
    3. 智能去重：AI分组+程序化合并
    """

    MAX_CONTEXT_TOKENS = 100000
    MAX_CHUNKS_PER_BATCH = 5  # 每批最多5个片段
    MAX_LOCS_PER_BATCH = 30   # 每批最多30个地点去重

    def __init__(self, config: ExtractionConfig, ai_service: Optional[AIService] = None):
        self.config = config
        self.ai_service = ai_service
        self.chunker = SmartChunker(
            chunk_size=config.chunk_size,
            chunk_overlap=config.chunk_overlap
        )

    async def extract_world(self, text: str) -> WorldSetting:
        """从文本中提取完整世界设定"""
        if not self.ai_service:
            raise ValueError("AI service is required for world extraction")

        chunks = self.chunker.chunk(text)
        if not chunks:
            return WorldSetting(name="", history="", locations=[], cultures=[], rules=[], themes=[])

        # 批量提取世界信息和地点
        all_world_info = []
        all_locations = []

        for i in range(0, len(chunks), self.MAX_CHUNKS_PER_BATCH):
            batch_chunks = chunks[i:i + self.MAX_CHUNKS_PER_BATCH]
            world_info, locations = await self._batch_extract_from_chunks(batch_chunks)
            all_world_info.append(world_info)
            all_locations.extend(locations)

        # 合并世界信息
        combined_history = "\n\n".join(filter(None, all_world_info)).strip()

        # 智能合并地点
        merged_locations = await self._smart_merge_locations(all_locations)

        # 提取文化和规则
        all_cultures = []
        all_rules = []
        for i in range(0, len(chunks), self.MAX_CHUNKS_PER_BATCH):
            batch_chunks = chunks[i:i + self.MAX_CHUNKS_PER_BATCH]
            combined_batch = "\n\n".join([c.content for c in batch_chunks])
            cultures, rules = await self._extract_cultures_and_rules(combined_batch)
            all_cultures.extend(cultures)
            all_rules.extend(rules)

        # 去重规则
        unique_rules = list(dict.fromkeys(all_rules))

        # 合并文化
        merged_cultures = self._merge_cultures(all_cultures)

        return WorldSetting(
            name="",
            history=combined_history,
            locations=merged_locations,
            cultures=merged_cultures,
            rules=unique_rules,
            themes=[]
        )

    def _merge_cultures(self, cultures: List[dict]) -> list:
        """按名称合并文化设定，去重"""
        seen = {}
        for c in cultures:
            name = c.get("name", "").strip()
            if not name:
                continue
            if name not in seen:
                seen[name] = c
            else:
                # 合并字段
                existing = seen[name]
                for key in ["beliefs", "values", "customs", "traditions"]:
                    if isinstance(c.get(key), list) and isinstance(existing.get(key), list):
                        existing[key] = list(dict.fromkeys(existing[key] + c[key]))
        return list(seen.values())

    async def _extract_cultures_and_rules(self, text: str) -> Tuple[List[dict], List[str]]:
        """提取文化和规则信息"""
        prompt = f"""你是一个专业的小说世界设定分析师。请仔细分析以下文本，提取其中的文化设定和世界规则。

文本内容：
{text}

## 任务
1. **文化设定**：提取文本中出现的文化、信仰、价值观、习俗和传统
2. **世界规则**：提取这个世界的运行规则、社会制度、魔法/科技体系等

## 输出格式
请以JSON格式输出：
{{
    "cultures": [
        {{
            "name": "文化名称",
            "description": "文化描述",
            "beliefs": ["信仰1", "信仰2"],
            "values": ["价值观1", "价值观2"],
            "customs": ["习俗1", "习俗2"],
            "traditions": ["传统1", "传统2"]
        }}
    ],
    "rules": ["规则1", "规则2", "规则3"]
}}

重要：
1. 只输出JSON，不要添加其他文字
2. 如果某些类别没有信息，返回空数组而不是省略"""

        for attempt in range(self.config.max_retries):
            try:
                response = await self.ai_service.chat(
                    prompt,
                    max_tokens=4000,
                    timeout=self.config.timeout
                )
                return self._parse_culture_and_rules_response(response)
            except Exception as e:
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(self.config.retry_delay)
                else:
                    print(f"文化和规则提取失败: {e}")
                    return [], []
        return [], []

    def _parse_culture_and_rules_response(self, response: str) -> Tuple[List[dict], List[str]]:
        """解析文化和规则响应"""
        try:
            data = self.ai_service._parse_json(response, dict)
            cultures = data.get("cultures", []) if isinstance(data, dict) else []
            rules = data.get("rules", []) if isinstance(data, dict) else []
            return cultures, [str(r) for r in rules if r]
        except Exception as e:
            print(f"解析文化和规则响应失败: {e}")
            return [], []

    async def extract_locations(self, text: str) -> List[Location]:
        """单独提取地点信息"""
        if not self.ai_service:
            raise ValueError("AI service is required for location extraction")

        chunks = self.chunker.chunk(text)
        if not chunks:
            return []

        all_locations = []
        for i in range(0, len(chunks), self.MAX_CHUNKS_PER_BATCH):
            batch_chunks = chunks[i:i + self.MAX_CHUNKS_PER_BATCH]
            _, locations = await self._batch_extract_from_chunks(batch_chunks)
            all_locations.extend(locations)

        return await self._smart_merge_locations(all_locations)

    async def _batch_extract_from_chunks(self, chunks: List[Chunk]) -> Tuple[str, List[Location]]:
        """批量从多个片段中提取世界信息和地点"""
        combined_content = "\n\n=== 文本片段分隔 ===\n\n".join([
            f"[片段 {j+1}]\n{chunk.content}"
            for j, chunk in enumerate(chunks)
        ])

        # 同时提取世界信息和地点
        world_info = await self._extract_world_info(combined_content)
        locations = await self._extract_locations(combined_content)

        return world_info, locations

    async def _extract_world_info(self, combined_text: str) -> str:
        """提取世界设定信息"""
        prompt = f"""你是一个专业的小说世界设定分析师。请仔细分析以下文本，提取世界设定信息。

文本内容：
{combined_text}

## 任务
提取这个世界的基本设定，包括：
- 时代背景（古代/现代/未来/架空等）
- 世界观特点（现实世界/奇幻/科幻/武侠等）
- 社会结构（政治体制、阶级分化等）
- 技术水平
- 魔法/超能力体系（如果存在）
- 地理环境
- 主要势力或组织

## 输出要求
- 以连贯的段落形式输出，不要分点
- 描述要具体、详细，200-500字
- 如果文本片段中有矛盾的信息，请综合描述

请直接输出世界设定描述："""

        for attempt in range(self.config.max_retries):
            try:
                response = await self.ai_service.chat(
                    prompt,
                    max_tokens=2000,
                    timeout=self.config.timeout
                )
                return response.strip()
            except Exception as e:
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(self.config.retry_delay)
                else:
                    print(f"世界设定提取失败: {e}")
                    return ""
        return ""

    async def _extract_locations(self, combined_text: str) -> List[Location]:
        """批量提取地点信息"""
        # 黑名单词汇
        BLACKLIST = {
            "电线杆", "柱子", "墙壁", "地板", "天花板",
            "桌子", "椅子", "床", "门", "窗户",
            "路上", "隔壁", "旁边", "对面", "前方", "后方",
            "月亮", "月球", "地球", "太阳", "星星",
            "上路", "中路", "下路", "野区", "泉水"
        }

        prompt = f"""你是一个专业的小说地点分析师。请仔细分析以下文本，提取所有重要地点信息。

文本内容：
{combined_text}

## 任务说明
提取所有重要地点的信息，包括：
- 地点名称
- 地点类型（城市、建筑、自然景观等）
- 详细描述
- 地理特征
- 文化背景
- 地标建筑

## 原文上下文（必须提取）
对于每个地点，必须提取原文中的相关片段：
- contexts: 包含地点的关键描述或场景的原文片段（2-4段）
- cultural_examples: 展现地点文化特色的原文片段（1-3段）
- historical_examples: 展现地点历史背景的原文片段（1-2段）

## 黑名单过滤
请忽略以下类型的实体：{', '.join(BLACKLIST)}

## 输出格式
请以JSON格式输出：
{{
    "locations": [
        {{
            "name": "地点名称",
            "type": "地点类型（city, country, building, natural, fantasy等）",
            "description": "地点详细描述（100-300字）",
            "geography": "地理特征",
            "culture": "文化背景",
            "landmarks": ["地标1", "地标2"],
            "contexts": [
                "原文片段1（50-200字）",
                "原文片段2（50-200字）"
            ],
            "cultural_examples": [
                "文化相关原文片段1",
                "文化相关原文片段2"
            ],
            "historical_examples": [
                "历史相关原文片段1"
            ],
            "importance": "重要性（low/medium/high/critical）"
        }}
    ]
}}

重要：
1. 只输出JSON，不要添加其他文字
2. 每个地点必须有contexts、cultural_examples、historical_examples
3. 如果地点在多个片段中出现，合并信息但不要遗漏任何片段的上下文"""

        for attempt in range(self.config.max_retries):
            try:
                response = await self.ai_service.chat(
                    prompt,
                    max_tokens=6000,
                    timeout=self.config.timeout
                )
                return self._parse_locations_response(response)
            except Exception as e:
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(self.config.retry_delay)
                else:
                    print(f"地点提取失败: {e}")
                    return []
        return []

    def _parse_locations_response(self, response: str) -> List[Location]:
        """解析地点响应"""
        try:
            data = self.ai_service._parse_json(response, dict)
            loc_list = data.get("locations", []) if isinstance(data, dict) else data

            locations = []
            for loc_data in loc_list:
                if not isinstance(loc_data, dict):
                    continue

                location = self._create_location_from_dict(loc_data)
                locations.append(location)

            return locations
        except Exception as e:
            print(f"解析地点响应失败: {e}")
            return []

    def _create_location_from_dict(self, loc_data: dict) -> Location:
        """从字典创建Location对象"""
        location_type = self._map_location_type(loc_data.get("type", "other"))
        importance = self._map_importance(loc_data.get("importance", "medium"))

        # 处理列表字段
        landmarks = self._ensure_list(loc_data.get("landmarks", []))
        contexts = self._ensure_list(loc_data.get("contexts", []))
        cultural_examples = self._ensure_list(loc_data.get("cultural_examples", []))
        historical_examples = self._ensure_list(loc_data.get("historical_examples", []))
        features = self._ensure_list(loc_data.get("features", []))
        related_locations = self._ensure_list(loc_data.get("related_locations", []))
        characters = self._ensure_list(loc_data.get("characters", []))

        return Location(
            name=str(loc_data.get("name", "Unknown")),
            type=location_type,
            description=str(loc_data.get("description", "")),
            geography=str(loc_data.get("geography", "")),
            culture=str(loc_data.get("culture", "")),
            landmarks=landmarks,
            source_contexts=contexts,
            cultural_examples=cultural_examples,
            historical_examples=historical_examples,
            importance=importance,
            climate=str(loc_data.get("climate", "")),
            features=features,
            related_locations=related_locations,
            characters=characters
        )

    def _ensure_list(self, data) -> List[str]:
        """确保数据是列表"""
        if isinstance(data, list):
            return [str(item) for item in data if item]
        elif isinstance(data, str) and data:
            return [data]
        return []

    def _map_location_type(self, type_str: str) -> LocationType:
        """映射地点类型"""
        if not type_str:
            return LocationType.OTHER

        type_lower = type_str.lower()
        type_map = {
            'city': LocationType.CITY, '城市': LocationType.CITY, '都市': LocationType.CITY,
            'town': LocationType.TOWN, '镇': LocationType.TOWN, '小镇': LocationType.TOWN,
            'village': LocationType.VILLAGE, '村庄': LocationType.VILLAGE, '村': LocationType.VILLAGE,
            'forest': LocationType.FOREST, '森林': LocationType.FOREST, '树林': LocationType.FOREST,
            'mountain': LocationType.MOUNTAIN, '山脉': LocationType.MOUNTAIN, '山': LocationType.MOUNTAIN,
            'river': LocationType.RIVER, '河流': LocationType.RIVER, '河': LocationType.RIVER,
            'ocean': LocationType.OCEAN, '海洋': LocationType.OCEAN, '大海': LocationType.OCEAN,
            'desert': LocationType.DESERT, '沙漠': LocationType.DESERT,
            'building': LocationType.BUILDING, '建筑': LocationType.BUILDING, '房屋': LocationType.BUILDING,
            'room': LocationType.ROOM, '房间': LocationType.ROOM, '室': LocationType.ROOM,
            'country': LocationType.CITY, '国家': LocationType.CITY, '王国': LocationType.CITY,
        }
        return type_map.get(type_lower, LocationType.OTHER)

    def _map_importance(self, importance_str: str) -> Importance:
        """映射重要性"""
        if not importance_str:
            return Importance.MEDIUM

        importance_lower = str(importance_str).lower()
        if importance_lower in ['low', '低', '不重要']:
            return Importance.LOW
        elif importance_lower in ['high', '高', '重要']:
            return Importance.HIGH
        elif importance_lower in ['critical', '关键', '致命', '转折']:
            return Importance.CRITICAL
        return Importance.MEDIUM

    async def _smart_merge_locations(self, all_locations: List[Location]) -> List[Location]:
        """智能合并地点"""
        # 阶段1: 按名称预合并
        pre_merged = self._merge_by_exact_name(all_locations)

        if len(pre_merged) <= 1:
            return pre_merged

        # 阶段2: AI智能分组
        groups = await self._ai_group_locations(pre_merged)

        # 阶段3: 按组合并
        return self._merge_by_groups(pre_merged, groups)

    def _merge_by_exact_name(self, locations: List[Location]) -> List[Location]:
        """按名称完全匹配合并"""
        name_map: Dict[str, Location] = {}

        for loc in locations:
            name = loc.name.strip()
            if not name:
                continue

            if name not in name_map:
                name_map[name] = loc
            else:
                self._merge_location_data(name_map[name], loc)

        return list(name_map.values())

    def _merge_location_data(self, target: Location, source: Location):
        """合并地点数据"""
        # 合并描述（取最长的）
        if len(source.description) > len(target.description):
            target.description = source.description

        # 合并地理特征
        if len(source.geography) > len(target.geography):
            target.geography = source.geography

        # 合并文化背景
        if len(source.culture) > len(target.culture):
            target.culture = source.culture

        # 合并列表字段（去重）
        target.landmarks = self._merge_lists(target.landmarks, source.landmarks)
        target.source_contexts = self._merge_lists(target.source_contexts, source.source_contexts)
        target.cultural_examples = self._merge_lists(target.cultural_examples, source.cultural_examples)
        target.historical_examples = self._merge_lists(target.historical_examples, source.historical_examples)
        target.features = self._merge_lists(target.features, source.features)
        target.related_locations = self._merge_lists(target.related_locations, source.related_locations)
        target.characters = self._merge_lists(target.characters, source.characters)

        # 更新重要性（取最高的）
        importance_priority = {
            Importance.CRITICAL: 3, Importance.HIGH: 2,
            Importance.MEDIUM: 1, Importance.LOW: 0
        }
        if importance_priority.get(source.importance, 0) > importance_priority.get(target.importance, 0):
            target.importance = source.importance

    def _merge_lists(self, list1: List[str], list2: List[str]) -> List[str]:
        """合并列表去重"""
        seen = set()
        result = []
        for item in list1 + list2:
            if item and item not in seen:
                seen.add(item)
                result.append(item)
        return result

    async def _ai_group_locations(self, locations: List[Location]) -> List[LocationGroup]:
        """AI智能分组地点"""
        if len(locations) <= 1:
            return [LocationGroup(indices=[i], canonical_name=locations[i].name)
                    for i in range(len(locations))]

        all_groups = []
        for batch_start in range(0, len(locations), self.MAX_LOCS_PER_BATCH):
            batch_end = min(batch_start + self.MAX_LOCS_PER_BATCH, len(locations))
            batch = locations[batch_start:batch_end]
            batch_groups = await self._ai_group_batch(batch, batch_start)
            all_groups.extend(batch_groups)

        return all_groups

    async def _ai_group_batch(self, locations: List[Location], offset: int) -> List[LocationGroup]:
        """对一批地点进行AI分组"""
        loc_descriptions = []
        for i, loc in enumerate(locations):
            desc = f"[{i}] 名称: {loc.name}"
            if loc.description:
                desc += f", 描述: {loc.description[:80]}..."
            if loc.geography:
                desc += f", 地理: {loc.geography[:50]}..."
            loc_descriptions.append(desc)

        prompt = f"""请分析以下地点列表，识别哪些地点是同一个地方的不同称呼或描述。

地点列表：
{chr(10).join(loc_descriptions)}

## 任务
判断哪些地点实际上是指同一个地方。考虑：
1. 完全相同的名称
2. 简称/全称（如"北京"和"北京市"）
3. 同一地点在不同片段中的描述

## 输出格式
返回JSON格式，只包含分组索引：
{{
    "groups": [
        [0, 2],  // 索引0和2是同一地点
        [1],     // 索引1是独立的
        [3, 4]   // 索引3和4是同一地点
    ]
}}

只返回JSON分组索引，不要返回地点详细信息。"""

        try:
            response = await self.ai_service.chat(prompt, max_tokens=2000)
            data = self.ai_service._parse_json(response, dict)
            groups_data = data.get("groups", [])

            groups = []
            used_indices = set()

            for group_indices in groups_data:
                if not isinstance(group_indices, list):
                    continue

                absolute_indices = [offset + idx for idx in group_indices if isinstance(idx, int)]

                if absolute_indices:
                    canonical_name = locations[group_indices[0]].name if group_indices[0] < len(locations) else "Unknown"
                    groups.append(LocationGroup(
                        indices=absolute_indices,
                        canonical_name=canonical_name
                    ))
                    used_indices.update(absolute_indices)

            # 处理未分组的地点
            for i in range(len(locations)):
                absolute_idx = offset + i
                if absolute_idx not in used_indices:
                    groups.append(LocationGroup(
                        indices=[absolute_idx],
                        canonical_name=locations[i].name
                    ))

            return groups

        except Exception as e:
            print(f"AI地点分组失败: {e}，回退到独立分组")
            return [
                LocationGroup(indices=[offset + i], canonical_name=loc.name)
                for i, loc in enumerate(locations)
            ]

    def _merge_by_groups(self, locations: List[Location], groups: List[LocationGroup]) -> List[Location]:
        """按组合并地点"""
        merged = []

        for group in groups:
            if not group.indices:
                continue

            group_locs = [locations[i] for i in group.indices if i < len(locations)]
            if not group_locs:
                continue

            base_loc = group_locs[0]
            for other_loc in group_locs[1:]:
                self._merge_location_data(base_loc, other_loc)

            base_loc.name = group.canonical_name
            merged.append(base_loc)

        return merged
