"""
增强版时间线提取器模块

该模块实现了高级时间线事件提取功能，集成了以下增强特性：
1. 时间线事件智能去重合并：通过程序化和AI混合方法合并重复事件
2. 批量处理优化：能够一次性处理整个事件列表
3. 分层合并策略：结合快速程序化合并和AI深度分析
4. 限速器支持：避免API调用频率超限
5. 保留最完整信息：合并过程中保留所有相关信息，避免信息丢失
6. 批量处理：支持对大量时间线事件进行分批处理

主要功能：
- 智能分片处理：将长文本分片以提高提取精度
- 事件去重合并：识别并合并描述同一事件的多个条目
- 信息丰富化：整合来自不同文本片段的完整事件信息
- API兼容：保持与基础提取器的接口兼容性
"""
import asyncio
import uuid
from typing import List, Optional
from pathlib import Path
from novelforge.services.ai_service import AIService
from novelforge.extractors.character_extractor import SmartChunker, Chunk
from novelforge.core.models import TimelineEvent, EventType, Importance, TimePrecision
from novelforge.extractors.base_extractor import (
    TimelineExtractorInterface, 
    ExtractionConfig
)
from novelforge.extractors.timeline_extractor import TimelineExtractor


class EnhancedTimelineExtractor(TimelineExtractorInterface):
    """增强版时间线提取器实现"""
    
    def __init__(self, config: ExtractionConfig, ai_service: Optional[AIService] = None):
        """
        初始化增强版时间线提取器
        
        Args:
            config: 提取配置参数
            ai_service: AI服务实例，用于智能处理
        """
        self.config = config
        self.ai_service = ai_service
        # 创建基础提取器实例，复用基础功能
        self.base_extractor = TimelineExtractor(config, ai_service)
    
    async def extract_timeline(self, text: str) -> List[TimelineEvent]:
        """
        从文本中提取时间线事件 - 增强版实现
        
        该方法实现了完整的时间线事件提取流程，包括：
        1. 文本智能分片
        2. 分片并行提取
        3. 程序化智能合并
        4. AI增强合并
        
        Args:
            text: 输入文本
            
        Returns:
            List[TimelineEvent]: 提取的时间线事件列表，已去重合并
        """
        if not self.ai_service:
            raise ValueError("AI service is required for timeline extraction")

        # 创建智能分片器，将长文本分割为处理单元
        chunker = SmartChunker(
            chunk_size=self.config.chunk_size,
            chunk_overlap=self.config.chunk_overlap
        )

        # 分片文本，为并行处理做准备
        chunks = chunker.chunk(text)
        if not chunks:
            return []

        # 提取所有片段中的时间线事件
        all_events = []
        for chunk in chunks:
            events = await self._extract_timeline_from_chunk(chunk)
            all_events.extend(events)

        # 如果事件数量不多，直接返回
        if len(all_events) <= 1:
            return all_events

        # 使用增强的合并方法，结合程序化和AI技术
        merged_events = await self._hierarchical_merge_timeline_events(all_events)
        return merged_events
    
    def _map_event_type(self, type_str: str) -> EventType:
        """映射事件类型"""
        return self.base_extractor._map_event_type(type_str)
    
    def _map_importance(self, importance_str: str) -> Importance:
        """映射事件重要性"""
        return self.base_extractor._map_importance(importance_str)
    
    def _map_time_precision(self, precision_str: str) -> TimePrecision:
        """映射时间精度"""
        return self.base_extractor._map_time_precision(precision_str)
    
    async def _extract_timeline_from_chunk(self, chunk: 'Chunk') -> List[TimelineEvent]:
        """从单个片段中提取时间线事件"""
        prompt = f"""你是一个专业的小说分析师。请仔细分析以下文本片段，提取关键事件。

文本片段：
{chunk.content}

## 任务说明
- 提取文本中的关键事件，包括情节发展、转折点、重要互动等
- 对于每个事件，尽可能提取以下信息：
  - ID (id) - 事件唯一标识
  - 标题 (title) - 事件的简短标题
  - 描述 (description) - 事件的详细描述
  - 事件类型 (event_type) - 主要事件、次要事件、战斗、对话等
  - 绝对时间 (absolute_time) - 事件发生的具体时间（如果明确提及）
  - 相对时间 (relative_time) - 相对于故事开始的时间（如"第一章末尾"）
  - 叙事时间 (narrative_time) - 在叙事中的时间位置
  - 重要角色 (characters) - 事件涉及的重要角色
  - 重要地点 (locations) - 事件发生的重要地点
  - 重要性 (importance) - 事件的重要性等级
  - 后果 (consequences) - 事件对故事的影响
  - 证据 (evidence) - 支持该事件存在的原文依据

## 事件类型说明
- BIRTH: 出生/诞生
- DEATH: 死亡/去世
- BATTLE: 战斗/战争/战役
- MARRIAGE: 结婚/婚姻
- CORONATION: 加冕/登基
- DISCOVERY: 发现/探索
- JOURNEY: 旅程/旅行/远征
- CONFLICT: 冲突/矛盾
- ALLIANCE: 联盟/结盟
- BETRAYAL: 背叛/出卖
- ROMANCE: 浪漫/爱情
- SEPARATION: 分离/离别
- REUNION: 重逢/团聚
- SACRIFICE: 牺牲/献身
- VICTORY: 胜利/成功
- DEFEAT: 失败/战败
- MYSTERY: 神秘/谜团
- REVELATION: 揭示/启示
- TRANSFORMATION: 转变/变形
- OTHER: 其他类型

## 重要性等级
- CRITICAL: 关键/致命/转折点
- HIGH: 重要/高影响
- MEDIUM: 中等/一般
- LOW: 低/不重要

## 详细要求
- 确保每个事件的标题简洁明了，能概括事件核心
- 事件描述应包含足够的细节，让读者理解事件内容
- 重要性等级应反映事件对整个故事的影响程度
- 绝对时间、相对时间和叙事时间应尽可能详细

## 输出格式
请以JSON格式输出，结构如下：
{{
    "events": [
        {{
            "id": "事件ID",
            "title": "事件标题",
            "description": "事件详细描述",
            "event_type": "事件类型（使用上述英文常量）",
            "absolute_time": "具体时间（如果知道）",
            "relative_time": "相对时间（如'第一章'）",
            "narrative_time": "叙事时间位置",
            "characters": ["角色1", "角色2"],
            "locations": ["地点1", "地点2"],
            "importance": "重要性等级（使用上述英文常量）",
            "consequences": ["后果1", "后果2"],
            "evidence": ["证据1", "证据2"]
        }}
    ]
}}

请注意：只输出JSON，不要添加其他解释文字。"""

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
                        id=str(event_data.get("id", str(uuid.uuid4())[:8])),
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
                    from rich.console import Console
                    console = Console()
                    console.print(f"[red]时间线提取失败: {e}[/red]")
                    return []
    
    async def _hierarchical_merge_timeline_events(self, all_events: List[TimelineEvent]) -> List[TimelineEvent]:
        """
        程序化+AI混合合并时间线事件
        
        实现分层合并策略：
        1. 程序化合并：基于事件标题快速合并明显重复项
        2. AI批量合并：使用大语言模型处理复杂合并场景
        
        Args:
            all_events: 待合并的时间线事件列表
            
        Returns:
            List[TimelineEvent]: 合并后的时间线事件列表
        """
        if not all_events:
            return []
        
        from rich.console import Console
        console = Console()
        console.print(f"[cyan]开始程序化+AI混合合并 {len(all_events)} 个时间线事件...[/cyan]")
        
        # 阶段1: 程序化合并 - 基于标题快速合并
        events_dict = {}
        for event in all_events:
            title = event.title.strip() if event.title else ""
            if not title:
                continue
                
            title_key = title.lower()
            if title_key not in events_dict:
                events_dict[title_key] = event.dict()
            else:
                # 合并信息，保留更完整的信息
                existing = events_dict[title_key]
                current = event.dict()
                
                # 合并描述
                if current.get('description') and not existing.get('description'):
                    existing['description'] = current['description']
                elif current.get('description') and existing.get('description') and current['description'] != existing['description']:
                    existing['description'] = f"{existing['description']} {current['description']}".strip()
                
                # 合并角色
                if current.get('characters'):
                    existing_chars = existing.get('characters', [])
                    existing['characters'] = list(set(existing_chars + current['characters']))
                
                # 合并地点
                if current.get('locations'):
                    existing_locs = existing.get('locations', [])
                    existing['locations'] = list(set(existing_locs + current['locations']))
                
                # 合并影响
                if current.get('consequences'):
                    existing_consequences = existing.get('consequences', [])
                    existing['consequences'] = list(set(existing_consequences + current['consequences']))
                
                # 合并证据
                if current.get('evidence'):
                    existing_evidence = existing.get('evidence', [])
                    existing['evidence'] = list(set(existing_evidence + current['evidence']))
        
        # 转换回TimelineEvent对象
        programmatic_merged = []
        for event_data in events_dict.values():
            try:
                event_obj = TimelineEvent(**event_data)
                programmatic_merged.append(event_obj)
            except Exception as e:
                console.print(f"[yellow]转换时间线事件数据失败: {e}[/yellow]")
                continue
        
        console.print(f"[cyan]程序化合并完成：{len(all_events)} -> {len(programmatic_merged)}[/cyan]")
        
        # 阶段2: AI批量合并 - 处理复杂合并场景
        if len(programmatic_merged) <= 1:
            return programmatic_merged
            
        # 分批进行AI处理，避免超出API限制
        ai_processed = []
        batch_size = 20  # 控制每批大小以避免API限制
        
        for i in range(0, len(programmatic_merged), batch_size):
            batch = programmatic_merged[i:i + batch_size]
            console.print(f"[cyan]正在AI处理第 {i//batch_size + 1}/{(len(programmatic_merged)-1)//batch_size + 1} 批时间线事件...[/cyan]")
            batch_result = await self._batch_merge_timeline_events_with_ai(batch)
            ai_processed.extend(batch_result)
        
        console.print(f"[green]程序化+AI混合合并完成，最终得到 {len(ai_processed)} 个时间线事件[/green]")
        return ai_processed

    async def _batch_merge_timeline_events_with_ai(self, events: List[TimelineEvent]) -> List[TimelineEvent]:
        """使用AI批量合并时间线事件列表中的重复项"""
        if not events or len(events) <= 1:
            return events
        
        # 为AI服务添加限速器（如果尚未添加）
        if not hasattr(self.ai_service, 'rate_limiter'):
            from novelforge.base.rate_limiter import RateLimiter
            self.ai_service.rate_limiter = RateLimiter(
                rpm_limit=self.config.rpm_limit if hasattr(self.config, 'rpm_limit') else 500,
                tpm_limit=self.config.tpm_limit if hasattr(self.config, 'tpm_limit') else 2_000_000
            )
        
        # 获取限流许可
        await self.ai_service.rate_limiter.acquire(estimated_tokens=2000)
        
        event_descriptions = []
        for i, event in enumerate(events, 1):
            desc = f"{i}. 标题: {event.title}"
            if event.description:
                desc += f", 描述: {event.description}"
            if event.event_type:
                desc += f", 类型: {event.event_type}"
            if event.absolute_time:
                desc += f", 绝对时间: {event.absolute_time}"
            if event.relative_time:
                desc += f", 相对时间: {event.relative_time}"
            if event.time_precision:
                desc += f", 时间精度: {event.time_precision}"
            if event.era:
                desc += f", 时代: {event.era}"
            if event.importance:
                desc += f", 重要性: {event.importance}"
            if event.characters:
                desc += f", 角色: {', '.join(event.characters)}"
            if event.locations:
                desc += f", 地点: {', '.join(event.locations)}"
            if event.consequences:
                desc += f", 影响: {', '.join(event.consequences)}"
            
            event_descriptions.append(desc)
        
        prompt = f"""请分析以下时间线事件列表，识别并合并表示同一事件的多个条目：
 
时间线事件列表：
{"\n".join(event_descriptions)}

请返回合并后的时间线事件列表JSON格式，确保：
1. 同一事件只保留一个条目
2. 合并所有相关信息（描述、时间、角色、地点、影响等）
3. 保留最完整和准确的信息
4. 维持原始字段结构不变
5. 不要删除或编造任何信息

返回格式为JSON数组，包含合并后的时间线事件对象。"""
        
        try:
            response = await self.ai_service.chat(prompt, max_tokens=4000)
            
            import json
            import re
            
            # 查找JSON数组
            json_match = re.search(r'\[.*\]', response, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
                try:
                    merged_events_data = json.loads(json_str)
                except json.JSONDecodeError:
                    # 如果直接解析失败，尝试使用AI服务的解析方法
                    try:
                        merged_events_data = self.ai_service._parse_json(response, list)
                    except:
                        console = Console()
                        console.print("[yellow]AI批量合并时间线事件：JSON解析失败，回退到程序化合并[/yellow]")
                        return self._deduplicate_timeline_events_original(events)
                
                # 将数据转换为TimelineEvent对象
                merged_events = []
                for event_data in merged_events_data:
                    try:
                        event_obj = TimelineEvent(**event_data)
                        merged_events.append(event_obj)
                    except Exception as e:
                        console = Console()
                        console.print(f"[yellow]转换时间线事件数据失败: {e}[/yellow]")
                        continue
                
                return merged_events
            else:
                # 尝试使用AI服务的解析方法
                try:
                    merged_events_data = self.ai_service._parse_json(response, list)
                    # 将数据转换为TimelineEvent对象
                    merged_events = []
                    for event_data in merged_events_data:
                        try:
                            event_obj = TimelineEvent(**event_data)
                            merged_events.append(event_obj)
                        except Exception as e:
                            console = Console()
                            console.print(f"[yellow]转换时间线事件数据失败: {e}[/yellow]")
                            continue
                    return merged_events
                except:
                    # 回退到原有逻辑
                    return self._deduplicate_timeline_events_original(events)
                
        except Exception as e:
            console = Console()
            console.print(f"[yellow]AI批量合并时间线事件出错: {e}[/yellow]")
            return self._deduplicate_timeline_events_original(events)

    def _deduplicate_timeline_events_original(self, events: List[TimelineEvent]) -> List[TimelineEvent]:
        """原有逻辑的备选方法，用于回退"""
        if not events:
            return []
        
        seen_events = set()
        unique_events = []
        
        for event in events:
            # 创建事件的唯一标识符
            event_key = (event.title, event.description[:50] if event.description else "")  # 使用前50个字符作为描述标识
            
            if event_key not in seen_events:
                seen_events.add(event_key)
                unique_events.append(event)
        
        return unique_events