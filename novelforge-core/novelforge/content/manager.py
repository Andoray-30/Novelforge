"""
内容管理系统实现
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
import json
from novelforge.storage.storage_manager import StorageManager
from .models import ContentItem, ContentMetadata, ContentSearchRequest, ContentSearchResult, ContentExportRequest


class ContentManager:
    """内容管理系统"""
    
    def __init__(self, storage_manager: StorageManager):
        self.storage = storage_manager
    
    async def create_content(self, content_item: ContentItem) -> str:
        """创建新内容"""
        content_id = content_item.metadata.id
        content_item.metadata.created_at = datetime.now()
        content_item.metadata.updated_at = datetime.now()
        
        # 保存内容
        await self.storage.save(f"content_{content_id}", content_item.model_dump())
        
        # 创建索引项
        index_item = {
            "id": content_id,
            "title": content_item.metadata.title,
            "type": content_item.metadata.type,
            "status": content_item.metadata.status,
            "tags": content_item.metadata.tags,
            "created_at": content_item.metadata.created_at.isoformat(),
            "updated_at": content_item.metadata.updated_at.isoformat(),
            "parent_id": content_item.metadata.parent_id
        }
        await self.storage.save(f"index_{content_id}", index_item)
        
        # 更新标签索引
        for tag in content_item.metadata.tags:
            await self._add_to_tag_index(content_id, tag)
        
        return content_id
    
    async def update_content(self, content_id: str, content_item: ContentItem) -> bool:
        """更新内容"""
        existing = await self.get_content(content_id)
        if not existing:
            return False
        
        # 保持原始创建时间
        content_item.metadata.created_at = existing.metadata.created_at
        content_item.metadata.updated_at = datetime.now()
        
        # 删除旧的标签索引
        for tag in existing.metadata.tags:
            await self._remove_from_tag_index(content_id, tag)
        
        # 保存内容
        await self.storage.save(f"content_{content_id}", content_item.model_dump())
        
        # 更新索引项
        index_item = {
            "id": content_id,
            "title": content_item.metadata.title,
            "type": content_item.metadata.type,
            "status": content_item.metadata.status,
            "tags": content_item.metadata.tags,
            "created_at": content_item.metadata.created_at.isoformat(),
            "updated_at": content_item.metadata.updated_at.isoformat(),
            "parent_id": content_item.metadata.parent_id
        }
        await self.storage.save(f"index_{content_id}", index_item)
        
        # 更新标签索引
        for tag in content_item.metadata.tags:
            await self._add_to_tag_index(content_id, tag)
        
        return True
    
    async def get_content(self, content_id: str) -> Optional[ContentItem]:
        """获取内容"""
        data = await self.storage.load(f"content_{content_id}")
        if data:
            return ContentItem(**data)
        return None
    
    async def delete_content(self, content_id: str) -> bool:
        """删除内容"""
        content = await self.get_content(content_id)
        if not content:
            return False
        
        # 删除内容和索引
        await self.storage.delete(f"content_{content_id}")
        await self.storage.delete(f"index_{content_id}")
        
        # 删除标签索引
        for tag in content.metadata.tags:
            await self._remove_from_tag_index(content_id, tag)
        
        return True
    
    async def search_content(self, request: ContentSearchRequest) -> ContentSearchResult:
        """搜索内容"""
        all_keys = await self.storage.list_keys()
        
        # 获取所有索引项
        index_keys = [key for key in all_keys if key.startswith("index_")]
        results = []
        
        for key in index_keys:
            index_data = await self.storage.load(key)
            if not index_data:
                continue
            
            # 检查筛选条件
            if request.content_type and index_data["type"] != request.content_type:
                continue
            if request.status and index_data["status"] != request.status:
                continue
            if request.tags:
                # 检查是否包含所有指定的标签
                has_all_tags = all(tag in index_data["tags"] for tag in request.tags)
                if not has_all_tags:
                    continue
            
            # 检查标题是否匹配查询
            if request.query and request.query.lower() not in index_data["title"].lower():
                continue
            
            # 获取完整内容
            content_id = index_data["id"]
            content = await self.get_content(content_id)
            if content:
                results.append(content)
        
        # 分页处理
        total = len(results)
        start = request.offset
        end = start + request.limit
        paginated_results = results[start:end]
        
        return ContentSearchResult(
            items=paginated_results,
            total=total,
            page=request.offset // request.limit + 1 if request.limit > 0 else 1,
            limit=request.limit
        )
    
    async def list_content_by_type(self, content_type: str, status: Optional[str] = None) -> List[ContentItem]:
        """按类型列出内容"""
        all_keys = await self.storage.list_keys()
        
        # 获取所有索引项
        index_keys = [key for key in all_keys if key.startswith("index_")]
        results = []
        
        for key in index_keys:
            index_data = await self.storage.load(key)
            if not index_data:
                continue
            
            # 检查类型和状态
            if index_data["type"] != content_type:
                continue
            if status and index_data["status"] != status:
                continue
            
            # 获取完整内容
            content_id = index_data["id"]
            content = await self.get_content(content_id)
            if content:
                results.append(content)
        
        return results
    
    async def export_content(self, request: ContentExportRequest) -> bytes:
        """导出内容"""
        contents = []
        for content_id in request.content_ids:
            content = await self.get_content(content_id)
            if content:
                contents.append(content)
        
        # 根据格式导出
        if request.format == "json":
            export_data = [content.model_dump() for content in contents]
            return json.dumps(export_data, ensure_ascii=False, indent=2).encode('utf-8')
        elif request.format == "txt":
            # 简单的文本导出
            text_parts = []
            for content in contents:
                text_parts.append(f"标题: {content.metadata.title}")
                text_parts.append(f"类型: {content.metadata.type}")
                text_parts.append(f"内容: {content.content}")
                text_parts.append("-" * 50)
            return "\n".join(text_parts).encode('utf-8')
        else:
            # 其他格式可扩展
            export_data = [content.model_dump() for content in contents]
            return json.dumps(export_data, ensure_ascii=False, indent=2).encode('utf-8')
    
    async def _add_to_tag_index(self, content_id: str, tag: str):
        """添加内容到标签索引"""
        key = f"tagindex_{tag}"
        index = await self.storage.load(key) or []
        if content_id not in index:
            index.append(content_id)
            await self.storage.save(key, index)
    
    async def _remove_from_tag_index(self, content_id: str, tag: str):
        """从标签索引移除内容"""
        key = f"tagindex_{tag}"
        index = await self.storage.load(key) or []
        if content_id in index:
            index.remove(content_id)
            await self.storage.save(key, index)
    
    async def get_content_stats(self) -> Dict[str, Any]:
        """获取内容统计"""
        all_keys = await self.storage.list_keys()
        
        # 计算不同类型和状态的内容数量
        type_counts = {}
        status_counts = {}
        tag_counts = {}
        
        index_keys = [key for key in all_keys if key.startswith("index_")]
        
        for key in index_keys:
            index_data = await self.storage.load(key)
            if not index_data:
                continue
            
            # 统计类型
            content_type = index_data.get("type")
            if content_type:
                type_counts[content_type] = type_counts.get(content_type, 0) + 1
            
            # 统计状态
            status = index_data.get("status")
            if status:
                status_counts[status] = status_counts.get(status, 0) + 1
            
            # 统计标签
            tags = index_data.get("tags", [])
            for tag in tags:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
        
        return {
            "total_contents": len(index_keys),
            "type_counts": type_counts,
            "status_counts": status_counts,
            "tag_counts": tag_counts,
            "updated_at": datetime.now().isoformat()
        }