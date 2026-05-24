"""
AI调度系统 - 管理和调度AI任务的执行
"""
import asyncio
import time
import logging
import sys
import os
from typing import Dict, List, Optional, Callable, Any
from datetime import datetime
from enum import Enum
from dataclasses import dataclass
import uuid
import re
from .ai_service import AIService
from ..storage.storage_manager import StorageManager
from ..core.config import Config

logger = logging.getLogger(__name__)
# 确保日志级别足够显示信息，并添加处理器
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

class TaskStatus(str, Enum):
    """任务状态枚举"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskPriority(int, Enum):
    """任务优先级枚举"""
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4


@dataclass
class Task:
    """AI任务数据类"""
    id: str
    type: str
    status: TaskStatus
    priority: TaskPriority
    parameters: Dict[str, Any]
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    progress: float = 0.0
    message: str = ""
    user_id: Optional[str] = None  # 支持多用户


class AITaskScheduler:
    """AI任务调度器"""
    
    def __init__(self, ai_service: AIService, storage_manager: StorageManager, config: Config, content_manager: Any = None):
        self.ai_service = ai_service
        self.storage = storage_manager
        self.config = config
        self.content_manager = content_manager
        self.tasks: Dict[str, Task] = {}
        self.queue: List[Task] = []
        self.running_tasks: List[Task] = []
        self.running_handles: Dict[str, asyncio.Task[Any]] = {}
        self.max_concurrent_tasks = config.max_concurrent_tasks if hasattr(config, 'max_concurrent_tasks') else 3
        self.is_running = False
        self._event_loop = None
        
    async def start(self):
        """启动调度器"""
        self.is_running = True
        self._event_loop = asyncio.get_event_loop()
        
        # 加载历史待处理任务
        await self._load_pending_tasks()
        
        asyncio.create_task(self._run_scheduler())
        logger.info(f"AI Task Scheduler started with {len(self.queue)} pending tasks.")
        
    async def stop(self):
        """停止调度器"""
        self.is_running = False
        logger.info("AI Task Scheduler stopped.")
        
    async def _run_scheduler(self):
        """调度器主循环"""
        logger.info("Scheduler loop started ticking...")
        while self.is_running:
            await self._process_queue()
            await asyncio.sleep(1)  # 每秒检查一次队列
            
    async def _process_queue(self):
        """处理任务队列"""
        if len(self.running_tasks) >= self.max_concurrent_tasks:
            # logger.info(f"Max concurrency reached ({len(self.running_tasks)}/{self.max_concurrent_tasks})")
            return  # 已达到最大并发数
            
        if not self.queue:
            return

        print(f"Checking queue: {len(self.queue)} tasks total.")
        # 按优先级排序队列
        self.queue.sort(key=lambda x: x.priority.value, reverse=True)
        
        # 选择待执行的任务
        ready_tasks = [task for task in self.queue if task.status == TaskStatus.PENDING]
        ready_tasks.sort(key=lambda x: x.priority.value, reverse=True)
        
        # 执行任务直到达到最大并发数或没有更多任务
        while (len(self.running_tasks) < self.max_concurrent_tasks and 
               ready_tasks and 
               len(ready_tasks) > 0):
            
            task = ready_tasks[0]
            self.queue.remove(task)
            
            # 更新任务状态
            task.status = TaskStatus.RUNNING
            task.started_at = datetime.now()
            self.running_tasks.append(task)
            
            # 保存任务状态到存储
            await self._save_task(task)
            
            # 异步执行任务
            task_handle = asyncio.create_task(self._execute_task(task))
            self.running_handles[task.id] = task_handle
            
            # 重新获取待处理任务列表
            ready_tasks = [task for task in self.queue if task.status == TaskStatus.PENDING]
            ready_tasks.sort(key=lambda x: x.priority.value, reverse=True)
    
    async def _execute_task(self, task: Task):
        """执行单个任务"""
        rate_limit_retries = 0
        max_rate_limit_retries = max(getattr(self.config, "max_retries", 3), 3)
        while True: # 增加重试循环以应对 429
            try:
                # 执行任务
                if task.status == TaskStatus.CANCELLED:
                    if not task.completed_at:
                        task.completed_at = datetime.now()
                    if not task.message:
                        task.message = "Task cancelled."
                    break

                handler = self._get_task_handler(task.type)
                result = await handler(task)

                if task.status == TaskStatus.CANCELLED:
                    if not task.completed_at:
                        task.completed_at = datetime.now()
                    if not task.message:
                        task.message = "Task cancelled."
                    break
                
                # 更新任务状态为完成
                task.status = TaskStatus.COMPLETED
                task.completed_at = datetime.now()
                task.result = result
                task.progress = 1.0
                if not task.message:
                    task.message = "任务已完成"
                break # 成功执行，退出循环
                
            except asyncio.CancelledError:
                task.status = TaskStatus.CANCELLED
                task.completed_at = datetime.now()
                task.message = "Task cancelled."
                break
            except Exception as e:
                error_str = str(e)
                # 识别 API 限流错误 (429)
                if "429" in error_str or "rate limit" in error_str.lower():
                    rate_limit_retries += 1
                    if rate_limit_retries > max_rate_limit_retries:
                        task.status = TaskStatus.FAILED
                        task.completed_at = datetime.now()
                        task.error = error_str
                        task.message = f"API 限流重试超过 {max_rate_limit_retries} 次，任务失败"
                        break

                    retry_delay = min(20 * (2 ** (rate_limit_retries - 1)), 300)
                    task.message = f"API 频率限制，将在 {retry_delay} 秒后第 {rate_limit_retries} 次重试..."
                    await self._save_task(task)
                    await asyncio.sleep(retry_delay)
                    continue # 回到循环开始重试
                
                # 其他真实错误，标记为失败
                task.status = TaskStatus.FAILED
                task.completed_at = datetime.now()
                task.error = error_str
                task.message = f"任务失败: {error_str[:120]}"
                break # 失败退场
                
        # 最终清理 (finally 逻辑)
        if task in self.running_tasks:
            self.running_tasks.remove(task)
        self.running_handles.pop(task.id, None)

        # 导入任务无论成功、失败或取消，都尝试清理临时文件
        if task.type == "novel_import":
            file_path = task.parameters.get("file_path")
            if isinstance(file_path, str) and file_path and os.path.exists(file_path):
                try:
                    os.unlink(file_path)
                except Exception as cleanup_error:
                    logger.warning(f"清理导入临时文件失败: {file_path}, error={cleanup_error}")
        # 保存最终任务状态
        await self._save_task(task)
    def _get_task_handler(self, task_type: str) -> Callable[[Task], Any]:
        """获取任务处理器"""
        mapping = {
            "novel_generation": self._process_novel_generation_task,
            "text_generation": self._process_text_generation_task,
            "extraction": self._process_extraction_task,
            "character_generation": self._process_character_generation_task,
            "world_building": self._process_world_building_task,
            "timeline_generation": self._process_timeline_task,
            "relationship_extraction": self._process_relationship_task,
            "novel_import": self._process_novel_import_task,
            "chapter_index_rerun": self._process_import_repair_task,
            "relationship_backfill": self._process_import_repair_task,
            "timeline_rebuild": self._process_import_repair_task,
            "import_repair_apply": self._process_import_repair_apply_task,
        }
        
        if task_type not in mapping:
            raise ValueError(f"未知任务类型: {task_type}")
            
        return mapping[task_type]

    async def _process_novel_generation_task(self, task: Task) -> Dict[str, Any]:
        """处理小说生成任务"""
        from ..api.ai_planning_service import get_ai_planning_service
        ai_planning_service = get_ai_planning_service(self.ai_service)
        
        # 调用AI规划服务生成内容
        result = await ai_planning_service.generate_story_outline(task.parameters)
        return result.model_dump() if hasattr(result, 'model_dump') else result
    
    async def _process_text_generation_task(self, task: Task) -> Dict[str, Any]:
        """处理文本生成任务"""
        prompt = task.parameters.get("prompt", "")
        if not prompt:
            raise ValueError("文本生成任务缺少prompt参数")
        
        generated_text = await self.ai_service.chat(
            prompt=prompt,
            system_prompt=task.parameters.get("system_prompt", "你是一个高质量的文本生成助手。"),
            temperature=task.parameters.get("temperature", 0.7),
            max_tokens=task.parameters.get("max_tokens", 1000)
        )
        
        return {
            "generated_text": generated_text,
            "tokens_used": len(generated_text) // 4  # 粗略估算
        }
    
    async def _process_extraction_task(self, task: Task) -> Dict[str, Any]:
        """处理提取任务"""
        from .extraction_service import get_extraction_service
        extraction_service = get_extraction_service(self.ai_service, self.config)
        
        text = task.parameters.get("text", "")
        if not text:
            raise ValueError("提取任务缺少text参数")
        
        # 根据参数决定提取类型
        elements = task.parameters.get("elements", ["characters", "world", "timeline", "relationships"])
        result = await extraction_service.extract_specific_elements(text, elements)
        
        return result
    
    async def _process_character_generation_task(self, task: Task) -> Dict[str, Any]:
        """处理角色生成任务"""
        from ..api.ai_planning_service import get_ai_planning_service
        ai_planning_service = get_ai_planning_service(self.ai_service)
        
        context = task.parameters.get("context", "")
        roles = task.parameters.get("roles", [])
        
        result = await ai_planning_service.design_characters(context, roles)
        return [item.model_dump() if hasattr(item, 'model_dump') else item for item in result]
    
    async def _process_world_building_task(self, task: Task) -> Dict[str, Any]:
        """处理世界构建任务"""
        from ..api.ai_planning_service import get_ai_planning_service
        ai_planning_service = get_ai_planning_service(self.ai_service)
        
        story_outline = task.parameters.get("story_outline", {})
        
        result = await ai_planning_service.build_world_setting(story_outline)
        return result.model_dump() if hasattr(result, 'model_dump') else result
    
    async def _process_timeline_task(self, task: Task) -> Dict[str, Any]:
        """处理时间线生成任务"""
        from .extraction_service import get_extraction_service
        extraction_service = get_extraction_service(self.ai_service, self.config)
        
        text = task.parameters.get("text", "")
        if not text:
            raise ValueError("时间线生成任务缺少text参数")
        
        timeline_events = await extraction_service.extract_timeline(text)
        return [event.model_dump() for event in timeline_events]
    
    async def _process_relationship_task(self, task: Task) -> Dict[str, Any]:
        """处理关系提取任务"""
        from .extraction_service import get_extraction_service
        extraction_service = get_extraction_service(self.ai_service, self.config)
        
        text = task.parameters.get("text", "")
        if not text:
            raise ValueError("关系提取任务缺少text参数")
        
        relationships = await extraction_service.extract_relationships(text)
        return [rel.model_dump() for rel in relationships]

    async def _load_repair_chapters(self, parameters: Dict[str, Any]) -> List[Dict[str, Any]]:
        if not self.content_manager:
            raise ValueError("导入修复任务缺少内容库管理器")

        chapter_id = parameters.get("chapter_id")
        if isinstance(chapter_id, str) and chapter_id.strip():
            chapter = await self.content_manager.get_content(chapter_id.strip())
            if not chapter:
                raise ValueError(f"章节不存在: {chapter_id}")
            payload = chapter.extracted_data if isinstance(chapter.extracted_data, dict) else {}
            return [{
                "id": chapter.metadata.id,
                "title": chapter.metadata.title,
                "chapter_index": int(payload.get("chapter_index") or payload.get("index") or 1),
                "content": chapter.content or "",
            }]

        session_id = parameters.get("session_id")
        parent_id = parameters.get("parent_id") or parameters.get("novel_id")
        if not isinstance(session_id, str) or not session_id.strip():
            raise ValueError("导入修复任务缺少 session_id 或 chapter_id")

        from ..content.models import ContentSearchRequest, ContentType

        result = await self.content_manager.search_content(ContentSearchRequest(
            session_id=session_id.strip(),
            parent_id=parent_id if isinstance(parent_id, str) and parent_id.strip() else None,
            content_type=ContentType.CHAPTER,
            limit=500,
        ))
        chapters = []
        for index, chapter in enumerate(result.items, start=1):
            payload = chapter.extracted_data if isinstance(chapter.extracted_data, dict) else {}
            chapters.append({
                "id": chapter.metadata.id,
                "title": chapter.metadata.title,
                "chapter_index": int(payload.get("chapter_index") or payload.get("index") or index),
                "content": chapter.content or "",
            })
        chapters.sort(key=lambda item: item.get("chapter_index") or 0)
        return chapters

    def _build_relationship_repair_key(self, relationship: Dict[str, Any]) -> Optional[str]:
        source = self._normalize_import_name(str(relationship.get("source") or ""))
        target = self._normalize_import_name(str(relationship.get("target") or relationship.get("target_name") or ""))
        relationship_type = self._normalize_repair_relationship_type(
            relationship.get("relationship_type") or relationship.get("relationship") or "other"
        )
        if not source or not target:
            return None
        return "->".join(sorted([source, target])) + f":{relationship_type}"

    @staticmethod
    def _normalize_repair_relationship_type(value: Any) -> str:
        raw_value = getattr(value, "value", value)
        normalized = " ".join(str(raw_value or "").strip().lower().split())
        if "." in normalized:
            normalized = normalized.rsplit(".", 1)[-1]
        aliases = {
            "friendship": "friend",
            "朋友": "friend",
            "友人": "friend",
            "romantic": "lover",
            "love": "lover",
            "mentor": "mentor",
            "mentorship": "mentor",
            "conflict": "enemy",
            "rivalry": "rival",
            "professional": "colleague",
            "alliance": "ally",
            "family": "family",
        }
        return aliases.get(normalized, normalized or "other")

    def _build_timeline_repair_key(self, event: Dict[str, Any], fallback_title: str = "") -> Optional[str]:
        title = self._normalize_import_name(str(event.get("title") or fallback_title or ""))
        description = self._normalize_import_name(str(event.get("description") or ""))
        if not title:
            return None
        return f"{title}:{description[:80]}"

    async def _load_existing_repair_asset_keys(
        self,
        *,
        session_id: str,
        parent_id: Optional[str],
        asset_type: str,
    ) -> set[str]:
        if not self.content_manager:
            return set()

        from ..content.models import ContentSearchRequest, ContentType

        type_map = {
            "relationship": ContentType.RELATIONSHIP,
            "timeline": ContentType.TIMELINE,
        }
        result = await self.content_manager.search_content(ContentSearchRequest(
            session_id=session_id.strip(),
            parent_id=parent_id if isinstance(parent_id, str) and parent_id.strip() else None,
            content_type=type_map[asset_type],
            limit=500,
        ))

        keys: set[str] = set()
        for item in list(getattr(result, "items", []) or []):
            payload = item.extracted_data if isinstance(item.extracted_data, dict) else {}
            if asset_type == "relationship":
                key = self._build_relationship_repair_key(payload)
            else:
                key = self._build_timeline_repair_key(payload, getattr(item.metadata, "title", ""))
            if key:
                keys.add(key)
        return keys

    async def _build_import_repair_diff(
        self,
        *,
        session_id: Optional[str],
        parent_id: Optional[str],
        relationships: List[Dict[str, Any]],
        timeline_events: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        if not session_id:
            return {
                "relationships": {"new": len(relationships), "duplicates": 0, "total": len(relationships)},
                "timeline": {"new": len(timeline_events), "duplicates": 0, "total": len(timeline_events)},
            }

        existing_relationship_keys = await self._load_existing_repair_asset_keys(
            session_id=session_id,
            parent_id=parent_id,
            asset_type="relationship",
        )
        existing_timeline_keys = await self._load_existing_repair_asset_keys(
            session_id=session_id,
            parent_id=parent_id,
            asset_type="timeline",
        )

        relationship_new = 0
        relationship_duplicates = 0
        seen_relationship_keys = set(existing_relationship_keys)
        for relationship in relationships:
            key = self._build_relationship_repair_key(relationship)
            if not key:
                continue
            if key in seen_relationship_keys:
                relationship_duplicates += 1
            else:
                relationship_new += 1
                seen_relationship_keys.add(key)

        timeline_new = 0
        timeline_duplicates = 0
        seen_timeline_keys = set(existing_timeline_keys)
        for event in timeline_events:
            key = self._build_timeline_repair_key(event)
            if not key:
                continue
            if key in seen_timeline_keys:
                timeline_duplicates += 1
            else:
                timeline_new += 1
                seen_timeline_keys.add(key)

        return {
            "relationships": {
                "new": relationship_new,
                "duplicates": relationship_duplicates,
                "total": len(relationships),
            },
            "timeline": {
                "new": timeline_new,
                "duplicates": timeline_duplicates,
                "total": len(timeline_events),
            },
        }

    async def _process_import_repair_task(self, task: Task) -> Dict[str, Any]:
        """Preview a focused rerun for imported chapter assets without duplicating saved assets."""
        from .extraction_service import get_extraction_service

        repair_type_by_task = {
            "chapter_index_rerun": "chapter_index",
            "relationship_backfill": "relationships",
            "timeline_rebuild": "timeline",
        }
        repair_type = task.parameters.get("repair_type") or repair_type_by_task.get(task.type, "chapter_index")

        task.progress = 0.15
        task.message = "正在读取需要重跑的章节..."
        await self._save_task(task)
        chapters = await self._load_repair_chapters(task.parameters)
        if not chapters:
            raise ValueError("没有找到可重跑的章节")

        task.progress = 0.45
        task.message = "正在执行章节级索引重跑..."
        await self._save_task(task)
        extraction_service = get_extraction_service(self.ai_service, self.config)
        analysis = await extraction_service.extract_chapter_index_assets(chapters)

        diagnostics = analysis.get("analysis_diagnostics")
        if not isinstance(diagnostics, dict):
            diagnostics = {}
        session_id = task.parameters.get("session_id")
        parent_id = task.parameters.get("parent_id") or task.parameters.get("novel_id")
        relationships_preview = [
            item.model_dump() if hasattr(item, "model_dump") else item
            for item in (analysis.get("relationships") or [])
        ]
        relationships_preview = [item for item in relationships_preview if isinstance(item, dict)]
        timeline_preview = [
            item.model_dump() if hasattr(item, "model_dump") else item
            for item in (analysis.get("timeline_events") or [])
        ]
        timeline_preview = [item for item in timeline_preview if isinstance(item, dict)]
        repair_diff = await self._build_import_repair_diff(
            session_id=session_id if isinstance(session_id, str) else None,
            parent_id=parent_id if isinstance(parent_id, str) else None,
            relationships=relationships_preview,
            timeline_events=timeline_preview,
        )

        result = {
            "repair_type": repair_type,
            "write_mode": "preview",
            "session_id": session_id if isinstance(session_id, str) else None,
            "parent_id": parent_id if isinstance(parent_id, str) else None,
            "chapters_count": len(chapters),
            "characters_count": len(analysis.get("characters") or []),
            "relationships_count": len(analysis.get("relationships") or []),
            "timeline_count": len(analysis.get("timeline_events") or []),
            "world_count": 1 if analysis.get("world_setting") else 0,
            "repair_diff": repair_diff,
            "candidate_counts": analysis.get("candidate_counts") or diagnostics.get("candidate_counts") or {},
            "failed_chapters": analysis.get("failed_chapters") or diagnostics.get("failed_chapters") or [],
            "relationship_unresolved_endpoints": (
                analysis.get("relationship_unresolved_endpoints")
                or diagnostics.get("relationship_unresolved_endpoints")
                or []
            ),
            "timeline_mismatch_events": (
                analysis.get("timeline_mismatch_events")
                or diagnostics.get("timeline_mismatch_events")
                or []
            ),
            "analysis_diagnostics": diagnostics,
        }

        if repair_type == "relationships":
            result["relationships"] = relationships_preview
        elif repair_type == "timeline":
            result["timeline_events"] = timeline_preview
        else:
            result["chapter_indices"] = analysis.get("chapter_indices") or []

        task.progress = 0.9
        task.message = "重跑完成，已生成可复核结果。"
        await self._save_task(task)
        return result

    async def _process_import_repair_apply_task(self, task: Task) -> Dict[str, Any]:
        """Persist selected repair preview assets after user confirmation."""
        if not self.content_manager:
            raise ValueError("导入修复写回任务缺少内容库管理器")

        preview = task.parameters.get("preview_result")
        if not isinstance(preview, dict):
            preview_task_id = task.parameters.get("preview_task_id")
            if isinstance(preview_task_id, str) and preview_task_id.strip():
                loaded_preview_task = await self.get_task_status(preview_task_id.strip())
                preview = loaded_preview_task.result if loaded_preview_task else None
        if not isinstance(preview, dict):
            raise ValueError("缺少可写回的修复 preview 结果")

        session_id = task.parameters.get("session_id") or preview.get("session_id")
        parent_id = task.parameters.get("parent_id") or preview.get("parent_id")
        if not isinstance(session_id, str) or not session_id.strip():
            raise ValueError("修复写回任务缺少 session_id")

        apply_types = task.parameters.get("apply_types")
        if not isinstance(apply_types, list) or not apply_types:
            repair_type = preview.get("repair_type")
            if repair_type == "relationships":
                apply_types = ["relationships"]
            elif repair_type == "timeline":
                apply_types = ["timeline"]
            else:
                apply_types = ["relationships", "timeline"]

        task.progress = 0.2
        task.message = "正在写回修复结果..."
        await self._save_task(task)

        repair_run_id = task.parameters.get("repair_run_id") or f"repair_{uuid.uuid4().hex[:12]}"
        relationships_written = 0
        timeline_written = 0

        from ..content.models import ContentItem, ContentMetadata

        existing_relationship_keys = set()
        if "relationships" in apply_types:
            existing_relationship_keys = await self._load_existing_repair_asset_keys(
                session_id=session_id,
                parent_id=parent_id if isinstance(parent_id, str) else None,
                asset_type="relationship",
            )

        existing_timeline_keys = set()
        if "timeline" in apply_types:
            existing_timeline_keys = await self._load_existing_repair_asset_keys(
                session_id=session_id,
                parent_id=parent_id if isinstance(parent_id, str) else None,
                asset_type="timeline",
            )

        if "relationships" in apply_types:
            for index, relationship in enumerate(preview.get("relationships") or []):
                if not isinstance(relationship, dict):
                    continue
                rel_source = str(relationship.get("source") or "UnknownSource").strip() or "UnknownSource"
                rel_target = str(relationship.get("target") or "UnknownTarget").strip() or "UnknownTarget"
                rel_type = str(relationship.get("relationship_type") or "other").strip() or "other"
                rel_key = self._build_relationship_repair_key({
                    "source": rel_source,
                    "target": rel_target,
                    "relationship_type": rel_type,
                })
                if rel_key in existing_relationship_keys:
                    continue
                rel_id = f"rel_{session_id}_{uuid.uuid4().hex[:8]}"
                await self.content_manager.create_content(ContentItem(
                    metadata=ContentMetadata(
                        id=rel_id,
                        title=f"{rel_source} -> {rel_target} ({rel_type})",
                        type="relationship",
                        session_id=session_id,
                        parent_id=parent_id if isinstance(parent_id, str) and parent_id.strip() else None,
                        tags=["repair-preview", "interaction", f"project-{session_id}", f"repair-run-{repair_run_id}"],
                    ),
                    content=str(relationship.get("description") or ""),
                    extracted_data={
                        **relationship,
                        "repair_run_id": repair_run_id,
                        "repair_source_task_id": task.parameters.get("preview_task_id"),
                        "repair_index": index,
                    },
                    relations={"source": [rel_source], "target": [rel_target]},
                ))
                relationships_written += 1
                existing_relationship_keys.add(rel_key)

        if "timeline" in apply_types:
            for index, event in enumerate(preview.get("timeline_events") or []):
                if not isinstance(event, dict):
                    continue
                event_title = str(event.get("title") or f"修复事件 {index + 1}").strip()
                event_description = str(event.get("description") or "未描述").strip()
                event_key = (
                    f"{self._normalize_import_name(event_title)}:"
                    f"{self._normalize_import_name(event_description)[:80]}"
                )
                if event_key in existing_timeline_keys:
                    continue
                characters = event.get("characters") if isinstance(event.get("characters"), list) else []
                locations = event.get("locations") if isinstance(event.get("locations"), list) else []
                event_id = f"timeline_{session_id}_{uuid.uuid4().hex[:10]}"
                event_content = "\n".join([
                    f"【事件】{event_title}",
                    f"【描述】{event_description}",
                    f"【涉及角色】{', '.join(str(item) for item in characters) if characters else '无'}",
                    f"【涉及地点】{', '.join(str(item) for item in locations) if locations else '无'}",
                ])
                await self.content_manager.create_content(ContentItem(
                    metadata=ContentMetadata(
                        id=event_id,
                        title=event_title,
                        type="timeline",
                        session_id=session_id,
                        parent_id=parent_id if isinstance(parent_id, str) and parent_id.strip() else None,
                        tags=["repair-preview", f"project-{session_id}", f"repair-run-{repair_run_id}"],
                    ),
                    content=event_content,
                    extracted_data={
                        **event,
                        "repair_run_id": repair_run_id,
                        "repair_source_task_id": task.parameters.get("preview_task_id"),
                        "repair_index": index,
                    },
                    relations={
                        "characters": [str(item) for item in characters],
                        "locations": [str(item) for item in locations],
                    },
                ))
                timeline_written += 1
                existing_timeline_keys.add(event_key)

        task.progress = 0.95
        task.message = f"修复写回完成：关系 {relationships_written} 条，时间线 {timeline_written} 条。"
        await self._save_task(task)
        return {
            "session_id": session_id,
            "parent_id": parent_id if isinstance(parent_id, str) else None,
            "repair_run_id": repair_run_id,
            "relationships_count": relationships_written,
            "timeline_count": timeline_written,
            "write_mode": "confirmed",
        }
    
    def _build_import_analysis_sample(self, text: str, max_chars: int = 24000) -> str:
        """Build a bounded full-book sample for import analysis to reduce timeout risk."""
        if len(text) <= max_chars:
            return text

        segment_count = 4
        segment_size = max_chars // segment_count
        last_start = max(len(text) - segment_size, 0)
        starts = [0]
        for slot in range(1, segment_count - 1):
            starts.append(round((len(text) - segment_size) * slot / (segment_count - 1)))
        starts.append(last_start)

        parts = []
        for index, start in enumerate(starts, start=1):
            end = min(start + segment_size, len(text))
            parts.append(f"[导入分析采样 {index}/{len(starts)} | 原文位置 {start}-{end}]\n{text[start:end]}")
        return "\n\n=== 导入分析采样分隔 ===\n\n".join(parts)

    async def _run_import_deep_analysis(
        self,
        extraction_service: Any,
        text: str,
        task: Task,
        chapters: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        from ..core.models import NetworkEdge, RelationshipType

        if chapters and hasattr(extraction_service, "extract_chapter_index_assets"):
            try:
                return await self._run_import_chapter_index_analysis(extraction_service, chapters, task)
            except Exception as exc:
                logger.error("Chapter index import analysis failed, falling back to legacy flow: %s", exc)

        analysis_text = self._build_import_analysis_sample(text, max_chars=24000)
        extracted: Dict[str, Any] = {
            "characters": [],
            "world_setting": None,
            "timeline_events": [],
            "relationships": [],
            "errors": [],
            "stage_results": {},
            "quality_issues": [],
        }

        async def run_stage(key: str, label: str, progress: float, extractor: Callable[[], Any]) -> None:
            task.progress = progress
            task.message = f"AI 分析中：提取{label}..."
            await self._save_task(task)
            try:
                extracted[key] = await extractor()
                extracted["stage_results"][key] = "completed"
                logger.info("Import analysis stage completed: %s", key)
            except Exception as exc:
                extracted["stage_results"][key] = "failed"
                extracted["errors"].append(f"{key}: {str(exc)}")
                logger.error("Import analysis stage failed: %s -> %s", key, exc)

        await run_stage(
            "characters",
            "角色信息",
            0.78,
            lambda: extraction_service.extract_characters(text),
        )
        await run_stage(
            "timeline_events",
            "时间线事件",
            0.84,
            lambda: extraction_service.extract_timeline(text),
        )
        await run_stage(
            "world_setting",
            "世界观设定",
            0.90,
            lambda: extraction_service.extract_world_setting(analysis_text),
        )

        def normalize_name(name: str) -> str:
            cleaned = re.sub(r"[\s·・•（）()《》<>『』「」\[\]]+", "", (name or "").strip())
            return cleaned or (name or "").strip()

        def normalize_relationships(relationships: List[Any]) -> List[Any]:
            unique: Dict[str, Any] = {}
            unresolved_endpoints: Set[str] = set()
            for relationship in relationships:
                source_raw = str(getattr(relationship, "source", ""))
                target_raw = str(getattr(relationship, "target", ""))
                source = resolve_character_name(source_raw)
                target = resolve_character_name(target_raw)
                if not source or not target or source == target:
                    continue
                if source.startswith("Unknown") or target.startswith("Unknown"):
                    continue
                if character_aliases and source not in character_names:
                    unresolved_endpoints.add(source_raw.strip() or source)
                if character_aliases and target not in character_names:
                    unresolved_endpoints.add(target_raw.strip() or target)
                relationship.source = source
                relationship.target = target
                key = "->".join(sorted([source, target])) + f":{getattr(relationship, 'relationship_type', '')}"
                existing = unique.get(key)
                if not existing or relationship_weight(relationship) > relationship_weight(existing):
                    unique[key] = relationship
            extracted["relationship_unresolved_endpoints"] = sorted(unresolved_endpoints)
            return list(unique.values())

        character_aliases: Dict[str, str] = {}
        for character in extracted.get("characters", []):
            canonical = normalize_name(getattr(character, "name", ""))
            if not canonical:
                continue
            character_aliases[canonical] = canonical
            for alias in getattr(character, "tags", []) or []:
                normalized_alias = normalize_name(str(alias))
                if normalized_alias:
                    character_aliases[normalized_alias] = canonical

        def resolve_character_name(name: str) -> str:
            normalized = normalize_name(name)
            if normalized in character_aliases:
                return character_aliases[normalized]
            for alias, canonical in character_aliases.items():
                if len(alias) >= 2 and len(normalized) >= 2 and (alias.endswith(normalized) or normalized.endswith(alias)):
                    return canonical
            return normalized

        character_names = {
            resolve_character_name(character.name)
            for character in extracted.get("characters", [])
            if getattr(character, "name", None) and character.name.strip()
        }

        def relationship_weight(relationship: Any) -> int:
            evidence_count = len(getattr(relationship, "evidence", []) or [])
            description_len = len(getattr(relationship, "description", "") or "")
            chapter_count = len(getattr(relationship, "chapter_references", []) or [])
            return evidence_count * 100 + chapter_count * 20 + description_len

        async def extract_relationships() -> List[Any]:
            current_characters = extracted.get("characters") or []
            if hasattr(extraction_service, "extract_relationships_guided"):
                relationships = await extraction_service.extract_relationships_guided(text, characters=current_characters)
            else:
                relationships = await extraction_service.extract_relationships(text)
            normalized = normalize_relationships(relationships)
            if normalized:
                return normalized

            if len(character_names) < 2:
                return []

            names = list(character_names)[:2]
            return [
                NetworkEdge(
                    source=names[0],
                    target=names[1],
                    relationship_type=RelationshipType.OTHER,
                    description="导入分析已识别两名以上角色，但关系提取未能给出可靠边；该关系需后续人工或 AI 复核。",
                    evidence=[],
                )
            ]

        await run_stage(
            "relationships",
            "人物关系",
            0.94,
            extract_relationships,
        )

        characters = extracted.get("characters") or []
        world_setting = extracted.get("world_setting")
        timeline_events = extracted.get("timeline_events") or []
        relationships = extracted.get("relationships") or []

        def character_quality(character: Any) -> Dict[str, Any]:
            quality = getattr(character, "extraction_quality", None)
            if isinstance(quality, dict):
                return quality
            evidence_count = len(getattr(character, "source_contexts", []) or [])
            evidence_count += len(getattr(character, "example_dialogues", []) or [])
            evidence_count += len(getattr(character, "behavior_examples", []) or [])
            profile_score = sum(bool(getattr(character, field, None)) for field in [
                "description",
                "background",
                "appearance",
                "occupation",
                "personality",
            ])
            return {
                "evidence_count": evidence_count,
                "profile_score": profile_score,
                "confidence": "high" if profile_score >= 4 and evidence_count >= 2 else "medium" if evidence_count else "low",
            }

        def is_core_character(character: Any) -> bool:
            role = str(getattr(getattr(character, "role", None), "value", getattr(character, "role", ""))).lower()
            return role.endswith("protagonist") or role.endswith("antagonist") or role.endswith("supporting")

        if not characters:
            extracted["quality_issues"].append("角色提取为空")
        elif len(characters) < 8:
            extracted["quality_issues"].append(f"角色覆盖不足：仅 {len(characters)} 个，期望至少 8 个")

        low_confidence_characters = [
            character for character in characters
            if character_quality(character).get("confidence") == "low"
        ]
        core_low_detail_characters = [
            character for character in characters
            if is_core_character(character) and character_quality(character).get("profile_score", 0) < 3
        ]
        if characters and len(low_confidence_characters) / max(len(characters), 1) > 0.4:
            extracted["quality_issues"].append(
                f"低置信角色占比过高：{len(low_confidence_characters)}/{len(characters)}"
            )
        if core_low_detail_characters:
            names = "、".join(getattr(character, "name", "未知角色") for character in core_low_detail_characters[:5])
            extracted["quality_issues"].append(f"核心角色档案信息不足：{names}")
        if not world_setting or not any([
            getattr(world_setting, "locations", None),
            getattr(world_setting, "cultures", None),
            getattr(world_setting, "rules", None),
            getattr(world_setting, "history", None),
            getattr(world_setting, "themes", None),
        ]):
            extracted["quality_issues"].append("世界观提取为空")
        if not timeline_events and not relationships:
            extracted["quality_issues"].append("时间线与关系网均为空")

        if timeline_events:
            events_without_evidence = [
                event for event in timeline_events
                if not (getattr(event, "evidence", None) or getattr(event, "chapter_reference", None))
            ]
            events_without_characters = [
                event for event in timeline_events
                if not getattr(event, "characters", None)
            ]
            title_description_mismatches = [
                event for event in timeline_events
                if getattr(event, "title", None)
                and getattr(event, "description", None)
                and normalize_name(str(getattr(event, "title", ""))) not in normalize_name(str(getattr(event, "description", "")))
                and not any(
                    normalize_name(str(character)) in normalize_name(str(getattr(event, "description", "")))
                    for character in getattr(event, "characters", []) or []
                )
            ]
            if len(events_without_evidence) / max(len(timeline_events), 1) > 0.4:
                extracted["quality_issues"].append(
                    f"时间线证据不足：{len(events_without_evidence)}/{len(timeline_events)} 个事件缺少证据或章节引用"
                )
            if len(events_without_characters) / max(len(timeline_events), 1) > 0.5:
                extracted["quality_issues"].append(
                    f"时间线角色关联不足：{len(events_without_characters)}/{len(timeline_events)} 个事件缺少涉及角色"
                )
            if title_description_mismatches:
                extracted["quality_issues"].append(
                    f"时间线标题/描述一致性存疑：{len(title_description_mismatches)} 个事件"
                )
        min_relationships = max(5, min(len(character_names), 10) - 2)
        if len(relationships) < min_relationships:
            extracted["quality_issues"].append(f"关系网覆盖不足：仅 {len(relationships)} 条，期望至少 {min_relationships} 条")
        protagonist_names = {
            normalize_name(character.name)
            for character in characters
            if getattr(character, "role", None) and str(getattr(character.role, "value", character.role)).lower().endswith("protagonist")
        }
        has_protagonist_relationship = any(
            normalize_name(getattr(relationship, "source", "")) in protagonist_names
            or normalize_name(getattr(relationship, "target", "")) in protagonist_names
            for relationship in relationships
        )
        if characters and not has_protagonist_relationship:
            extracted["quality_issues"].append("主角关系缺失")
        unresolved_endpoints = extracted.get("relationship_unresolved_endpoints", []) or []
        if unresolved_endpoints:
            preview = "、".join(str(endpoint) for endpoint in unresolved_endpoints[:5])
            extracted["quality_issues"].append(f"关系端点无法映射到角色池：{preview}")

        completed_stages = [
            key for key, status in extracted["stage_results"].items()
            if status == "completed"
        ]
        if not completed_stages:
            extracted["analysis_status"] = "failed"
        elif extracted["quality_issues"]:
            extracted["analysis_status"] = "low_quality"
        elif extracted["errors"]:
            extracted["analysis_status"] = "partial"
        else:
            extracted["analysis_status"] = "completed"

        if extracted["quality_issues"]:
            extracted["analysis_warning"] = "；".join(extracted["quality_issues"]) + "。已保留成功提取的结构化结果。"
        elif extracted["errors"]:
            extracted["analysis_warning"] = "部分深度分析阶段失败，已保留成功提取的结构化结果。"
        else:
            extracted["analysis_warning"] = None

        return extracted

    async def _run_import_chapter_index_analysis(
        self,
        extraction_service: Any,
        chapters: List[Dict[str, Any]],
        task: Task,
    ) -> Dict[str, Any]:
        task.progress = 0.78
        task.message = "AI 分析中：构建章节级创作资产索引..."
        await self._save_task(task)

        analysis = await extraction_service.extract_chapter_index_assets(chapters)
        diagnostics = analysis.get("analysis_diagnostics", {}) or {}
        characters = list(analysis.get("characters") or [])
        relationships = list(analysis.get("relationships") or [])
        timeline_events = list(analysis.get("timeline_events") or [])
        world_setting = analysis.get("world_setting")

        extracted: Dict[str, Any] = {
            "characters": characters,
            "world_setting": world_setting,
            "timeline_events": timeline_events,
            "relationships": relationships,
            "errors": [],
            "stage_results": {
                "chapter_index": "completed",
                "characters": "completed",
                "timeline_events": "completed",
                "world_setting": "completed" if world_setting else "failed",
                "relationships": "completed",
            },
            "quality_issues": [],
            "analysis_diagnostics": diagnostics,
            "candidate_counts": diagnostics.get("candidate_counts", {}),
            "failed_chapters": diagnostics.get("failed_chapters", []),
            "relationship_unresolved_endpoints": diagnostics.get("relationship_unresolved_endpoints", []),
            "timeline_mismatch_events": diagnostics.get("timeline_mismatch_events", []),
        }

        if not characters:
            extracted["quality_issues"].append("角色提取为空")
        elif len(characters) < 8:
            extracted["quality_issues"].append(f"角色覆盖不足：仅 {len(characters)} 个，期望至少 8 个")

        if len(relationships) < 8:
            extracted["quality_issues"].append(f"关系网覆盖不足：仅 {len(relationships)} 条，期望至少 8 条")

        if len(timeline_events) < 6:
            extracted["quality_issues"].append(f"时间线覆盖不足：仅 {len(timeline_events)} 个事件，期望至少 6 个")

        if not world_setting or not any([
            getattr(world_setting, "locations", None),
            getattr(world_setting, "cultures", None),
            getattr(world_setting, "rules", None),
            getattr(world_setting, "history", None),
            getattr(world_setting, "themes", None),
        ]):
            extracted["quality_issues"].append("世界观提取为空")

        unresolved = extracted["relationship_unresolved_endpoints"]
        if relationships:
            mapped_endpoint_count = 0
            total_endpoint_count = len(relationships) * 2
            character_names = {self._normalize_import_name(getattr(character, "name", "")) for character in characters}
            for relationship in relationships:
                if self._normalize_import_name(getattr(relationship, "source", "")) in character_names:
                    mapped_endpoint_count += 1
                if self._normalize_import_name(getattr(relationship, "target", "")) in character_names:
                    mapped_endpoint_count += 1
            mapping_ratio = mapped_endpoint_count / max(total_endpoint_count, 1)
            extracted["candidate_counts"]["relationship_endpoint_mapping_ratio"] = round(mapping_ratio, 3)
            if mapping_ratio < 0.8:
                extracted["quality_issues"].append(f"关系端点映射率不足：{mapped_endpoint_count}/{total_endpoint_count}")
        if unresolved:
            preview = "、".join(str(endpoint) for endpoint in unresolved[:5])
            extracted["quality_issues"].append(f"关系端点无法映射到角色池：{preview}")

        mismatch_events = extracted["timeline_mismatch_events"]
        if mismatch_events:
            extracted["quality_issues"].append(f"时间线标题/描述一致性存疑：{len(mismatch_events)} 个事件")

        if extracted["failed_chapters"]:
            extracted["errors"].append(f"failed_chapters: {len(extracted['failed_chapters'])}")

        has_world_facts = bool(world_setting and any([
            getattr(world_setting, "locations", None),
            getattr(world_setting, "cultures", None),
            getattr(world_setting, "rules", None),
            getattr(world_setting, "history", None),
            getattr(world_setting, "themes", None),
        ]))
        has_structured_assets = bool(characters or relationships or timeline_events or has_world_facts)

        if not has_structured_assets:
            extracted["analysis_status"] = "failed"
        elif extracted["errors"]:
            extracted["analysis_status"] = "partial"
        elif extracted["quality_issues"]:
            extracted["analysis_status"] = "low_quality"
        else:
            extracted["analysis_status"] = "completed"

        if extracted["quality_issues"]:
            extracted["analysis_warning"] = "；".join(extracted["quality_issues"]) + "。已保留成功提取的结构化结果。"
        elif extracted["errors"]:
            extracted["analysis_warning"] = "部分章节级分析失败，已保留成功提取的结构化结果。"
        else:
            extracted["analysis_warning"] = None
        return extracted

    @staticmethod
    def _normalize_import_name(name: str) -> str:
        return re.sub(r"[\s·・•（）()《》<>『』「」\[\]]+", "", (name or "").strip())

    def _split_long_import_chapter(self, chapter: Any, max_chars: int = 18000) -> List[Any]:
        from ..types.text_processing import Chapter

        content = getattr(chapter, "content", "") or ""
        if len(content) <= max_chars:
            return [chapter]

        parts: List[Any] = []
        start = 0
        part_index = 1
        base_start = getattr(chapter, "start_position", 0) or 0
        title = getattr(chapter, "title", "章节") or "章节"
        index = getattr(chapter, "index", 0) or 0

        while start < len(content):
            target_end = min(start + max_chars, len(content))
            end = target_end
            if target_end < len(content):
                window_start = max(start + int(max_chars * 0.55), start)
                candidates = [
                    content.rfind("\n\n", window_start, target_end),
                    content.rfind("。", window_start, target_end),
                    content.rfind("！", window_start, target_end),
                    content.rfind("？", window_start, target_end),
                ]
                best = max(candidates)
                if best > start:
                    end = best + (2 if content.startswith("\n\n", best) else 1)

            part_content = content[start:end].strip()
            if part_content:
                parts.append(
                    Chapter(
                        title=f"{title}（{part_index}）",
                        content=part_content,
                        start_position=base_start + start,
                        end_position=base_start + end,
                        index=index + part_index - 1,
                        metadata={**(getattr(chapter, "metadata", None) or {}), "split_from_title": title, "split_part": part_index},
                    )
                )
                part_index += 1
            start = end

        return parts or [chapter]

    def _expand_long_import_chapters(self, chapters: List[Any], max_chars: int = 18000) -> List[Any]:
        expanded: List[Any] = []
        for chapter in chapters:
            expanded.extend(self._split_long_import_chapter(chapter, max_chars=max_chars))
        for index, chapter in enumerate(expanded, start=1):
            chapter.index = index
        return expanded

    async def _update_import_conversation_title(
        self,
        *,
        session_id: Optional[str],
        book_title: Optional[str],
        source_file_name: Optional[str],
    ) -> None:
        if not session_id:
            return

        title = (book_title or "").strip()
        if not title and source_file_name:
            title = os.path.splitext(os.path.basename(source_file_name))[0].strip()
        if not title:
            return

        key = f"conversation_{session_id}"
        try:
            try:
                conversation = await self.storage.load(key, storage_type="file")
            except TypeError:
                conversation = await self.storage.load(key)

            if not isinstance(conversation, dict):
                return

            conversation["title"] = title
            metadata = conversation.get("metadata")
            if not isinstance(metadata, dict):
                metadata = {}
            metadata["imported_book_title"] = title
            conversation["metadata"] = metadata
            conversation["updated_at"] = datetime.now().isoformat()

            try:
                await self.storage.save(key, conversation, storage_type="file")
            except TypeError:
                await self.storage.save(key, conversation)
        except Exception as exc:
            logger.warning("Failed to update import conversation title for %s: %s", session_id, exc)

    async def find_existing_import_by_upload_hash(
        self,
        raw_upload_sha256: Optional[str],
        *,
        exclude_session_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Find a previous novel import with the same uploaded file hash."""
        if not self.content_manager or not raw_upload_sha256:
            return None

        from ..content.models import ContentSearchRequest, ContentType

        try:
            result = await self.content_manager.search_content(
                ContentSearchRequest(
                    query="",
                    content_type=ContentType.NOVEL,
                    limit=500,
                    offset=0,
                )
            )
        except Exception as exc:
            logger.warning("Failed to search existing imports for dedupe: %s", exc)
            return None

        for novel in getattr(result, "items", []) or []:
            existing_session_id = getattr(novel.metadata, "session_id", None)
            if exclude_session_id and existing_session_id == exclude_session_id:
                continue
            payload = novel.extracted_data if isinstance(novel.extracted_data, dict) else {}
            if payload.get("raw_upload_sha256") != raw_upload_sha256:
                continue

            counts = await self._count_import_assets(
                session_id=existing_session_id,
                parent_id=novel.metadata.id,
            )
            return {
                "duplicate_import": True,
                "reused_existing_import": True,
                "session_id": existing_session_id,
                "parent_id": novel.metadata.id,
                "book_title": novel.metadata.title,
                "source_file_name": payload.get("source_file"),
                "raw_upload_sha256": raw_upload_sha256,
                "chapters_count": counts.get("chapter", 0),
                "characters_count": counts.get("character", 0),
                "relationships_count": counts.get("relationship", 0),
                "timeline_count": counts.get("timeline", 0),
                "world_count": counts.get("world", 0),
                "analysis_status": payload.get("analysis_status") or "completed",
                "analysis_quality_issues": payload.get("analysis_quality_issues") or [],
                "analysis_diagnostics": payload.get("analysis_diagnostics") or {},
            }
        return None

    async def _count_import_assets(self, *, session_id: Optional[str], parent_id: Optional[str]) -> Dict[str, int]:
        counts = {
            "novel": 0,
            "chapter": 0,
            "character": 0,
            "world": 0,
            "relationship": 0,
            "timeline": 0,
        }
        if not self.content_manager or not session_id:
            return counts

        from ..content.models import ContentSearchRequest, ContentType

        try:
            result = await self.content_manager.search_content(
                ContentSearchRequest(
                    query="",
                    session_id=session_id,
                    content_types=[
                        ContentType.NOVEL,
                        ContentType.CHAPTER,
                        ContentType.CHARACTER,
                        ContentType.WORLD,
                        ContentType.RELATIONSHIP,
                        ContentType.TIMELINE,
                    ],
                    limit=500,
                    offset=0,
                )
            )
        except Exception:
            return counts

        for item in getattr(result, "items", []) or []:
            if parent_id and item.metadata.type != ContentType.NOVEL and item.metadata.parent_id != parent_id:
                continue
            item_type = getattr(item.metadata.type, "value", str(item.metadata.type)).lower()
            if item_type in counts:
                counts[item_type] += 1
        return counts

    async def create_completed_duplicate_import_task(
        self,
        *,
        requested_session_id: Optional[str],
        duplicate_result: Dict[str, Any],
        source_file_name: Optional[str],
    ) -> Task:
        """Persist a completed task so frontend flows receive a normal lifecycle result."""
        task_id = f"duplicate_import_{uuid.uuid4().hex[:12]}"
        task = Task(
            id=task_id,
            type="novel_import",
            status=TaskStatus.COMPLETED,
            priority=TaskPriority.HIGH,
            parameters={
                "session_id": requested_session_id,
                "source_file_name": source_file_name,
                "duplicate_import": True,
            },
            created_at=datetime.now(),
            started_at=datetime.now(),
            completed_at=datetime.now(),
            result=duplicate_result,
            progress=1.0,
            message="检测到相同原文已导入，已复用现有项目资产。",
        )
        self.tasks[task_id] = task
        await self._save_task(task)
        return task

    async def _delete_previous_import_assets(self, *, session_id: Optional[str], parent_id: Optional[str]) -> int:
        if not self.content_manager or not session_id or not parent_id:
            return 0

        from ..content.models import ContentSearchRequest

        deleted = 0
        protected_types = {"novel"}
        import_tags = {"imported", "extracted"}
        while True:
            result = await self.content_manager.search_content(ContentSearchRequest(
                query="",
                content_types=["chapter", "character", "world", "timeline", "relationship"],
                session_id=session_id,
                parent_id=parent_id,
                limit=500,
                offset=0,
            ))
            if not result.items:
                break

            deleted_this_page = 0
            for item in result.items:
                tags = set(item.metadata.tags or [])
                is_import_asset = bool(tags & import_tags) or any(tag.startswith("import-run-") for tag in tags)
                if item.metadata.type in protected_types or not is_import_asset:
                    continue
                try:
                    if await self.content_manager.delete_content(item.metadata.id):
                        deleted += 1
                        deleted_this_page += 1
                except Exception as exc:
                    logger.warning("Failed to delete previous import asset %s: %s", item.metadata.id, exc)

            if len(result.items) < 500 or deleted_this_page == 0:
                break

        if deleted:
            logger.info("Deleted %s previous import assets for parent %s", deleted, parent_id)
        return deleted

    async def _process_novel_import_task(self, task: Task) -> Dict[str, Any]:
        """处理小说导入异步任务"""
        from ..services.text_processing_service import text_processing_service
        from ..types.text_processing import Chapter, TextProcessingConfig
        from ..services.extraction_service import get_extraction_service
        from ..content.models import ContentItem, ContentMetadata
        from pathlib import Path
        import os
        import hashlib
        
        params = task.parameters
        file_path = params.get("file_path")
        source_file_name = params.get("source_file_name") or (os.path.basename(file_path) if file_path else None)
        book_title = params.get("book_title")
        session_id = params.get("session_id")
        parent_id = params.get("parent_id")
        import_run_id = params.get("import_run_id") or f"import_{uuid.uuid4().hex[:12]}"
        raw_upload_sha256 = params.get("raw_upload_sha256")
        
        if self.content_manager is None:
            raise ValueError("内容管理器未初始化，无法执行导入任务")

        if not file_path or not os.path.exists(file_path):
            raise ValueError(f"文件不存在: {file_path}")

        await self._update_import_conversation_title(
            session_id=session_id,
            book_title=book_title,
            source_file_name=source_file_name,
        )

        task.message = "正在读取并解析文本..."
        task.progress = 0.1
        await self._save_task(task)
        
        # 如果没有指定 parent_id，先确保存在一个 Novel 根节点
        if not parent_id:
            parent_id = f"novel_{session_id}"
            existing_parent = await self.content_manager.get_content(parent_id)
            if not existing_parent:
                novel_title = book_title or "未命名小说"
                novel_summary = f"这是《{novel_title}》的小说根节点，作为所有章节和角色的父级容器。"
                novel_item = ContentItem(
                    metadata=ContentMetadata(
                        id=parent_id,
                        title=novel_title,
                        type="novel",
                        session_id=session_id,
                        tags=["novel", f"project-{session_id}", f"import-run-{import_run_id}"]
                    ),
                    content=novel_summary,
                    extracted_data={
                        "title": novel_title,
                        "content": novel_summary,
                        "source": "text_processing_import",
                        "import_run_id": import_run_id,
                        "source_file": source_file_name,
                        "raw_upload_sha256": raw_upload_sha256,
                    },
                )
                await self.content_manager.create_content(novel_item)

        # 1. 解析文本 (在独立线程中运行，避免阻塞事件循环)
        config = TextProcessingConfig(**params.get("config", {}))
        result = await asyncio.to_thread(text_processing_service.process_file, file_path, config)
        if not result.content or not result.content.strip():
            raise ValueError("文本解析后为空，无法导入")
        chapters_to_save = list(result.chapters)
        if not chapters_to_save and result.content.strip():
            chapters_to_save = [
                Chapter(
                    title=(book_title or result.metadata.title or "导入正文"),
                    content=result.content,
                    start_position=0,
                    end_position=len(result.content),
                    index=1,
                )
            ]
        
        chapters_to_save = self._expand_long_import_chapters(chapters_to_save, max_chars=18000)

        # 2. 保存章节 (分阶段汇报进度)
        task.message = f"解析完成，正在保存 {len(chapters_to_save)} 个章节..."
        await self._save_task(task)
        deleted_previous_assets = await self._delete_previous_import_assets(
            session_id=session_id if isinstance(session_id, str) else None,
            parent_id=parent_id if isinstance(parent_id, str) else None,
        )

        chapters_data = []
        total_chapters = len(chapters_to_save)
        analysis_status = "completed"
        analysis_warning = None
        analysis_stage_results: Dict[str, str] = {}
        analysis_quality_issues: List[str] = []
        analysis_diagnostics: Dict[str, Any] = {}
        candidate_counts: Dict[str, Any] = {}
        failed_chapters: List[Dict[str, Any]] = []
        relationship_unresolved_endpoints: List[str] = []
        timeline_mismatch_events: List[Dict[str, Any]] = []
        source_fingerprint = None
        if isinstance(result.content, str):
            source_fingerprint = hashlib.sha256(result.content.encode("utf-8")).hexdigest()
        for i, chapter in enumerate(chapters_to_save):
            # 每存一章，进度递增（0.1 -> 0.7 阶段）
            task.progress = 0.1 + (i / max(total_chapters, 1)) * 0.6
            chapter_number = chapter.index or (i + 1)
            chapter_title = chapter.title or f"第 {chapter_number} 章"
            task.message = f"正在保存第 {i+1}/{total_chapters} 章: {chapter_title}"
            await self._save_task(task)
            
            chapter_content = chapter.content or result.content[chapter.start_position:chapter.end_position].strip() or result.content
            # 创建内容项
            item_id = f"chapter_{session_id}_{uuid.uuid4().hex[:12]}"
            chapter_payload = {
                "title": chapter_title,
                "chapter_title": chapter_title,
                "content": chapter_content,
                "chapter_index": chapter_number,
                "start_position": chapter.start_position,
                "end_position": chapter.end_position,
                "book_title": book_title,
                "source": "text_processing_import",
                "source_file": source_file_name,
                "source_fingerprint": source_fingerprint,
                "raw_upload_sha256": raw_upload_sha256,
                "import_run_id": import_run_id,
            }
            item = ContentItem(
                metadata=ContentMetadata(
                    id=item_id,
                    title=chapter_title,
                    type="chapter",
                    session_id=session_id,
                    parent_id=parent_id,
                    tags=["imported", f"project-{session_id}", f"import-run-{import_run_id}"]
                ),
                content=chapter_content,
                extracted_data=chapter_payload,
            )
            await self.content_manager.create_content(item)
            chapters_data.append({
                "id": item_id,
                "title": item.metadata.title,
                "chapter_index": chapter_number,
                "content": chapter_content,
            })
            
        # 3. 深度分析 (0.7 -> 0.95 阶段)
        task.progress = 0.75
        task.message = "正在进行 AI 深度分析（角色、世界观提取）..."
        await self._save_task(task)
        
        logger.info(f"准备导入深度分析：全文 {len(result.content)} 字符")
        
        # 解析并应用用户自定义模型配置
        runtime_ai_service = self.ai_service
        openai_config_dict = params.get("openai_config")
        if openai_config_dict:
            ai_mode = openai_config_dict.get("ai_mode")
            if isinstance(ai_mode, str) and ai_mode in {"fast", "pro"}:
                runtime_ai_service = runtime_ai_service.with_overrides(ai_mode=ai_mode)
                logger.info(f"任务使用AI模式: {ai_mode}")

        if openai_config_dict and getattr(self.config, "allow_runtime_openai_overrides", True):
            api_key = openai_config_dict.get("api_key")
            base_url = openai_config_dict.get("base_url")
            model = openai_config_dict.get("model")
            if api_key or base_url or model:
                runtime_ai_service = self.ai_service.with_overrides(
                    api_key=api_key,
                    base_url=base_url,
                    model=model
                )
                logger.info(f"任务使用自定义AI配置: model={model}, base_url={base_url}")
                
        extraction_service = get_extraction_service(runtime_ai_service, self.config)

        try:
            task.message = "AI 分析中：提取角色信息..."
            await self._save_task(task)

            extracted = await self._run_import_deep_analysis(
                extraction_service,
                result.content,
                task,
                chapters=chapters_data,
            )
            analysis_status = extracted.get("analysis_status", "completed")
            analysis_warning = extracted.get("analysis_warning")
            analysis_stage_results = extracted.get("stage_results", {})
            analysis_quality_issues = extracted.get("quality_issues", [])
            analysis_diagnostics = extracted.get("analysis_diagnostics", {})
            candidate_counts = extracted.get("candidate_counts", {})
            failed_chapters = extracted.get("failed_chapters", [])
            relationship_unresolved_endpoints = extracted.get("relationship_unresolved_endpoints", [])
            timeline_mismatch_events = extracted.get("timeline_mismatch_events", [])

            task.message = "AI 分析完成，正在保存结果..."
            await self._save_task(task)

        except Exception as e:
            logger.error(f"AI 提取失败: {e}")
            extracted = {
                "characters": [],
                "world_setting": None,
                "timeline_events": [],
                "relationships": [],
                "errors": [str(e)],
            }
            analysis_status = "failed"
            analysis_warning = f"章节已导入，但深度分析失败：{str(e)[:120]}"
            analysis_stage_results = {}
            analysis_quality_issues = ["深度分析流程失败"]
            analysis_diagnostics = {}
            candidate_counts = {}
            failed_chapters = []
            relationship_unresolved_endpoints = []
            timeline_mismatch_events = []
            task.message = f"AI 分析失败: {str(e)[:50]}"
            await self._save_task(task)
        
        # 保存提取资产 - 角色（全量保存深度信息）
        characters_count = 0
        for char in extracted.get("characters", []):
            try:
                char_id = f"char_{session_id}_{uuid.uuid4().hex[:8]}"
                # 关键修复：不再手动拼接，而是全量保存 AI 提取的原始模型数据
                raw_data = char.model_dump() if hasattr(char, 'model_dump') else char
                
                # 构建用于快速展示的简介
                summary = raw_data.get('personality', '') or raw_data.get('description', '')
                
                char_item = ContentItem(
                    metadata=ContentMetadata(
                        id=char_id,
                        title=char.name,
                        type="character",
                        session_id=session_id,
                        parent_id=parent_id,
                        tags=["extracted", "high-quality", f"project-{session_id}", f"import-run-{import_run_id}"]
                    ),
                    content=summary,
                    extracted_data={
                        **raw_data,
                        "import_run_id": import_run_id,
                        "source_file": source_file_name,
                        "source_fingerprint": source_fingerprint,
                        "raw_upload_sha256": raw_upload_sha256,
                    } # 这里的 raw_data 包含您要的所有高质量字段（台词、背景、因果等）
                )
                await self.content_manager.create_content(char_item)
                characters_count += 1
            except Exception as e:
                logger.error(f"保存角色 {char.name if hasattr(char, 'name') else 'unknown'} 失败: {e}")
        
        # 保存世界设定 - 全量深度信息
        world_setting = extracted.get("world_setting")
        world_count = 0
        if world_setting:
            try:
                world_id = f"world_{session_id}_{uuid.uuid4().hex[:8]}"
                raw_world = world_setting.model_dump() if hasattr(world_setting, 'model_dump') else world_setting
                world_content = raw_world.get("history") or "\n".join(
                    str(item)
                    for item in ((raw_world.get("rules") or []) + (raw_world.get("themes") or []))
                    if item
                ) or "世界深度分析已完成"
                
                world_item = ContentItem(
                    metadata=ContentMetadata(
                        id=world_id,
                        title="世界深度设定",
                        type="world",
                        session_id=session_id,
                        parent_id=parent_id,
                        tags=["extracted", "world-core", f"project-{session_id}", f"import-run-{import_run_id}"]
                    ),
                    content=world_content,
                    extracted_data={
                        **raw_world,
                        "import_run_id": import_run_id,
                        "source_file": source_file_name,
                        "source_fingerprint": source_fingerprint,
                        "raw_upload_sha256": raw_upload_sha256,
                    }
                )
                await self.content_manager.create_content(world_item)
                world_count += 1
            except Exception as e:
                logger.error(f"保存世界设定失败: {e}")

        # 保存关系网络 - 确保 Edge 能够对应到实体
        relationships = extracted.get("relationships", [])
        rel_count = 0
        for rel in relationships:
            try:
                # 关系不仅要在 Edge 中，还要作为 ContentItem 保存以便溯源
                raw_rel = rel.model_dump() if hasattr(rel, 'model_dump') else rel
                if not isinstance(raw_rel, dict):
                    raw_rel = {}
                rel_source = raw_rel.get("source") if isinstance(raw_rel, dict) else None
                rel_target = raw_rel.get("target") if isinstance(raw_rel, dict) else None
                rel_type = raw_rel.get("relationship_type") if isinstance(raw_rel, dict) else None
                if not isinstance(rel_source, str) or not rel_source.strip():
                    rel_source = "UnknownSource"
                if not isinstance(rel_target, str) or not rel_target.strip():
                    rel_target = "UnknownTarget"
                if not isinstance(rel_type, str) or not rel_type.strip():
                    rel_type = "other"
                rel_id = f"rel_{session_id}_{uuid.uuid4().hex[:8]}"
                
                rel_item = ContentItem(
                    metadata=ContentMetadata(
                        id=rel_id,
                        title=f"{rel_source} -> {rel_target} ({rel_type})",
                        type="relationship",
                        session_id=session_id,
                        parent_id=parent_id,
                        tags=["extracted", "interaction", f"project-{session_id}", f"import-run-{import_run_id}"]
                    ),
                    content=raw_rel.get('description', ''),
                    extracted_data={
                        **raw_rel,
                        "import_run_id": import_run_id,
                        "source_file": source_file_name,
                        "source_fingerprint": source_fingerprint,
                        "raw_upload_sha256": raw_upload_sha256,
                    },
                    # 记录关联实体，以便世界树精准绘图
                    relations={"source": [rel_source], "target": [rel_target]}
                )
                await self.content_manager.create_content(rel_item)
                rel_count += 1
            except Exception as e:
                logger.error(f"保存关系失败: {e}")
        
        # 保存时间线事件
        timeline_events = extracted.get("timeline_events", [])
        timeline_count = 0
        for i, event in enumerate(timeline_events):
            try:
                raw_event = event.model_dump() if hasattr(event, 'model_dump') else event
                event_title = raw_event.get("title") or f"事件 {i+1}"
                event_description = raw_event.get("description") or "未描述"
                absolute_time = raw_event.get("absolute_time") or raw_event.get("date") or ""
                relative_time = raw_event.get("relative_time") or ""
                characters = raw_event.get("characters") if isinstance(raw_event.get("characters"), list) else []
                locations = raw_event.get("locations") if isinstance(raw_event.get("locations"), list) else []

                event_id = f"timeline_{session_id}_{uuid.uuid4().hex[:10]}"
                event_content = f"""
【事件】{event_title}
【描述】{event_description}
【绝对时间】{absolute_time or '未知'}
【相对时间】{relative_time or '未知'}
【涉及角色】{', '.join(characters) if characters else '无'}
【涉及地点】{', '.join(locations) if locations else '无'}
""".strip()

                event_item = ContentItem(
                    metadata=ContentMetadata(
                        id=event_id,
                        title=event_title,
                        type="timeline",
                        session_id=session_id,
                        parent_id=parent_id,
                        tags=["extracted", f"project-{session_id}", f"import-run-{import_run_id}"]
                    ),
                    content=event_content,
                    extracted_data={
                        **raw_event,
                        "import_run_id": import_run_id,
                        "source_file": source_file_name,
                        "source_fingerprint": source_fingerprint,
                        "raw_upload_sha256": raw_upload_sha256,
                    },
                    relations={
                        "characters": characters,
                        "locations": locations,
                    },
                )
                await self.content_manager.create_content(event_item)
                timeline_count += 1
            except Exception as e:
                logger.error(f"保存时间线事件 {i} 失败: {e}")
        
        logger.info(f"成功保存 {timeline_count} 个时间线事件")

        # 4. 清理临时文件并完成
        if os.path.exists(file_path):
            os.unlink(file_path)
            
        task.progress = 1.0
        task.message = (
            f"导入完成：已写入 {len(chapters_to_save)} 个章节"
            + (f"，并完成 {characters_count} 个角色、{world_count} 个世界设定、{timeline_count} 个时间线、{rel_count} 个关系资产分析" if analysis_status == "completed" else "，但深度分析未完全完成")
        )
        return {
            "book_title": book_title,
            "parent_id": parent_id,
            "chapters_count": len(chapters_to_save),
            "chapter_ids": [chapter["id"] for chapter in chapters_data],
            "chapter_titles": [chapter["title"] for chapter in chapters_data],
            "characters_count": characters_count,
            "world_count": world_count,
            "relationships_count": rel_count,
            "timeline_count": timeline_count,
            "session_id": session_id,
            "source_file_name": source_file_name,
            "source_fingerprint": source_fingerprint,
            "raw_upload_sha256": raw_upload_sha256,
            "import_run_id": import_run_id,
            "deleted_previous_assets": deleted_previous_assets,
            "analysis_status": analysis_status,
            "analysis_warning": analysis_warning,
            "analysis_stage_results": analysis_stage_results,
            "analysis_quality_issues": analysis_quality_issues,
            "analysis_diagnostics": analysis_diagnostics,
            "candidate_counts": candidate_counts,
            "failed_chapters": failed_chapters,
            "relationship_unresolved_endpoints": relationship_unresolved_endpoints,
            "timeline_mismatch_events": timeline_mismatch_events,
        }
    
    async def submit_task(self, task_type: str, parameters: Dict[str, Any], 
                         priority: TaskPriority = TaskPriority.MEDIUM, 
                         user_id: Optional[str] = None) -> str:
        """提交新任务到队列"""
        task_id = parameters.get("task_id") or str(int(time.time() * 1000000))
        
        task = Task(
            id=task_id,
            type=task_type,
            status=TaskStatus.PENDING,
            priority=priority,
            parameters=parameters,
            created_at=datetime.now(),
            user_id=user_id
        )
        
        # 添加到任务字典和队列
        self.tasks[task_id] = task
        self.queue.append(task)
        
        # 保存任务到存储
        await self._save_task(task)
        
        return task_id
    
    async def get_task_status(self, task_id: str) -> Optional[Task]:
        """获取任务状态"""
        # 首先尝试从内存获取
        task = self.tasks.get(task_id)
        if not task:
            # 尝试从存储获取
            task_data = await self.storage.load(f"task_{task_id}")
            if task_data:
                # 重新构建Task对象
                task = Task(
                    id=task_data["id"],
                    type=task_data["type"],
                    status=TaskStatus(task_data["status"]),
                    priority=TaskPriority(task_data["priority"]),
                    parameters=task_data["parameters"],
                    created_at=datetime.fromisoformat(task_data["created_at"]),
                    started_at=datetime.fromisoformat(task_data["started_at"]) if task_data["started_at"] else None,
                    completed_at=datetime.fromisoformat(task_data["completed_at"]) if task_data["completed_at"] else None,
                    result=task_data["result"],
                    error=task_data["error"],
                    progress=task_data.get("progress", 0.0),
                    message=task_data.get("message", ""),
                    user_id=task_data["user_id"]
                )
                self.tasks[task_id] = task
            else:
                task = None
        
        return task
    
    async def cancel_task(self, task_id: str) -> bool:
        """取消任务"""
        task = self.tasks.get(task_id)
        if not task:
            return False
        
        if task.status in [TaskStatus.RUNNING, TaskStatus.PENDING]:
            task.status = TaskStatus.CANCELLED
            task.completed_at = datetime.now()
            task.message = "任务已取消"
            
            # 从队列中移除（如果在队列中）
            if task in self.queue:
                self.queue.remove(task)
            
            # 从运行列表中移除（如果在运行中）
            task_handle = self.running_handles.get(task_id)
            if task_handle and not task_handle.done():
                task_handle.cancel()
            
            # 保存任务状态
            await self._save_task(task)
            return True
        
        return False
    
    async def _save_task(self, task: Task):
        """保存任务到存储"""
        task_data = {
            "id": task.id,
            "type": task.type,
            "status": task.status.value,
            "priority": task.priority.value,
            "parameters": task.parameters,
            "created_at": task.created_at.isoformat(),
            "started_at": task.started_at.isoformat() if task.started_at else None,
            "completed_at": task.completed_at.isoformat() if task.completed_at else None,
            "result": task.result,
            "error": task.error,
            "progress": task.progress,
            "message": task.message,
            "user_id": task.user_id
        }
        await self.storage.save(f"task_{task.id}", task_data)

    async def _recover_completed_import_task_from_assets(self, task: Task) -> Task:
        """Recover stale import tasks when their assets already exist."""
        if task.type != "novel_import" or task.status not in {TaskStatus.PENDING, TaskStatus.RUNNING}:
            return task
        if not self.content_manager:
            return task
        if any(queued.id == task.id for queued in self.queue):
            return task
        running_handle = self.running_handles.get(task.id)
        if running_handle and not running_handle.done():
            return task

        session_id = str(task.parameters.get("session_id") or "")
        if not session_id:
            return task

        try:
            from ..content.models import ContentSearchRequest, ContentType

            result = await self.content_manager.search_content(
                ContentSearchRequest(
                    session_id=session_id,
                    content_types=[
                        ContentType.NOVEL,
                        ContentType.CHAPTER,
                        ContentType.CHARACTER,
                        ContentType.WORLD,
                        ContentType.RELATIONSHIP,
                        ContentType.TIMELINE,
                    ],
                    limit=500,
                )
            )
        except Exception:
            return task

        counts = {
            "novel": 0,
            "chapter": 0,
            "character": 0,
            "world": 0,
            "relationship": 0,
            "timeline": 0,
        }
        novel_id: Optional[str] = None
        for item in getattr(result, "items", []) or []:
            item_type = getattr(item.metadata.type, "value", str(item.metadata.type)).lower()
            if item_type in counts:
                counts[item_type] += 1
            if item_type == "novel" and not novel_id:
                novel_id = str(item.metadata.id)

        if counts["novel"] <= 0 or counts["chapter"] <= 0:
            return task

        task.status = TaskStatus.COMPLETED
        task.progress = 1.0
        task.completed_at = task.completed_at or datetime.now()
        task.message = "导入任务已完成，已根据内容库资产恢复任务状态。"
        task.result = {
            "session_id": session_id,
            "parent_id": novel_id,
            "chapters_count": counts["chapter"],
            "characters_count": counts["character"],
            "relationships_count": counts["relationship"],
            "timeline_count": counts["timeline"],
            "world_count": counts["world"],
            "analysis_status": "completed" if counts["character"] and counts["relationship"] else "partial",
            "analysis_stage_results": {
                "chapter_index": "completed" if counts["chapter"] else "failed",
                "characters": "completed" if counts["character"] else "failed",
                "world_setting": "completed" if counts["world"] else "failed",
                "timeline_events": "completed" if counts["timeline"] else "failed",
                "relationships": "completed" if counts["relationship"] else "failed",
            },
            "recovered_from_assets": True,
        }
        await self._save_task(task)
        return task
    
    async def _load_pending_tasks(self):
        """启动时加载所有待处理的任务"""
        try:
            all_keys = await self.storage.list_keys()
            # 建立优先级映射以便处理字符串形式的旧数据
            prio_map = {
                "low": TaskPriority.LOW,
                "medium": TaskPriority.MEDIUM,
                "high": TaskPriority.HIGH,
                "critical": TaskPriority.CRITICAL,
                1: TaskPriority.LOW,
                2: TaskPriority.MEDIUM,
                3: TaskPriority.HIGH,
                4: TaskPriority.CRITICAL
            }
            
            for key in all_keys:
                if key.startswith("task_"):
                    task_data = await self.storage.load(key)
                    if not task_data: continue
                    
                    status_val = task_data.get("status")
                    if status_val in ["pending", "running"]:
                        # 转换优先级
                        raw_prio = task_data.get("priority")
                        prio = TaskPriority.MEDIUM
                        if isinstance(raw_prio, str):
                            prio = prio_map.get(raw_prio.lower(), TaskPriority.MEDIUM)
                        elif isinstance(raw_prio, int):
                            prio = prio_map.get(raw_prio, TaskPriority.MEDIUM)
                            
                        task = Task(
                            id=task_data["id"],
                            type=task_data["type"],
                            status=TaskStatus.PENDING,
                            priority=prio,
                            parameters=task_data["parameters"],
                            created_at=datetime.fromisoformat(task_data["created_at"]),
                            started_at=None,
                            completed_at=None,
                            result=None,
                            error=None,
                            progress=task_data.get("progress", 0.0),
                            message=task_data.get("message", ""),
                            user_id=task_data.get("user_id")
                        )
                        self.tasks[task.id] = task
                        self.queue.append(task)
            print(f"Successfully recovered {len(self.queue)} tasks from storage.")
        except Exception as e:
            import traceback
            print(f"Error loading pending tasks: {e}")
            traceback.print_exc()

    async def get_user_tasks(self, user_id: str, limit: int = 20, offset: int = 0) -> List[Task]:
        """获取用户的所有任务"""
        all_task_ids = await self.storage.list_keys()
        user_tasks = []
        
        for key in all_task_ids:
            if key.startswith("task_"):
                task_data = await self.storage.load(key)
                if task_data and task_data.get("user_id") == user_id:
                    task = Task(
                        id=task_data["id"],
                        type=task_data["type"],
                        status=TaskStatus(task_data["status"]),
                        priority=TaskPriority(task_data["priority"]),
                        parameters=task_data["parameters"],
                        created_at=datetime.fromisoformat(task_data["created_at"]),
                        started_at=datetime.fromisoformat(task_data["started_at"]) if task_data["started_at"] else None,
                        completed_at=datetime.fromisoformat(task_data["completed_at"]) if task_data["completed_at"] else None,
                        result=task_data["result"],
                        error=task_data["error"],
                        progress=task_data.get("progress", 0.0),
                        message=task_data.get("message", ""),
                        user_id=task_data["user_id"]
                    )
                    user_tasks.append(task)
        
        # 按创建时间排序
        user_tasks.sort(key=lambda x: x.created_at, reverse=True)
        
        # 分页处理
        start_idx = offset
        end_idx = start_idx + limit
        return user_tasks[start_idx:end_idx]
    
    async def get_active_tasks_by_session(self, session_id: str) -> List[Task]:
        """获取指定会话的所有任务，支持持久化恢复"""
        session_tasks = []
        
        all_keys = await self.storage.list_keys()
        for key in all_keys:
            if key.startswith("task_"):
                task_data = await self.storage.load(key)
                if task_data and task_data.get("parameters", {}).get("session_id") == session_id:
                    # 获取状态
                    task = Task(
                        id=task_data["id"],
                        type=task_data["type"],
                        status=TaskStatus(task_data["status"]),
                        priority=TaskPriority(task_data["priority"]),
                        parameters=task_data["parameters"],
                        created_at=datetime.fromisoformat(task_data["created_at"]),
                        started_at=datetime.fromisoformat(task_data["started_at"]) if task_data.get("started_at") else None,
                        completed_at=datetime.fromisoformat(task_data["completed_at"]) if task_data.get("completed_at") else None,
                        result=task_data.get("result"),
                        error=task_data.get("error"),
                        progress=task_data.get("progress", 0.0),
                        message=task_data.get("message", ""),
                        user_id=task_data.get("user_id")
                    )
                    task = await self._recover_completed_import_task_from_assets(task)
                    if task.status not in {TaskStatus.PENDING, TaskStatus.RUNNING}:
                        continue
                    session_tasks.append(task)
                    
        # 排序：按创建时间倒序
        session_tasks.sort(key=lambda x: x.created_at, reverse=True)
        # 过滤：只返回最近的 5 个任务，避免前端拥堵
        return session_tasks[:5]

    async def get_recent_tasks_by_session(
        self,
        session_id: str,
        *,
        limit: int = 10,
        task_type: Optional[str] = None,
    ) -> List[Task]:
        """Return recent persisted tasks for a session, including terminal tasks."""
        session_tasks: List[Task] = []

        all_keys = await self.storage.list_keys()
        for key in all_keys:
            if not key.startswith("task_"):
                continue
            task_data = await self.storage.load(key)
            if not task_data or task_data.get("parameters", {}).get("session_id") != session_id:
                continue
            if task_type and task_data.get("type") != task_type:
                continue
            task = Task(
                id=task_data["id"],
                type=task_data["type"],
                status=TaskStatus(task_data["status"]),
                priority=TaskPriority(task_data["priority"]),
                parameters=task_data["parameters"],
                created_at=datetime.fromisoformat(task_data["created_at"]),
                started_at=datetime.fromisoformat(task_data["started_at"]) if task_data.get("started_at") else None,
                completed_at=datetime.fromisoformat(task_data["completed_at"]) if task_data.get("completed_at") else None,
                result=task_data.get("result"),
                error=task_data.get("error"),
                progress=task_data.get("progress", 0.0),
                message=task_data.get("message", ""),
                user_id=task_data.get("user_id"),
            )
            task = await self._recover_completed_import_task_from_assets(task)
            if isinstance(task.result, dict) and task.result.get("recovered_from_assets"):
                task.message = "已从当前项目资产库恢复导入状态。"
                task.result.setdefault("analysis_stage_results", {
                    "chapter_index": "completed" if task.result.get("chapters_count") else "failed",
                    "characters": "completed" if task.result.get("characters_count") else "failed",
                    "world_setting": "completed" if task.result.get("world_count") else "failed",
                    "timeline_events": "completed" if task.result.get("timeline_count") else "failed",
                    "relationships": "completed" if task.result.get("relationships_count") else "failed",
                })
            session_tasks.append(task)

        session_tasks.sort(key=lambda item: item.completed_at or item.created_at, reverse=True)
        return session_tasks[: max(1, min(limit, 50))]
    
    def get_queue_stats(self) -> Dict[str, Any]:
        """获取队列统计信息"""
        pending_count = len([t for t in self.queue if t.status == TaskStatus.PENDING])
        running_count = len(self.running_tasks)
        total_count = len(self.tasks)
        
        return {
            "pending_tasks": pending_count,
            "running_tasks": running_count,
            "total_tasks": total_count,
            "max_concurrent": self.max_concurrent_tasks,
            "queue_length": len(self.queue)
        }


# 全局AI调度器实例
_ai_scheduler: Optional[AITaskScheduler] = None


def get_ai_scheduler(ai_service: AIService, storage_manager: StorageManager, config: Config, content_manager: Any = None) -> AITaskScheduler:
    """获取或创建AI调度器实例"""
    global _ai_scheduler
    if _ai_scheduler is None:
        _ai_scheduler = AITaskScheduler(ai_service, storage_manager, config, content_manager)
    return _ai_scheduler
