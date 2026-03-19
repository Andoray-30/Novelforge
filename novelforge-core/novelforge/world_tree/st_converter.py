"""
SillyTavern 格式转换器

将世界树数据转换为 SillyTavern 兼容的格式：
- 角色卡 (Character Card V3)
- World Info 条目
- Narrator 叙述者角色卡
"""

import json
import uuid
from pathlib import Path
from typing import Optional
from rich.console import Console

from novelforge.world_tree.models import (
    WorldTree,
    Layer0Core,
    Layer2Deep,
    CharacterProfile,
    LocationDetail,
)
from novelforge.services.tavern_converter import TavernCardV2, TavernCardData

from novelforge.core.models import Character

console = Console()


class SillyTavernConverter:
    """SillyTavern 格式转换器"""
    
    def __init__(self, output_dir: str = "./output/st"):
        """
        初始化转换器
        
        Args:
            output_dir: 输出目录
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # World Info 条目计数器
        self._entry_counter = 0
    
    def convert_all(self, world_tree: WorldTree) -> dict[str, str]:
        """
        转换所有内容为 SillyTavern 格式
        
        Args:
            world_tree: 世界树对象
            
        Returns:
            dict[str, str]: 导出的文件路径映射
        """
        exported_files = {}
        
        # 转换角色卡
        exported_files["characters"] = self.convert_characters(world_tree)
        
        # 转换 World Info
        exported_files["world_info"] = self.convert_world_info(world_tree)
        
        # 创建叙述者角色卡
        exported_files["narrator"] = self.create_narrator_card(world_tree)
        
        console.print(f"[green]已导出 {len(exported_files)} 个 SillyTavern 文件到 {self.output_dir}[/green]")
        return exported_files
    
    def convert_characters(self, world_tree: WorldTree) -> str:
        """
        转换角色卡
        
        Args:
            world_tree: 世界树对象
            
        Returns:
            str: 角色卡目录路径
        """
        characters_dir = self.output_dir / "characters"
        characters_dir.mkdir(parents=True, exist_ok=True)
        
        if not world_tree.layer2:
            console.print("[yellow]没有角色数据可导出[/yellow]")
            return str(characters_dir)
        
        count = 0
        for name, profile in world_tree.layer2.character_profiles.items():
            try:
                card = self._create_character_card(profile, world_tree)
                filepath = characters_dir / f"{self._sanitize_filename(name)}.json"
                
                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump(card, f, ensure_ascii=False, indent=2)
                
                count += 1
            except Exception as e:
                console.print(f"[yellow]角色卡导出失败 ({name}): {e}[/yellow]")
        
        console.print(f"[dim]  导出 {count} 个角色卡到 {characters_dir}[/dim]")
        return str(characters_dir)
    
    def convert_world_info(self, world_tree: WorldTree) -> str:
        """
        转换为 World Info 格式
        
        Args:
            world_tree: 世界树对象
            
        Returns:
            str: World Info 文件路径
        """
        entries = {}
        self._entry_counter = 0
        
        # 添加角色条目
        if world_tree.layer2:
            for name, profile in world_tree.layer2.character_profiles.items():
                entry = self._create_character_wi_entry(profile)
                entries[entry["uid"]] = entry
        
        # 添加地点条目
        if world_tree.layer2:
            for name, detail in world_tree.layer2.location_details.items():
                entry = self._create_location_wi_entry(detail)
                entries[entry["uid"]] = entry
        
        # 添加世界规则条目
        if world_tree.layer2:
            for rule in world_tree.layer2.world_rules:
                entry = self._create_rule_wi_entry(rule.name, rule.description)
                entries[entry["uid"]] = entry
        
        # 添加时间线条目
        if world_tree.layer2 and world_tree.layer2.timeline_events:
            for event in world_tree.layer2.timeline_events[:20]:  # 限制最多20个事件
                entry = self._create_event_wi_entry(event)
                entries[entry["uid"]] = entry
        
        # 构建 World Info 结构
        world_info = {
            "entries": entries,
            "name": world_tree.name,
        }
        
        filepath = self.output_dir / f"world_info_{world_tree.id}.json"
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(world_info, f, ensure_ascii=False, indent=2)
        
        console.print(f"[dim]  导出 World Info ({len(entries)} 条目): {filepath}[/dim]")
        return str(filepath)
    
    def convert_timeline(self, world_tree: WorldTree) -> str:
        """
        转换时间线为 World Info
        
        Args:
            world_tree: 世界树对象
            
        Returns:
            str: 时间线 World Info 文件路径
        """
        entries = {}
        self._entry_counter = 0
        
        if world_tree.layer2 and world_tree.layer2.timeline_events:
            for event in world_tree.layer2.timeline_events:
                entry = self._create_event_wi_entry(event)
                entries[entry["uid"]] = entry
        
        world_info = {
            "entries": entries,
            "name": f"{world_tree.name} - 时间线",
        }
        
        filepath = self.output_dir / f"timeline_{world_tree.id}.json"
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(world_info, f, ensure_ascii=False, indent=2)
        
        return str(filepath)
    
    def convert_relationships(self, world_tree: WorldTree) -> str:
        """
        转换关系网络为 World Info
        
        Args:
            world_tree: 世界树对象
            
        Returns:
            str: 关系网络 World Info 文件路径
        """
        entries = {}
        self._entry_counter = 0
        
        if world_tree.layer2 and world_tree.layer2.relationship_network:
            for char_name, relationships in world_tree.layer2.relationship_network.items():
                if relationships:
                    entry = self._create_relationship_wi_entry(char_name, relationships)
                    entries[entry["uid"]] = entry
        
        world_info = {
            "entries": entries,
            "name": f"{world_tree.name} - 关系网络",
        }
        
        filepath = self.output_dir / f"relationships_{world_tree.id}.json"
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(world_info, f, ensure_ascii=False, indent=2)
        
        return str(filepath)
    
    def convert_locations(self, world_tree: WorldTree) -> str:
        """
        转换地点为 World Info
        
        Args:
            world_tree: 世界树对象
            
        Returns:
            str: 地点 World Info 文件路径
        """
        entries = {}
        self._entry_counter = 0
        
        if world_tree.layer2:
            for name, detail in world_tree.layer2.location_details.items():
                entry = self._create_location_wi_entry(detail)
                entries[entry["uid"]] = entry
        
        world_info = {
            "entries": entries,
            "name": f"{world_tree.name} - 地点",
        }
        
        filepath = self.output_dir / f"locations_{world_tree.id}.json"
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(world_info, f, ensure_ascii=False, indent=2)
        
        return str(filepath)
    
    def create_narrator_card(self, world_tree: WorldTree) -> str:
        """
        创建叙述者角色卡
        
        Args:
            world_tree: 世界树对象
            
        Returns:
            str: 叙述者角色卡文件路径
        """
        # 构建叙述者角色卡
        card_data = self._build_narrator_card_data(world_tree)
        
        # 创建 Tavern Card V3 格式
        card = {
            "spec": "chara_card_v3",
            "spec_version": "3.0",
            "data": card_data,
        }
        
        filepath = self.output_dir / "narrator.json"
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(card, f, ensure_ascii=False, indent=2)
        
        console.print(f"[dim]  导出叙述者角色卡: {filepath}[/dim]")
        return str(filepath)
    
    def _create_character_card(
        self,
        profile: CharacterProfile,
        world_tree: WorldTree,
    ) -> dict:
        """
        创建角色卡
        
        Args:
            profile: 角色档案
            world_tree: 世界树对象
            
        Returns:
            dict: 角色卡数据
        """
        # 构建描述
        description_parts = []
        if profile.description:
            description_parts.append(profile.description)
        if profile.background:
            description_parts.append(f"背景：{profile.background}")
        
        description = "\n\n".join(description_parts) or f"这是{profile.name}，故事中的{profile.role}角色。"
        
        # 构建场景
        scenario_parts = []
        if world_tree.layer0:
            scenario_parts.append(f"世界：{world_tree.layer0.world_summary[:200]}")
            if world_tree.layer0.genre:
                scenario_parts.append(f"题材：{', '.join(world_tree.layer0.genre)}")
        
        scenario = "\n".join(scenario_parts) or "这是一个充满冒险的世界。"
        
        # 构建首条消息
        first_mes = f"*{profile.name}出现在故事中...*"
        if profile.personality:
            first_mes = f"*{profile.name}带着{profile.personality[:50]}的气质出现了...*"
        
        # 构建示例消息
        mes_example = ""
        if profile.key_quotes:
            examples = []
            for quote in profile.key_quotes[:3]:
                examples.append(f"<START>\n{{user}}: ...\n{{char}}: {quote}")
            mes_example = "\n\n".join(examples)
        
        return {
            "spec": "chara_card_v3",
            "spec_version": "3.0",
            "data": {
                "name": profile.name,
                "description": description,
                "personality": profile.personality or "性格未知",
                "scenario": scenario,
                "first_mes": first_mes,
                "mes_example": mes_example,
                "creator_notes": f"角色定位：{profile.role}",
                "tags": [profile.role, "novel"],
                "creator": "NovelForge",
                "character_version": "1.0",
                "alternate_greetings": [],
                "character_book": None,
            },
        }
    
    def _build_narrator_card_data(self, world_tree: WorldTree) -> dict:
        """
        构建叙述者角色卡数据
        
        Args:
            world_tree: 世界树对象
            
        Returns:
            dict: 角色卡数据
        """
        # 描述
        description = """你是一个专业的小说作家，负责以第三人称续写故事。

