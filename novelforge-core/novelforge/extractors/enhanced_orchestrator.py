"""
增强版多窗口协调器模块

该模块实现了高级多窗口协调功能，集成了以下增强特性：
1. 集成所有增强版提取器：角色、世界设定、时间线提取器的增强版
2. 保持API兼容性：与原有协调器保持接口兼容
3. 实时保存功能：边提取边保存结果，避免长时间运行后的数据丢失
4. 并发控制：使用信号量控制并发数量，避免API超限
5. 错误处理：对每个提取任务进行异常处理，确保整体流程的稳定性
6. 提取统计：提供详细的提取进度和结果统计

主要功能：
- 并发提取：同时执行角色、世界设定、时间线和关系网络提取
- 实时保存：支持实时保存中间结果
- CLI兼容：保持与命令行工具的兼容性
- 结果汇总：生成提取统计和结果摘要
"""
import asyncio
import time
from datetime import datetime
from typing import List, Optional, Callable, Dict, Any
from pathlib import Path

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
from novelforge.extractors.enhanced_character_extractor import EnhancedCharacterExtractor
from novelforge.extractors.enhanced_world_extractor import EnhancedWorldExtractor
from novelforge.extractors.enhanced_timeline_extractor import EnhancedTimelineExtractor
from novelforge.extractors.relationship_extractor import RelationshipExtractor
from novelforge.extractors.tavern_converter import TavernConverter
from novelforge.extractors.multi_window_orchestrator import MultiWindowConfig


