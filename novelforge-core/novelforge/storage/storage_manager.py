"""
存储管理器
统一管理不同类型的存储策略
"""
from typing import Any, Optional, List, Literal, Union
from .base_storage import BaseStorage
from .file_storage import FileStorage
from .memory_storage import MemoryStorage
from .database_storage import DatabaseStorage
from .content_database_storage import ContentDatabaseStorage


class StorageManager:
    """存储管理器 - 统一管理不同存储策略"""
    
    def __init__(self, default_storage: Literal["file", "memory", "database", "content_db"] = "file"):
        self._storages = {
            "file": FileStorage(),
            "memory": MemoryStorage(),
            "database": DatabaseStorage(),
            "content_db": ContentDatabaseStorage()
        }
        self._default_storage = default_storage
        
    def get_storage(self, storage_type: Optional[Literal["file", "memory", "database", "content_db"]] = None) -> BaseStorage:
        """获取指定类型的存储实例"""
        if storage_type is None:
            storage_type = self._default_storage
        
        if storage_type not in self._storages:
            raise ValueError(f"Invalid storage type: {storage_type}. Valid types are: file, memory, database, content_db")
        
        return self._storages[storage_type]
    
    async def save(self, key: str, data: Any, storage_type: Optional[Literal["file", "memory", "database", "content_db"]] = None) -> bool:
        """保存数据到指定存储"""
        storage = self.get_storage(storage_type)
        return await storage.save(key, data)
    
    async def load(self, key: str, storage_type: Optional[Literal["file", "memory", "database", "content_db"]] = None) -> Optional[Any]:
        """从指定存储加载数据"""
        storage = self.get_storage(storage_type)
        return await storage.load(key)
    
    async def delete(self, key: str, storage_type: Optional[Literal["file", "memory", "database", "content_db"]] = None) -> bool:
        """从指定存储删除数据"""
        storage = self.get_storage(storage_type)
        return await storage.delete(key)
    
    async def list_keys(self, storage_type: Optional[Literal["file", "memory", "database", "content_db"]] = None) -> List[str]:
        """列出指定存储的所有键"""
        storage = self.get_storage(storage_type)
        return await storage.list_keys()
    
    async def exists(self, key: str, storage_type: Optional[Literal["file", "memory", "database", "content_db"]] = None) -> bool:
        """检查键在指定存储中是否存在"""
        storage = self.get_storage(storage_type)
        return await storage.exists(key)
    
    async def migrate(self, key: str, from_type: Literal["file", "memory", "database", "content_db"], to_type: Literal["file", "memory", "database", "content_db"]) -> bool:
        """迁移数据在不同存储类型间"""
        from_storage = self.get_storage(from_type)
        to_storage = self.get_storage(to_type)
        
        data = await from_storage.load(key)
        if data is not None:
            success = await to_storage.save(key, data)
            if success:
                await from_storage.delete(key)
            return success
        return False
    
    def get_content_storage(self) -> ContentDatabaseStorage:
        """获取内容专用数据库存储实例"""
        return self._storages["content_db"]