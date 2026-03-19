"""
多窗口协调器模块

重构后的多窗口提取器协调器，替代原multi_window_v5.py中的MultiWindowExtractor。

该模块实现了多窗口提取功能，支持并发处理多个提取任务，包括：
1. 角色提取：从文本中提取角色信息
2. 世界设定提取：提取世界设定信息
3. 时间线提取：提取时间线事件
4. 关系网络提取：提取角色关系

增强特性：
- 支持基础和增强版提取器切换
- 实时保存功能：边提取边保存结果
- 进度回调：提供提取进度反馈
- 错误处理：对异常情况进行处理
- API兼容：保持与原有接口的兼容性
"""

import asyncio
import time
from datetime import datetime
from typing import List, Optional, Callable, Dict, Any
from pathlib import Path
from dataclasses import dataclass

from novelforge.services.ai_service import AIService
from novelforge.core.config import Config
from novelforge.core.models import (
    Character, Location, TimelineEvent, NetworkEdge, WorldSetting
)
from novelforge.extractors.base_extractor import (
    CharacterExtractorInterface, WorldExtractorInterface, 
    TimelineExtractorInterface, RelationshipExtractorInterface,
    ExtractionConfig
)
from novelforge.extractors.character_extractor import CharacterExtractor
from novelforge.extractors.world_extractor import WorldExtractor
from novelforge.extractors.timeline_extractor import TimelineExtractor
from novelforge.extractors.relationship_extractor import RelationshipExtractor
from novelforge.extractors.tavern_converter import TavernConverter


@dataclass
class MultiWindowConfig:
    """多窗口配置"""
    num_workers: int = 2
    max_concurrent_per_worker: int = 1
    chunk_size: int = 2000
    chunk_overlap: int = 500
    workspace_dir: str = "workspace"
    api_timeout: float = 300.0
    request_delay: float = 0.5
    max_retries: int = 3
    retry_delay: float = 1.0
    rpm_limit: int = 500  # 每分钟请求数限制
    tpm_limit: int = 2_000_000  # 每分钟令牌数限制


