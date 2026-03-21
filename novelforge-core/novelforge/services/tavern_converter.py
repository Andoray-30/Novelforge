"""
SillyTavern 格式转换器

将 NovelForge 内部数据模型转换为 SillyTavern 兼容格式
"""

from typing import Optional, Any
from pydantic import BaseModel
import uuid

from ..core.models import (
    Character,
    Location,
    TimelineEvent,
    NetworkEdge,
    WorldSetting,
    CharacterRole,
    RelationshipType,
    EventType,
    Importance,
    LocationType,
)


class TavernCardData(BaseModel):
    """Tavern Card 数据模型"""
    name: str = ""
    description: str = ""
    personality: str = ""
    scenario: str = ""
    first_mes: str = ""
    mes_example: str = ""
    creator_notes: Optional[str] = ""
    system_prompt: str = ""
    post_history_instructions: str = ""
    alternate_greetings: list[str] = []
    tags: list[str] = []
    creator: str = ""
    character_version: str = "1.0"
    extensions: dict = {}


from enum import Enum


class QualityGrade(str, Enum):
    """质量等级"""
    S = "S"
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    F = "F"


class QualityScoreBreakdown(BaseModel):
    """质量评分明细"""
    field_appropriateness: int = 0      # 字段适当性与结构
    character_consistency: int = 0      # 角色一致性与身份
    rp_playability: int = 0            # 角色扮演实用性与沉浸感
    creativity: int = 0                # 创意与原创性
    polish: int = 0                    # 打磨与技术清晰度
    alternate_greetings_bonus: int = 0  # alternate_greetings 奖励分


class TokenEstimate(BaseModel):
    """Token 估算"""
    total: int = 0
    description: int = 0
    personality: int = 0
    scenario: int = 0
    first_mes: int = 0
    mes_example: int = 0


class QualityScore(BaseModel):
    """质量评分"""
    grade: QualityGrade = QualityGrade.F
    score: int = 0
    breakdown: QualityScoreBreakdown = QualityScoreBreakdown()
    suggestions: list[str] = []
    token_estimate: Optional[TokenEstimate] = None


# 评分等级阈值
QUALITY_THRESHOLDS = {
    "S": 90,  # 90-105分
    "A": 80,  # 80-89分
    "B": 70,  # 70-79分
    "C": 60,  # 60-69分
    "D": 50,  # 50-59分
    "F": 0,   # 0-49分
}


def determine_grade(score: int) -> QualityGrade:
    """根据分数确定等级"""
    if score >= QUALITY_THRESHOLDS["S"]:
        return QualityGrade.S
    elif score >= QUALITY_THRESHOLDS["A"]:
        return QualityGrade.A
    elif score >= QUALITY_THRESHOLDS["B"]:
        return QualityGrade.B
    elif score >= QUALITY_THRESHOLDS["C"]:
        return QualityGrade.C
    elif score >= QUALITY_THRESHOLDS["D"]:
        return QualityGrade.D
    else:
        return QualityGrade.F


# 字段长度指南
FIELD_LENGTH_GUIDELINES = {
    "name": {"min": 1, "max": 50, "recommended": 10},
    "description": {"min": 100, "max": 2000, "recommended": 500},
    "personality": {"min": 50, "max": 1000, "recommended": 200},
    "scenario": {"min": 50, "max": 1000, "recommended": 200},
    "first_mes": {"min": 50, "max": 2000, "recommended": 300},
    "mes_example": {"min": 100, "max": 5000, "recommended": 1000},
}


class CharacterQualityScore(QualityScore):
    """角色质量评分"""
    pass


class WorldQualityScore(QualityScore):
    """世界设定质量评分"""
    pass


class TavernCardV2(BaseModel):
    """SillyTavern 角色卡 V2 格式"""
    spec: str = "chara_card_v2"
    spec_version: str = "2.0"
    data: TavernCardData


    data: TavernCardData


