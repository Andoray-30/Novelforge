"""
数据模型定义

包含角色、世界设定、时间线、关系网络等核心数据模型。
"""

from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
import uuid


class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"
    UNKNOWN = "unknown"


class CharacterRole(str, Enum):
    PROTAGONIST = "protagonist"
    ANTAGONIST = "antagonist"
    SUPPORTING = "supporting"
    MINOR = "minor"
    NARRATOR = "narrator"


class RelationshipType(str, Enum):
    FAMILY = "family"
    FRIEND = "friend"
    ENEMY = "enemy"
    LOVER = "lover"
    MENTOR = "mentor"
    RIVAL = "rival"
    COLLEAGUE = "colleague"
    OTHER = "other"


class CharacterRelationship(BaseModel):
    """角色关系"""
    target_name: str = Field(..., description="目标角色名称")
    relationship: str = Field(..., description="关系描述")
    relationship_type: RelationshipType = Field(default=RelationshipType.OTHER, description="关系类型")
    strength: int = Field(default=5, ge=1, le=10, description="关系强度 1-10")


class Character(BaseModel):
    """角色卡"""
    name: str = Field(..., description="角色名称")
    description: Optional[str] = Field(None, description="角色描述")
    personality: Optional[str] = Field(None, description="性格特征")
    background: Optional[str] = Field(None, description="背景故事")
    appearance: Optional[str] = Field(None, description="外貌描述")
    age: Optional[int] = Field(None, description="年龄")
    gender: Gender = Field(default=Gender.UNKNOWN, description="性别")
    occupation: Optional[str] = Field(None, description="职业")
    role: CharacterRole = Field(default=CharacterRole.SUPPORTING, description="角色定位")
    first_message: Optional[str] = Field(None, description="首次出场对话")
    example_messages: list[str] = Field(default_factory=list, description="示例对话")
    tags: list[str] = Field(default_factory=list, description="标签")
    relationships: list[CharacterRelationship] = Field(default_factory=list, description="角色关系")
    mentions: int = Field(default=0, description="出现次数")
    
    # 增加原文上下文字段
    source_contexts: list[str] = Field(default_factory=list, description="角色在原文中的上下文片段")
    example_dialogues: list[str] = Field(default_factory=list, description="角色在原文中的对话示例")
    behavior_examples: list[str] = Field(default_factory=list, description="角色在原文中的行为示例")
    
    model_config = {
        "json_schema_extra": {
            "examples": [{
                "name": "张三",
                "description": "故事的主角，一个普通的年轻人",
                "personality": "勇敢、善良、有些冲动",
                "role": "protagonist"
            }]
        }
    }


class LocationType(str, Enum):
    CITY = "city"
    TOWN = "town"
    VILLAGE = "village"
    FOREST = "forest"
    MOUNTAIN = "mountain"
    RIVER = "river"
    OCEAN = "ocean"
    DESERT = "desert"
    BUILDING = "building"
    ROOM = "room"
    OTHER = "other"


