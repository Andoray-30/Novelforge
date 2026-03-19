#!/usr/bin/env python3
"""
完成NovelForge提取结果的合并工作
使用现有分析结果进行最终合并，生成完整的世界书和角色卡
"""

import json
import os
from pathlib import Path
from typing import List, Dict, Any
from novelforge.core.models import Character, Location, TimelineEvent, NetworkEdge, WorldSetting
from novelforge.core.config import Config
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

console = Console()

def load_all_analysis_results(results_dir: str) -> List[Dict[str, Any]]:
    """加载所有分析结果"""
    results_dir = Path(results_dir)
    analysis_files = list(results_dir.glob("chunk_*_analysis.json"))
    
    all_results = []
    for file_path in analysis_files:
        with open(file_path, 'r', encoding='utf-8') as f:
            result = json.load(f)
            all_results.append(result)
            console.print(f"[green]✓[/green] 加载 {file_path.name}")
    
    console.print(f"[bold green]成功加载 {len(all_results)} 个分析结果文件[/bold green]")
    return all_results

def extract_all_characters(all_results: List[Dict[str, Any]]) -> List[Character]:
    """从所有结果中提取所有角色"""
    all_characters = []
    for result in all_results:
        if "characters" in result:
            for char_data in result["characters"]:
                try:
                    # 确保数据格式正确
                    char = Character(**char_data)
                    all_characters.append(char)
                except Exception as e:
                    console.print(f"[yellow]警告: 角色数据转换失败: {e}[/yellow]")
                    continue
    
    console.print(f"[green]提取到 {len(all_characters)} 个角色[/green]")
    return all_characters

def extract_all_locations(all_results: List[Dict[str, Any]]) -> List[Location]:
    """从所有结果中提取所有地点"""
    all_locations = []
    for result in all_results:
        if "locations" in result:
            for loc_data in result["locations"]:
                try:
                    loc = Location(**loc_data)
                    all_locations.append(loc)
                except Exception as e:
                    console.print(f"[yellow]警告: 地点数据转换失败: {e}[/yellow]")
                    continue
    
    console.print(f"[green]提取到 {len(all_locations)} 个地点[/green]")
    return all_locations

def extract_all_timeline_events(all_results: List[Dict[str, Any]]) -> List[TimelineEvent]:
    """从所有结果中提取所有时间线事件"""
    all_events = []
    for result in all_results:
        if "timeline_events" in result:
            for event_data in result["timeline_events"]:
                try:
                    event = TimelineEvent(**event_data)
                    all_events.append(event)
                except Exception as e:
                    console.print(f"[yellow]警告: 时间线事件数据转换失败: {e}[/yellow]")
                    continue
    
    console.print(f"[green]提取到 {len(all_events)} 个时间线事件[/green]")
    return all_events

def extract_all_relationships(all_results: List[Dict[str, Any]]) -> List[NetworkEdge]:
    """从所有结果中提取所有关系"""
    all_relationships = []
    for result in all_results:
        if "network_edges" in result:
            for rel_data in result["network_edges"]:
                try:
                    rel = NetworkEdge(**rel_data)
                    all_relationships.append(rel)
                except Exception as e:
                    console.print(f"[yellow]警告: 关系数据转换失败: {e}[/yellow]")
                    continue
    
    console.print(f"[green]提取到 {len(all_relationships)} 个关系[/green]")
    return all_relationships

def deduplicate_characters(characters: List[Character]) -> List[Character]:
    """简单的角色去重"""
    seen = {}
    unique_chars = []
    
    for char in characters:
        # 使用姓名作为唯一标识
        name = char.name.strip().lower() if char.name else ""
        if not name:
            continue
            
        if name not in seen:
            seen[name] = char
            unique_chars.append(char)
        else:
            # 如果已存在，合并一些信息
            existing = seen[name]
            # 合并描述
            if char.description and not existing.description:
                existing.description = char.description
            # 合并性格
            if char.personality and not existing.personality:
                existing.personality = char.personality
            # 合并背景
            if char.background and not existing.background:
                existing.background = char.background
            # 合并外貌
            if char.appearance and not existing.appearance:
                existing.appearance = char.appearance
            # 合并标签
            if char.tags:
                existing.tags = list(set(existing.tags + char.tags))
            # 合并关系
            if char.relationships:
                existing.relationships = existing.relationships + char.relationships
            # 合并原文上下文
            if char.source_contexts:
                existing.source_contexts = list(set(existing.source_contexts + char.source_contexts))
            if char.example_dialogues:
                existing.example_dialogues = list(set(existing.example_dialogues + char.example_dialogues))
            if char.behavior_examples:
                existing.behavior_examples = list(set(existing.behavior_examples + char.behavior_examples))
    
    console.print(f"[green]角色去重: {len(characters)} -> {len(unique_chars)}[/green]")
    return unique_chars