class TavernCardBuilder:
    """Tavern Card 构建器"""
    
    @staticmethod
    def build_card(
        name: str,
        description: str,
        personality: str = "",
        scenario: str = "",
        first_mes: str = "",
        mes_example: str = "",
        **kwargs,
    ) -> 'TavernCardV2':
        """
        构建 Tavern Card
        
        Args:
            name: 角色名
            description: 描述
            personality: 性格
            scenario: 场景
            first_mes: 首条消息
            mes_example: 消息示例
            **kwargs: 其他字段
            
        Returns:
            TavernCardV2: 构建的卡牌
        """
        card_data = TavernCardData(
            name=name,
            description=description,
            personality=personality,
            scenario=scenario,
            first_mes=first_mes,
            mes_example=mes_example,
            **kwargs
        )
        
        return TavernCardV2(
            spec="chara_card_v2",
            spec_version="2.0",
            data=card_data
        )


class CharacterBookEntry(BaseModel):
    """SillyTavern Character Book 条目"""
    keys: list[str]
    content: str
    extensions: dict = {}
    enabled: bool = True
    insertion_order: int = 0
    case_sensitive: bool = False
    name: Optional[str] = None
    priority: Optional[int] = None
    id: Optional[int] = None
    comment: Optional[str] = None
    selective: bool = False
    secondary_keys: list[str] = []
    constant: bool = False
    position: Optional[str] = None


class CharacterBook(BaseModel):
    """SillyTavern Character Book 格式"""
    name: Optional[str] = None
    description: Optional[str] = None
    scan_depth: int = 400
    token_budget: int = 2048
    recursive_scanning: bool = True
    extensions: dict = {}
    entries: list[CharacterBookEntry] = []