你的任务是：
1. 保持角色性格一致性
2. 遵循世界观设定
3. 推进剧情发展
4. 使用生动的描写和对话
5. 保持叙事的连贯性和逻辑性

写作风格：
- 客观、细腻、善于描写场景和人物心理
- 文风优雅，节奏把控得当
- 注重细节描写，让读者身临其境"""

        # 场景（包含世界信息）
        scenario_parts = []
        if world_tree.layer0:
            scenario_parts.append(f"【世界概览】\n{world_tree.layer0.world_summary}")
            scenario_parts.append(f"【题材】{', '.join(world_tree.layer0.genre)}")
            scenario_parts.append(f"【基调】{', '.join(world_tree.layer0.tone)}")
            
            if world_tree.layer0.main_characters:
                scenario_parts.append(f"【主要角色】{', '.join(world_tree.layer0.main_characters[:5])}")
            
            if world_tree.layer0.core_conflicts:
                scenario_parts.append(f"【核心冲突】\n" + "\n".join(f"- {c}" for c in world_tree.layer0.core_conflicts[:3]))
        
        scenario = "\n\n".join(scenario_parts) if scenario_parts else "故事正在展开..."
        
        # 首条消息
        first_mes = "*故事开始...*\n\n"
        if world_tree.layer0:
            first_mes = f"*故事继续...*\n\n当前剧情：{world_tree.layer0.current_plot_state}\n\n请告诉我您想要续写的方向，或者让我自由发挥。"
        
        # 示例消息
        mes_example = """<START>
{{user}}: 续写500字
{{char}}: *继续以第三人称叙述故事...*

