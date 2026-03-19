"""
Type definitions for NovelForge API
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime
import uuid
from enum import Enum

class NovelType(str, Enum):
    FANTASY = "fantasy"
    SCIENCE_FICTION = "science_fiction"
    ROMANCE = "romance"
    MYSTERY = "mystery"
    HISTORICAL = "historical"
    WUXIA = "wuxia"

class LengthType(str, Enum):
    SHORT = "short"
    MEDIUM = "medium"
    LONG = "long"

class TargetAudience(str, Enum):
    GENERAL = "general"
    YOUNG_ADULT = "young_adult"
    ADULT = "adult"

class PlotPosition(str, Enum):
    BEGINNING = "beginning"
    DEVELOPMENT = "development"
    CLIMAX = "climax"
    ENDING = "ending"

class ImportanceLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

# 请求模型
class StoryOutlineParams(BaseModel):
    novel_type: NovelType = Field(..., description="小说类型")
    theme: str = Field(..., min_length=1, max_length=500, description="故事主题")
    length: LengthType = Field(default=LengthType.MEDIUM, description="预期长度")
    constraints: Optional[List[str]] = Field(default=None, description="创作约束条件")
    target_audience: TargetAudience = Field(default=TargetAudience.GENERAL, description="目标受众")

class CharacterDesignRequest(BaseModel):
    context: str = Field(..., min_length=1, max_length=2000, description="故事背景信息")
    roles: List[str] = Field(..., min_items=1, max_items=10, description="角色职责列表")

class WorldBuildingRequest(BaseModel):
    story_outline: dict = Field(..., description="故事架构信息")

# 响应模型
class PlotPoint(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str = Field(..., min_length=1, max_length=100)
    description: str = Field(..., min_length=1, max_length=500)
    position: PlotPosition
    importance: ImportanceLevel

class CharacterRole(BaseModel):
    role: str = Field(..., description="角色类型 (protagonist, antagonist, supporting, mentor, love_interest)")
    name: str = Field(..., min_length=1, max_length=50)
    description: str = Field(..., min_length=1, max_length=500)
    keyTraits: List[str] = Field(default_factory=list, max_items=10)
    background: str = Field(default="", max_length=1000)
    relationships: List[str] = Field(default_factory=list)

class StoryOutline(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str = Field(..., min_length=1, max_length=200)
    genre: str = Field(..., description="故事类型")
    theme: str = Field(..., description="故事主题")
    plotPoints: List[PlotPoint]
    characterRoles: List[CharacterRole]
    worldElements: List[str] = Field(default_factory=list)
    tone: str = Field(default="neutral", description="故事基调")
    targetAudience: str = Field(default="general")
    createdAt: datetime = Field(default_factory=datetime.now)
    updatedAt: datetime = Field(default_factory=datetime.now)

class CharacterArc(BaseModel):
    current_belief: str = Field(default="")
    target_truth: str = Field(default="")
    transformation_steps: List[dict] = Field(default_factory=list)
    setbacks: List[dict] = Field(default_factory=list)

class CharacterDesign(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    role: str = Field(..., description="角色职责")
    description: str = Field(..., min_length=1, max_length=500)
    personality: str = Field(default="", max_length=500)
    background: str = Field(default="", max_length=1000)
    keyTraits: List[str] = Field(default_factory=list, max_items=10)
    relationships: dict = Field(default_factory=dict)
    arc: CharacterArc = Field(default_factory=CharacterArc)

class Location(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    type: str = Field(..., description="地点类型")
    description: str = Field(..., min_length=1, max_length=500)
    geography: Optional[str] = Field(default=None, max_length=500)
    culture: Optional[str] = Field(default=None, max_length=500)
    history: Optional[str] = Field(default=None, max_length=500)
    notable_features: List[str] = Field(default_factory=list)

class Culture(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(..., min_length=1, max_length=500)
    beliefs: List[str] = Field(default_factory=list)
    values: List[str] = Field(default_factory=list)
    customs: List[str] = Field(default_factory=list)

class WorldRule(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(..., min_length=1, max_length=500)
    category: str = Field(..., description="规则类别")
    importance: ImportanceLevel = Field(default=ImportanceLevel.MEDIUM)

class WorldSetting(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(..., min_length=1, max_length=1000)
    geography: str = Field(default="", max_length=1000)
    social_structure: str = Field(default="", max_length=1000)
    culture: str = Field(default="", max_length=1000)
    technology_magic: str = Field(default="", max_length=1000)
    history: str = Field(default="", max_length=2000)
    core_conflicts: List[str] = Field(default_factory=list)
    locations: List[Location] = Field(default_factory=list)
    cultures: List[Culture] = Field(default_factory=list)
    rules: List[WorldRule] = Field(default_factory=list)

# 错误响应模型
class ErrorResponse(BaseModel):
    error: str = Field(..., description="错误信息")
    detail: Optional[str] = Field(default=None, description="详细错误信息")
    timestamp: datetime = Field(default_factory=datetime.now)


# AI对话创作相关模型
class Message(BaseModel):
    """对话消息"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: str = Field(..., description="角色: user, assistant, system")
    content: str = Field(..., min_length=1, description="消息内容")
    timestamp: datetime = Field(default_factory=datetime.now)


