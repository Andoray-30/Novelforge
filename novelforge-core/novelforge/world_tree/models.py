"""
世界树数据模型

分层组织的世界信息数据结构，包含4层：
- Layer 0: 核心摘要层（始终加载）
- Layer 1: 场景信息层（按触发词加载）
- Layer 2: 深度信息层（按需加载）
- Layer 3: 参考信息层（离线参考）
"""

from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, Field
import uuid


# ==================== Layer 0: 核心摘要层 ====================

class Layer0Core(BaseModel):
    """
    Layer 0: 核心摘要层
    
    包含世界的基本概览信息，始终加载到上下文中。
    """
    world_summary: str = Field(..., description="世界概览（100-200字摘要）")
    main_characters: list[str] = Field(default_factory=list, description="主要角色名称列表")
    core_conflicts: list[str] = Field(default_factory=list, description="核心冲突列表")
    current_plot_state: str = Field(..., description="当前剧情状态摘要")
    genre: list[str] = Field(default_factory=list, description="题材类型（如：玄幻、都市、科幻）")
    tone: list[str] = Field(default_factory=list, description="基调风格（如：轻松、严肃、黑暗）")
    setting_era: Optional[str] = Field(None, description="时代背景（如：古代、现代、未来）")
    setting_world: Optional[str] = Field(None, description="世界类型（如：现实、奇幻、修仙）")
    
    # 统计信息
    total_characters: int = Field(default=0, description="角色总数")
    total_locations: int = Field(default=0, description="地点总数")
    total_events: int = Field(default=0, description="事件总数")


# ==================== Layer 1: 场景信息层 ====================

class Layer1Scene(BaseModel):
    """
    Layer 1: 场景信息层
    
    包含当前场景的详细信息，通过触发词加载。
    """
    current_location: Optional[str] = Field(None, description="当前地点名称")
    active_characters: list[str] = Field(default_factory=list, description="当前活跃角色")
    scene_description: str = Field(default="", description="当前场景描述")
    scene_history: list[str] = Field(default_factory=list, description="场景历史事件")
    scene_rules: list[str] = Field(default_factory=list, description="场景特定规则")
    recent_events: list[str] = Field(default_factory=list, description="近期事件（最近5-10个）")
    
    # 场景氛围
    atmosphere: Optional[str] = Field(None, description="场景氛围（如：紧张、温馨、神秘）")
    time_of_day: Optional[str] = Field(None, description="时间（如：清晨、正午、深夜）")
    weather: Optional[str] = Field(None, description="天气")


# ==================== Layer 2: 深度信息层 ====================

class CharacterProfile(BaseModel):
    """角色档案（用于 Layer 2）"""
    name: str = Field(..., description="角色名称")
    role: str = Field(default="supporting", description="角色定位")
    description: str = Field(default="", description="角色描述")
    personality: str = Field(default="", description="性格特征")
    background: str = Field(default="", description="背景故事")
    abilities: list[str] = Field(default_factory=list, description="能力/技能")
    relationships: dict[str, str] = Field(default_factory=dict, description="关系映射 {角色名: 关系}")
    character_arc: Optional[str] = Field(None, description="角色弧光/成长轨迹")
    key_quotes: list[str] = Field(default_factory=list, description="经典台词")


class LocationDetail(BaseModel):
    """地点详情（用于 Layer 2）"""
    name: str = Field(..., description="地点名称")
    type: str = Field(default="other", description="地点类型")
    description: str = Field(default="", description="地点描述")
    geography: Optional[str] = Field(None, description="地理特征")
    culture: Optional[str] = Field(None, description="文化特色")
    history: Optional[str] = Field(None, description="历史背景")
    landmarks: list[str] = Field(default_factory=list, description="地标")
    notable_characters: list[str] = Field(default_factory=list, description="相关角色")


class WorldRule(BaseModel):
    """世界规则（用于 Layer 2）"""
    name: str = Field(..., description="规则名称")
    description: str = Field(..., description="规则描述")
    category: str = Field(default="general", description="规则类别（如：魔法、社会、自然）")
    exceptions: list[str] = Field(default_factory=list, description="例外情况")


