"""
AI调度系统 - 管理和调度AI任务的执行
"""
import asyncio
import time
from typing import Dict, List, Optional, Callable, Any
from datetime import datetime
from enum import Enum
from dataclasses import dataclass
from novelforge.services.ai_service import AIService
from novelforge.storage.storage_manager import StorageManager
from novelforge.core.config import Config


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
    user_id: Optional[str] = None  # 支持多用户


class AITaskScheduler:
    """AI任务调度器"""
    
    def __init__(self, ai_service: AIService, storage_manager: StorageManager, config: Config):
        self.ai_service = ai_service
        self.storage = storage_manager
        self.config = config
        self.tasks: Dict[str, Task] = {}
        self.queue: List[Task] = []
        self.running_tasks: List[Task] = []
        self.max_concurrent_tasks = config.max_concurrent_tasks if hasattr(config, 'max_concurrent_tasks') else 3
        self.is_running = False
        self._event_loop = None
        self.task_processors = {
            "novel_generation": self._process_novel_generation_task,
            "text_generation": self._process_text_generation_task,
            "extraction": self._process_extraction_task,
            "character_generation": self._process_character_generation_task,
            "world_building": self._process_world_building_task,
            "timeline_generation": self._process_timeline_task,
            "relationship_extraction": self._process_relationship_task
        }
        
    async def start(self):
        """启动调度器"""
        self.is_running = True
        self._event_loop = asyncio.get_event_loop()
        asyncio.create_task(self._run_scheduler())
        
    async def stop(self):
        """停止调度器"""
        self.is_running = False
        
    async def _run_scheduler(self):
        """调度器主循环"""
        while self.is_running:
            await self._process_queue()
            await asyncio.sleep(1)  # 每秒检查一次队列
            
    async def _process_queue(self):
        """处理任务队列"""
        if len(self.running_tasks) >= self.max_concurrent_tasks:
            return  # 已达到最大并发数
            
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
        try:
            # 检查任务类型是否存在处理器
            if task.type not in self.task_processors:
                raise ValueError(f"未知任务类型: {task.type}")
            
            # 执行任务
            result = await self.task_processors[task.type](task)
            
            # 更新任务状态为完成
            task.status = TaskStatus.COMPLETED
            task.completed_at = datetime.now()
            task.result = result
            
        except Exception as e:
            # 更新任务状态为失败
            task.status = TaskStatus.FAILED
            task.completed_at = datetime.now()
            task.error = str(e)
            
        finally:
            # 从运行列表中移除任务
            if task in self.running_tasks:
                self.running_tasks.remove(task)
            
            # 保存最终任务状态
            await self._save_task(task)
    
    async def _process_novel_generation_task(self, task: Task) -> Dict[str, Any]:
        """处理小说生成任务"""
        from novelforge.api.ai_planning_service import get_ai_planning_service
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
        from novelforge.services.extraction_service import get_extraction_service
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
        from novelforge.api.ai_planning_service import get_ai_planning_service
        ai_planning_service = get_ai_planning_service(self.ai_service)
        
        context = task.parameters.get("context", "")
        roles = task.parameters.get("roles", [])
        
        result = await ai_planning_service.design_characters(context, roles)
        return [item.model_dump() if hasattr(item, 'model_dump') else item for item in result]
    
    async def _process_world_building_task(self, task: Task) -> Dict[str, Any]:
        """处理世界构建任务"""
        from novelforge.api.ai_planning_service import get_ai_planning_service
        ai_planning_service = get_ai_planning_service(self.ai_service)
        
        story_outline = task.parameters.get("story_outline", {})
        
        result = await ai_planning_service.build_world_setting(story_outline)
        return result.model_dump() if hasattr(result, 'model_dump') else result
    
    async def _process_timeline_task(self, task: Task) -> Dict[str, Any]:
        """处理时间线生成任务"""
        from novelforge.services.extraction_service import get_extraction_service
        extraction_service = get_extraction_service(self.ai_service, self.config)
        
        text = task.parameters.get("text", "")
        if not text:
            raise ValueError("时间线生成任务缺少text参数")
        
        timeline_events = await extraction_service.extract_timeline(text)
        return [event.model_dump() for event in timeline_events]
    
    async def _process_relationship_task(self, task: Task) -> Dict[str, Any]:
        """处理关系提取任务"""
        from novelforge.services.extraction_service import get_extraction_service
        extraction_service = get_extraction_service(self.ai_service, self.config)
        
        text = task.parameters.get("text", "")
        if not text:
            raise ValueError("关系提取任务缺少text参数")
        
        relationships = await extraction_service.extract_relationships(text)
        return [rel.model_dump() for rel in relationships]
    
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
                    user_id=task_data["user_id"]
                )
                self.tasks[task_id] = task
        
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
            "user_id": task.user_id
        }
        await self.storage.save(f"task_{task.id}", task_data)
    
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
                        user_id=task_data["user_id"]
                    )
                    user_tasks.append(task)
        
        # 按创建时间排序
        user_tasks.sort(key=lambda x: x.created_at, reverse=True)
        
        # 分页处理
        start_idx = offset
        end_idx = start_idx + limit
        return user_tasks[start_idx:end_idx]
    
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


def get_ai_scheduler(ai_service: AIService, storage_manager: StorageManager, config: Config) -> AITaskScheduler:
    """获取或创建AI调度器实例"""
    global _ai_scheduler
    if _ai_scheduler is None:
        _ai_scheduler = AITaskScheduler(ai_service, storage_manager, config)
    return _ai_scheduler