class Importance(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Location(BaseModel):
    """地点"""
    name: str = Field(..., description="地点名称")
    description: Optional[str] = Field(None, description="地点描述")
    type: LocationType = Field(default=LocationType.OTHER, description="地点类型")
    importance: Importance = Field(default=Importance.MEDIUM, description="重要性")
    geography: Optional[str] = Field(None, description="地理特征")
    climate: Optional[str] = Field(None, description="气候")
    culture: Optional[str] = Field(None, description="文化特色")
    history: Optional[str] = Field(None, description="历史背景")
    features: list[str] = Field(default_factory=list, description="地点特色")
    landmarks: list[str] = Field(default_factory=list, description="地标")
    related_locations: list[str] = Field(default_factory=list, description="相关地点")
    characters: list[str] = Field(default_factory=list, description="相关角色")
    
    # 增加原文上下文字段
    source_contexts: list[str] = Field(default_factory=list, description="地点在原文中的上下文片段")
    cultural_examples: list[str] = Field(default_factory=list, description="地点在原文中的文化示例")
    historical_examples: list[str] = Field(default_factory=list, description="地点在原文中的历史示例")


class Culture(BaseModel):
    """文化设定"""
    name: str = Field(..., description="文化名称")
    description: Optional[str] = Field(None, description="文化描述")
    beliefs: list[str] = Field(default_factory=list, description="信仰")
    values: list[str] = Field(default_factory=list, description="价值观")
    customs: list[str] = Field(default_factory=list, description="习俗")
    traditions: list[str] = Field(default_factory=list, description="传统")


class WorldSetting(BaseModel):
    """世界书设定"""
    locations: list[Location] = Field(default_factory=list, description="地点列表")
    cultures: list[Culture] = Field(default_factory=list, description="文化列表")
    rules: list[str] = Field(default_factory=list, description="世界规则")
    history: Optional[str] = Field(None, description="历史背景")
    themes: list[str] = Field(default_factory=list, description="主题元素")


# ==================== 时间线模型 ====================

class EventType(str, Enum):
    """事件类型"""
    BIRTH = "birth"              # 出生
    DEATH = "death"              # 死亡
    BATTLE = "battle"            # 战斗
    MARRIAGE = "marriage"        # 婚姻
    CORONATION = "coronation"    # 加冕
    DISCOVERY = "discovery"      # 发现
    JOURNEY = "journey"          # 旅程
    CONFLICT = "conflict"        # 冲突
    ALLIANCE = "alliance"        # 结盟
    BETRAYAL = "betrayal"        # 背叛
    ROMANCE = "romance"          # 恋爱
    SEPARATION = "separation"    # 分离
    REUNION = "reunion"          # 重逢
    SACRIFICE = "sacrifice"      # 牺牲
    VICTORY = "victory"          # 胜利
    DEFEAT = "defeat"            # 失败
    MYSTERY = "mystery"          # 谜团
    REVELATION = "revelation"    # 揭示
    TRANSFORMATION = "transformation"  # 转变
    OTHER = "other"              # 其他


class TimePrecision(str, Enum):
    """时间精度"""
    YEAR = "year"                # 年
    MONTH = "month"              # 月
    DAY = "day"                  # 日
    HOUR = "hour"                # 时
    RELATIVE = "relative"        # 相对时间（如"三天后"）
    NARRATIVE = "narrative"      # 叙事时间（如"童年时期"）
    UNKNOWN = "unknown"          # 未知


class TimelineEvent(BaseModel):
    """时间线事件"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8], description="事件唯一标识")
    title: str = Field(..., description="事件标题")
    description: str = Field(..., description="事件描述")
    event_type: EventType = Field(default=EventType.OTHER, description="事件类型")
    
    # 时间信息
    absolute_time: Optional[str] = Field(None, description="绝对时间，如 2024-01-01")
    relative_time: Optional[str] = Field(None, description="相对时间，如 三天后")
    time_precision: TimePrecision = Field(default=TimePrecision.NARRATIVE, description="时间精度")
    era: Optional[str] = Field(None, description="时代/纪元，如 战国时期")
    narrative_time: Optional[str] = Field(None, description="叙事时间，如 童年时期")
    
    # 关联信息
    characters: list[str] = Field(default_factory=list, description="涉及角色")
    locations: list[str] = Field(default_factory=list, description="涉及地点")
    chapter_reference: Optional[str] = Field(None, description="章节引用")
    
    # 重要性
    importance: Importance = Field(default=Importance.MEDIUM, description="重要性")
    
    # 后续影响
    consequences: list[str] = Field(default_factory=list, description="后续影响")
    
    # 原文证据
    evidence: list[str] = Field(default_factory=list, description="文本证据")


class Timeline(BaseModel):
    """时间线"""
    events: list[TimelineEvent] = Field(default_factory=list, description="事件列表")
    eras: list[str] = Field(default_factory=list, description="时代列表")
    start_point: Optional[str] = Field(None, description="时间线起点")
    end_point: Optional[str] = Field(None, description="时间线终点")
    total_events: int = Field(default=0, description="事件总数")
    
    def get_events_by_character(self, character_name: str) -> list[TimelineEvent]:
        """获取指定角色相关的所有事件"""
        return [
            event for event in self.events
            if character_name in event.characters
        ]
    
    def get_events_by_type(self, event_type: EventType) -> list[TimelineEvent]:
        """获取指定类型的所有事件"""
        return [
            event for event in self.events
            if event.event_type == event_type
        ]
    
    def get_events_by_importance(self, min_importance: Importance) -> list[TimelineEvent]:
        """获取指定重要性以上的事件"""
        importance_order = [Importance.LOW, Importance.MEDIUM, Importance.HIGH, Importance.CRITICAL]
        min_idx = importance_order.index(min_importance)
        return [
            event for event in self.events
            if importance_order.index(event.importance) >= min_idx
        ]


# ==================== 关系网络模型 ====================

class RelationshipStatus(str, Enum):
    """关系状态"""
    ACTIVE = "active"            # 活跃
    ENDED = "ended"              # 已结束
    DORMANT = "dormant"          # 休眠
    EVOLVING = "evolving"        # 演变中
    UNKNOWN = "unknown"          # 未知


class NetworkEdge(BaseModel):
    """关系网络边（关系详情）"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8], description="关系唯一标识")
    source: str = Field(..., description="源角色名称")
    target: str = Field(..., description="目标角色名称")
    relationship_type: RelationshipType = Field(default=RelationshipType.OTHER, description="关系类型")
    description: str = Field(..., description="关系描述")
    strength: int = Field(default=5, ge=1, le=10, description="关系强度 1-10")
    status: RelationshipStatus = Field(default=RelationshipStatus.ACTIVE, description="关系状态")
    
    # 关系演变
    start_event: Optional[str] = Field(None, description="关系建立事件")
    end_event: Optional[str] = Field(None, description="关系结束事件")
    evolution: list[str] = Field(default_factory=list, description="关系演变历史")
    
    # 证据
    evidence: list[str] = Field(default_factory=list, description="文本证据")
    chapter_references: list[str] = Field(default_factory=list, description="章节引用")


class RelationshipNetwork(BaseModel):
    """关系网络"""
    edges: list[NetworkEdge] = Field(default_factory=list, description="关系边列表")
    nodes: list[str] = Field(default_factory=list, description="角色节点列表")
    total_relationships: int = Field(default=0, description="关系总数")
    
    def get_character_relationships(self, character_name: str) -> list[NetworkEdge]:
        """获取指定角色的所有关系"""
        return [
            edge for edge in self.edges
            if edge.source == character_name or edge.target == character_name
        ]
    
    def get_strongest_relationships(self, threshold: int = 7) -> list[NetworkEdge]:
        """获取强关系"""
        return [edge for edge in self.edges if edge.strength >= threshold]
    
    def get_relationships_by_type(self, rel_type: RelationshipType) -> list[NetworkEdge]:
        """获取指定类型的关系"""
        return [edge for edge in self.edges if edge.relationship_type == rel_type]
    
    def get_active_relationships(self) -> list[NetworkEdge]:
        """获取活跃关系"""
        return [edge for edge in self.edges if edge.status == RelationshipStatus.ACTIVE]
    
    def add_edge(self, edge: NetworkEdge) -> None:
        """添加关系边"""
        self.edges.append(edge)
        if edge.source not in self.nodes:
            self.nodes.append(edge.source)
        if edge.target not in self.nodes:
            self.nodes.append(edge.target)
        self.total_relationships = len(self.edges)


# ==================== 提取结果模型 ====================

class ExtractionResult(BaseModel):
    """提取结果"""
    characters: list[Character] = Field(default_factory=list, description="角色列表")
    world: Optional[WorldSetting] = Field(None, description="世界设定")
    timeline: Optional[Timeline] = Field(None, description="时间线")
    relationships: Optional[RelationshipNetwork] = Field(None, description="关系网络")
    success: bool = Field(default=True, description="是否成功")
    errors: list[str] = Field(default_factory=list, description="错误信息")
    
    def get_character_count(self) -> int:
        """获取角色数量"""
        return len(self.characters)
    
    def get_event_count(self) -> int:
        """获取事件数量"""
        return len(self.timeline.events) if self.timeline else 0
    
    def get_relationship_count(self) -> int:
        """获取关系数量"""
        return len(self.relationships.edges) if self.relationships else 0