class Layer2Deep(BaseModel):
    """
    Layer 2: 深度信息层
    
    包含完整的世界设定信息，按需加载。
    """
    character_profiles: dict[str, CharacterProfile] = Field(
        default_factory=dict, 
        description="角色档案映射 {角色名: 档案}"
    )
    location_details: dict[str, LocationDetail] = Field(
        default_factory=dict,
        description="地点详情映射 {地点名: 详情}"
    )
    world_rules: list[WorldRule] = Field(default_factory=list, description="世界规则列表")
    timeline_events: list[dict[str, Any]] = Field(default_factory=list, description="时间线事件")
    relationship_network: dict[str, list[dict]] = Field(
        default_factory=dict,
        description="关系网络 {角色名: [关系列表]}"
    )
    
    # 文化设定
    cultures: list[dict[str, Any]] = Field(default_factory=list, description="文化设定")
    
    # 势力/组织
    factions: list[dict[str, Any]] = Field(default_factory=list, description="势力/组织")


# ==================== Layer 3: 参考信息层 ====================

class OriginalExcerpt(BaseModel):
    """原文片段（用于 Layer 3）"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    content: str = Field(..., description="原文内容")
    chapter: Optional[str] = Field(None, description="章节引用")
    characters: list[str] = Field(default_factory=list, description="涉及角色")
    location: Optional[str] = Field(None, description="涉及地点")
    event_type: Optional[str] = Field(None, description="事件类型")
    importance: str = Field(default="medium", description="重要性")


class SettingReference(BaseModel):
    """设定参考（用于 Layer 3）"""
    topic: str = Field(..., description="主题")
    content: str = Field(..., description="参考内容")
    source: Optional[str] = Field(None, description="来源（如：作者设定、读者推测）")
    tags: list[str] = Field(default_factory=list, description="标签")


class Layer3Reference(BaseModel):
    """
    Layer 3: 参考信息层
    
    包含原文片段和参考资料，离线参考使用。
    """
    original_excerpts: list[OriginalExcerpt] = Field(
        default_factory=list,
        description="原文片段库"
    )
    setting_references: list[SettingReference] = Field(
        default_factory=list,
        description="设定参考资料"
    )
    author_notes: list[str] = Field(default_factory=list, description="作者笔记")
    reader_notes: list[str] = Field(default_factory=list, description="读者笔记")
    
    # 索引
    character_mentions: dict[str, list[str]] = Field(
        default_factory=dict,
        description="角色提及索引 {角色名: [片段ID列表]}"
    )
    location_mentions: dict[str, list[str]] = Field(
        default_factory=dict,
        description="地点提及索引 {地点名: [片段ID列表]}"
    )


# ==================== 世界树主模型 ====================

class WorldTree(BaseModel):
    """
    世界树
    
    分层组织的世界信息数据结构，整合角色、世界书、时间线、关系网络。
    """
    # 元数据
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8], description="世界树ID")
    name: str = Field(default="未命名世界树", description="世界树名称")
    source_file: str = Field(default="", description="源文件路径")
    created_at: datetime = Field(default_factory=datetime.now, description="创建时间")
    updated_at: datetime = Field(default_factory=datetime.now, description="更新时间")
    version: str = Field(default="1.0.0", description="版本号")
    
    # 分层数据
    layer0: Optional[Layer0Core] = Field(None, description="核心摘要层")
    layer1: Optional[Layer1Scene] = Field(None, description="场景信息层")
    layer2: Optional[Layer2Deep] = Field(None, description="深度信息层")
    layer3: Optional[Layer3Reference] = Field(None, description="参考信息层")
    
    # 统计信息
    total_characters: int = Field(default=0, description="角色总数")
    total_locations: int = Field(default=0, description="地点总数")
    total_events: int = Field(default=0, description="事件总数")
    total_word_count: int = Field(default=0, description="总字数")
    
    def update_timestamp(self) -> None:
        """更新时间戳"""
        self.updated_at = datetime.now()
    
    def get_layer(self, layer_num: int) -> Optional[BaseModel]:
        """
        获取指定层的数据
        
        Args:
            layer_num: 层级编号 (0-3)
            
        Returns:
            对应层的数据模型，如果层级无效返回 None
        """
        layers = {
            0: self.layer0,
            1: self.layer1,
            2: self.layer2,
            3: self.layer3,
        }
        return layers.get(layer_num)
    
    def get_main_characters(self) -> list[str]:
        """获取主要角色列表"""
        if self.layer0:
            return self.layer0.main_characters
        return []
    
    def get_character_profile(self, name: str) -> Optional[CharacterProfile]:
        """
        获取指定角色的档案
        
        Args:
            name: 角色名称
            
        Returns:
            角色档案，如果不存在返回 None
        """
        if self.layer2:
            return self.layer2.character_profiles.get(name)
        return None
    
    def get_location_detail(self, name: str) -> Optional[LocationDetail]:
        """
        获取指定地点的详情
        
        Args:
            name: 地点名称
            
        Returns:
            地点详情，如果不存在返回 None
        """
        if self.layer2:
            return self.layer2.location_details.get(name)
        return None
    
    def get_character_relationships(self, character_name: str) -> dict[str, str]:
        """
        获取指定角色的关系网络
        
        Args:
            character_name: 角色名称
            
        Returns:
            关系映射 {目标角色: 关系描述}
        """
        profile = self.get_character_profile(character_name)
        if profile:
            return profile.relationships
        
        if self.layer2:
            return self.layer2.relationship_network.get(character_name, {})
        return {}
    
    def to_summary_dict(self) -> dict:
        """
        生成摘要字典（用于导出）
        
        Returns:
            摘要信息字典
        """
        return {
            "id": self.id,
            "name": self.name,
            "source_file": self.source_file,
            "version": self.version,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "statistics": {
                "total_characters": self.total_characters,
                "total_locations": self.total_locations,
                "total_events": self.total_events,
                "total_word_count": self.total_word_count,
            },
            "layer0_summary": {
                "world_summary": self.layer0.world_summary if self.layer0 else None,
                "main_characters": self.layer0.main_characters if self.layer0 else [],
                "genre": self.layer0.genre if self.layer0 else [],
            }
        }


# ==================== 世界树节点（用于细粒度存储） ====================

class WorldTreeNodeType(str):
    """世界树节点类型"""
    CHARACTER = "character"
    LOCATION = "location"
    EVENT = "event"
    RELATIONSHIP = "relationship"
    RULE = "rule"
    CULTURE = "culture"
    FACTION = "faction"
    ITEM = "item"
    CONCEPT = "concept"


class WorldTreeNode(BaseModel):
    """
    世界树节点
    
    用于细粒度存储和检索的节点结构。
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    node_type: str = Field(..., description="节点类型")
    name: str = Field(..., description="节点名称")
    content: str = Field(default="", description="节点内容")
    layer: int = Field(default=2, ge=0, le=3, description="所属层级")
    
    # 关联
    parent_id: Optional[str] = Field(None, description="父节点ID")
    children_ids: list[str] = Field(default_factory=list, description="子节点ID列表")
    related_ids: list[str] = Field(default_factory=list, description="关联节点ID列表")
    
    # 触发词（用于 World Info）
    trigger_words: list[str] = Field(default_factory=list, description="触发词列表")
    
    # 元数据
    importance: str = Field(default="medium", description="重要性")
    tags: list[str] = Field(default_factory=list, description="标签")
    source_reference: Optional[str] = Field(None, description="原文引用")
    
    def add_trigger_word(self, word: str) -> None:
        """添加触发词"""
        if word and word not in self.trigger_words:
            self.trigger_words.append(word)
    
    def add_child(self, child_id: str) -> None:
        """添加子节点"""
        if child_id and child_id not in self.children_ids:
            self.children_ids.append(child_id)
    
    def add_related(self, related_id: str) -> None:
        """添加关联节点"""
        if related_id and related_id not in self.related_ids:
            self.related_ids.append(related_id)
