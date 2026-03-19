"""
时间线提取器模块
从multi_window_v5.py中提取的时间线相关功能
"""

import asyncio
from typing import List, Optional
from pathlib import Path
from novelforge.services.ai_service import AIService
from novelforge.extractors.character_extractor import SmartChunker, Chunk
from novelforge.core.models import TimelineEvent, EventType, Importance, TimePrecision
from novelforge.extractors.base_extractor import (
    TimelineExtractorInterface, 
    ExtractionConfig
)


class TimelineExtractor(TimelineExtractorInterface):
    """时间线提取器实现"""
    
    def __init__(self, config: ExtractionConfig, ai_service: Optional[AIService] = None):
        self.config = config
        self.ai_service = ai_service
    async def extract_timeline(self, text: str) -> List[TimelineEvent]:
        """
        从文本中提取时间线事件
        
        Args:
            text: 输入文本
            
        Returns:
            List[TimelineEvent]: 提取的时间线事件列表
        """
        if not self.ai_service:
            raise ValueError("AI service is required for timeline extraction")

        # 创建智能分片器
        chunker = SmartChunker(
            chunk_size=self.config.chunk_size,
            chunk_overlap=self.config.chunk_overlap
        )

        # 分片文本
        chunks = chunker.chunk(text)
        if not chunks:
            return []

        # 提取所有片段中的时间线事件
        all_events = []
        for chunk in chunks:
            events = await self._extract_timeline_from_chunk(chunk)
            all_events.extend(events)

        # 合并和去重
        if len(all_events) <= 1:
            return all_events

        merged_events = await self._hierarchical_merge_timeline_events(all_events)
        return merged_events
    
    def _map_event_type(self, type_str: str) -> EventType:
        """映射事件类型"""
        if not type_str:
            return EventType.OTHER
        
        type_lower = type_str.lower()
        if type_lower in ['birth', '出生', '诞生']:
            return EventType.BIRTH
        elif type_lower in ['death', '死亡', '去世']:
            return EventType.DEATH
        elif type_lower in ['battle', '战斗', '战争', '战役']:
            return EventType.BATTLE
        elif type_lower in ['marriage', '结婚', '婚姻']:
            return EventType.MARRIAGE
        elif type_lower in ['coronation', '加冕', '登基']:
            return EventType.CORONATION
        elif type_lower in ['discovery', '发现', '探索']:
            return EventType.DISCOVERY
        elif type_lower in ['journey', '旅程', '旅行', '远征']:
            return EventType.JOURNEY
        elif type_lower in ['conflict', '冲突', '矛盾']:
            return EventType.CONFLICT
        elif type_lower in ['alliance', '联盟', '结盟']:
            return EventType.ALLIANCE
        elif type_lower in ['betrayal', '背叛', '出卖']:
            return EventType.BETRAYAL
        elif type_lower in ['romance', '浪漫', '爱情']:
            return EventType.ROMANCE
        elif type_lower in ['separation', '分离', '离别']:
            return EventType.SEPARATION
        elif type_lower in ['reunion', '重逢', '团聚']:
            return EventType.REUNION
        elif type_lower in ['sacrifice', '牺牲', '献身']:
            return EventType.SACRIFICE
        elif type_lower in ['victory', '胜利', '成功']:
            return EventType.VICTORY
        elif type_lower in ['defeat', '失败', '战败']:
            return EventType.DEFEAT
        elif type_lower in ['mystery', '神秘', '谜团']:
            return EventType.MYSTERY
        elif type_lower in ['revelation', '揭示', '启示']:
            return EventType.REVELATION
        elif type_lower in ['transformation', '转变', '变形']:
            return EventType.TRANSFORMATION
        else:
            return EventType.OTHER
    
    def _map_importance(self, importance_str: str) -> Importance:
        """映射事件重要性"""
        if not importance_str:
            return Importance.MEDIUM
        
        importance_lower = importance_str.lower()
        if importance_lower in ['low', '低', '不重要']:
            return Importance.LOW
        elif importance_lower in ['medium', '中', '一般']:
            return Importance.MEDIUM
        elif importance_lower in ['high', '高', '重要']:
            return Importance.HIGH
        elif importance_lower in ['critical', '关键', '致命', '转折']:
            return Importance.CRITICAL
        else:
            return Importance.MEDIUM
    
    def _map_time_precision(self, precision_str: str) -> TimePrecision:
        """映射时间精度"""
        if not precision_str:
            return TimePrecision.NARRATIVE
        
        precision_lower = str(precision_str).lower()
        if precision_lower in ['year', '年']:
            return TimePrecision.YEAR
        elif precision_lower in ['month', '月']:
            return TimePrecision.MONTH
        elif precision_lower in ['day', '日']:
            return TimePrecision.DAY
        elif precision_lower in ['hour', '时']:
            return TimePrecision.HOUR
        elif precision_lower in ['relative', '相对', '相对时间']:
            return TimePrecision.RELATIVE
        elif precision_lower in ['narrative', '叙事', '叙事时间']:
            return TimePrecision.NARRATIVE
        else:
            return TimePrecision.UNKNOWN
    async def _hierarchical_merge_timeline_events(self, all_events: List[TimelineEvent]) -> List[TimelineEvent]:
        """分层合并时间线事件"""
        # 这里将实现分层合并逻辑
        # 目前返回原列表，后续会从原文件迁移具体实现
        return all_events


    async def _extract_timeline_from_chunk(self, chunk: 'Chunk') -> List[TimelineEvent]:
        """从单个片段中提取时间线事件"""
        prompt = f"""你是一个专业的小说分析师。请仔细分析以下文本片段，提取关键事件。", "", "文本片段：", "{chunk.content}", "", "## 任务说明", "- 提取文本中的关键事件，包括情节发展、转折点、重要互动等", "- 对于每个事件，尽可能提取以下信息：", "  - ID (id)", "  - 标题 (title) - 事件的简短标题", "  - 描述 (description) - 事件的详细描述", "  - 事件类型 (event_type) - 主要事件、次要事件、战斗、对话等", "  - 绝对时间 (absolute_time) - 事件发生的具体时间（如果明确提及）", "  - 相对时间 (relative_time) - 相对于故事开始的时间（如\"第一章末尾\"）", "  - 叙事时间 (narrative_time) - 在叙事中的时间位置", "  - 重要角色 (characters) - 事件涉及的重要角色", "  - 重要地点 (locations) - 事件发生的重要地点", "  - 重要性 (importance) - 事件的重要性等级", "  - 后果 (consequences) - 事件对故事的影响", "  - 证据 (evidence) - 支持该事件存在的原文依据", "", "## 事件类型说明", "- BIRTH: 出生/诞生", "- DEATH: 死亡/去世", "- BATTLE: 战斗/战争/战役", "- MARRIAGE: 结婚/婚姻", "- CORONATION: 加冕/登基", "- DISCOVERY: 发现/探索", "- JOURNEY: 旅程/旅行/远征", "- CONFLICT: 冲突/矛盾", "- ALLIANCE: 联盟/结盟", "- BETRAYAL: 背叛/出卖", "- ROMANCE: 浪漫/爱情", "- SEPARATION: 分离/离别", "- REUNION: 重逢/团聚", "- SACRIFICE: 牺牲/献身", "- VICTORY: 胜利/成功", "- DEFEAT: 失败/战败", "- MYSTERY: 神秘/谜团", "- REVELATION: 揭示/启示", "- TRANSFORMATION: 转变/变形", "- OTHER: 其他类型", "", "## 重要性等级", "- CRITICAL: 关键/致命/转折点", "- HIGH: 重要/高影响", "- MEDIUM: 中等/一般", "- LOW: 低/不重要", "", "## 输出格式", "请以JSON格式输出，结构如下：", "{{", "    \"events\": [", "        {{", "            \"id\": \"事件ID\",", "            \"title\": \"事件标题\",", "            \"description\": \"事件详细描述\",", "            \"event_type\": \"事件类型（使用上述英文常量）\",", "            \"absolute_time\": \"具体时间（如果知道）\",", "            \"relative_time\": \"相对时间（如'第一章'）\",", "            \"narrative_time\": \"叙事时间位置\",", "            \"characters\": [\"角色1\", \"角色2\"],", "            \"locations\": [\"地点1\", \"地点2\"],", "            \"importance\": \"重要性等级（使用上述英文常量）\",", "            \"consequences\": [\"后果1\", \"后果2\"],", "            \"evidence\": [\"证据1\", \"证据2\"]", "        }}", "    ]", "}}", "", "请注意：只输出JSON，不要添加其他解释文字。"""

        for attempt in range(self.config.max_retries):
            try:
                response = await self.ai_service.chat(prompt, max_tokens=4000, timeout=self.config.timeout)
                data = self.ai_service._parse_json(response, dict)

                events = []
                event_list = data.get("events", []) if isinstance(data, dict) else data

                for event_data in event_list:
                    if not isinstance(event_data, dict):
                        continue

                    # 解析事件类型
                    type_data = event_data.get("event_type", "other")
                    event_type = self._map_event_type(type_data)

                    # 解析重要性
                    importance_data = event_data.get("importance", "medium")
                    importance = self._map_importance(importance_data)

                    # 处理列表字段
                    characters = event_data.get("characters", [])
                    if isinstance(characters, str):
                        characters = [characters] if characters else []
                    elif not isinstance(characters, list):
                        characters = []

                    locations = event_data.get("locations", [])
                    if isinstance(locations, str):
                        locations = [locations] if locations else []
                    elif not isinstance(locations, list):
                        locations = []

                    consequences = event_data.get("consequences", [])
                    if isinstance(consequences, str):
                        consequences = [consequences] if consequences else []
                    elif not isinstance(consequences, list):
                        consequences = []

                    evidence = event_data.get("evidence", [])
                    if isinstance(evidence, str):
                        evidence = [evidence] if evidence else []
                    elif not isinstance(evidence, list):
                        evidence = []

                    # 创建事件对象
                    event = TimelineEvent(
                        id=str(event_data.get("id", "")),
                        title=str(event_data.get("title", "")),
                        description=str(event_data.get("description", "")),
                        event_type=event_type,
                        absolute_time=str(event_data.get("absolute_time", "")) if event_data.get("absolute_time") else None,
                        relative_time=str(event_data.get("relative_time", "")) if event_data.get("relative_time") else None,
                        narrative_time=str(event_data.get("narrative_time", "")) if event_data.get("narrative_time") else None,
                        time_precision=self._map_time_precision(event_data.get("time_precision", "narrative")),
                        era=str(event_data.get("era", "")) if event_data.get("era") else None,
                        chapter_reference=str(event_data.get("chapter_reference", "")) if event_data.get("chapter_reference") else None,
                        characters=characters,
                        locations=locations,
                        importance=importance,
                        consequences=consequences,
                        evidence=evidence
                    )
                    events.append(event)

                return events

            except Exception as e:
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(self.config.retry_delay)
                else:
                    print(f"时间线提取失败: {e}")
                    return []