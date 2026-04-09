"""
内容专用的SQLite数据库存储实现
"""
import sqlite3
import json
import asyncio
from typing import Any, Optional, List, Dict
from pathlib import Path
from datetime import datetime
from contextlib import contextmanager

# 使用绝对导入以避免类型检查问题
from novelforge.storage.base_storage import BaseStorage
from novelforge.content.models import ContentItem, ContentMetadata, ContentType, ContentStatus


class ContentDatabaseStorage(BaseStorage):
    """基于SQLite的内容专用数据库存储实现"""
    
    def __init__(self, db_path: str = "./data/novelforge_content.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()  # 异步安全锁
        self._init_db()
    
    def _init_db(self):
        """初始化数据库表和索引"""
        with self._get_connection() as conn:
            # 创建内容表
            conn.execute('''
                CREATE TABLE IF NOT EXISTS content (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    author TEXT,
                    content TEXT NOT NULL,
                    extracted_data TEXT,
                    stats TEXT,
                    relations TEXT,
                    created_at TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP NOT NULL,
                    version INTEGER NOT NULL DEFAULT 1,
                    parent_id TEXT,
                    children_ids TEXT,
                    session_id TEXT
                )
            ''')
            
            # 添加 session_id 到现有表的容错机制
            try:
                conn.execute('ALTER TABLE content ADD COLUMN session_id TEXT')
            except Exception:
                pass
            
            # 创建标签表（多对多关系）
            conn.execute('''
                CREATE TABLE IF NOT EXISTS tags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    content_id TEXT NOT NULL,
                    tag TEXT NOT NULL,
                    FOREIGN KEY (content_id) REFERENCES content (id) ON DELETE CASCADE
                )
            ''')
            
            # 创建索引优化查询性能
            conn.execute('CREATE INDEX IF NOT EXISTS idx_content_type ON content (type)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_content_status ON content (status)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_content_created ON content (created_at)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_content_updated ON content (updated_at)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_content_parent ON content (parent_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_content_session ON content (session_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_tags_content ON tags (content_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags (tag)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_content_title ON content (title)')
            
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
    
    def _serialize_metadata(self, metadata: ContentMetadata) -> Dict[str, Any]:
        """序列化元数据为字典"""
        return {
            'id': metadata.id,
            'title': metadata.title,
            'type': metadata.type.value,
            'status': metadata.status.value,
            'author': metadata.author,
            'created_at': metadata.created_at.isoformat(),
            'updated_at': metadata.updated_at.isoformat(),
            'version': metadata.version,
            'parent_id': metadata.parent_id,
            'children_ids': json.dumps(metadata.children_ids) if metadata.children_ids else '[]',
            'session_id': metadata.session_id
        }
    
    def _deserialize_metadata(self, data: Dict[str, Any]) -> ContentMetadata:
        """从字典反序列化元数据"""
        return ContentMetadata(
            id=data['id'],
            title=data['title'],
            type=ContentType(data['type']),
            status=ContentStatus(data['status']),
            author=data.get('author'),
            tags=[],  # 标签需要单独查询
            created_at=datetime.fromisoformat(data['created_at']),
            updated_at=datetime.fromisoformat(data['updated_at']),
            version=data.get('version', 1),
            parent_id=data.get('parent_id'),
            children_ids=json.loads(data.get('children_ids', '[]')),
            session_id=data.get('session_id')
        )
    
    def _serialize_content_item(self, content_item: ContentItem) -> Dict[str, Any]:
        """序列化内容项为字典"""
        metadata_dict = self._serialize_metadata(content_item.metadata)
        return {
            **metadata_dict,
            'content': content_item.content,
            'extracted_data': json.dumps(content_item.extracted_data, ensure_ascii=False) if content_item.extracted_data else None,
            'stats': json.dumps(content_item.stats, ensure_ascii=False) if content_item.stats else None,
            'relations': json.dumps(content_item.relations, ensure_ascii=False) if content_item.relations else None
        }
    
    def _deserialize_content_item(self, data: Dict[str, Any], tags: Optional[List[str]] = None) -> ContentItem:
        """从字典反序列化内容项"""
        metadata = self._deserialize_metadata(data)
        if tags is not None:
            metadata.tags = tags
        
        return ContentItem(
            metadata=metadata,
            content=data['content'],
            extracted_data=json.loads(data['extracted_data']) if data.get('extracted_data') else None,
            stats=json.loads(data['stats']) if data.get('stats') else None,
            relations=json.loads(data['relations']) if data.get('relations') else None
        )
    
    async def save_content(self, content_item: ContentItem) -> bool:
        """保存内容项到数据库"""
        try:
            async with self._lock:
                content_dict = self._serialize_content_item(content_item)
                
                with self._get_connection() as conn:
                    # 保存内容
                    conn.execute('''
                        INSERT OR REPLACE INTO content 
                        (id, title, type, status, author, content, extracted_data, stats, relations, 
                         created_at, updated_at, version, parent_id, children_ids, session_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        content_dict['id'],
                        content_dict['title'],
                        content_dict['type'],
                        content_dict['status'],
                        content_dict.get('author'),
                        content_dict['content'],
                        content_dict.get('extracted_data'),
                        content_dict.get('stats'),
                        content_dict.get('relations'),
                        content_dict['created_at'],
                        content_dict['updated_at'],
                        content_dict['version'],
                        content_dict.get('parent_id'),
                        content_dict.get('children_ids'),
                        content_dict.get('session_id')
                    ))
                    
                    # 处理标签
                    # 先删除现有标签
                    conn.execute('DELETE FROM tags WHERE content_id = ?', (content_dict['id'],))
                    
                    # 添加新标签
                    for tag in content_item.metadata.tags:
                        conn.execute('INSERT INTO tags (content_id, tag) VALUES (?, ?)', 
                                   (content_dict['id'], tag))
                    
                    conn.commit()
                return True
        except Exception as e:
            print(f"保存内容失败: {e}")
            return False
    
    async def load_content(self, content_id: str) -> Optional[ContentItem]:
        """从数据库加载内容项"""
        try:
            with self._get_connection() as conn:
                # 获取内容
                cursor = conn.execute('SELECT * FROM content WHERE id = ?', (content_id,))
                content_row = cursor.fetchone()
                if not content_row:
                    return None
                
                # 获取标签
                tag_cursor = conn.execute('SELECT tag FROM tags WHERE content_id = ?', (content_id,))
                tags = [row['tag'] for row in tag_cursor.fetchall()]
                
                content_item = self._deserialize_content_item(dict(content_row), tags)
                return content_item
        except Exception as e:
            print(f"加载内容失败: {e}")
            return None
    
    async def delete_content(self, content_id: str) -> bool:
        """从数据库删除内容项"""
        try:
            async with self._lock:
                with self._get_connection() as conn:
                    # SQLite的CASCADE会自动删除相关标签
                    cursor = conn.execute('DELETE FROM content WHERE id = ?', (content_id,))
                    conn.commit()
                    return cursor.rowcount > 0
        except Exception as e:
            print(f"删除内容失败: {e}")
            return False

    async def delete_content_by_session(self, session_id: str) -> int:
        """物理删除指定会话的所有内容"""
        try:
            async with self._lock:
                with self._get_connection() as conn:
                    # 获取该 session 的所有 content_id，以便触发 tags 级联（如果没配外键级联）
                    # 实际上上面 init_db 已经配了 FOREIGN KEY ... ON DELETE CASCADE
                    cursor = conn.execute('DELETE FROM content WHERE session_id = ?', (session_id,))
                    count = cursor.rowcount
                    conn.commit()
                    return count
        except Exception as e:
            print(f"批量删除会话内容失败: {e}")
            return 0
    
    async def search_content(
        self, 
        query: Optional[str] = None,
        content_type: Optional[ContentType] = None,
        tags: Optional[List[str]] = None,
        status: Optional[ContentStatus] = None,
        session_id: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> Dict[str, Any]:
        """高效搜索内容"""
        try:
            with self._get_connection() as conn:
                # 构建查询条件
                conditions = []
                params = []
                
                if content_type:
                    conditions.append("type = ?")
                    params.append(content_type.value)
                
                if status:
                    conditions.append("status = ?")
                    params.append(status.value)
                
                if session_id:
                    conditions.append("session_id = ?")
                    params.append(session_id)
                
                if query:
                    conditions.append("title LIKE ?")
                    params.append(f"%{query}%")
                
                where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
                
                # 处理标签查询（如果需要所有指定标签）
                if tags:
                    # 使用子查询确保包含所有指定标签
                    tag_conditions = " AND ".join([f"EXISTS (SELECT 1 FROM tags t{i} WHERE t{i}.content_id = c.id AND t{i}.tag = ?)" 
                                                  for i, _ in enumerate(tags)])
                    if where_clause:
                        where_clause += f" AND {tag_conditions}"
                    else:
                        where_clause = f"WHERE {tag_conditions}"
                    params.extend(tags)
                
                # 计算总数
                count_query = f"SELECT COUNT(*) as total FROM content c {where_clause}"
                count_cursor = conn.execute(count_query, params)
                total = count_cursor.fetchone()['total']
                
                # 获取分页结果
                base_query = f"""
                    SELECT c.* FROM content c
                    {where_clause}
                    ORDER BY c.updated_at DESC
                    LIMIT ? OFFSET ?
                """
                params.append(limit)
                params.append(offset)
                
                cursor = conn.execute(base_query, params)
                rows = cursor.fetchall()
                
                # 获取每个内容的标签
                results = []
                for row in rows:
                    content_id = row['id']
                    tag_cursor = conn.execute('SELECT tag FROM tags WHERE content_id = ?', (content_id,))
                    item_tags = [tag_row['tag'] for tag_row in tag_cursor.fetchall()]
                    content_item = self._deserialize_content_item(dict(row), item_tags)
                    results.append(content_item)
                
                return {
                    'items': results,
                    'total': total
                }
        except Exception as e:
            print(f"搜索内容失败: {e}")
            return {'items': [], 'total': 0}
    
    async def list_content_by_type(
        self, 
        content_type: ContentType, 
        status: Optional[ContentStatus] = None,
        session_id: Optional[str] = None
    ) -> List[ContentItem]:
        """按类型列出内容"""
        try:
            with self._get_connection() as conn:
                conditions = ["type = ?"]
                params = [content_type.value]
                
                if status:
                    conditions.append("status = ?")
                    params.append(status.value)
                if session_id:
                    conditions.append("session_id = ?")
                    params.append(session_id)
                
                where_clause = " WHERE " + " AND ".join(conditions)
                cursor = conn.execute(
                    f'SELECT * FROM content{where_clause} ORDER BY updated_at DESC',
                    tuple(params)
                )
                
                rows = cursor.fetchall()
                results = []
                for row in rows:
                    content_id = row['id']
                    tag_cursor = conn.execute('SELECT tag FROM tags WHERE content_id = ?', (content_id,))
                    tags = [tag_row['tag'] for tag_row in tag_cursor.fetchall()]
                    content_item = self._deserialize_content_item(dict(row), tags)
                    results.append(content_item)
                
                return results
        except Exception as e:
            print(f"列出内容失败: {e}")
            return []
    
    async def get_content_stats(self) -> Dict[str, Any]:
        """获取内容统计信息"""
        try:
            with self._get_connection() as conn:
                # 总内容数
                cursor = conn.execute('SELECT COUNT(*) as total FROM content')
                total = cursor.fetchone()['total']
                
                # 按类型统计
                type_cursor = conn.execute('SELECT type, COUNT(*) as count FROM content GROUP BY type')
                type_counts = {row['type']: row['count'] for row in type_cursor.fetchall()}
                
                # 按状态统计
                status_cursor = conn.execute('SELECT status, COUNT(*) as count FROM content GROUP BY status')
                status_counts = {row['status']: row['count'] for row in status_cursor.fetchall()}
                
                # 标签统计
                tag_cursor = conn.execute('SELECT tag, COUNT(*) as count FROM tags GROUP BY tag ORDER BY count DESC LIMIT 50')
                tag_counts = {row['tag']: row['count'] for row in tag_cursor.fetchall()}
                
                return {
                    'total_contents': total,
                    'type_counts': type_counts,
                    'status_counts': status_counts,
                    'tag_counts': tag_counts,
                    'updated_at': datetime.now().isoformat()
                }
        except Exception as e:
            print(f"获取统计信息失败: {e}")
            return {}
    
    # 以下方法是为了兼容BaseStorage接口
    async def save(self, key: str, data: Any) -> bool:
        """通用保存方法（不推荐用于内容存储）"""
        return False
    
    async def load(self, key: str) -> Optional[Any]:
        """通用加载方法（不推荐用于内容存储）"""
        return None
    
    async def delete(self, key: str) -> bool:
        """通用删除方法（不推荐用于内容存储）"""
        return False
    
    async def list_keys(self) -> List[str]:
        """列出所有键（不推荐用于内容存储）"""
        return []
    
    async def exists(self, key: str) -> bool:
        """检查键是否存在（不推荐用于内容存储）"""
        return False