"""
内容管理系统模型定义
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional, Dict, Any
import uuid
from enum import Enum


class ContentStatus(str, Enum):
    """内容状态"""
    DRAFT = "draft"
    REVIEW = "review"
    PUBLISHED = "published"
    ARCHIVED = "archived"
    DELETED = "deleted"


class ContentType(str, Enum):
    """内容类型"""
    NOVEL = "novel"
    CHAPTER = "chapter"
    SCENE = "scene"
    CHARACTER = "character"
    WORLD = "world"
    TIMELINE = "timeline"
    RELATIONSHIP = "relationship"
    CONVERSATION = "conversation"
    OUTLINE = "outline"


class ContentMetadata(BaseModel):
    """内容元数据"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str = Field(..., description="内容标题")
    type: ContentType = Field(..., description="内容类型")
    status: ContentStatus = Field(default=ContentStatus.DRAFT, description="内容状态")
    author: Optional[str] = Field(default=None, description="作者")
    tags: List[str] = Field(default_factory=list, description="标签")
    created_at: datetime = Field(default_factory=datetime.now, description="创建时间")
    updated_at: datetime = Field(default_factory=datetime.now, description="更新时间")
    version: int = Field(default=1, description="版本号")
    parent_id: Optional[str] = Field(default=None, description="父内容ID")
    children_ids: List[str] = Field(default_factory=list, description="子内容ID列表")
    session_id: Optional[str] = Field(default=None, description="所绑定的会话/项目ID")


class ContentItem(BaseModel):
    """内容项"""
    metadata: ContentMetadata = Field(..., description="内容元数据")
    content: str = Field(..., description="内容正文")
    extracted_data: Optional[Dict[str, Any]] = Field(default=None, description="提取的数据")
    stats: Optional[Dict[str, Any]] = Field(default=None, description="统计信息")
    relations: Optional[Dict[str, List[str]]] = Field(default=None, description="关系信息")


class ContentSearchRequest(BaseModel):
    """内容搜索请求"""
    # TODO: 将 query 改为 Optional，支持纯 tags 过滤时不传 query 的场景
    query: Optional[str] = Field(default='', description="搜索查询，为空时返回全部")
    content_type: Optional[ContentType] = Field(default=None, description="内容类型")
    tags: Optional[List[str]] = Field(default=None, description="标签")
    status: Optional[ContentStatus] = Field(default=None, description="内容状态")
    session_id: Optional[str] = Field(default=None, description="所属会话ID过滤")
    limit: int = Field(default=20, ge=1, le=500, description="返回数量限制")
    offset: int = Field(default=0, ge=0, description="偏移量")


class ContentSearchResult(BaseModel):
    """内容搜索结果"""
    items: List[ContentItem] = Field(..., description="搜索到的内容项")
    total: int = Field(..., description="总数量")
    page: int = Field(..., description="当前页")
    limit: int = Field(..., description="每页数量")


class ContentExportFormat(str, Enum):
    """内容导出格式"""
    TXT = "txt"
    JSON = "json"
    EPUB = "epub"
    PDF = "pdf"
    SILLYTAVERN = "sillytavern"


class ContentExportRequest(BaseModel):
    """内容导出请求"""
    content_ids: List[str] = Field(..., description="要导出的内容ID列表")
    format: ContentExportFormat = Field(..., description="导出格式")
    options: Optional[Dict[str, Any]] = Field(default=None, description="导出选项")