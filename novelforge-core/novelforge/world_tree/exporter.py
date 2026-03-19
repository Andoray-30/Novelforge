"""
世界树导出器

将世界树数据导出为 JSON 文件，支持分层导出和完整导出。
"""

import json
from pathlib import Path
from typing import Optional
from datetime import datetime
from rich.console import Console

from novelforge.world_tree.models import (
    WorldTree,
    Layer0Core,
    Layer1Scene,
    Layer2Deep,
    Layer3Reference,
)

console = Console()


class WorldTreeExporter:
    """世界树导出器"""
    
    def __init__(self, output_dir: str = "./output"):
        """
        初始化导出器
        
        Args:
            output_dir: 输出目录
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def export_all(self, world_tree: WorldTree) -> dict[str, str]:
        """
        导出所有层和摘要
        
        Args:
            world_tree: 世界树对象
            
        Returns:
            dict[str, str]: 导出的文件路径映射
        """
        exported_files = {}
        
        # 导出完整世界树
        exported_files["full"] = self.export_full(world_tree)
        
        # 导出各层
        if world_tree.layer0:
            exported_files["layer0"] = self.export_layer(world_tree, 0)
        if world_tree.layer1:
            exported_files["layer1"] = self.export_layer(world_tree, 1)
        if world_tree.layer2:
            exported_files["layer2"] = self.export_layer(world_tree, 2)
        if world_tree.layer3:
            exported_files["layer3"] = self.export_layer(world_tree, 3)
        
        # 导出摘要
        exported_files["summary"] = self.export_summary(world_tree)
        
        console.print(f"[green]已导出 {len(exported_files)} 个文件到 {self.output_dir}[/green]")
        return exported_files
    
    def export_full(self, world_tree: WorldTree) -> str:
        """
        导出完整世界树
        
        Args:
            world_tree: 世界树对象
            
        Returns:
            str: 导出文件路径
        """
        filename = f"world_tree_{world_tree.id}.json"
        filepath = self.output_dir / filename
        
        # 转换为可序列化的字典
        data = world_tree.model_dump()
        
        # 处理 datetime 对象
        data["created_at"] = data["created_at"].isoformat() if isinstance(data.get("created_at"), datetime) else data.get("created_at")
        data["updated_at"] = data["updated_at"].isoformat() if isinstance(data.get("updated_at"), datetime) else data.get("updated_at")
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        console.print(f"[dim]  导出完整世界树: {filepath}[/dim]")
        return str(filepath)
    
    def export_layer(self, world_tree: WorldTree, layer: int) -> str:
        """
        导出指定层
        
        Args:
            world_tree: 世界树对象
            layer: 层级编号 (0-3)
            
        Returns:
            str: 导出文件路径
        """
        layer_data = world_tree.get_layer(layer)
        if not layer_data:
            raise ValueError(f"Layer {layer} 不存在")
        
        filename = f"layer{layer}_{world_tree.id}.json"
        filepath = self.output_dir / filename
        
        data = layer_data.model_dump()
        
        # 添加元信息
        data["_meta"] = {
            "world_tree_id": world_tree.id,
            "world_tree_name": world_tree.name,
            "layer": layer,
            "exported_at": datetime.now().isoformat(),
        }
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        console.print(f"[dim]  导出 Layer {layer}: {filepath}[/dim]")
        return str(filepath)
    
    def export_layer0(self, world_tree: WorldTree) -> str:
        """导出核心摘要层"""
        return self.export_layer(world_tree, 0)
    
    def export_layer1(self, world_tree: WorldTree) -> str:
        """导出场景信息层"""
        return self.export_layer(world_tree, 1)
    
    def export_layer2(self, world_tree: WorldTree) -> str:
        """导出深度信息层"""
        return self.export_layer(world_tree, 2)
    
    def export_layer3(self, world_tree: WorldTree) -> str:
        """导出参考信息层"""
        return self.export_layer(world_tree, 3)
    
    def export_summary(self, world_tree: WorldTree) -> str:
        """
        导出世界树摘要
        
        Args:
            world_tree: 世界树对象
            
        Returns:
            str: 导出文件路径
        """
        filename = f"summary_{world_tree.id}.json"
        filepath = self.output_dir / filename
        
        summary = world_tree.to_summary_dict()
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        console.print(f"[dim]  导出摘要: {filepath}[/dim]")
        return str(filepath)
    
    def export_characters(self, world_tree: WorldTree) -> str:
        """
        导出角色列表
        
        Args:
            world_tree: 世界树对象
            
        Returns:
            str: 导出文件路径
        """
        filename = f"characters_{world_tree.id}.json"
        filepath = self.output_dir / filename
        
        characters_data = {}
        
        if world_tree.layer2:
            for name, profile in world_tree.layer2.character_profiles.items():
                characters_data[name] = {
                    "name": profile.name,
                    "role": profile.role,
                    "description": profile.description,
                    "personality": profile.personality,
                    "background": profile.background,
                    "relationships": profile.relationships,
                }
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(characters_data, f, ensure_ascii=False, indent=2)
        
        console.print(f"[dim]  导出角色列表: {filepath}[/dim]")
        return str(filepath)
    
    def export_locations(self, world_tree: WorldTree) -> str:
        """
        导出地点列表
        
        Args:
            world_tree: 世界树对象
            
        Returns:
            str: 导出文件路径
        """
        filename = f"locations_{world_tree.id}.json"
        filepath = self.output_dir / filename
        
        locations_data = {}
        
        if world_tree.layer2:
            for name, detail in world_tree.layer2.location_details.items():
                locations_data[name] = {
                    "name": detail.name,
                    "type": detail.type,
                    "description": detail.description,
                    "geography": detail.geography,
                    "culture": detail.culture,
                    "history": detail.history,
                    "landmarks": detail.landmarks,
                }
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(locations_data, f, ensure_ascii=False, indent=2)
        
        console.print(f"[dim]  导出地点列表: {filepath}[/dim]")
        return str(filepath)
    
    def export_timeline(self, world_tree: WorldTree) -> str:
        """
        导出时间线
        
        Args:
            world_tree: 世界树对象
            
        Returns:
            str: 导出文件路径
        """
        filename = f"timeline_{world_tree.id}.json"
        filepath = self.output_dir / filename
        
        timeline_data = {
            "events": [],
            "eras": [],
        }
        
        if world_tree.layer2:
            timeline_data["events"] = world_tree.layer2.timeline_events
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(timeline_data, f, ensure_ascii=False, indent=2)
        
        console.print(f"[dim]  导出时间线: {filepath}[/dim]")
        return str(filepath)
    
    def export_relationships(self, world_tree: WorldTree) -> str:
        """
        导出关系网络
        
        Args:
            world_tree: 世界树对象
            
        Returns:
            str: 导出文件路径
        """
        filename = f"relationships_{world_tree.id}.json"
        filepath = self.output_dir / filename
        
        relationships_data = {}
        
        if world_tree.layer2:
            relationships_data = world_tree.layer2.relationship_network
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(relationships_data, f, ensure_ascii=False, indent=2)
        
        console.print(f"[dim]  导出关系网络: {filepath}[/dim]")
        return str(filepath)
    
    def export_for_layer(
        self,
        world_tree: WorldTree,
        layer: int,
        include_meta: bool = True,
    ) -> str:
        """
        导出指定层（带格式化选项）
        
        Args:
            world_tree: 世界树对象
            layer: 层级编号
            include_meta: 是否包含元信息
            
        Returns:
            str: 导出文件路径
        """
        layer_data = world_tree.get_layer(layer)
        if not layer_data:
            raise ValueError(f"Layer {layer} 不存在")
        
        # 根据层级选择文件名前缀
        layer_names = {
            0: "core",
            1: "scene",
            2: "deep",
            3: "reference",
        }
        
        filename = f"{layer_names.get(layer, f'layer{layer}')}_{world_tree.id}.json"
        filepath = self.output_dir / filename
        
        data = layer_data.model_dump()
        
        if include_meta:
            data["_meta"] = {
                "world_tree_id": world_tree.id,
                "world_tree_name": world_tree.name,
                "layer": layer,
                "layer_name": layer_names.get(layer, f"Layer {layer}"),
                "exported_at": datetime.now().isoformat(),
                "version": world_tree.version,
            }
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        return str(filepath)


def export_world_tree(
    world_tree: WorldTree,
    output_dir: str = "./output",
    export_all: bool = True,
    layer: Optional[int] = None,
) -> dict[str, str]:
    """
    便捷函数：导出世界树
    
    Args:
        world_tree: 世界树对象
        output_dir: 输出目录
        export_all: 是否导出所有层
        layer: 指定导出的层级（如果 export_all 为 False）
        
    Returns:
        dict[str, str]: 导出的文件路径映射
    """
    exporter = WorldTreeExporter(output_dir)
    
    if export_all:
        return exporter.export_all(world_tree)
    elif layer is not None:
        return {f"layer{layer}": exporter.export_layer(world_tree, layer)}
    else:
        return {"full": exporter.export_full(world_tree)}
