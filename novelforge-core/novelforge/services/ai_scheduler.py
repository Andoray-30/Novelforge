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
        
        if self.content_manager is None:
            raise ValueError("内容管理器未初始化，无法执行导入任务")

        if not file_path or not os.path.exists(file_path):
            raise ValueError(f"文件不存在: {file_path}")
            
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
        
        # 2. 保存章节 (分阶段汇报进度)
        task.message = f"解析完成，正在保存 {len(chapters_to_save)} 个章节..."
        await self._save_task(task)
        
        chapters_data = []
        total_chapters = len(chapters_to_save)
        analysis_status = "completed"
        analysis_warning = None
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
            
            # 创建内容项
            item_id = f"chapter_{session_id}_{uuid.uuid4().hex[:12]}"
            chapter_payload = {
                "title": chapter_title,
                "chapter_title": chapter_title,
                "content": chapter.content,
                "chapter_index": chapter_number,
                "start_position": chapter.start_position,
                "end_position": chapter.end_position,
                "book_title": book_title,
                "source": "text_processing_import",
                "source_file": source_file_name,
                "source_fingerprint": source_fingerprint,
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
                content=chapter.content,
                extracted_data=chapter_payload,
            )
            await self.content_manager.create_content(item)
            chapters_data.append({"id": item_id, "title": item.metadata.title, "chapter_index": chapter_number})
            
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
            analysis_status = "timed_out"
            analysis_warning = "AI analysis timed out; chapters were imported but structured extraction was skipped."
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
            analysis_status = "failed"
            analysis_warning = f"AI analysis failed after chapter import: {str(e)[:120]}"
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
                
                world_item = ContentItem(
                    metadata=ContentMetadata(
                        id=world_id,
                        title="世界深度设定",
                        type="world",
                        session_id=session_id,
                        parent_id=parent_id,
                        tags=["extracted", "world-core", f"project-{session_id}", f"import-run-{import_run_id}"]
                    ),
                    content=raw_world.get('history', '世界深度分析已完成'),
                    extracted_data={
                        **raw_world,
                        "import_run_id": import_run_id,
                        "source_file": source_file_name,
                        "source_fingerprint": source_fingerprint,
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
                        tags=["extracted", "interaction", f"project-{session_id}", f"import-run-{import_run_id}"]
                    ),
                    content=raw_rel.get('description', ''),
                    extracted_data={
                        **raw_rel,
                        "import_run_id": import_run_id,
                        "source_file": source_file_name,
                        "source_fingerprint": source_fingerprint,
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
            "import_run_id": import_run_id,
            "analysis_status": analysis_status,
            "analysis_warning": analysis_warning,
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
