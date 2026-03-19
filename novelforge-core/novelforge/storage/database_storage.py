"""
数据库存储实现
"""
import sqlite3
import json
import threading
from typing import Any, Optional, List
from pathlib import Path
from datetime import datetime
from contextlib import contextmanager
from .base_storage import BaseStorage


class DatabaseStorage(BaseStorage):
    """基于SQLite的数据库存储实现"""
    
    def __init__(self, db_path: str = "./data/novelforge.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()  # 线程安全锁
        self._init_db()
    
    def _init_db(self):
        """初始化数据库表"""
        with self._get_connection() as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS storage (
                    key TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            conn.commit()
    
    @contextmanager
    def _get_connection(self):
        """获取数据库连接的上下文管理器"""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row  # 使结果可以像字典一样访问
        try:
            yield conn
        finally:
            conn.close()
    
    async def save(self, key: str, data: Any) -> bool:
        """保存数据到数据库"""
        try:
            with self._lock:
                data_str = json.dumps(data, ensure_ascii=False)
                with self._get_connection() as conn:
                    conn.execute('''
                        INSERT OR REPLACE INTO storage (key, data, updated_at)
                        VALUES (?, ?, CURRENT_TIMESTAMP)
                    ''', (key, data_str))
                    conn.commit()
                return True
        except Exception as e:
            print(f"保存数据失败: {e}")
            return False
    
    async def load(self, key: str) -> Optional[Any]:
        """从数据库加载数据"""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute('SELECT data FROM storage WHERE key = ?', (key,))
                row = cursor.fetchone()
                if row:
                    return json.loads(row['data'])
                return None
        except Exception as e:
            print(f"加载数据失败: {e}")
            return None
    
    async def delete(self, key: str) -> bool:
        """从数据库删除数据"""
        try:
            with self._lock:
                with self._get_connection() as conn:
                    cursor = conn.execute('DELETE FROM storage WHERE key = ?', (key,))
                    conn.commit()
                    return cursor.rowcount > 0
        except Exception as e:
            print(f"删除数据失败: {e}")
            return False
    
    async def list_keys(self) -> List[str]:
        """列出所有数据键"""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute('SELECT key FROM storage')
                rows = cursor.fetchall()
                return [row['key'] for row in rows]
        except Exception as e:
            print(f"列出键失败: {e}")
            return []
    
    async def exists(self, key: str) -> bool:
        """检查键是否存在"""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute('SELECT 1 FROM storage WHERE key = ? LIMIT 1', (key,))
                return cursor.fetchone() is not None
        except Exception as e:
            print(f"检查键存在性失败: {e}")
            return False