class Conversation(BaseModel):
    """对话会话"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str = Field(default="新对话", description="对话标题")
    messages: List[Message] = Field(default_factory=list, description="消息列表")
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    metadata: dict = Field(default_factory=dict, description="元数据")


class ChatRequest(BaseModel):
    """聊天请求"""
    conversation_id: Optional[str] = Field(None, description="对话ID，为空则创建新对话")
    message: str = Field(..., min_length=1, max_length=5000, description="用户消息")
    context: Optional[dict] = Field(default=None, description="上下文信息")
    settings: Optional[dict] = Field(default=None, description="生成设置")


class ChatResponse(BaseModel):
    """聊天响应"""
    conversation_id: str = Field(..., description="对话ID")
    message: Message = Field(..., description="AI回复消息")
    context: Optional[dict] = Field(default=None, description="上下文信息")
    suggestions: List[str] = Field(default_factory=list, description="建议回复")


# 新剧情生成相关模型
class GenerationRequest(BaseModel):
    """内容生成请求"""
    prompt: str = Field(..., min_length=1, max_length=5000, description="生成提示")
    context: dict = Field(default_factory=dict, description="上下文信息")
    length: Optional[int] = Field(default=500, ge=100, le=5000, description="生成长度")
    style: Optional[str] = Field(default="neutral", description="写作风格")
    temperature: Optional[float] = Field(default=0.7, ge=0.0, le=1.0, description="创造性")
    extract_info: Optional[dict] = Field(default=None, description="提取的信息")


class GenerationResult(BaseModel):
    """内容生成结果"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    content: str = Field(..., description="生成的内容")
    quality_score: float = Field(ge=0.0, le=1.0, description="质量评分")
    extracted_elements: Optional[dict] = Field(default=None, description="提取的元素")
    created_at: datetime = Field(default_factory=datetime.now)
    metrics: dict = Field(default_factory=dict, description="生成指标")


class NovelGenerationRequest(BaseModel):
    """小说生成请求"""
    story_context: dict = Field(..., description="故事上下文")
    generation_type: str = Field(default="continuation", description="生成类型: continuation, character_focus, plot_twist, scene")
    target_length: int = Field(default=1000, ge=200, le=10000, description="目标长度")
    focus_on: Optional[List[str]] = Field(default=None, description="关注点")
    exclude_elements: Optional[List[str]] = Field(default=None, description="排除元素")


class NovelGenerationResult(BaseModel):
    """小说生成结果"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    generated_text: str = Field(..., description="生成的文本")
    extracted_characters: List[dict] = Field(default_factory=list, description="生成的字符")
    extracted_events: List[dict] = Field(default_factory=list, description="生成的事件")
    quality_metrics: dict = Field(default_factory=dict, description="质量指标")
    timeline: List[dict] = Field(default_factory=list, description="时间线")
    relationships: List[dict] = Field(default_factory=list, description="关系")
    created_at: datetime = Field(default_factory=datetime.now)


# AI调度系统相关模型
class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AITask(BaseModel):
    """AI任务模型"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str = Field(..., description="任务类型")
    status: TaskStatus = Field(default=TaskStatus.PENDING)
    priority: TaskPriority = Field(default=TaskPriority.MEDIUM)
    parameters: dict = Field(default_factory=dict, description="任务参数")
    created_at: datetime = Field(default_factory=datetime.now)
    started_at: Optional[datetime] = Field(default=None)
    completed_at: Optional[datetime] = Field(default=None)
    result: Optional[dict] = Field(default=None)
    error: Optional[str] = Field(default=None)


class TaskQueueRequest(BaseModel):
    """任务队列请求"""
    task_type: str = Field(..., description="任务类型")
    parameters: dict = Field(default_factory=dict, description="任务参数")
    priority: TaskPriority = Field(default=TaskPriority.MEDIUM)


class TaskQueueResponse(BaseModel):
    """任务队列响应"""
    task_id: str = Field(..., description="任务ID")
    status: TaskStatus = Field(..., description="任务状态")
    message: str = Field(..., description="状态消息")