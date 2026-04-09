"""
AI调度系统 - 管理和调度AI任务的执行
"""
import asyncio
import time
import logging
import sys
from typing import Dict, List, Optional, Callable, Any
from datetime import datetime
from enum import Enum
from dataclasses import dataclass
import uuid
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
            asyncio.create_task(self._execute_task(task))
            
            # 重新获取待处理任务列表
            ready_tasks = [task for task in self.queue if task.status == TaskStatus.PENDING]
            ready_tasks.sort(key=lambda x: x.priority.value, reverse=True)
    
    async def _execute_task(self, task: Task):
        """执行单个任务"""
        while True: # 增加重试循环以应对 429
            try:
                # 执行任务
                handler = self._get_task_handler(task.type)
                result = await handler(task)
                
                # 更新任务状态为完成
                task.status = TaskStatus.COMPLETED
                task.completed_at = datetime.now()
                task.result = result
                break # 成功执行，退出循环
                
            except Exception as e:
                error_str = str(e)
                # 识别 API 限流错误 (429)
                if "429" in error_str or "rate limit" in error_str.lower():
                    task.message = f"API 频率限制，正在等待重试... (出错: {error_str[:30]}...)"
                    await self._save_task(task)
                    # 指数级避让延迟：第 N 次失败等待 2^N * 10 秒
                    await asyncio.sleep(20) # 简单起点 20 秒
                    continue # 回到循环开始重试
                
                # 其他真实错误，标记为失败
                task.status = TaskStatus.FAILED
                task.completed_at = datetime.now()
                task.error = error_str
                break # 失败退场
                
        # 最终清理 (finally 逻辑)
        if task in self.running_tasks:
            self.running_tasks.remove(task)
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
            "novel_import": self._process_novel_import_task
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
    
    async def _process_novel_import_task(self, task: Task) -> Dict[str, Any]:
        """处理小说导入异步任务"""
        from ..services.text_processing_service import text_processing_service
        from ..types.text_processing import TextProcessingConfig
        from ..services.extraction_service import get_extraction_service
        from ..content.models import ContentItem, ContentMetadata
        from pathlib import Path
        import os
        
        params = task.parameters
        file_path = params.get("file_path")
        book_title = params.get("book_title")
        session_id = params.get("session_id")
        parent_id = params.get("parent_id")
        
        if not file_path or not os.path.exists(file_path):
            raise ValueError(f"文件不存在: {file_path}")
            
        task.message = "正在读取并解析文本..."
        task.progress = 0.1
        await self._save_task(task)
        
        # 如果没有指定 parent_id，先创建一个 Novel 根节点
        if not parent_id:
            parent_id = f"novel_{session_id}"
            novel_item = ContentItem(
                metadata=ContentMetadata(
                    id=parent_id,
                    title=book_title or "未命名小说",
                    type="novel",
                    session_id=session_id,
                    tags=["novel", f"project-{session_id}"]
                ),
                content=f"这是《{book_title}》的小说根节点，作为所有章节和角色的父级容器。"
            )
            await self.content_manager.create_content(novel_item)

        # 1. 解析文本 (在独立线程中运行，避免阻塞事件循环)
        config = TextProcessingConfig(**params.get("config", {}))
        result = await asyncio.to_thread(text_processing_service.process_file, file_path, config)
        
        # 2. 保存章节 (分阶段汇报进度)
        task.message = f"解析完成，正在保存 {len(result.chapters)} 个章节..."
        await self._save_task(task)
        
        chapters_data = []
        for i, chapter in enumerate(result.chapters):
            # 每存一章，进度递增（0.1 -> 0.7 阶段）
            task.progress = 0.1 + (i / len(result.chapters)) * 0.6
            task.message = f"正在保存第 {i+1}/{len(result.chapters)} 章: {chapter.title}"
            await self._save_task(task)
            
            # 创建内容项
            item_id = f"chapter_{session_id}_{i}"
            item = ContentItem(
                metadata=ContentMetadata(
                    id=item_id,
                    title=chapter.title or f"第 {i+1} 章",
                    type="chapter",
                    session_id=session_id,
                    parent_id=parent_id,
                    tags=["imported", f"project-{session_id}"]
                ),
                content=chapter.content
            )
            await self.content_manager.create_content(item)
            chapters_data.append({"id": item_id, "title": item.metadata.title})
            
        # 3. 深度分析 (0.7 -> 0.95 阶段)
        task.progress = 0.75
        task.message = "正在进行 AI 深度分析（角色、世界观提取）..."
        await self._save_task(task)
        
        # 提取关键信息 - 传递全文给提取器，由提取器内部进行分片和合并
        analysis_text = result.content
        logger.info(f"传递全文进行分析：{len(analysis_text)} 字符")
        
        # 解析并应用用户自定义模型配置
        runtime_ai_service = self.ai_service
        openai_config_dict = params.get("openai_config")
        if openai_config_dict:
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
        
        # 添加超时机制，最多等待5分钟
        try:
            task.message = "AI 分析中：提取角色信息..."
            await self._save_task(task)
            
            extracted = await asyncio.wait_for(
                extraction_service.extract_all(analysis_text),
                timeout=300  # 5分钟超时
            )
            
            task.message = "AI 分析完成，正在保存结果..."
            await self._save_task(task)
            
        except asyncio.TimeoutError:
            logger.error("AI 提取超时，使用默认空结果")
            extracted = {
                "characters": [],
                "world_setting": None,
                "timeline_events": [],
                "relationships": []
            }
            task.message = "AI 分析超时，已跳过深度分析"
            await self._save_task(task)
        except Exception as e:
            logger.error(f"AI 提取失败: {e}")
            extracted = {
                "characters": [],
                "world_setting": None,
                "timeline_events": [],
                "relationships": []
            }
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
                        tags=["extracted", "high-quality", f"project-{session_id}"]
                    ),
                    content=summary,
                    extracted_data=raw_data # 这里的 raw_data 包含您要的所有高质量字段（台词、背景、因果等）
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
                
                world_item = ContentItem(
                    metadata=ContentMetadata(
                        id=world_id,
                        title="世界深度设定",
                        type="world",
                        session_id=session_id,
                        parent_id=parent_id,
                        tags=["extracted", "world-core", f"project-{session_id}"]
                    ),
                    content=raw_world.get('history', '世界深度分析已完成'),
                    extracted_data=raw_world
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
                rel_id = f"rel_{session_id}_{uuid.uuid4().hex[:8]}"
                
                rel_item = ContentItem(
                    metadata=ContentMetadata(
                        id=rel_id,
                        title=f"{rel.source} -> {rel.target} ({rel.relationship_type})",
                        type="relationship",
                        session_id=session_id,
                        tags=["extracted", "interaction", f"project-{session_id}"]
                    ),
                    content=raw_rel.get('description', ''),
                    extracted_data=raw_rel,
                    # 记录关联实体，以便世界树精准绘图
                    relations={"source": [rel.source], "target": [rel.target]}
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
                event_id = f"timeline_{session_id}_{i}"
                event_content = f"""
【时间】{event.time if hasattr(event, 'time') else '未知'}
【事件】{event.description if hasattr(event, 'description') else '未描述'}
【涉及角色】{', '.join(event.characters) if hasattr(event, 'characters') and event.characters else '无'}
""".strip()
                
                event_item = ContentItem(
                    metadata=ContentMetadata(
                        id=event_id,
                        title=event.name if hasattr(event, 'name') else f"事件 {i+1}",
                        type="timeline",
                        session_id=session_id,
                        parent_id=parent_id,
                        tags=["extracted", f"project-{session_id}"]
                    ),
                    content=event_content,
                    extracted_data={
                        "time": event.time if hasattr(event, 'time') else "",
                        "importance": event.importance if hasattr(event, 'importance') else "medium"
                    }
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
        task.message = "处理完成！"
        return {
            "book_title": book_title,
            "chapters_count": len(result.chapters),
            "session_id": session_id
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
            
            # 从队列中移除（如果在队列中）
            if task in self.queue:
                self.queue.remove(task)
            
            # 从运行列表中移除（如果在运行中）
            if task in self.running_tasks:
                self.running_tasks.remove(task)
            
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
                    session_tasks.append(task)
                    
        # 排序：按创建时间倒序
        session_tasks.sort(key=lambda x: x.created_at, reverse=True)
        # 过滤：只返回最近的 5 个任务，避免前端拥堵
        return session_tasks[:5]
    
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