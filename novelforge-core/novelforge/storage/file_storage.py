"""
文件存储实现
"""
import json
import os
import logging
from pathlib import Path
from typing import Any, Optional, List
from .base_storage import BaseStorage

# 设置日志
logger = logging.getLogger(__name__)


class FileStorage(BaseStorage):
    """基于文件系统的存储实现"""
    
    def __init__(self, storage_dir: str = "./data"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
    
    def _get_file_path(self, key: str) -> Path:
        """获取键对应的文件路径"""
        # 对键进行安全处理，避免路径遍历攻击
        if not key or not isinstance(key, str):
            raise ValueError("Key must be a non-empty string")
        
        # 移除危险字符，只保留字母、数字、点、下划线、连字符和空格
        safe_key = "".join(c for c in key if c.isalnum() or c in "._- ")
        if not safe_key:
            raise ValueError("Key contains no valid characters after sanitization")
        
        # 确保不会发生路径遍历
        file_path = self.storage_dir / f"{safe_key}.json"
        if not str(file_path.resolve()).startswith(str(self.storage_dir.resolve())):
            raise ValueError("Invalid key that would cause path traversal")
        
        return file_path
    
    async def save(self, key: str, data: Any) -> bool:
        """保存数据到文件"""
        try:
            file_path = self._get_file_path(key)
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            logger.error(f"保存数据失败 (key: {key}): {e}")
            return False
    
    async def load(self, key: str) -> Optional[Any]:
        """从文件加载数据"""
        try:
            file_path = self._get_file_path(key)
            if not file_path.exists():
                return None
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"加载数据失败 (key: {key}): {e}")
            return None
    
    async def delete(self, key: str) -> bool:
        """删除数据文件"""
        try:
            file_path = self._get_file_path(key)
            if file_path.exists():
                file_path.unlink()
                return True
            return False
        except Exception as e:
            logger.error(f"删除数据失败 (key: {key}): {e}")
            return False
    
    async def list_keys(self) -> List[str]:
        """列出所有数据键"""
        try:
            keys = []
            for file_path in self.storage_dir.glob("*.json"):
                key = file_path.stem  # 移除扩展名
                keys.append(key)
            return keys
        except Exception as e:
            logger.error(f"列出键失败: {e}")
            return []
    
    async def exists(self, key: str) -> bool:
        """检查键是否存在"""
        try:
            file_path = self._get_file_path(key)
            return file_path.exists()
        except Exception as e:
            logger.error(f"检查键存在性失败 (key: {key}): {e}")
            return False