def deduplicate_locations(locations: List[Location]) -> List[Location]:
    """简单的地点去重"""
    seen = {}
    unique_locs = []
    
    for loc in locations:
        # 使用名称作为唯一标识
        name = loc.name.strip().lower() if loc.name else ""
        if not name:
            continue
            
        if name not in seen:
            seen[name] = loc
            unique_locs.append(loc)
        else:
            # 如果已存在，合并一些信息
            existing = seen[name]
            # 合并描述
            if loc.description and not existing.description:
                existing.description = loc.description
            # 合并类型
            if loc.type and not existing.type:
                existing.type = loc.type
            # 合并重要性
            if loc.importance and not existing.importance:
                existing.importance = loc.importance
            # 合并地理特征
            if loc.geography and not existing.geography:
                existing.geography = loc.geography
            # 合并气候
            if loc.climate and not existing.climate:
                existing.climate = loc.climate
            # 合并文化特色
            if loc.culture and not existing.culture:
                existing.culture = loc.culture
            # 合并历史背景
            if loc.history and not existing.history:
                existing.history = loc.history
            # 合并特色
            if loc.features:
                existing.features = list(set(existing.features + loc.features))
            # 合并地标
            if loc.landmarks:
                existing.landmarks = list(set(existing.landmarks + loc.landmarks))
            # 合并相关地点
            if loc.related_locations:
                existing.related_locations = list(set(existing.related_locations + loc.related_locations))
            # 合并相关角色
            if loc.characters:
                existing.characters = list(set(existing.characters + loc.characters))
            # 合并原文上下文
            if loc.source_contexts:
                existing.source_contexts = list(set(existing.source_contexts + loc.source_contexts))
            if loc.cultural_examples:
                existing.cultural_examples = list(set(existing.cultural_examples + loc.cultural_examples))
            if loc.historical_examples:
                existing.historical_examples = list(set(existing.historical_examples + loc.historical_examples))
    
    console.print(f"[green]地点去重: {len(locations)} -> {len(unique_locs)}[/green]")
    return unique_locs

def deduplicate_timeline_events(events: List[TimelineEvent]) -> List[TimelineEvent]:
    """简单的时间线事件去重"""
    seen = set()
    unique_events = []
    
    for event in events:
        # 创建事件的唯一标识
        title = event.title.strip().lower() if event.title else ""
        description = event.description[:50].lower() if event.description else ""  # 使用前50个字符
        key = f"{title}|{description}"
        
        if key not in seen:
            seen.add(key)
            unique_events.append(event)
    
    console.print(f"[green]时间线事件去重: {len(events)} -> {len(unique_events)}[/green]")
    return unique_events

def deduplicate_relationships(relationships: List[NetworkEdge]) -> List[NetworkEdge]:
    """简单的关系去重"""
    seen = set()
    unique_rels = []
    
    for rel in relationships:
        # 创建关系的唯一标识
        source = rel.source.strip().lower() if rel.source else ""
        target = rel.target.strip().lower() if rel.target else ""
        rel_type = str(rel.relationship_type.value) if rel.relationship_type else "unknown"
        key = f"{source}|{target}|{rel_type}"
        
        if key not in seen:
            seen.add(key)
            unique_rels.append(rel)
    
    console.print(f"[green]关系去重: {len(relationships)} -> {len(unique_rels)}[/green]")
    return unique_rels

