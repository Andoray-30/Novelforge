"""
基础存储接口定义
"""
from abc import ABC, abstractmethod
from typing import Any, Optional, List, Dict
import json
import os
from pathlib import Path


class BaseStorage(ABC):
    """基础存储接口"""

    @abstractmethod
    async def save(self, key: str, data: Any) -> bool:
        """保存数据"""
        pass

    @abstractmethod
    async def load(self, key: str) -> Optional[Any]:
        """加载数据"""
        pass

    @abstractmethod
    async def delete(self, key: str) -> bool:
        """删除数据"""
        pass

    @abstractmethod
    async def list_keys(self) -> List[str]:
        """列出所有键"""
        pass

    @abstractmethod
    async def exists(self, key: str) -> bool:
        """检查键是否存在"""
        pass