class MultiWindowOrchestrator:
    """多窗口协调器 - 重构版本"""
    
    def __init__(
        self,
        ai_service: Optional[AIService] = None,
        config: Optional[Config] = None,
        mw_config: Optional[MultiWindowConfig] = None,
        use_enhanced: bool = False  # 新增参数，用于控制是否使用增强版提取器
    ):
        """
        初始化多窗口协调器
        
        Args:
            ai_service: AI服务实例
            config: 全局配置
            mw_config: 多窗口配置
            use_enhanced: 是否使用增强版提取器
        """
        self.ai_service = ai_service
        self.global_config = config or Config.from_env()
        self.config = mw_config or MultiWindowConfig()
        
        # 创建提取器实例
        extraction_config = ExtractionConfig(
            timeout=self.config.api_timeout,
            max_retries=self.config.max_retries,
            retry_delay=self.config.retry_delay,
            chunk_size=self.config.chunk_size,
            chunk_overlap=self.config.chunk_overlap
        )
        
        if use_enhanced:
            # 使用增强版提取器
            from novelforge.extractors.enhanced_character_extractor import EnhancedCharacterExtractor
            from novelforge.extractors.enhanced_world_extractor import EnhancedWorldExtractor
            from novelforge.extractors.enhanced_timeline_extractor import EnhancedTimelineExtractor
            self.character_extractor = EnhancedCharacterExtractor(extraction_config, ai_service)
            self.world_extractor = EnhancedWorldExtractor(extraction_config, ai_service)
            self.timeline_extractor = EnhancedTimelineExtractor(extraction_config, ai_service)
        else:
            # 使用基础提取器
            self.character_extractor = CharacterExtractor(extraction_config, ai_service)
            self.world_extractor = WorldExtractor(extraction_config, ai_service)
            self.timeline_extractor = TimelineExtractor(extraction_config, ai_service)
        
        self.relationship_extractor = RelationshipExtractor(extraction_config, ai_service)
        
        # 创建 tavern 转换器
        self.tavern_converter = TavernConverter()
        
        # 工作空间管理
        self.workspace_dir = Path(self.config.workspace_dir)
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
    
    async def extract(self, text: str, on_progress: Optional[Callable[[str, int, int], None]] = None) -> Dict[str, Any]:
        """
        执行提取任务

        该方法实现并发提取，同时执行角色、世界设定、时间线和关系网络提取任务。
        使用信号量控制并发数量，避免API调用超限。

        Args:
            text: 输入文本
            on_progress: 进度回调函数

        Returns:
            Dict[str, Any]: 提取结果，包含 characters, world_setting, timeline_events, relationships
        """
        print("[cyan]开始多窗口并发提取...[/cyan]")
        
        # 创建信号量控制并发
        semaphore = asyncio.Semaphore(self.config.num_workers)
        
        async def extract_with_semaphore(extractor_func, name, step):
            async with semaphore:
                if on_progress:
                    on_progress(f"提取{name}", step, 4)
                return await extractor_func(text)
        
        # 并发执行所有提取任务
        tasks = [
            extract_with_semaphore(self.character_extractor.extract_characters, "角色", 0),
            extract_with_semaphore(self.world_extractor.extract_world, "世界设定", 1),
            extract_with_semaphore(self.timeline_extractor.extract_timeline, "时间线", 2),
            extract_with_semaphore(self.relationship_extractor.extract_relationships, "关系网络", 3),
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 处理结果
        characters = results[0] if not isinstance(results[0], Exception) else []
        world_setting = results[1] if not isinstance(results[1], Exception) else WorldSetting(name="", history="", locations=[], cultures=[], rules=[], themes=[])
        timeline_events = results[2] if not isinstance(results[2], Exception) else []
        relationships = results[3] if not isinstance(results[3], Exception) else []
        
        if on_progress:
            on_progress("构建最终结果", 4, 4)
        
        result = {
            "characters": characters,
            "world_setting": world_setting,
            "timeline_events": timeline_events,
            "relationships": relationships
        }
        
        print(f"[green]提取完成：{len(characters)} 个角色, {len(world_setting.locations)} 个地点, {len(timeline_events)} 个事件, {len(relationships)} 个关系[/green]")
        
        return result
    
    async def save_to_sillytavern(self, result: Dict[str, Any], output_dir: Path) -> None:
        """保存为SillyTavern格式"""
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # 保存角色卡片
        self.tavern_converter.save_tavern_cards(result["characters"], output_dir)
        
        # 保存世界信息
        world_setting = result["world_setting"]
        if world_setting is not None and hasattr(world_setting, 'locations'):
            # 如果world_setting是WorldSetting对象
            locations = world_setting.locations if world_setting else []
            world_info = world_setting.history if world_setting else ""
        else:
            # 如果world_setting是None或locations列表
            locations = world_setting if isinstance(world_setting, list) else []
            world_info = ""
        
        self.tavern_converter.save_world_info(
            locations,
            world_info,
            output_dir
        )
        
        # 保存时间线数据（可选）
        timeline_path = output_dir / "timeline.json"
        with open(timeline_path, 'w', encoding='utf-8') as f:
            import json
            json.dump([event.dict() for event in result["timeline_events"]], f, ensure_ascii=False, indent=2)
        
        # 保存关系网络数据（可选）
        relationships_path = output_dir / "relationships.json"
        with open(relationships_path, 'w', encoding='utf-8') as f:
            import json
            json.dump([edge.dict() for edge in result["relationships"]], f, ensure_ascii=False, indent=2)
    
    def resume(self) -> Optional[Dict[str, Any]]:
        """恢复之前未完成的提取"""
        # 这里将实现恢复逻辑
        # 目前返回None，后续会从原文件迁移具体实现
        return None
    
    async def extract_with_conversion(self, text: str, output_dir: Path, on_progress: Optional[Callable[[str, int, int], None]] = None) -> Dict[str, Any]:
        """提取并转换为SillyTavern格式（使用实时保存）"""
        # 使用实时保存方法
        result = await self.extract_with_realtime_save(text, output_dir, on_progress)
        
        return result

    async def extract_with_realtime_save(self, text: str, output_dir: Path, on_progress: Optional[Callable[[str, int, int], None]] = None) -> Dict[str, Any]:
        """实时保存的提取方法 - 边提取边保存"""
        output_dir.mkdir(parents=True, exist_ok=True)
        
        print("[cyan]开始多窗口并发提取（实时保存模式）...[/cyan]")
        
        # 创建信号量控制并发
        semaphore = asyncio.Semaphore(self.config.num_workers)
        
        async def extract_and_save(extractor_func, name, step, result_key):
            """提取并立即保存特定类型的数据"""
            async with semaphore:
                if on_progress:
                    on_progress(f"提取{name}", step, 4)
                
                try:
                    result = await extractor_func(text)
                    
                    # 立即保存该类型的结果
                    if result_key == "characters" and result:
                        characters_dir = output_dir / "characters"
                        characters_dir.mkdir(parents=True, exist_ok=True)
                        
                        # 保存完整的角色列表
                        all_chars_path = output_dir / "characters_all.json"
                        with open(all_chars_path, 'w', encoding='utf-8') as f:
                            import json
                            json.dump([char.model_dump() for char in result], f, ensure_ascii=False, indent=2)
                        
                        # 保存单独的角色卡片
                        self.tavern_converter.save_tavern_cards(result, output_dir)
                        
                        print(f"[green]已保存 {len(result)} 个角色[/green]")
                    
                    elif result_key == "world_setting" and result:
                        # 保存世界设定
                        world_setting_dir = output_dir / "world"
                        world_setting_dir.mkdir(parents=True, exist_ok=True)
                        
                        try:
                            # 检查result是否为WorldSetting对象
                            if hasattr(result, 'model_dump_json'):
                                # 如果result是WorldSetting对象
                                with open(world_setting_dir / "world_setting.json", 'w', encoding='utf-8') as f:
                                    f.write(result.model_dump_json(indent=2, ensure_ascii=False))
                                
                                # 保存世界设定的简化版本用于世界书
                                if hasattr(result, 'locations'):
                                    self.tavern_converter.save_world_info(
                                        result.locations,
                                        result.history if result.history else "",
                                        output_dir
                                    )
                            else:
                                # 如果result不是WorldSetting对象，而是列表或其他格式
                                with open(world_setting_dir / "world_setting.json", 'w', encoding='utf-8') as f:
                                    import json
                                    json.dump(result, f, ensure_ascii=False, indent=2)
                                
                                # 如果是WorldSetting对象的字典格式
                                if isinstance(result, dict) and 'locations' in result:
                                    self.tavern_converter.save_world_info(
                                        result['locations'],
                                        result.get('history', ''),
                                        output_dir
                                    )
                                elif isinstance(result, list):
                                    self.tavern_converter.save_world_info(
                                        result,
                                        "",
                                        output_dir
                                    )
                        
                        except Exception as e:
                            print(f"[red]保存世界设定时出错: {e}[/red]")
                        
                        print(f"[green]已保存世界设定[/green]")
                    
                    elif result_key == "timeline_events" and result:
                        # 保存时间线
                        timeline_dir = output_dir / "timeline"
                        timeline_dir.mkdir(parents=True, exist_ok=True)
                        
                        with open(timeline_dir / "timeline.json", 'w', encoding='utf-8') as f:
                            import json
                            json.dump([event.model_dump() for event in result], f, ensure_ascii=False, indent=2)
                        
                        print(f"[green]已保存 {len(result)} 个时间线事件[/green]")
                    
                    elif result_key == "relationships" and result:
                        # 保存关系网络
                        relationships_dir = output_dir / "relationships"
                        relationships_dir.mkdir(parents=True, exist_ok=True)
                        
                        with open(relationships_dir / "relationships.json", 'w', encoding='utf-8') as f:
                            import json
                            json.dump([edge.model_dump() for edge in result], f, ensure_ascii=False, indent=2)
                        
                        print(f"[green]已保存 {len(result)} 个关系[/green]")
                    
                    return result
                except Exception as e:
                    print(f"[red]保存{name}时出错: {e}[/red]")
                    return []
        
        # 并发执行提取和保存任务
        tasks = [
            extract_and_save(self.character_extractor.extract_characters, "角色", 0, "characters"),
            extract_and_save(self.world_extractor.extract_world, "世界设定", 1, "world_setting"),
            extract_and_save(self.timeline_extractor.extract_timeline, "时间线", 2, "timeline_events"),
            extract_and_save(self.relationship_extractor.extract_relationships, "关系网络", 3, "relationships"),
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 整理结果
        characters = results[0] if not isinstance(results[0], Exception) else []
        world_setting = results[1] if not isinstance(results[1], Exception) else WorldSetting(name="", history="", locations=[], cultures=[], rules=[], themes=[])
        timeline_events = results[2] if not isinstance(results[2], Exception) else []
        relationships = results[3] if not isinstance(results[3], Exception) else []
        
        result = {
            "characters": characters,
            "world_setting": world_setting,
            "timeline_events": timeline_events,
            "relationships": relationships
        }
        
        # 最后保存汇总结果
        summary_path = output_dir / "extraction_summary.json"
        with open(summary_path, 'w', encoding='utf-8') as f:
            import json
            json.dump({
                "total_characters": len(characters),
                "total_locations": len(world_setting.locations) if hasattr(world_setting, 'locations') else 0,
                "total_timeline_events": len(timeline_events),
                "total_relationships": len(relationships),
                "extraction_time": datetime.now().isoformat()
            }, f, ensure_ascii=False, indent=2)
        
        print(f"[green]提取完成：{len(characters)} 个角色, {len(world_setting.locations) if hasattr(world_setting, 'locations') else 0} 个地点, {len(timeline_events)} 个事件, {len(relationships)} 个关系[/green]")
        
        return result

    async def extract_for_cli(self, text: str) -> Dict[str, Any]:
        """
        Extract method compatible with CLI expectations
        Returns dict with keys: characters, locations, world_info, timeline_events, network_edges
        """
        # Use empty progress callback
        result = await self.extract(text, lambda msg, curr, total: None)
        
        # Convert to CLI expected format
        cli_result = {
            "characters": result.get("characters", []),
            "locations": result.get("world_setting", WorldSetting()).locations if result.get("world_setting") else [],
            "world_info": result.get("world_setting", WorldSetting()).history if result.get("world_setting") and result.get("world_setting").history else "",
            "timeline_events": result.get("timeline_events", []),
            "network_edges": result.get("relationships", [])
        }
        
        return cli_result