<START>
{{user}}: 接下来发生什么
{{char}}: *推进剧情发展...*

<START>
{{user}}: 描写一下[角色名]
{{char}}: *详细描写角色的外貌、动作和心理...*"""
        
        return {
            "name": "小说叙述者",
            "description": description,
            "personality": "客观、细腻、善于描写场景和人物心理。文风优雅，节奏把控得当。",
            "scenario": scenario,
            "first_mes": first_mes,
            "mes_example": mes_example,
            "creator_notes": "NovelForge 自动生成的叙述者角色卡，用于第三人称小说续写",
            "tags": ["narrator", "novel", "writing", "third-person"],
            "creator": "NovelForge",
            "character_version": "1.0",
            "alternate_greetings": [],
        }
    
    def _create_world_info_entry(
        self,
        uid: int,
        keys: list[str],
        comment: str,
        content: str,
        **kwargs,
    ) -> dict:
        """
        创建 World Info 条目
        
        Args:
            uid: 唯一ID
            keys: 触发词列表
            comment: 条目名称
            content: 条目内容
            **kwargs: 其他可选参数
            
        Returns:
            dict: World Info 条目
        """
        return {
            "uid": uid,
            "key": keys,
            "keysecondary": kwargs.get("keysecondary", []),
            "comment": comment,
            "content": content,
            "constant": kwargs.get("constant", False),
            "selective": kwargs.get("selective", False),
            "order": kwargs.get("order", 100),
            "position": kwargs.get("position", 0),
            "disable": kwargs.get("disable", False),
            "excludeRecursion": kwargs.get("excludeRecursion", False),
            "probability": kwargs.get("probability", 100),
            "useProbability": kwargs.get("useProbability", True),
            "depth": kwargs.get("depth", 4),
            "group": kwargs.get("group", ""),
            "scanDepth": kwargs.get("scanDepth", None),
            "caseSensitive": kwargs.get("caseSensitive", None),
            "matchWholeWords": kwargs.get("matchWholeWords", None),
            "useGroupScoring": kwargs.get("useGroupScoring", None),
            "automationId": kwargs.get("automationId", ""),
            "role": kwargs.get("role", None),
            "vectorized": kwargs.get("vectorized", False),
            "displayIndex": kwargs.get("displayIndex", 0),
        }
    
    def _create_character_wi_entry(self, profile: CharacterProfile) -> dict:
        """创建角色 World Info 条目"""
        self._entry_counter += 1
        
        # 触发词：角色名 + 可能的别名
        keys = [profile.name]
        
        # 内容
        content_parts = [f"【{profile.name}】"]
        if profile.description:
            content_parts.append(profile.description)
        if profile.personality:
            content_parts.append(f"性格：{profile.personality}")
        if profile.background:
            content_parts.append(f"背景：{profile.background}")
        
        content = "\n".join(content_parts)
        
        return self._create_world_info_entry(
            uid=self._entry_counter,
            keys=keys,
            comment=profile.name,
            content=content,
            group="角色",
            order=50,
        )
    
    def _create_location_wi_entry(self, detail: LocationDetail) -> dict:
        """创建地点 World Info 条目"""
        self._entry_counter += 1
        
        keys = [detail.name]
        
        content_parts = [f"【{detail.name}】"]
        if detail.description:
            content_parts.append(detail.description)
        if detail.geography:
            content_parts.append(f"地理：{detail.geography}")
        if detail.culture:
            content_parts.append(f"文化：{detail.culture}")
        if detail.landmarks:
            content_parts.append(f"地标：{', '.join(detail.landmarks[:5])}")
        
        content = "\n".join(content_parts)
        
        return self._create_world_info_entry(
            uid=self._entry_counter,
            keys=keys,
            comment=detail.name,
            content=content,
            group="地点",
            order=60,
        )
    
    def _create_rule_wi_entry(self, name: str, description: str) -> dict:
        """创建规则 World Info 条目"""
        self._entry_counter += 1
        
        # 从规则描述中提取关键词作为触发词
        keys = [name]
        
        content = f"【{name}】\n{description}"
        
        return self._create_world_info_entry(
            uid=self._entry_counter,
            keys=keys,
            comment=name,
            content=content,
            group="世界规则",
            order=70,
        )
    
    def _create_event_wi_entry(self, event: dict) -> dict:
        """创建事件 World Info 条目"""
        self._entry_counter += 1
        
        title = event.get("title", "未命名事件")
        keys = [title]
        
        # 添加涉及角色作为触发词
        characters = event.get("characters", [])
        keys.extend(characters[:3])
        
        content_parts = [f"【{title}】"]
        if event.get("description"):
            content_parts.append(event["description"])
        if characters:
            content_parts.append(f"涉及角色：{', '.join(characters)}")
        if event.get("locations"):
            content_parts.append(f"地点：{', '.join(event['locations'])}")
        
        content = "\n".join(content_parts)
        
        return self._create_world_info_entry(
            uid=self._entry_counter,
            keys=keys,
            comment=title,
            content=content,
            group="历史事件",
            order=80,
        )
    
    def _create_relationship_wi_entry(self, char_name: str, relationships: list[dict]) -> dict:
        """创建关系 World Info 条目"""
        self._entry_counter += 1
        
        keys = [char_name]
        
        rel_descriptions = []
        for rel in relationships[:5]:
            target = rel.get("target", "")
            rel_type = rel.get("type", "")
            desc = rel.get("description", "")
            rel_descriptions.append(f"- 与{target}的关系({rel_type}): {desc}")
        
        content = f"【{char_name}的关系】\n" + "\n".join(rel_descriptions)
        
        return self._create_world_info_entry(
            uid=self._entry_counter,
            keys=keys,
            comment=f"{char_name}的关系",
            content=content,
            group="角色关系",
            order=55,
        )
    
    def _sanitize_filename(self, name: str) -> str:
        """清理文件名"""
        # 移除不允许的字符
        invalid_chars = '<>:"/\\|?*'
        for char in invalid_chars:
            name = name.replace(char, '_')
        return name.strip()


def convert_to_sillytavern(
    world_tree: WorldTree,
    output_dir: str = "./output/st",
) -> dict[str, str]:
    """
    便捷函数：转换为 SillyTavern 格式
    
    Args:
        world_tree: 世界树对象
        output_dir: 输出目录
        
    Returns:
        dict[str, str]: 导出的文件路径映射
    """
    converter = SillyTavernConverter(output_dir)
    return converter.convert_all(world_tree)
