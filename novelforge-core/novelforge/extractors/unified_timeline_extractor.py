"""
统一时间线提取器 - 批量提取，充分利用大模型长上下文
"""
import asyncio
from typing import List, Dict, Optional
from novelforge.services.ai_service import AIService
from novelforge.extractors.base_extractor import (
    TimelineExtractorInterface, ExtractionConfig, SmartChunker, Chunk
)
from novelforge.core.models import TimelineEvent, EventType, Importance, TimePrecision


class UnifiedTimelineExtractor(TimelineExtractorInterface):
    """统一时间线提取器"""

    MAX_CHUNKS_PER_BATCH = 5

    def __init__(self, config: ExtractionConfig, ai_service: Optional[AIService] = None):
        self.config = config
        self.ai_service = ai_service
        self.chunker = SmartChunker(
            chunk_size=config.chunk_size,
            chunk_overlap=config.chunk_overlap
        )

    async def extract_timeline(self, text: str) -> List[TimelineEvent]:
        """从文本中提取时间线事件"""
        if not self.ai_service:
            raise ValueError("AI service is required for timeline extraction")

        chunks = self.chunker.chunk(text)
        if not chunks:
            return []

        all_events = []
        for i in range(0, len(chunks), self.MAX_CHUNKS_PER_BATCH):
            batch_chunks = chunks[i:i + self.MAX_CHUNKS_PER_BATCH]
            events = await self._batch_extract_from_chunks(batch_chunks)
            all_events.extend(events)

        return await self._smart_merge_timeline_events(all_events)

    async def _batch_extract_from_chunks(self, chunks: List[Chunk]) -> List[TimelineEvent]:
        """批量从多个片段中提取时间线事件"""
        combined_content = "\n\n=== 文本片段分隔 ===\n\n".join([
            f"[片段 {j+1}]\n{chunk.content}"
            for j, chunk in enumerate(chunks)
        ])

        return await self._extract_timeline_events(combined_content)

    async def _extract_timeline_events(self, combined_text: str) -> List[TimelineEvent]:
        """提取时间线事件"""
        prompt = f"""你是一个专业的小说时间线分析师。请仔细分析以下文本，提取所有关键事件。

文本内容：
{combined_text}

## 任务
提取文本中的关键事件，深入分析以下维度：
- 核心事件（情节发展、重大转折、关键决策）
- 因果链条（识别此事件由哪个前置事件引起，又将直接导致什么后果）
- 情节钩子（识别是否存在预留的伏笔或悬念）
- 影响评估（该事件对世界观设定或人物关系的重大改变）

## 输出格式
请以JSON格式输出：
{{
    "events": [
        {{
            "id": "事件唯一ID（如event_001）",
            "title": "事件标题",
            "description": "事件详细描述，重点描述其冲突点和戏剧性",
            "event_type": "事件类型（battle/revelation/betrayal/sacrifice/transformation等）",
            "absolute_time": "具体时间",
            "relative_time": "相对时间",
            "causal_link": {{
                "cause": "起因事件简述",
                "impact": "对后续剧情的直接驱动作用"
            }},
            "plot_hook": "是否存在伏笔或尚未解开的悬念",
            "world_state_change": "对世界观背景或规则的改变描述",
            "relationship_changes": ["角色A对角色B的态度转为敌对", "角色的盟友增加"],
            "characters": ["涉及角色1", "涉及角色2"],
            "importance": "重要性（critical/high/medium/low）",
            "evidence": ["原文证据1", "原文证据2"]
        }}
    ]
}}

只输出JSON，不要添加其他文字。"""

        for attempt in range(self.config.max_retries):
            try:
                response = await self.ai_service.chat(
                    prompt,
                    max_tokens=6000,
                    timeout=self.config.timeout
                )
                return self._parse_timeline_response(response)
            except Exception as e:
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(self.config.retry_delay)
                else:
                    print(f"时间线提取失败: {e}")
                    return []
        return []

    def _parse_timeline_response(self, response: str) -> List[TimelineEvent]:
        """解析时间线响应"""
        try:
            data = self.ai_service._parse_json(response, dict)
            event_list = data.get("events", []) if isinstance(data, dict) else data

            events = []
            for event_data in event_list:
                if not isinstance(event_data, dict):
                    continue

                event = self._create_event_from_dict(event_data)
                events.append(event)

            return events
        except Exception as e:
            print(f"解析时间线响应失败: {e}")
            return []

    def _create_event_from_dict(self, event_data: dict) -> TimelineEvent:
        """从字典创建TimelineEvent对象"""
        event_type = self._map_event_type(event_data.get("event_type", "other"))
        importance = self._map_importance(event_data.get("importance", "medium"))
        time_precision = self._map_time_precision(event_data.get("time_precision", "narrative"))

        # 处理列表字段
        characters = self._ensure_list(event_data.get("characters", []))
        locations = self._ensure_list(event_data.get("locations", []))
        consequences = self._ensure_list(event_data.get("consequences", []))
        evidence = self._ensure_list(event_data.get("evidence", []))

        return TimelineEvent(
            id=str(event_data.get("id", "")),
            title=str(event_data.get("title", "")),
            description=str(event_data.get("description", "")),
            event_type=event_type,
            absolute_time=str(event_data.get("absolute_time", "")) if event_data.get("absolute_time") else None,
            relative_time=str(event_data.get("relative_time", "")) if event_data.get("relative_time") else None,
            narrative_time=str(event_data.get("narrative_time", "")) if event_data.get("narrative_time") else None,
            time_precision=time_precision,
            era=str(event_data.get("era", "")) if event_data.get("era") else None,
            chapter_reference=str(event_data.get("chapter_reference", "")) if event_data.get("chapter_reference") else None,
            characters=characters,
            locations=locations,
            importance=importance,
            consequences=consequences,
            evidence=evidence
        )

    def _ensure_list(self, data) -> List[str]:
        """确保数据是列表"""
        if isinstance(data, list):
            return [str(item) for item in data if item]
        elif isinstance(data, str) and data:
            return [data]
        return []

    def _map_event_type(self, type_str: str) -> EventType:
        """映射事件类型"""
        if not type_str:
            return EventType.OTHER

        type_lower = type_str.lower()
        type_map = {
            'birth': EventType.BIRTH, '出生': EventType.BIRTH, '诞生': EventType.BIRTH,
            'death': EventType.DEATH, '死亡': EventType.DEATH, '去世': EventType.DEATH,
            'battle': EventType.BATTLE, '战斗': EventType.BATTLE, '战争': EventType.BATTLE, '战役': EventType.BATTLE,
            'marriage': EventType.MARRIAGE, '结婚': EventType.MARRIAGE, '婚姻': EventType.MARRIAGE,
            'coronation': EventType.CORONATION, '加冕': EventType.CORONATION, '登基': EventType.CORONATION,
            'discovery': EventType.DISCOVERY, '发现': EventType.DISCOVERY, '探索': EventType.DISCOVERY,
            'journey': EventType.JOURNEY, '旅程': EventType.JOURNEY, '旅行': EventType.JOURNEY,
            'conflict': EventType.CONFLICT, '冲突': EventType.CONFLICT, '矛盾': EventType.CONFLICT,
            'alliance': EventType.ALLIANCE, '联盟': EventType.ALLIANCE, '结盟': EventType.ALLIANCE,
            'betrayal': EventType.BETRAYAL, '背叛': EventType.BETRAYAL, '出卖': EventType.BETRAYAL,
            'romance': EventType.ROMANCE, '浪漫': EventType.ROMANCE, '爱情': EventType.ROMANCE,
            'separation': EventType.SEPARATION, '分离': EventType.SEPARATION, '离别': EventType.SEPARATION,
            'reunion': EventType.REUNION, '重逢': EventType.REUNION, '团聚': EventType.REUNION,
            'sacrifice': EventType.SACRIFICE, '牺牲': EventType.SACRIFICE, '献身': EventType.SACRIFICE,
            'victory': EventType.VICTORY, '胜利': EventType.VICTORY, '成功': EventType.VICTORY,
            'defeat': EventType.DEFEAT, '失败': EventType.DEFEAT, '战败': EventType.DEFEAT,
            'mystery': EventType.MYSTERY, '神秘': EventType.MYSTERY, '谜团': EventType.MYSTERY,
            'revelation': EventType.REVELATION, '揭示': EventType.REVELATION, '启示': EventType.REVELATION,
            'transformation': EventType.TRANSFORMATION, '转变': EventType.TRANSFORMATION, '变形': EventType.TRANSFORMATION,
        }
        return type_map.get(type_lower, EventType.OTHER)

    def _map_importance(self, importance_str: str) -> Importance:
        """映射重要性"""
        if not importance_str:
            return Importance.MEDIUM

        importance_lower = importance_str.lower()
        if importance_lower in ['low', '低', '不重要']:
            return Importance.LOW
        elif importance_lower in ['high', '高', '重要']:
            return Importance.HIGH
        elif importance_lower in ['critical', '关键', '致命', '转折']:
            return Importance.CRITICAL
        return Importance.MEDIUM

    def _map_time_precision(self, precision_str: str) -> TimePrecision:
        """映射时间精度"""
        if not precision_str:
            return TimePrecision.NARRATIVE

        precision_lower = str(precision_str).lower()
        precision_map = {
            'year': TimePrecision.YEAR, '年': TimePrecision.YEAR,
            'month': TimePrecision.MONTH, '月': TimePrecision.MONTH,
            'day': TimePrecision.DAY, '日': TimePrecision.DAY,
            'hour': TimePrecision.HOUR, '时': TimePrecision.HOUR,
            'relative': TimePrecision.RELATIVE, '相对': TimePrecision.RELATIVE, '相对时间': TimePrecision.RELATIVE,
            'narrative': TimePrecision.NARRATIVE, '叙事': TimePrecision.NARRATIVE, '叙事时间': TimePrecision.NARRATIVE,
        }
        return precision_map.get(precision_lower, TimePrecision.UNKNOWN)

    async def _smart_merge_timeline_events(self, all_events: List[TimelineEvent]) -> List[TimelineEvent]:
        """智能合并时间线事件"""
        # 按ID分组
        event_map: Dict[str, List[TimelineEvent]] = {}

        for event in all_events:
            key = event.id if event.id else f"{event.title}_{event.narrative_time}"
            if key not in event_map:
                event_map[key] = []
            event_map[key].append(event)

        # 合并每组事件
        merged = []
        for key, events in event_map.items():
            if len(events) == 1:
                merged.append(events[0])
            else:
                merged_event = self._merge_event_group(events)
                merged.append(merged_event)

        # 按叙事时间排序
        merged.sort(key=lambda e: e.narrative_time or "")

        return merged

    def _merge_event_group(self, events: List[TimelineEvent]) -> TimelineEvent:
        """合并一组事件"""
        base = events[0]

        for other in events[1:]:
            # 合并描述（取最长的）
            if len(other.description) > len(base.description):
                base.description = other.description

            # 合并角色（去重）
            base.characters = list(set(base.characters + other.characters))

            # 合并地点（去重）
            base.locations = list(set(base.locations + other.locations))

            # 合并后果（去重）
            base.consequences = list(set(base.consequences + other.consequences))

            # 合并证据（去重）
            base.evidence = list(set(base.evidence + other.evidence))

            # 更新重要性（取最高的）
            importance_priority = {
                Importance.CRITICAL: 3, Importance.HIGH: 2,
                Importance.MEDIUM: 1, Importance.LOW: 0
            }
            if importance_priority.get(other.importance, 0) > importance_priority.get(base.importance, 0):
                base.importance = other.importance

        return base