class EnhancedMultiWindowOrchestrator:
    """增强版多窗口协调器 - 集成所有增强功能"""
    
    def __init__(
        self,
        ai_service: Optional[AIService] = None,
        config: Optional[Config] = None,
        mw_config: Optional[MultiWindowConfig] = None
    ):
        """
        初始化增强版多窗口协调器
        
        Args:
            ai_service: AI服务实例
            config: 全局配置
            mw_config: 多窗口配置
        """
        self.ai_service = ai_service
        self.global_config = config or Config.from_env()
        self.config = mw_config or MultiWindowConfig()
        
        # 创建增强版提取器实例，利用增强的去重合并功能
        extraction_config = ExtractionConfig(
            timeout=self.config.api_timeout,
            max_retries=self.config.max_retries,
            retry_delay=self.config.retry_delay,
            chunk_size=self.config.chunk_size,
            chunk_overlap=self.config.chunk_overlap
        )
        
        self.character_extractor = EnhancedCharacterExtractor(extraction_config, ai_service)
        self.world_extractor = EnhancedWorldExtractor(extraction_config, ai_service)
        self.timeline_extractor = EnhancedTimelineExtractor(extraction_config, ai_service)
        self.relationship_extractor = RelationshipExtractor(extraction_config, ai_service)
        
        # 创建 tavern 转换器，用于生成SillyTavern格式的输出
        self.tavern_converter = TavernConverter()
        
        # 工作空间管理，确保输出目录存在
        self.workspace_dir = Path(self.config.workspace_dir)
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
    
    async def extract(self, text: str, on_progress: Optional[Callable[[str, int, int], None]] = None) -> Dict[str, Any]:
        """
        执行提取任务 - 保持原有API接口兼容性
        
        该方法实现并发提取，同时执行角色、世界设定、时间线和关系网络提取任务。
        使用信号量控制并发数量，避免API调用超限。
        
        Args:
            text: 输入文本
            on_progress: 进度回调函数
            
        Returns:
            Dict[str, Any]: 提取结果，包含 characters, world_setting, timeline_events, relationships
        """
        from rich.console import Console
        console = Console()
        console.print("[cyan]开始增强版多窗口并发提取...[/cyan]")
        
        # 创建信号量控制并发，限制同时执行的任务数
        semaphore = asyncio.Semaphore(self.config.num_workers)
        
        async def extract_with_semaphore(extractor_func, name, step):
            """带信号量控制的提取任务包装器"""
            async with semaphore:
                if on_progress:
                    on_progress(f"提取{name}", step, 4)
                return await extractor_func(text)
        
        # 并发执行所有提取任务，提高整体效率
        tasks = [
            extract_with_semaphore(self.character_extractor.extract_characters, "角色", 0),
            extract_with_semaphore(self.world_extractor.extract_world, "世界设定", 1),
            extract_with_semaphore(self.timeline_extractor.extract_timeline, "时间线", 2),
            extract_with_semaphore(self.relationship_extractor.extract_relationships, "关系网络", 3),
        ]
        
        # 等待所有任务完成，返回异常结果以便后续处理
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 处理结果，确保异常情况下的默认值
        characters = results[0] if not isinstance(results[0], Exception) else []
        world_setting = results[1] if not isinstance(results[1], Exception) else WorldSetting(name="", history="", locations=[], cultures=[], rules=[], themes=[])
        timeline_events = results[2] if not isinstance(results[2], Exception) else []
        relationships = results[3] if not isinstance(results[3], Exception) else []
        
        # 通知进度回调已完成
        if on_progress:
            on_progress("构建最终结果", 4, 4)
        
        result = {
            "characters": characters,
            "world_setting": world_setting,
            "timeline_events": timeline_events,
            "relationships": relationships
        }
        
        console.print(f"[green]提取完成：{len(characters)} 个角色, {len(world_setting.locations)} 个地点, {len(timeline_events)} 个事件, {len(relationships)} 个关系[/green]")
        
        return result
    
    async def save_to_sillytavern(self, result: Dict[str, Any], output_dir: Path) -> None:
        """保存为SillyTavern格式 - 保持原有方法兼容性"""
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
    
    async def extract_with_conversion(self, text: str, output_dir: Path, on_progress: Optional[Callable[[str, int, int], None]] = None) -> Dict[str, Any]:
        """提取并转换为SillyTavern格式（使用实时保存）- 保持原有方法兼容性"""
        # 使用实时保存方法
        result = await self.extract_with_realtime_save(text, output_dir, on_progress)
        
        return result

    async def extract_with_realtime_save(self, text: str, output_dir: Path, on_progress: Optional[Callable[[str, int, int], None]] = None) -> Dict[str, Any]:
        """
        实时保存的提取方法 - 边提取边保存 - 保持原有方法兼容性
        
        该方法在提取过程中实时保存中间结果，避免长时间运行后因意外中断导致数据丢失。
        每个提取任务完成后立即保存对应的结果。
        
        Args:
            text: 输入文本
            output_dir: 输出目录
            on_progress: 进度回调函数
            
        Returns:
            Dict[str, Any]: 提取结果
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        
        from rich.console import Console
        console = Console()
        console.print("[cyan]开始增强版多窗口并发提取（实时保存模式）...[/cyan]")
        
        # 创建信号量控制并发，限制同时执行的任务数
        semaphore = asyncio.Semaphore(self.config.num_workers)
        
        async def extract_and_save(extractor_func, name, step, result_key):
            """
            提取并立即保存特定类型的数据
            
            Args:
                extractor_func: 提取器函数
                name: 任务名称（用于进度显示）
                step: 步骤编号
                result_key: 结果键名（用于确定保存逻辑）
                
            Returns:
                提取结果
            """
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
                        
                        console.print(f"[green]已保存 {len(result)} 个角色[/green]")
                    
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
                            console.print(f"[red]保存世界设定时出错: {e}[/red]")
                        
                        console.print(f"[green]已保存世界设定[/green]")
                    
                    elif result_key == "timeline_events" and result:
                        # 保存时间线
                        timeline_dir = output_dir / "timeline"
                        timeline_dir.mkdir(parents=True, exist_ok=True)
                        
                        with open(timeline_dir / "timeline.json", 'w', encoding='utf-8') as f:
                            import json
                            json.dump([event.model_dump() for event in result], f, ensure_ascii=False, indent=2)
                        
                        console.print(f"[green]已保存 {len(result)} 个时间线事件[/green]")
                    
                    elif result_key == "relationships" and result:
                        # 保存关系网络
                        relationships_dir = output_dir / "relationships"
                        relationships_dir.mkdir(parents=True, exist_ok=True)
                        
                        with open(relationships_dir / "relationships.json", 'w', encoding='utf-8') as f:
                            import json
                            json.dump([edge.model_dump() for edge in result], f, ensure_ascii=False, indent=2)
                        
                        console.print(f"[green]已保存 {len(result)} 个关系[/green]")
                    
                    return result
                except Exception as e:
                    console.print(f"[red]保存{name}时出错: {e}[/red]")
                    return []
        
        # 并发执行提取和保存任务，提高整体效率
        tasks = [
            extract_and_save(self.character_extractor.extract_characters, "角色", 0, "characters"),
            extract_and_save(self.world_extractor.extract_world, "世界设定", 1, "world_setting"),
            extract_and_save(self.timeline_extractor.extract_timeline, "时间线", 2, "timeline_events"),
            extract_and_save(self.relationship_extractor.extract_relationships, "关系网络", 3, "relationships"),
        ]
        
        # 等待所有提取和保存任务完成
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 整理最终结果，确保异常情况下的默认值
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
        
        # 最后保存汇总结果，提供整体统计信息
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
        
        console.print(f"[green]提取完成：{len(characters)} 个角色, {len(world_setting.locations) if hasattr(world_setting, 'locations') else 0} 个地点, {len(timeline_events)} 个事件, {len(relationships)} 个关系[/green]")
        
        return result

    async def extract_for_cli(self, text: str) -> Dict[str, Any]:
        """
        Extract method compatible with CLI expectations - 保持原有CLI兼容性
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