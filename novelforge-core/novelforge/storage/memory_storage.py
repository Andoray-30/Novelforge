"""
内存存储实现
"""
from typing import Any, Optional, List
from .base_storage import BaseStorage


class MemoryStorage(BaseStorage):
    """基于内存的存储实现"""
    
    def __init__(self):
        self._storage = {}
    
    async def save(self, key: str, data: Any) -> bool:
        """保存数据到内存"""
        try:
            self._storage[key] = data
            return True
        except Exception:
            return False
    
    async def load(self, key: str) -> Optional[Any]:
        """从内存加载数据"""
        return self._storage.get(key)
    
    async def delete(self, key: str) -> bool:
        """从内存删除数据"""
        if key in self._storage:
            del self._storage[key]
            return True
        return False
    
    async def list_keys(self) -> List[str]:
        """列出所有数据键"""
        return list(self._storage.keys())
    
    async def exists(self, key: str) -> bool:
        """检查键是否存在"""
        return key in self._storage