class SillyTavernConverter:
    """SillyTavern 格式转换器"""
    
    # 角色角色映射
    ROLE_MAP = {
        CharacterRole.PROTAGONIST: "主角",
        CharacterRole.ANTAGONIST: "反派",
        CharacterRole.SUPPORTING: "配角",
        CharacterRole.MINOR: "次要",
        CharacterRole.NARRATOR: "叙述者",
    }
    
    # 关系类型映射
    RELATIONSHIP_TYPE_MAP = {
        RelationshipType.FAMILY: "家人",
        RelationshipType.FRIEND: "朋友",
        RelationshipType.ENEMY: "敌人",
        RelationshipType.LOVER: "恋人",
        RelationshipType.MENTOR: "导师",
        RelationshipType.RIVAL: "对手",
        RelationshipType.COLLEAGUE: "同事",
        RelationshipType.OTHER: "其他",
    }
    
    # 事件类型映射
    EVENT_TYPE_MAP = {
        EventType.BIRTH: "出生",
        EventType.DEATH: "死亡",
        EventType.BATTLE: "战斗",
        EventType.MARRIAGE: "婚姻",
        EventType.CORONATION: "加冕",
        EventType.DISCOVERY: "发现",
        EventType.JOURNEY: "旅程",
        EventType.CONFLICT: "冲突",
        EventType.ALLIANCE: "结盟",
        EventType.BETRAYAL: "背叛",
        EventType.ROMANCE: "恋爱",
        EventType.SEPARATION: "分离",
        EventType.REUNION: "重逢",
        EventType.SACRIFICE: "牺牲",
        EventType.VICTORY: "胜利",
        EventType.DEFEAT: "失败",
        EventType.MYSTERY: "谜团",
        EventType.REVELATION: "揭示",
        EventType.TRANSFORMATION: "转变",
        EventType.OTHER: "其他",
    }
    
    # 重要性映射
    IMPORTANCE_MAP = {
        Importance.LOW: "低",
        Importance.MEDIUM: "中",
        Importance.HIGH: "高",
        Importance.CRITICAL: "关键",
    }
    
    # 地点类型映射
    LOCATION_TYPE_MAP = {
        LocationType.CITY: "城市",
        LocationType.TOWN: "城镇",
        LocationType.VILLAGE: "村庄",
        LocationType.FOREST: "森林",
        LocationType.MOUNTAIN: "山脉",
        LocationType.RIVER: "河流",
        LocationType.OCEAN: "海洋",
        LocationType.DESERT: "沙漠",
        LocationType.BUILDING: "建筑",
        LocationType.ROOM: "房间",
        LocationType.OTHER: "其他",
    }
    
    @classmethod
    def character_to_tavern_card(
        cls,
        character: Character,
        scenario: Optional[str] = None,
        system_prompt: Optional[str] = None,
        creator: str = "NovelForge",
        creator_notes: Optional[str] = None,
    ) -> dict:
        """
        将 NovelForge Character 转换为 SillyTavern TavernCardV2
        
        Args:
            character: NovelForge 角色模型
            scenario: 场景设定（可选，默认使用 background）
            system_prompt: 系统提示词（可选）
            creator: 创建者名称
            creator_notes: 创建者备注（可选）
            
        Returns:
            TavernCardV2 格式的角色卡
        """
        # 构建描述
        description_parts = []
        if character.description:
            description_parts.append(character.description)
        if character.appearance:
            description_parts.append(f"外貌：{character.appearance}")
        
        description = "\n\n".join(description_parts) if description_parts else ""
        
        # 构建性格
        personality = character.personality or ""
        
        # 构建场景（使用 background 或传入的 scenario）
        scenario_text = scenario or character.background or ""
        
        # 构建首次消息
        first_mes = character.first_message or cls._generate_first_message(character)
        
        # 构建示例对话 - 使用增强的上下文信息
        mes_example_parts = []
        
        # 添加角色描述作为上下文
        if character.description:
            mes_example_parts.append(f"{{char}}是一个名叫{character.name}的角色。{character.description}")
        
        # 添加性格特征
        if character.personality:
            mes_example_parts.append(f"{{char}}的性格特点是：{character.personality}")
        
        # 添加外貌描述
        if character.appearance:
            mes_example_parts.append(f"{{char}}的外貌是：{character.appearance}")
        
        # 添加职业信息
        if character.occupation:
            mes_example_parts.append(f"{{char}}的职业是：{character.occupation}")
        
        # 添加年龄信息
        if character.age:
            mes_example_parts.append(f"{{char}}的年龄是：{character.age}")
        
        # 添加其他特征
        if character.tags:
            tags_str = "，".join(character.tags)
            mes_example_parts.append(f"{{char}}的相关标签包括：{tags_str}")
        
        # 添加角色定位信息
        if character.role:
            role_map = {
                "protagonist": "主角",
                "antagonist": "反派",
                "supporting": "配角",
                "minor": "次要角色",
                "narrator": "叙述者"
            }
            role_desc = role_map.get(str(character.role).lower(), str(character.role))
            mes_example_parts.append(f"{{char}}的角色定位是：{role_desc}")
        
        # 添加关系信息
        if character.relationships:
            rel_names = []
            for rel in character.relationships[:3]:  # 只取前3个
                rel_names.append(rel.target_name)
            if rel_names:
                mes_example_parts.append(f"{{char}}与{'、'.join(rel_names)}等人有关系")
        
        # 添加原文上下文片段
        if character.source_contexts:
            context_samples = character.source_contexts[:3]  # 只取前3个上下文片段
            for i, context in enumerate(context_samples, 1):
                mes_example_parts.append(f"上下文{i}：{context}")
        
        # 添加原文对话示例
        if character.example_dialogues:
            dialogue_samples = character.example_dialogues[:5]  # 只取前5个对话示例
            for i, dialogue in enumerate(dialogue_samples, 1):
                mes_example_parts.append(f"对话{i}：{dialogue}")
        
        # 添加行为示例
        if character.behavior_examples:
            behavior_samples = character.behavior_examples[:3]  # 只取前3个行为示例
            for i, behavior in enumerate(behavior_samples, 1):
                mes_example_parts.append(f"行为示例{i}：{behavior}")
        
        # 添加原有的示例消息
        if character.example_messages:
            original_examples = character.example_messages[:3]  # 只取前3个
            for example in original_examples:
                mes_example_parts.append(example)
        
        # 构建完整的mes_example
        mes_example = "\n\n".join(mes_example_parts)
        
        # 构建标签
        tags = list(character.tags) if character.tags else []
        if character.role:
            tags.append(cls.ROLE_MAP.get(character.role, "配角"))
        if character.occupation:
            tags.append(character.occupation)
        
        # 构建关系描述
        relationships_text = ""
        if character.relationships:
            rel_parts = []
            for rel in character.relationships:
                rel_type = cls.RELATIONSHIP_TYPE_MAP.get(rel.relationship_type, "其他")
                rel_parts.append(f"- {rel.target_name}（{rel_type}）: {rel.relationship}")
            relationships_text = "\n".join(rel_parts)
        
        # 构建扩展字段
        extensions = {
            "novelforge": {
                "role": character.role.value if character.role else None,
                "gender": character.gender.value if character.gender else None,
                "age": character.age,
                "occupation": character.occupation,
                "mentions": character.mentions,
                "relationships": relationships_text,
            }
        }
        
        # 确保所有枚举值都转换为字符串
        if character.role:
            extensions["novelforge"]["role"] = character.role.value
        if character.gender:
            extensions["novelforge"]["gender"] = character.gender.value
        if character.relationships:
            extensions["novelforge"]["relationships"] = [
                {
                    "target_name": rel.target_name,
                    "relationship": rel.relationship,
                    "relationship_type": rel.relationship_type.value if hasattr(rel.relationship_type, 'value') else str(rel.relationship_type),
                    "strength": rel.strength,
                }
                for rel in character.relationships
            ]
        
        # 返回字典而不是Pydantic模型
        return {
            "spec": "chara_card_v2",
            "spec_version": "2.0",
            "data": {
                "name": character.name,
                "description": description,
                "personality": personality,
                "scenario": scenario_text,
                "first_mes": first_mes,
                "mes_example": mes_example,
                "creator_notes": creator_notes or f"由 NovelForge 从小说中提取的角色卡",
                "system_prompt": system_prompt or "",
                "post_history_instructions": "",
                "alternate_greetings": [],
                "tags": tags,
                "creator": creator,
                "character_version": "1.0",
                "extensions": extensions,
            }
        }
    
    @classmethod
    def location_to_character_book_entry(
        cls,
        location: Location,
        insertion_order: int = 0,
    ) -> CharacterBookEntry:
        """
        将 NovelForge Location 转换为 SillyTavern CharacterBookEntry
        
        Args:
            location: NovelForge 地点模型
            insertion_order: 插入顺序
            
        Returns:
            CharacterBookEntry 格式的地点条目
        """
        # 构建关键词
        keys = [location.name]
        
        # 构建内容
        content_parts = [f"【{location.name}】"]
        
        if location.description:
            content_parts.append(location.description)
        
        if location.type:
            type_name = cls.LOCATION_TYPE_MAP.get(location.type, location.type.value if hasattr(location.type, 'value') else str(location.type))
            content_parts.append(f"类型：{type_name}")
        
        if location.geography:
            content_parts.append(f"地理：{location.geography}")
        
        if location.climate:
            content_parts.append(f"气候：{location.climate}")
        
        if location.culture:
            content_parts.append(f"文化：{location.culture}")
        
        if location.history:
            content_parts.append(f"历史：{location.history}")
        
        if location.landmarks:
            content_parts.append(f"地标：{', '.join(location.landmarks)}")
        
        if location.characters:
            content_parts.append(f"相关角色：{', '.join(location.characters)}")
        
        # 添加新增的上下文信息
        if location.source_contexts:
            context_samples = location.source_contexts[:3]  # 只取前3个上下文片段
            for i, context in enumerate(context_samples, 1):
                content_parts.append(f"原文描述{i}：{context}")
        
        if location.cultural_examples:
            cultural_samples = location.cultural_examples[:3]  # 只取前3个文化示例
            for i, cultural in enumerate(cultural_samples, 1):
                content_parts.append(f"文化示例{i}：{cultural}")
        
        if location.historical_examples:
            historical_samples = location.historical_examples[:3]  # 只取前3个历史示例
            for i, historical in enumerate(historical_samples, 1):
                content_parts.append(f"历史示例{i}：{historical}")
        
        content = "\n".join(content_parts)
        
        # 构建备注
        importance_name = cls.IMPORTANCE_MAP.get(location.importance, "中")
        comment = f"地点类型: {cls.LOCATION_TYPE_MAP.get(location.type, '其他')}, 重要性: {importance_name}"
        
        return CharacterBookEntry(
            keys=keys,
            content=content,
            insertion_order=insertion_order,
            name=location.name,
            comment=comment,
            extensions={
                "novelforge": {
                    "type": location.type.value if hasattr(location.type, 'value') else str(location.type),
                    "importance": location.importance.value if hasattr(location.importance, 'value') else str(location.importance),
                }
            },
        )
    
    @classmethod
    def world_setting_to_character_book(
        cls,
        world: WorldSetting,
        name: str = "NovelForge World Book",
        description: Optional[str] = None,
    ) -> CharacterBook:
        """
        将 NovelForge WorldSetting 转换为 SillyTavern CharacterBook
        
        Args:
            world: NovelForge 世界设定模型
            name: 世界书名称
            description: 世界书描述
            
        Returns:
            CharacterBook 格式的世界书
        """
        entries = []
        order = 0
        
        # 添加地点条目
        for location in world.locations:
            entry = cls.location_to_character_book_entry(location, insertion_order=order)
            entries.append(entry)
            order += 1
        
        # 添加文化条目
        for culture in world.cultures:
            keys = [culture.name]
            if culture.name:
                keys.append(culture.name)
            
            content_parts = [f"【{culture.name}】文化"]
            if culture.description:
                content_parts.append(culture.description)
            if culture.beliefs:
                content_parts.append(f"信仰：{', '.join(culture.beliefs)}")
            if culture.values:
                content_parts.append(f"价值观：{', '.join(culture.values)}")
            if culture.customs:
                content_parts.append(f"习俗：{', '.join(culture.customs)}")
            if culture.traditions:
                content_parts.append(f"传统：{', '.join(culture.traditions)}")
            
            content = "\n".join(content_parts)
            
            entry = CharacterBookEntry(
                keys=keys,
                content=content,
                insertion_order=order,
                name=culture.name,
                comment="文化设定",
            )
            entries.append(entry)
            order += 1
        
        # 添加世界规则条目
        if world.rules:
            for i, rule in enumerate(world.rules):
                entry = CharacterBookEntry(
                    keys=[f"世界规则{i+1}", "世界设定"],
                    content=f"【世界规则】{rule}",
                    insertion_order=order,
                    name=f"世界规则{i+1}",
                    comment="世界规则",
                )
                entries.append(entry)
                order += 1
        
        # 添加历史背景条目
        if world.history:
            entry = CharacterBookEntry(
                keys=["历史背景", "世界历史"],
                content=f"【历史背景】\n{world.history}",
                insertion_order=order,
                name="历史背景",
                comment="历史背景",
            )
            entries.append(entry)
            order += 1
        
        # 添加主题元素条目
        if world.themes:
            for i, theme in enumerate(world.themes):
                entry = CharacterBookEntry(
                    keys=[theme, f"主题{i+1}"],
                    content=f"【主题元素】{theme}",
                    insertion_order=order,
                    name=f"主题{i+1}",
                    comment="主题元素",
                )
                entries.append(entry)
                order += 1
        
        return CharacterBook(
            name=name,
            description=description or "由 NovelForge 从小说中提取的世界书",
            entries=entries,
        )
    
    @classmethod
    def timeline_to_character_book_entries(
        cls,
        events: list[TimelineEvent],
        scan_depth: int = 400,
    ) -> list[CharacterBookEntry]:
        """
        将 NovelForge TimelineEvent 列表转换为 CharacterBookEntry 列表
        
        Args:
            events: 时间线事件列表
            scan_depth: 扫描深度
            
        Returns:
            CharacterBookEntry 列表
        """
        entries = []
        
        for i, event in enumerate(events):
            # 构建关键词（使用事件标题和涉及角色）
            keys = [event.title]
            keys.extend(event.characters[:3])  # 最多3个角色作为关键词
            
            # 构建内容
            content_parts = [f"【{event.title}】"]
            
            # 事件类型
            event_type_name = cls.EVENT_TYPE_MAP.get(event.event_type, "其他")
            content_parts.append(f"类型：{event_type_name}")
            
            # 时间信息
            time_info = []
            if event.absolute_time:
                time_info.append(f"绝对时间：{event.absolute_time}")
            if event.relative_time:
                time_info.append(f"相对时间：{event.relative_time}")
            if event.narrative_time:
                time_info.append(f"叙事时间：{event.narrative_time}")
            if event.era:
                time_info.append(f"时代：{event.era}")
            if time_info:
                content_parts.append(" | ".join(time_info))
            
            # 事件描述
            if event.description:
                content_parts.append(event.description)
            
            # 涉及角色
            if event.characters:
                content_parts.append(f"涉及角色：{', '.join(event.characters)}")
            
            # 涉及地点
            if event.locations:
                content_parts.append(f"涉及地点：{', '.join(event.locations)}")
            
            # 后续影响
            if event.consequences:
                content_parts.append(f"后续影响：{'; '.join(event.consequences)}")
            
            content = "\n".join(content_parts)
            
            # 重要性
            importance_name = cls.IMPORTANCE_MAP.get(event.importance, "中")
            
            entry = CharacterBookEntry(
                keys=keys,
                content=content,
                insertion_order=i,
                name=event.title,
                comment=f"时间线事件 - {event_type_name} - 重要性: {importance_name}",
                extensions={
                    "novelforge": {
                        "event_id": event.id,
                        "event_type": event.event_type.value if hasattr(event.event_type, 'value') else str(event.event_type),
                        "importance": event.importance.value if hasattr(event.importance, 'value') else str(event.importance),
                    }
                },
            )
            entries.append(entry)
        
        return entries
    
    @classmethod
    def relationships_to_character_book_entries(
        cls,
        edges: list[NetworkEdge],
    ) -> list[CharacterBookEntry]:
        """
        将 NovelForge NetworkEdge 列表转换为 CharacterBookEntry 列表
        
        Args:
            edges: 关系边列表
            
        Returns:
            CharacterBookEntry 列表
        """
        entries = []
        
        for i, edge in enumerate(edges):
            # 构建关键词（使用两个角色名称）
            keys = [edge.source, edge.target, f"{edge.source}与{edge.target}"]
            
            # 构建内容
            rel_type_name = cls.RELATIONSHIP_TYPE_MAP.get(edge.relationship_type, "其他")
            content_parts = [
                f"【{edge.source}与{edge.target}的关系】",
                f"关系类型：{rel_type_name}",
                f"关系描述：{edge.description}",
                f"关系强度：{edge.strength}/10",
            ]
            
            if edge.evolution:
                content_parts.append(f"关系演变：{' -> '.join(edge.evolution)}")
            
            if edge.evidence:
                content_parts.append(f"原文证据：{edge.evidence[0]}")  # 只取第一条证据
            
            content = "\n".join(content_parts)
            
            # 状态
            status_name = {
                "active": "活跃",
                "ended": "已结束",
                "dormant": "休眠",
                "evolving": "演变中",
                "unknown": "未知",
            }.get(edge.status.value if hasattr(edge.status, 'value') else str(edge.status), "未知")
            
            entry = CharacterBookEntry(
                keys=keys,
                content=content,
                insertion_order=i,
                name=f"{edge.source}与{edge.target}",
                comment=f"角色关系 - {rel_type_name} - 状态: {status_name}",
                extensions={
                    "novelforge": {
                        "edge_id": edge.id,
                        "relationship_type": edge.relationship_type.value if hasattr(edge.relationship_type, 'value') else str(edge.relationship_type),
                        "strength": edge.strength,
                        "status": edge.status.value if hasattr(edge.status, 'value') else str(edge.status),
                    }
                },
            )
            entries.append(entry)
        
        return entries
    
    @classmethod
    def _generate_first_message(cls, character: Character) -> str:
        """生成首次消息"""
        role_text = cls.ROLE_MAP.get(character.role, "角色")
        
        if character.background:
            return f"*{character.name}是一个{role_text}。*\n\n{character.background[:200]}..."
        else:
            return f"*{character.name}出现在故事中。*"


# 便捷函数
def to_tavern_card(character: Character, **kwargs) -> TavernCardV2:
    """将角色转换为 Tavern Card 格式"""
    return SillyTavernConverter.character_to_tavern_card(character, **kwargs)


def to_character_book(world: WorldSetting, **kwargs) -> CharacterBook:
    """将世界设定转换为 Character Book 格式"""
    return SillyTavernConverter.world_setting_to_character_book(world, **kwargs)


def to_character_book_entries(
    locations: list[Location] = None,
    events: list[TimelineEvent] = None,
    relationships: list[NetworkEdge] = None,
) -> list[CharacterBookEntry]:
    """将各种数据转换为 Character Book 条目"""
    entries = []
    
    if locations:
        for i, loc in enumerate(locations):
            entries.append(SillyTavernConverter.location_to_character_book_entry(loc, i))
    
    if events:
        entries.extend(SillyTavernConverter.timeline_to_character_book_entries(events))
    
    if relationships:
        entries.extend(SillyTavernConverter.relationships_to_character_book_entries(relationships))
    
    return entries
