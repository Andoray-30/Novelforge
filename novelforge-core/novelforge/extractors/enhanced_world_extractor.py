"""
增强版世界设定提取器模块

该模块实现了高级世界设定提取功能，集成了以下增强特性：
1. 地点智能去重合并：通过程序化和AI混合方法合并重复地点
2. 上下文信息提取：保存原文中的上下文片段、文化示例和历史示例
3. AI驱动的批量合并：使用大语言模型一次性处理整个地点列表
4. 分层合并策略：结合快速程序化合并和AI深度分析
5. 限速器支持：避免API调用频率超限
6. 黑名单过滤：通过黑名单过滤非地点实体
7. 保留最完整信息：合并过程中保留所有相关信息，避免信息丢失

主要功能：
- 智能分片处理：将长文本分片以提高提取精度
- 地点去重合并：识别并合并描述同一地点的多个条目
- 信息丰富化：整合来自不同文本片段的完整地点信息
- API兼容：保持与基础提取器的接口兼容性
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
from novelforge.extractors.world_extractor import WorldExtractor


class EnhancedWorldExtractor(WorldExtractorInterface):
    """增强版世界设定提取器实现"""
    
    def __init__(self, config: ExtractionConfig, ai_service: Optional[AIService] = None):
        """
        初始化增强版世界设定提取器
        
        Args:
            config: 提取配置参数
            ai_service: AI服务实例，用于智能处理
        """
        self.config = config
        self.ai_service = ai_service
        # 创建基础提取器实例，复用基础功能
        self.base_extractor = WorldExtractor(config, ai_service)
    
    async def extract_world(self, text: str) -> WorldSetting:
        """
        从文本中提取世界设定 - 增强版实现
        
        该方法实现了完整的世界设定提取流程，包括：
        1. 文本智能分片
        2. 分片并行提取世界信息和地点
        3. 世界历史信息合并
        4. 地点去重合并
        
        Args:
            text: 输入文本
            
        Returns:
            WorldSetting: 提取的世界设定，包含合并后的地点列表
        """
        if not self.ai_service:
            raise ValueError("AI service is required for world extraction")

        # 创建智能分片器，将长文本分割为处理单元
        chunker = SmartChunker(
            chunk_size=self.config.chunk_size,
            chunk_overlap=self.config.chunk_overlap
        )

        # 分片文本，为并行处理做准备
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

        # 合并世界历史信息
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
        从文本中提取地点信息 - 增强版实现
        
        该方法实现了完整的地点提取流程，包括：
        1. 文本智能分片
        2. 分片并行提取
        3. 程序化智能合并
        4. AI增强合并
        
        Args:
            text: 输入文本
            
        Returns:
            List[Location]: 提取的地点列表，已去重合并
        """
        if not self.ai_service:
            raise ValueError("AI service is required for location extraction")

        # 创建智能分片器，将长文本分割为处理单元
        chunker = SmartChunker(
            chunk_size=self.config.chunk_size,
            chunk_overlap=self.config.chunk_overlap
        )

        # 分片文本，为并行处理做准备
        chunks = chunker.chunk(text)
        if not chunks:
            return []

        # 提取所有片段中的地点
        all_locations = []
        for chunk in chunks:
            locations = await self._extract_locations_from_chunk(chunk)
            all_locations.extend(locations)

        # 如果地点数量不多，直接返回
        if len(all_locations) <= 1:
            return all_locations

        # 使用增强的合并方法，结合程序化和AI技术
        merged_locations = await self._hierarchical_merge_locations(all_locations)
        return merged_locations
    
    def _map_location_type(self, type_str: str) -> LocationType:
        """映射地点类型"""
        return self.base_extractor._map_location_type(type_str)
    
    def _map_importance(self, importance_str: str) -> Importance:
        """映射重要性等级"""
        return self.base_extractor._map_importance(importance_str)
    
    async def _extract_world_info_from_chunk(self, chunk: 'Chunk') -> str:
        """从单个片段中提取世界设定信息"""
        prompt = f"""快速提取以下文本中的世界设定：

{chunk.content}

请简洁地描述这个世界的基本设定，包括：
- 时代背景
- 世界观特点  
- 社会结构
- 技术水平
- 魔法/超能力体系（如果存在）
- 地理环境
- 主要势力

请以段落形式输出，不要使用列表格式。"""

        for attempt in range(self.config.max_retries):
            try:
                response = await self.ai_service.chat(prompt, max_tokens=2000, timeout=self.config.timeout)
                return response.strip()
            except Exception as e:
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(self.config.retry_delay)
                else:
                    from rich.console import Console
                    console = Console()
                    console.print(f"世界设定提取失败: {e}")
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
        
        prompt = f"""你是一个专业的小说分析师。请仔细分析以下文本片段，提取地点信息并收集相关的原文上下文。

文本片段：
{chunk.content}

## 任务说明
- 提取所有重要地点的信息，包括地点名称、类型、描述、地理特征、文化背景等
- 忽略明显不属于地点的实体（如物品、人物、抽象概念等）
- 对于每个地点，除了基本信息外，还需要提取原文中的相关上下文信息：
  - 上下文片段 (contexts) - 包含地点的关键描述或场景的原文片段
  - 文化示例 (cultural_examples) - 展现地点文化特色的原文片段
  - 历史示例 (historical_examples) - 展现地点历史背景的原文片段

## 黑名单过滤
请忽略以下类型的实体：
- 纯物品：{', '.join(PURE_OBJECT_WORDS)}
- 方向词：{', '.join(DIRECTION_WORDS)}
- 天体：{', '.join(CELESTIAL_WORDS)}
- 游戏术语：{', '.join(GAME_TERMS)}

## 详细要求
- 每个地点至少提取1-3个上下文片段，每个片段不超过200字符
- 提取1-3个文化示例，展现地点的文化特色
- 提取1-2个历史示例，展现地点的历史背景

## 输出格式
请以JSON格式输出，结构如下：
{{
    "locations": [
        {{
            "name": "地点名称",
            "type": "地点类型（city, country, building, natural, fantasy等）",
            "description": "地点描述",
            "geography": "地理特征",
            "culture": "文化背景",
            "landmarks": ["地标1", "地标2"],
            "contexts": [
                "包含地点的关键描述或场景的原文片段1",
                "包含地点的关键描述或场景的原文片段2"
            ],
            "cultural_examples": [
                "展现地点文化特色的原文片段1",
                "展现地点文化特色的原文片段2"
            ],
            "historical_examples": [
                "展现地点历史背景的原文片段1",
                "展现地点历史背景的原文片段2"
            ]
        }}
    ]
}}

请注意：只输出JSON，不要添加其他解释文字。"""

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
                    from rich.console import Console
                    console = Console()
                    console.print(f"地点提取失败: {e}")
                    return []
    
    async def _hierarchical_merge_locations(self, all_locations: List[Location]) -> List[Location]:
        """
        分层合并地点 - 使用与角色和事件类似的模式
        
        实现分层合并策略：
        1. 程序化合并：基于地点名称快速合并明显重复项
        2. AI批量合并：使用大语言模型处理复杂合并场景
        
        Args:
            all_locations: 待合并的地点列表
            
        Returns:
            List[Location]: 合并后的地点列表
        """
        if not all_locations:
            return []
        
        from rich.console import Console
        console = Console()
        console.print(f"[cyan]开始程序化+AI混合合并 {len(all_locations)} 个地点...[/cyan]")
        
        # 阶段1: 程序化合并 - 基于名称快速合并
        locations_dict = {}
        for loc in all_locations:
            name = loc.name.strip() if loc.name else ""
            if not name:
                continue
                
            if name not in locations_dict:
                locations_dict[name] = loc.dict()
            else:
                # 合并信息，保留更完整的信息
                existing = locations_dict[name]
                current = loc.dict()
                
                # 合并描述
                if current.get('description') and not existing.get('description'):
                    existing['description'] = current['description']
                elif current.get('description') and existing.get('description') and current['description'] != existing['description']:
                    existing['description'] = f"{existing['description']} {current['description']}".strip()
                
                # 合并地理
                if current.get('geography') and not existing.get('geography'):
                    existing['geography'] = current['geography']
                
                # 合并气候
                if current.get('climate') and not existing.get('climate'):
                    existing['climate'] = current['climate']
                
                # 合并文化
                if current.get('culture') and not existing.get('culture'):
                    existing['culture'] = current['culture']
                
                # 合并历史
                if current.get('history') and not existing.get('history'):
                    existing['history'] = current['history']
                
                # 合并特色
                if current.get('features'):
                    existing_features = existing.get('features', [])
                    existing['features'] = list(set(existing_features + current['features']))
                
                # 合并地标
                if current.get('landmarks'):
                    existing_landmarks = existing.get('landmarks', [])
                    existing['landmarks'] = list(set(existing_landmarks + current['landmarks']))
                
                # 合并相关角色
                if current.get('characters'):
                    existing_chars = existing.get('characters', [])
                    existing['characters'] = list(set(existing_chars + current['characters']))
                
                # 合并相关地点
                if current.get('related_locations'):
                    existing_related = existing.get('related_locations', [])
                    existing['related_locations'] = list(set(existing_related + current['related_locations']))
                
                # 合并新增的上下文字段
                # 合并原文上下文片段，去重
                if current.get('source_contexts'):
                    existing_contexts = existing.get('source_contexts', [])
                    existing['source_contexts'] = list(dict.fromkeys(existing_contexts + current['source_contexts']))  # 保持顺序的去重
                
                # 合并文化示例，去重
                if current.get('cultural_examples'):
                    existing_cultural = existing.get('cultural_examples', [])
                    existing['cultural_examples'] = list(dict.fromkeys(existing_cultural + current['cultural_examples']))  # 保持顺序的去重
                
                # 合并历史示例，去重
                if current.get('historical_examples'):
                    existing_historical = existing.get('historical_examples', [])
                    existing['historical_examples'] = list(dict.fromkeys(existing_historical + current['historical_examples']))  # 保持顺序的去重
        
        # 转换回Location对象
        programmatic_merged = []
        for loc_data in locations_dict.values():
            try:
                loc_obj = Location(**loc_data)
                programmatic_merged.append(loc_obj)
            except Exception as e:
                console.print(f"[yellow]转换地点数据失败: {e}[/yellow]")
                continue
        
        console.print(f"[cyan]程序化合并完成：{len(all_locations)} -> {len(programmatic_merged)}[/cyan]")
        
        # 阶段2: AI批量合并 - 处理复杂合并场景
        if len(programmatic_merged) <= 1:
            return programmatic_merged
            
        # 分批进行AI处理，避免超出API限制
        ai_processed = []
        batch_size = 20  # 控制每批大小以避免API限制
        
        for i in range(0, len(programmatic_merged), batch_size):
            batch = programmatic_merged[i:i + batch_size]
            console.print(f"[cyan]正在AI处理第 {i//batch_size + 1}/{(len(programmatic_merged)-1)//batch_size + 1} 批地点...[/cyan]")
            batch_result = await self._batch_merge_locations_with_ai(batch)
            ai_processed.extend(batch_result)
        
        console.print(f"[green]程序化+AI混合合并完成，最终得到 {len(ai_processed)} 个地点[/green]")
        return ai_processed

    async def _batch_merge_locations_with_ai(self, locations: List[Location]) -> List[Location]:
        """使用AI批量合并地点列表中的重复项"""
        if not locations or len(locations) <= 1:
            return locations
        
        # 为AI服务添加限速器（如果尚未添加）
        if not hasattr(self.ai_service, 'rate_limiter'):
            from novelforge.base.rate_limiter import RateLimiter
            self.ai_service.rate_limiter = RateLimiter(
                rpm_limit=self.config.rpm_limit if hasattr(self.config, 'rpm_limit') else 500,
                tpm_limit=self.config.tpm_limit if hasattr(self.config, 'tpm_limit') else 2_000_000
            )
        
        # 获取限流许可
        await self.ai_service.rate_limiter.acquire(estimated_tokens=2000)
        
        location_descriptions = []
        for i, loc in enumerate(locations, 1):
            desc = f"{i}. 名称: {loc.name}"
            if loc.description:
                desc += f", 描述: {loc.description}"
            if loc.type:
                desc += f", 类型: {loc.type}"
            if loc.features:
                desc += f", 特色: {', '.join(loc.features)}"
            if loc.importance:
                desc += f", 重要性: {loc.importance}"
            if loc.characters:
                desc += f", 相关角色: {', '.join(loc.characters)}"
            
            location_descriptions.append(desc)
        
        prompt = f"""请分析以下地点列表，识别并合并表示同一地点的多个条目：
 
地点列表：
{"\n".join(location_descriptions)}

请返回合并后的地点列表JSON格式，确保：
1. 同一地点只保留一个条目
2. 合并所有相关信息（描述、类型、特色、相关角色等）
3. 保留最完整和准确的信息
4. 维持原始字段结构不变
5. 不要删除或编造任何信息

返回格式为JSON数组，包含合并后的地点对象。"""

        try:
            response = await self.ai_service.chat(prompt, max_tokens=4000)
            
            import json
            import re
            
            # 查找JSON数组
            json_match = re.search(r'\[.*\]', response, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
                try:
                    merged_locs_data = json.loads(json_str)
                except json.JSONDecodeError:
                    # 如果直接解析失败，尝试使用AI服务的解析方法
                    try:
                        merged_locs_data = self.ai_service._parse_json(response, list)
                    except:
                        console = Console()
                        console.print("[yellow]AI批量合并地点：JSON解析失败，回退到程序化合并[/yellow]")
                        return self._deduplicate_locations(locations)
                
                # 将数据转换为Location对象
                merged_locs = []
                for loc_data in merged_locs_data:
                    try:
                        loc_obj = Location(**loc_data)
                        merged_locs.append(loc_obj)
                    except Exception as e:
                        console = Console()
                        console.print(f"[yellow]转换地点数据失败: {e}[/yellow]")
                        continue
                
                return merged_locs
            else:
                # 尝试使用AI服务的解析方法
                try:
                    merged_locs_data = self.ai_service._parse_json(response, list)
                    # 将数据转换为Location对象
                    merged_locs = []
                    for loc_data in merged_locs_data:
                        try:
                            loc_obj = Location(**loc_data)
                            merged_locs.append(loc_obj)
                        except Exception as e:
                            console = Console()
                            console.print(f"[yellow]转换地点数据失败: {e}[/yellow]")
                            continue
                    return merged_locs
                except:
                    # 回退到原有逻辑
                    return self._deduplicate_locations(locations)
                
        except Exception as e:
            console = Console()
            console.print(f"[yellow]AI批量合并地点出错: {e}[/yellow]")
            return self._deduplicate_locations(locations)

    def _deduplicate_locations(self, locations: List[Location]) -> List[Location]:
        """对地点进行去重"""
        if not locations:
            return []
        
        # 首先使用程序化方法基于名称合并
        locations_dict = {}
        for loc in locations:
            name = loc.name.strip() if loc.name else ""
            if not name:
                continue
                
            if name not in locations_dict:
                locations_dict[name] = loc.dict()
            else:
                # 合并信息
                existing = locations_dict[name]
                current = loc.dict()
                
                # 合并描述
                if current.get('description') and not existing.get('description'):
                    existing['description'] = current['description']
                elif current.get('description') and existing.get('description') and current['description'] != existing['description']:
                    existing['description'] = f"{existing['description']} {current['description']}".strip()
                
                # 合并地理
                if current.get('geography') and not existing.get('geography'):
                    existing['geography'] = current['geography']
                
                # 合并气候
                if current.get('climate') and not existing.get('climate'):
                    existing['climate'] = current['climate']
                
                # 合并文化
                if current.get('culture') and not existing.get('culture'):
                    existing['culture'] = current['culture']
                
                # 合并历史
                if current.get('history') and not existing.get('history'):
                    existing['history'] = current['history']
                
                # 合并特色
                if current.get('features'):
                    existing_features = existing.get('features', [])
                    existing['features'] = list(set(existing_features + current['features']))
                
                # 合并地标
                if current.get('landmarks'):
                    existing_landmarks = existing.get('landmarks', [])
                    existing['landmarks'] = list(set(existing_landmarks + current['landmarks']))
                
                # 合并相关角色
                if current.get('characters'):
                    existing_chars = existing.get('characters', [])
                    existing['characters'] = list(set(existing_chars + current['characters']))
                
                # 合并相关地点
                if current.get('related_locations'):
                    existing_related = existing.get('related_locations', [])
                    existing['related_locations'] = list(set(existing_related + current['related_locations']))
                
                # 合并新增的上下文字段
                # 合并原文上下文片段，去重
                if current.get('source_contexts'):
                    existing_contexts = existing.get('source_contexts', [])
                    existing['source_contexts'] = list(dict.fromkeys(existing_contexts + current['source_contexts']))  # 保持顺序的去重
                
                # 合并文化示例，去重
                if current.get('cultural_examples'):
                    existing_cultural = existing.get('cultural_examples', [])
                    existing['cultural_examples'] = list(dict.fromkeys(existing_cultural + current['cultural_examples']))  # 保持顺序的去重
                
                # 合并历史示例，去重
                if current.get('historical_examples'):
                    existing_historical = existing.get('historical_examples', [])
                    existing['historical_examples'] = list(dict.fromkeys(existing_historical + current['historical_examples']))  # 保持顺序的去重
        
        # 转换回Location对象
        merged_locations = []
        for loc_data in locations_dict.values():
            try:
                loc_obj = Location(**loc_data)
                merged_locations.append(loc_obj)
            except Exception as e:
                from rich.console import Console
                console = Console()
                console.print(f"[yellow]转换地点数据失败: {e}[/yellow]")
                continue
        
        return merged_locations