def save_characters_as_tavern_cards(characters: List[Character], output_dir: str):
    """将角色保存为SillyTavern角色卡格式"""
    output_dir = Path(output_dir)
    tavern_dir = output_dir / "tavern_cards"
    tavern_dir.mkdir(exist_ok=True)
    
    for char in characters:
        # 创建角色卡数据
        tavern_card = {
            "name": char.name or "Unknown",
            "description": char.description or "",
            "personality": char.personality or "",
            "scenario": "",
            "first_mes": char.first_message or "",
            "mes_example": "\n".join(char.example_messages) if char.example_messages else "",
            "system_prompt": f"你是一个名为{char.name}的角色。{char.description or ''}",
            "post_history_instructions": "",
            "alternate_greetings": [],
            "character_book": None,
            "lorebook": None,
            "appearance": char.appearance,
            "note": "",
            "utilityBot": False,
            "is_greeting": False,
            "tags": char.tags,
            "creator_notes": "",
            "source_contexts": getattr(char, 'source_contexts', []),
            "example_dialogues": getattr(char, 'example_dialogues', []),
            "behavior_examples": getattr(char, 'behavior_examples', [])
        }
        
        # 保存为JSON文件
        filename = f"{char.name.replace('/', '_').replace('\\', '_').replace(':', '_').replace('*', '_').replace('?', '_').replace('"', '_').replace('<', '_').replace('>', '_').replace('|', '_')}.json"
        filepath = tavern_dir / filename
        
        with open(filepath, 'w', encoding='utf-8', newline='') as f:
            json.dump(tavern_card, f, ensure_ascii=False, indent=2)
        
        console.print(f"[green]✓[/green] 保存角色卡: {filepath}")

def save_world_book(locations: List[Location], events: List[TimelineEvent], relationships: List[NetworkEdge], output_dir: str):
    """保存世界书"""
    output_dir = Path(output_dir)
    
    # 创建世界书数据
    world_setting = {
        "locations": [loc.model_dump() for loc in locations],
        "cultures": [],  # 这里可以添加文化信息
        "rules": [],
        "history": "",
        "themes": [],
        "timeline_events": [event.model_dump() for event in events],
        "relationships": [rel.model_dump() for rel in relationships]
    }
    
    # 保存为JSON文件
    filepath = output_dir / "worldbook.json"
    with open(filepath, 'w', encoding='utf-8', newline='') as f:
        json.dump(world_setting, f, ensure_ascii=False, indent=2)
    
    console.print(f"[green]✓[/green] 保存世界书: {filepath}")

def main():
    console.print("[bold blue]开始合并NovelForge提取结果...[/bold blue]")
    
    results_dir = "output_kaguya_new/results"
    output_dir = "output_kaguya_new/final"
    
    # 确保输出目录存在
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    # 加载所有分析结果
    all_results = load_all_analysis_results(results_dir)
    
    if not all_results:
        console.print("[red]错误: 没有找到任何分析结果文件[/red]")
        return
    
    # 提取所有数据
    console.print("\n[bold]提取数据...[/bold]")
    all_characters = extract_all_characters(all_results)
    all_locations = extract_all_locations(all_results)
    all_events = extract_all_timeline_events(all_results)
    all_relationships = extract_all_relationships(all_results)
    
    # 去重处理
    console.print("\n[bold]执行去重处理...[/bold]")
    unique_characters = deduplicate_characters(all_characters)
    unique_locations = deduplicate_locations(all_locations)
    unique_events = deduplicate_timeline_events(all_events)
    unique_relationships = deduplicate_relationships(all_relationships)
    
    # 保存结果
    console.print("\n[bold]保存合并结果...[/bold]")
    save_characters_as_tavern_cards(unique_characters, output_dir)
    save_world_book(unique_locations, unique_events, unique_relationships, output_dir)
    
    # 生成摘要报告
    console.print("\n[bold green]合并完成![/bold green]")
    console.print(f"• 角色数量: {len(unique_characters)}")
    console.print(f"• 地点数量: {len(unique_locations)}")
    console.print(f"• 时间线事件数量: {len(unique_events)}")
    console.print(f"• 关系数量: {len(unique_relationships)}")
    console.print(f"\n结果已保存到: {output_dir}")

if __name__ == "__main__":
    main()