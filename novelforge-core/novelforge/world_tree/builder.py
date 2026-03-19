"""
世界树构建器

整合角色、世界书、时间线、关系网络等数据，构建分层世界树。
"""

from typing import Optional
from pathlib import Path
from rich.console import Console

from novelforge.core.config import Config
from novelforge.core.models import (
    ExtractionResult,
    Character,
    WorldSetting,
    Timeline,
    TimelineEvent,
    RelationshipNetwork,
    NetworkEdge,
    CharacterRole,
    Importance,
)
from novelforge.world_tree.models import (
    WorldTree,
    Layer0Core,
    Layer1Scene,
    Layer2Deep,
    Layer3Reference,
    CharacterProfile,
    LocationDetail,
    WorldRule,
    OriginalExcerpt,
    SettingReference,
    WorldTreeNode,
    WorldTreeNodeType,
)
from novelforge.base.parser import ParsedDocument, Chapter

console = Console()


class WorldTreeBuilder:
    """世界树构建器"""
    
    def __init__(self, config: Optional[Config] = None):
        """
        初始化构建器
        
        Args:
            config: 配置对象
        """
        self.config = config or Config.load()
    
    def build(
        self,
        extraction_result: ExtractionResult,
        timeline: Optional[Timeline] = None,
        relationship_network: Optional[RelationshipNetwork] = None,
        source_file: str = "",
        parsed_document: Optional[ParsedDocument] = None,
    ) -> WorldTree:
        """
        构建世界树
        
        Args:
            extraction_result: 提取结果（包含角色和世界书）
            timeline: 时间线（可选）
            relationship_network: 关系网络（可选）
            source_file: 源文件路径
            parsed_document: 解析后的文档（可选，用于 Layer 3）
            
        Returns:
            WorldTree: 完整的世界树对象
        """
        console.print("[cyan]开始构建世界树...[/cyan]")
        
        # 创建世界树基础结构
        world_tree = WorldTree(
            source_file=source_file,
            name=self._generate_world_tree_name(source_file),
        )
        
        # 构建 Layer 0: 核心摘要层
        console.print("[dim]  构建 Layer 0: 核心摘要层[/dim]")
        world_tree.layer0 = self.build_layer0(
            extraction_result,
            timeline,
            relationship_network,
        )
        
        # 构建 Layer 1: 场景信息层
        console.print("[dim]  构建 Layer 1: 场景信息层[/dim]")
        world_tree.layer1 = self.build_layer1(
            extraction_result,
            timeline,
        )
        
        # 构建 Layer 2: 深度信息层
        console.print("[dim]  构建 Layer 2: 深度信息层[/dim]")
        world_tree.layer2 = self.build_layer2(
            extraction_result,
            timeline,
            relationship_network,
        )
        
        # 构建 Layer 3: 参考信息层
        console.print("[dim]  构建 Layer 3: 参考信息层[/dim]")
        world_tree.layer3 = self.build_layer3(
            extraction_result,
            parsed_document,
        )
        
        # 更新统计信息
        self._update_statistics(world_tree, extraction_result, timeline, relationship_network)
        
        console.print("[green]世界树构建完成[/green]")
        return world_tree
    
    def build_layer0(
        self,
        extraction_result: ExtractionResult,
        timeline: Optional[Timeline] = None,
        relationship_network: Optional[RelationshipNetwork] = None,
    ) -> Layer0Core:
        """
        构建核心摘要层
        
        Args:
            extraction_result: 提取结果
            timeline: 时间线
            relationship_network: 关系网络
            
        Returns:
            Layer0Core: 核心摘要层对象
        """
        characters = extraction_result.characters
        world = extraction_result.world
        
        # 生成世界概览
        world_summary = self._generate_world_summary(world, characters)
        
        # 识别主要角色
        main_characters = self._identify_main_characters(characters)
        
        # 提取核心冲突
        core_conflicts = self._extract_core_conflicts(timeline, characters)
        
        # 生成当前剧情状态
        current_plot_state = self._generate_plot_state(timeline, characters)
        
        # 识别题材和基调
        genre, tone = self._identify_genre_and_tone(world, characters)
        
        return Layer0Core(
            world_summary=world_summary,
            main_characters=main_characters,
            core_conflicts=core_conflicts,
            current_plot_state=current_plot_state,
            genre=genre,
            tone=tone,
            setting_era=self._extract_setting_era(world),
            setting_world=self._extract_setting_world(world),
            total_characters=len(characters),
            total_locations=len(world.locations) if world else 0,
            total_events=len(timeline.events) if timeline else 0,
        )
    
    def build_layer1(
        self,
        extraction_result: ExtractionResult,
        timeline: Optional[Timeline] = None,
    ) -> Layer1Scene:
        """
        构建场景信息层
        
        Args:
            extraction_result: 提取结果
            timeline: 时间线
            
        Returns:
            Layer1Scene: 场景信息层对象
        """
        characters = extraction_result.characters
        world = extraction_result.world
        
        # 获取当前/最近场景
        current_location = None
        scene_description = ""
        active_characters = []
        
        if world and world.locations:
            # 取最重要的地点作为当前场景
            important_locations = [
                loc for loc in world.locations
                if loc.importance in [Importance.HIGH, Importance.CRITICAL]
            ]
            if important_locations:
                current_location = important_locations[0].name
                scene_description = important_locations[0].description or ""
        
        # 获取活跃角色（主角和重要配角）
        active_characters = [
            c.name for c in characters
            if c.role in [CharacterRole.PROTAGONIST, CharacterRole.SUPPORTING]
        ][:10]  # 限制最多10个
        
        # 获取近期事件
        recent_events = []
        if timeline and timeline.events:
            # 取最近的重要事件
            recent_events = [
                f"{e.title}: {e.description[:100]}"
                for e in timeline.events[:10]
                if e.importance in [Importance.HIGH, Importance.CRITICAL]
            ]
        
        # 场景历史
        scene_history = []
        if timeline:
            scene_history = [
                e.title for e in timeline.events[:5]
            ]
        
        return Layer1Scene(
            current_location=current_location,
            active_characters=active_characters,
            scene_description=scene_description,
            scene_history=scene_history,
            recent_events=recent_events,
        )
    
    def build_layer2(
        self,
        extraction_result: ExtractionResult,
        timeline: Optional[Timeline] = None,
        relationship_network: Optional[RelationshipNetwork] = None,
    ) -> Layer2Deep:
        """
        构建深度信息层
        
        Args:
            extraction_result: 提取结果
            timeline: 时间线
            relationship_network: 关系网络
            
        Returns:
            Layer2Deep: 深度信息层对象
        """
        characters = extraction_result.characters
        world = extraction_result.world
        
        # 构建角色档案
        character_profiles = {}
        for char in characters:
            profile = self._build_character_profile(char, relationship_network)
            character_profiles[char.name] = profile
        
        # 构建地点详情
        location_details = {}
        if world:
            for loc in world.locations:
                detail = self._build_location_detail(loc)
                location_details[loc.name] = detail
        
        # 构建世界规则
        world_rules = []
        if world and world.rules:
            for i, rule in enumerate(world.rules):
                world_rules.append(WorldRule(
                    name=f"规则{i+1}",
                    description=rule,
                    category="general",
                ))
        
        # 时间线事件
        timeline_events = []
        if timeline:
            timeline_events = [
                {
                    "id": e.id,
                    "title": e.title,
                    "description": e.description,
                    "event_type": e.event_type.value,
                    "characters": e.characters,
                    "locations": e.locations,
                    "importance": e.importance.value,
                }
                for e in timeline.events
            ]
        
        # 关系网络
        relationship_network_dict = {}
        if relationship_network:
            for edge in relationship_network.edges:
                # 添加源角色的关系
                if edge.source not in relationship_network_dict:
                    relationship_network_dict[edge.source] = []
                relationship_network_dict[edge.source].append({
                    "target": edge.target,
                    "type": edge.relationship_type.value,
                    "description": edge.description,
                    "strength": edge.strength,
                })
                
                # 添加目标角色的反向关系
                if edge.target not in relationship_network_dict:
                    relationship_network_dict[edge.target] = []
                relationship_network_dict[edge.target].append({
                    "target": edge.source,
                    "type": edge.relationship_type.value,
                    "description": edge.description,
                    "strength": edge.strength,
                })
        
        # 文化设定
        cultures = []
        if world and world.cultures:
            cultures = [
                {
                    "name": c.name,
                    "description": c.description,
                    "beliefs": c.beliefs,
                    "values": c.values,
                    "customs": c.customs,
                }
                for c in world.cultures
            ]
        
        return Layer2Deep(
            character_profiles=character_profiles,
            location_details=location_details,
            world_rules=world_rules,
            timeline_events=timeline_events,
            relationship_network=relationship_network_dict,
            cultures=cultures,
        )
    
    def build_layer3(
        self,
        extraction_result: ExtractionResult,
        parsed_document: Optional[ParsedDocument] = None,
    ) -> Layer3Reference:
        """
        构建参考信息层
        
        Args:
            extraction_result: 提取结果
            parsed_document: 解析后的文档
            
        Returns:
            Layer3Reference: 参考信息层对象
        """
        original_excerpts = []
        character_mentions = {}
        location_mentions = {}
        
        # 从章节中提取原文片段
        if parsed_document and parsed_document.chapters:
            for chapter in parsed_document.chapters[:50]:  # 限制最多50个章节
                excerpt = OriginalExcerpt(
                    content=chapter.content[:1000],  # 限制长度
                    chapter=chapter.title,
                    importance="medium",
                )
                original_excerpts.append(excerpt)
        
        # 从角色信息中提取证据
        for char in extraction_result.characters:
            if char.background:
                excerpt = OriginalExcerpt(
                    content=f"【{char.name}】{char.background}",
                    characters=[char.name],
                    importance="high",
                )
                original_excerpts.append(excerpt)
                
                if char.name not in character_mentions:
                    character_mentions[char.name] = []
                character_mentions[char.name].append(excerpt.id)
        
        # 构建设定参考
        setting_references = []
        world = extraction_result.world
        if world:
            if world.history:
                setting_references.append(SettingReference(
                    topic="历史背景",
                    content=world.history,
                    source="世界书",
                    tags=["历史", "背景"],
                ))
            
            for theme in world.themes:
                setting_references.append(SettingReference(
                    topic="主题元素",
                    content=theme,
                    source="世界书",
                    tags=["主题"],
                ))
        
        return Layer3Reference(
            original_excerpts=original_excerpts,
            setting_references=setting_references,
            character_mentions=character_mentions,
            location_mentions=location_mentions,
        )
    
    def _generate_world_tree_name(self, source_file: str) -> str:
        """生成世界树名称"""
        if source_file:
            return Path(source_file).stem
        return "未命名世界树"
    
    def _generate_world_summary(
        self,
        world: Optional[WorldSetting],
        characters: list[Character],
    ) -> str:
        """生成世界概览"""
        parts = []
        
        if world:
            if world.history:
                parts.append(f"历史背景：{world.history[:200]}")
            
            if world.locations:
                loc_names = [loc.name for loc in world.locations[:5]]
                parts.append(f"主要地点：{', '.join(loc_names)}")
            
            if world.themes:
                parts.append(f"主题元素：{', '.join(world.themes[:5])}")
        
        if characters:
            main_chars = [c.name for c in characters if c.role == CharacterRole.PROTAGONIST]
            if main_chars:
                parts.append(f"主角：{', '.join(main_chars[:3])}")
        
        if parts:
            return " | ".join(parts)
        return "这是一个待探索的世界。"
    
    def _identify_main_characters(self, characters: list[Character]) -> list[str]:
        """识别主要角色"""
        # 按角色定位和提及次数排序
        role_priority = {
            CharacterRole.PROTAGONIST: 0,
            CharacterRole.SUPPORTING: 1,
            CharacterRole.ANTAGONIST: 2,
            CharacterRole.MINOR: 3,
            CharacterRole.NARRATOR: 4,
        }
        
        sorted_chars = sorted(
            characters,
            key=lambda c: (role_priority.get(c.role, 5), -c.mentions)
        )
        
        return [c.name for c in sorted_chars[:10]]
    
    def _extract_core_conflicts(
        self,
        timeline: Optional[Timeline],
        characters: list[Character],
    ) -> list[str]:
        """提取核心冲突"""
        conflicts = []
        
        if timeline:
            # 从事件中提取冲突
            conflict_types = ["battle", "conflict", "betrayal"]
            for event in timeline.events:
                if event.event_type.value in conflict_types:
                    conflicts.append(f"{event.title}: {event.description[:100]}")
        
        # 从反派角色推断冲突
        antagonists = [c for c in characters if c.role == CharacterRole.ANTAGONIST]
        for ant in antagonists[:3]:
            if ant.description:
                conflicts.append(f"与{ant.name}的对立")
        
        return conflicts[:5]  # 限制最多5个
    
    def _generate_plot_state(
        self,
        timeline: Optional[Timeline],
        characters: list[Character],
    ) -> str:
        """生成当前剧情状态"""
        if timeline and timeline.events:
            latest_events = timeline.events[:3]
            if latest_events:
                event_descs = [e.title for e in latest_events]
                return f"最近发展：{' -> '.join(event_descs)}"
        
        main_chars = [c for c in characters if c.role == CharacterRole.PROTAGONIST]
        if main_chars:
            return f"故事围绕{main_chars[0].name}展开"
        
        return "故事正在展开中..."
    
    def _identify_genre_and_tone(
        self,
        world: Optional[WorldSetting],
        characters: list[Character],
    ) -> tuple[list[str], list[str]]:
        """识别题材和基调"""
        genre = []
        tone = []
        
        # 基于世界规则推断题材
        if world:
            rules_text = " ".join(world.rules).lower()
            
            # 题材识别
            if any(kw in rules_text for kw in ["修仙", "灵气", "境界", "道"]):
                genre.append("修仙")
            if any(kw in rules_text for kw in ["魔法", "魔力", "咒语"]):
                genre.append("奇幻")
            if any(kw in rules_text for kw in ["科技", "机械", "星际"]):
                genre.append("科幻")
            if any(kw in rules_text for kw in ["武功", "江湖", "门派"]):
                genre.append("武侠")
            
            # 基调识别
            if any(kw in rules_text for kw in ["黑暗", "残酷", "血腥"]):
                tone.append("黑暗")
            if any(kw in rules_text for kw in ["轻松", "幽默", "搞笑"]):
                tone.append("轻松")
            if any(kw in rules_text for kw in ["热血", "战斗", "冒险"]):
                tone.append("热血")
        
        # 默认值
        if not genre:
            genre.append("玄幻")
        if not tone:
            tone.append("正剧")
        
        return genre, tone
    
    def _extract_setting_era(self, world: Optional[WorldSetting]) -> Optional[str]:
        """提取时代背景"""
        if not world:
            return None
        
        history = (world.history or "").lower()
        
        if any(kw in history for kw in ["古代", "王朝", "帝國"]):
            return "古代"
        if any(kw in history for kw in ["现代", "都市", "当代"]):
            return "现代"
        if any(kw in history for kw in ["未来", "星际", "科技"]):
            return "未来"
        
        return None
    
    def _extract_setting_world(self, world: Optional[WorldSetting]) -> Optional[str]:
        """提取世界类型"""
        if not world:
            return None
        
        rules = " ".join(world.rules).lower() if world.rules else ""
        
        if any(kw in rules for kw in ["修仙", "灵气", "境界"]):
            return "修仙世界"
        if any(kw in rules for kw in ["魔法", "精灵", "龙"]):
            return "奇幻世界"
        if any(kw in rules for kw in ["科技", "机械", "星际"]):
            return "科幻世界"
        
        return "异世界"
    
    def _build_character_profile(
        self,
        character: Character,
        relationship_network: Optional[RelationshipNetwork] = None,
    ) -> CharacterProfile:
        """构建角色档案"""
        # 构建关系映射
        relationships = {}
        if relationship_network:
            for edge in relationship_network.get_character_relationships(character.name):
                other = edge.target if edge.source == character.name else edge.source
                relationships[other] = f"{edge.relationship_type.value}: {edge.description}"
        
        # 从角色关系字段补充
        for rel in character.relationships:
            if rel.target_name not in relationships:
                relationships[rel.target_name] = rel.relationship
        
        return CharacterProfile(
            name=character.name,
            role=character.role.value,
            description=character.description or "",
            personality=character.personality or "",
            background=character.background or "",
            abilities=[],  # TODO: 从描述中提取
            relationships=relationships,
            key_quotes=character.example_messages[:3] if character.example_messages else [],
        )
    
    def _build_location_detail(self, location) -> LocationDetail:
        """构建地点详情"""
        return LocationDetail(
            name=location.name,
            type=location.type.value if hasattr(location.type, 'value') else str(location.type),
            description=location.description or "",
            geography=location.geography,
            culture=location.culture,
            history=location.history,
            landmarks=location.landmarks or [],
            notable_characters=location.characters or [],
        )
    
    def _update_statistics(
        self,
        world_tree: WorldTree,
        extraction_result: ExtractionResult,
        timeline: Optional[Timeline],
        relationship_network: Optional[RelationshipNetwork],
    ) -> None:
        """更新统计信息"""
        world_tree.total_characters = len(extraction_result.characters)
        
        if extraction_result.world:
            world_tree.total_locations = len(extraction_result.world.locations)
        
        if timeline:
            world_tree.total_events = len(timeline.events)


def build_world_tree(
    extraction_result: ExtractionResult,
    timeline: Optional[Timeline] = None,
    relationship_network: Optional[RelationshipNetwork] = None,
    source_file: str = "",
    config: Optional[Config] = None,
) -> WorldTree:
    """
    便捷函数：构建世界树
    
    Args:
        extraction_result: 提取结果
        timeline: 时间线
        relationship_network: 关系网络
        source_file: 源文件路径
        config: 配置对象
        
    Returns:
        WorldTree: 世界树对象
    """
    builder = WorldTreeBuilder(config)
    return builder.build(
        extraction_result=extraction_result,
        timeline=timeline,
        relationship_network=relationship_network,
        source_file=source_file,
    )
