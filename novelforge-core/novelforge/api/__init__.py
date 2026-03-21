"""
FastAPI Web API for NovelForge
提供AI规划、角色提取、世界构建等Web API接口
"""

from fastapi import FastAPI, HTTPException, status, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime
import uuid
from enum import Enum

from .types import (
    NovelType,
    LengthType,
    TargetAudience,
    PlotPosition,
    ImportanceLevel,
    StoryOutlineParams,
    CharacterDesignRequest,
    WorldBuildingRequest,
    PlotPoint,
    CharacterRole,
    StoryOutline,
    CharacterDesign,
    WorldSetting,
    ErrorResponse,
    ChatRequest,
    ChatResponse,
    Message,
    Conversation,
    GenerationRequest,
    GenerationResult,
    NovelGenerationRequest,
    NovelGenerationResult,
    AITask,
    TaskQueueRequest,
    TaskQueueResponse,
    TaskStatus,
    TaskPriority as APITaskPriority
)
from ..core.models import (
    Character, WorldSetting as WorldSettingModel, Timeline, RelationshipNetwork,
    CharacterRole as CharacterRoleEnum, RelationshipType, ExtractionResult, TimelineEvent, NetworkEdge
)
from ..extractors.enhanced_orchestrator import EnhancedMultiWindowOrchestrator
from ..services.extraction_service import get_extraction_service, ExtractionService
# FIXME: 解决 TaskPriority 与 api.types 的同名导出冲突
from ..services.ai_scheduler import get_ai_scheduler, AITaskScheduler, TaskPriority as SchedulerTaskPriority
from ..services.ai_service import AIService

from ..core.config import Config
from .ai_planning_service import get_ai_planning_service, AIPlanningService
from ..storage.storage_manager import StorageManager
from ..content.manager import ContentManager
from ..content.models import ContentItem, ContentSearchRequest, ContentSearchResult, ContentExportRequest

# 全局配置和AI服务
config = Config.load()
ai_service = AIService(config)
ai_planning_service = get_ai_planning_service(ai_service)

# 创建提取器协调器
extractor_orchestrator = EnhancedMultiWindowOrchestrator(
    ai_service=ai_service,
    config=config
)

# 创建存储管理器
# TODO: 建议在此处检查数据存储路径是否存在，并确保当前进程具备写权限
storage_manager = StorageManager()

# 创建提取服务
extraction_service = get_extraction_service(ai_service, config)

# 创建AI调度器
ai_scheduler = get_ai_scheduler(ai_service, storage_manager, config)

# 创建内容管理器
content_manager = ContentManager(storage_manager)

# 初始化FastAPI应用
app = FastAPI(
    title="NovelForge AI Planning API",
    description="AI驱动的故事创作规划服务",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],  # 前端开发服务器
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API路由

@app.get("/")
async def root():
    """API根路径"""
    return {
        "message": "NovelForge AI Planning API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy", "timestamp": datetime.now()}

# AI规划相关端点

@app.post("/api/ai/generate-story-outline", response_model=StoryOutline)
async def generate_story_outline(params: StoryOutlineParams):
    """生成故事架构"""
    try:
        # 调用AI规划服务生成故事架构
        outline = await ai_planning_service.generate_story_outline(params)
        return outline
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"故事架构生成失败: {str(e)}"
        )

@app.post("/api/ai/design-characters", response_model=List[CharacterDesign])
async def design_characters(request: CharacterDesignRequest):
    """设计角色"""
    try:
        # 调用AI规划服务设计角色
        characters = await ai_planning_service.design_characters(
            request.context, request.roles
        )
        return characters
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"角色设计失败: {str(e)}"
        )

@app.post("/api/ai/build-world-setting", response_model=WorldSetting)
async def build_world_setting(request: WorldBuildingRequest):
    """构建世界设定"""
    try:
        # 调用AI规划服务构建世界设定
        world_setting = await ai_planning_service.build_world_setting(
            request.story_outline
        )
        return world_setting
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"世界构建失败: {str(e)}"
        )

# 工作流管理端点

@app.post("/api/workflow/start-process")
async def start_workflow_process(ai_plan: dict, source_text: Optional[str] = None):
    """启动完整工作流处理"""
    try:
        # TODO: 此处尚未接入实际工作流系统，目前仅生成了一个模拟的任务ID
        task_id = str(uuid.uuid4())
        return {
            "taskId": task_id,
            "status": "started",
            "message": "工作流已启动"
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"工作流启动失败: {str(e)}"
        )


@app.get("/api/workflow/status/{task_id}")
async def get_workflow_status(task_id: str):
    """获取工作流状态"""
    try:
        # TODO: 此处应实现对接任务管理器的真实状态查询逻辑
        return {
            "taskId": task_id,
            "status": "completed",  # 或 "running", "error"
            "progress": 100,
            "result": {},
            "message": "工作流已完成"
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取工作流状态失败: {str(e)}"
        )


# 文本提取相关端点

# FIXME: 已移除重复定义的多余的 @app.post 路由装饰器
@app.post("/api/extract/text", response_model=ExtractionResult)
async def extract_from_text(text_data: dict):
   """从文本中提取角色、世界设定、时间线和关系网络"""
   try:
       text = text_data.get("text", "")
       if not text:
           raise HTTPException(
               status_code=status.HTTP_400_BAD_REQUEST,
               detail="文本内容不能为空"
           )
       
       # 使用提取器协调器进行提取
       extraction_result = await extractor_orchestrator.extract(text)
       
       # 构建返回结果
       result = ExtractionResult(
           characters=extraction_result.get("characters", []),
           world=extraction_result.get("world_setting", None),
           timeline=Timeline(
               events=extraction_result.get("timeline_events", []),
               total_events=len(extraction_result.get("timeline_events", []))
           ),
           relationships=RelationshipNetwork(
               edges=extraction_result.get("relationships", []),
               nodes=list(set([edge.source for edge in extraction_result.get("relationships", [])] +
                             [edge.target for edge in extraction_result.get("relationships", [])])),
               total_relationships=len(extraction_result.get("relationships", []))
           ),
           success=True
       )
       
       return result
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"文本提取失败: {str(e)}"
       )

@app.post("/api/extract/file", response_model=ExtractionResult)
async def extract_from_file(file: UploadFile = File(...)):
   """从文件中提取角色、世界设定、时间线和关系网络"""
   try:
       # 检查文件类型
       if not file.filename.lower().endswith(('.txt', '.md', '.text')):
           raise HTTPException(
               status_code=status.HTTP_400_BAD_REQUEST,
               detail="只支持文本文件(.txt, .md, .text)"
           )
       
       # 读取文件内容
       content = await file.read()
       text = content.decode('utf-8')
       
       # 使用提取器协调器进行提取
       extraction_result = await extractor_orchestrator.extract(text)
       
       # 构建返回结果
       result = ExtractionResult(
           characters=extraction_result.get("characters", []),
           world=extraction_result.get("world_setting", None),
           timeline=Timeline(
               events=extraction_result.get("timeline_events", []),
               total_events=len(extraction_result.get("timeline_events", []))
           ),
           relationships=RelationshipNetwork(
               edges=extraction_result.get("relationships", []),
               nodes=list(set([edge.source for edge in extraction_result.get("relationships", [])] +
                             [edge.target for edge in extraction_result.get("relationships", [])])),
               total_relationships=len(extraction_result.get("relationships", []))
           ),
           success=True
       )
       
       return result
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"文件提取失败: {str(e)}"
       )


# 单独提取相关端点
@app.post("/api/extract/characters", response_model=List[Character])
async def extract_characters(text_data: dict):
  """单独提取角色"""
  try:
      text = text_data.get("text", "")
      if not text:
          raise HTTPException(
              status_code=status.HTTP_400_BAD_REQUEST,
              detail="文本内容不能为空"
          )
      
      characters = await extraction_service.extract_characters(text)
      return characters
  except Exception as e:
      raise HTTPException(
          status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
          detail=f"角色提取失败: {str(e)}"
      )


@app.post("/api/extract/world-setting", response_model=WorldSetting)
async def extract_world_setting(text_data: dict):
  """单独提取世界设定"""
  try:
      text = text_data.get("text", "")
      if not text:
          raise HTTPException(
              status_code=status.HTTP_400_BAD_REQUEST,
              detail="文本内容不能为空"
          )
      
      world_setting = await extraction_service.extract_world_setting(text)
      return world_setting
  except Exception as e:
      raise HTTPException(
          status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
          detail=f"世界设定提取失败: {str(e)}"
      )


@app.post("/api/extract/timeline", response_model=List[TimelineEvent])
async def extract_timeline(text_data: dict):
  """单独提取时间线"""
  try:
      text = text_data.get("text", "")
      if not text:
          raise HTTPException(
              status_code=status.HTTP_400_BAD_REQUEST,
              detail="文本内容不能为空"
          )
      
      timeline_events = await extraction_service.extract_timeline(text)
      return timeline_events
  except Exception as e:
      raise HTTPException(
          status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
          detail=f"时间线提取失败: {str(e)}"
      )


@app.post("/api/extract/relationships", response_model=List[NetworkEdge])
async def extract_relationships(text_data: dict):
  """单独提取关系网络"""
  try:
      text = text_data.get("text", "")
      if not text:
          raise HTTPException(
              status_code=status.HTTP_400_BAD_REQUEST,
              detail="文本内容不能为空"
          )
      
      relationships = await extraction_service.extract_relationships(text)
      return relationships
  except Exception as e:
      raise HTTPException(
          status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
          detail=f"关系网络提取失败: {str(e)}"
      )


# AI对话创作相关端点
@app.post("/api/chat/start-conversation", response_model=Conversation)
async def start_conversation():
   """开始新对话"""
   try:
       conversation = Conversation(
           title="新创作对话",
           messages=[],
           metadata={"type": "novel_creation"}
       )
       # 保存到存储
       await storage_manager.save(f"conversation_{conversation.id}", conversation.model_dump())
       return conversation
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"开始对话失败: {str(e)}"
       )


@app.post("/api/chat/send-message", response_model=ChatResponse)
async def send_message(request: ChatRequest):
   """发送消息到AI"""
   try:
       conversation_id = request.conversation_id
       if not conversation_id:
           # 创建新对话
           conversation = Conversation(
               title="AI创作对话",
               messages=[],
               metadata={"type": "novel_creation"}
           )
           conversation_id = conversation.id
           await storage_manager.save(f"conversation_{conversation_id}", conversation.model_dump())
       else:
           # 加载现有对话
           loaded = await storage_manager.load(f"conversation_{conversation_id}")
           if loaded:
               conversation = Conversation(**loaded)
           else:
               raise HTTPException(
                   status_code=status.HTTP_404_NOT_FOUND,
                   detail="对话不存在"
               )
       
       # 添加用户消息
       user_message = Message(role="user", content=request.message)
       conversation.messages.append(user_message)
       
       # 调用AI服务获取响应
       system_prompt = "你是一个专业的小说创作助手，帮助用户创作高质量的小说内容。请根据用户的请求和上下文信息进行创作。"
       if request.context:
           context_str = f"创作上下文: {request.context}"
           system_prompt += f"\n{context_str}"
       
       ai_response = await ai_service.chat(
           prompt=request.message,
           system_prompt=system_prompt
       )
       
       # 添加AI响应
       ai_message = Message(role="assistant", content=ai_response)
       conversation.messages.append(ai_message)
       
       # 更新对话时间戳
       conversation.updated_at = datetime.now()
       
       # 保存更新的对话
       await storage_manager.save(f"conversation_{conversation_id}", conversation.model_dump())
       
       # 生成建议回复
       suggestions = []
       if len(ai_response) > 100:
           # 简单的建议生成逻辑，实际应用中可用AI生成
           suggestions = [
               "请继续这个情节",
               "能详细描述一下人物感受吗？",
               "这个设定很有趣，能展开说说吗？"
           ]
       
       response = ChatResponse(
           conversation_id=conversation_id,
           message=ai_message,
           context=request.context,
           suggestions=suggestions
       )
       return response
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"发送消息失败: {str(e)}"
       )


@app.get("/api/chat/conversation/{conversation_id}", response_model=Conversation)
async def get_conversation(conversation_id: str):
   """获取对话历史"""
   try:
       loaded = await storage_manager.load(f"conversation_{conversation_id}")
       if not loaded:
           raise HTTPException(
               status_code=status.HTTP_404_NOT_FOUND,
               detail="对话不存在"
           )
       return Conversation(**loaded)
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"获取对话失败: {str(e)}"
       )


# 新剧情生成相关端点
@app.post("/api/generate/novel", response_model=NovelGenerationResult)
async def generate_novel_content(request: NovelGenerationRequest):
   """生成新小说内容"""
   try:
       # 构建生成提示
       story_context = request.story_context
       context_info = f"故事上下文: {story_context}"
       
       prompt_parts = []
       prompt_parts.append(context_info)
       prompt_parts.append(f"生成类型: {request.generation_type}")
       prompt_parts.append(f"目标长度: {request.target_length} 字")
       
       if request.focus_on:
           prompt_parts.append(f"重点关注: {', '.join(request.focus_on)}")
       
       if request.exclude_elements:
           prompt_parts.append(f"排除元素: {', '.join(request.exclude_elements)}")
       
       prompt_parts.append("请生成高质量的小说内容，确保情节连贯、人物生动、符合上下文。")
       
       prompt = "\n".join(prompt_parts)
       
       # 调用AI服务生成内容
       generated_text = await ai_service.chat(
           prompt=prompt,
           system_prompt="你是一个专业的小说作家，擅长创作高质量、连贯的故事情节。请根据给定的上下文和要求生成内容。",
           max_tokens=request.target_length // 4  # 粗略估算token数
       )
       
       # 创建生成结果
       result = NovelGenerationResult(
           generated_text=generated_text,
           extracted_characters=[],  # 可以进一步提取生成内容中的角色
           extracted_events=[],      # 可以进一步提取生成内容中的事件
           quality_metrics={"coherence": 0.8, "originality": 0.7, "relevance": 0.9},
           timeline=[],
           relationships=[],
           created_at=datetime.now()
       )
       
       return result
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"小说内容生成失败: {str(e)}"
       )


@app.post("/api/generate/text", response_model=GenerationResult)
async def generate_text(request: GenerationRequest):
   """通用文本生成"""
   try:
       # 使用AI服务生成文本
       generated_text = await ai_service.chat(
           prompt=request.prompt,
           system_prompt="你是一个高质量的文本生成助手。请根据用户的要求生成相应的内容。",
           temperature=request.temperature,
           max_tokens=request.length // 4 if request.length else 1000
       )
       
       result = GenerationResult(
           content=generated_text,
           quality_score=0.8,  # 可以用质量评估服务来计算
           extracted_elements=request.extract_info,
           metrics={
               "length": len(generated_text),
               "tokens": len(generated_text) // 4
           }
       )
       return result
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"文本生成失败: {str(e)}"
       )


# 启动AI调度器的函数
async def start_scheduler():
    await ai_scheduler.start()


# AI调度系统相关端点
@app.post("/api/task/queue", response_model=TaskQueueResponse)
async def queue_task(request: TaskQueueRequest):
   """将任务添加到队列"""
   try:
       task = AITask(
           type=request.task_type,
           parameters=request.parameters,
           priority=request.priority
       )
       
       # 保存任务
       await storage_manager.save(f"task_{task.id}", task.model_dump())
       
       response = TaskQueueResponse(
           task_id=task.id,
           status=task.status,
           message="任务已添加到队列"
       )
       return response
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"任务队列失败: {str(e)}"
       )


@app.get("/api/task/{task_id}", response_model=AITask)
async def get_basic_task_status(task_id: str):
    """获取任务状态"""
    loaded = await storage_manager.load(f"task_{task_id}")
    if not loaded:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    return AITask(**loaded)


@app.post("/api/task/{task_id}/execute")
async def execute_task(task_id: str):
   """执行任务（模拟）"""
   try:
       loaded = await storage_manager.load(f"task_{task_id}")
       if not loaded:
           raise HTTPException(
               status_code=status.HTTP_404_NOT_FOUND,
               detail="任务不存在"
           )
       
       task = AITask(**loaded)
       if task.status != TaskStatus.PENDING:
           raise HTTPException(
               status_code=status.HTTP_400_BAD_REQUEST,
               detail="任务状态不是待执行状态"
           )
       
       # 更新任务状态为运行中
       task.status = TaskStatus.RUNNING
       task.started_at = datetime.now()
       await storage_manager.save(f"task_{task_id}", task.model_dump())
       
       # 根据任务类型执行相应操作（模拟）
       result = None
       if task.type == "novel_generation":
           # 执行小说生成任务
           gen_request = NovelGenerationRequest(**task.parameters)
           result = await generate_novel_content(gen_request)
       elif task.type == "text_generation":
           # 执行文本生成任务
           gen_request = GenerationRequest(**task.parameters)
           result = await generate_text(gen_request)
       elif task.type == "extraction":
           # 执行提取任务
           result = await extract_from_text(task.parameters)
       else:
           # 其他任务类型
           result = {"status": "completed", "message": f"执行了{task.type}类型的任务"}
       
       # 更新任务状态为完成
       task.status = TaskStatus.COMPLETED
       task.completed_at = datetime.now()
       task.result = result.model_dump() if hasattr(result, 'model_dump') else result
       await storage_manager.save(f"task_{task_id}", task.model_dump())
       
       return {"message": "任务执行完成", "task_id": task_id}
   except Exception as e:
       # 更新任务状态为失败
       try:
           loaded = await storage_manager.load(f"task_{task_id}")
           if loaded:
               task = AITask(**loaded)
               task.status = TaskStatus.FAILED
               task.error = str(e)
               task.completed_at = datetime.now()
               await storage_manager.save(f"task_{task_id}", task.model_dump())
       except:
           pass  # 忽略保存错误
       
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"任务执行失败: {str(e)}"
       )


# 内容管理相关端点
@app.post("/api/content/create", response_model=dict)
async def create_content(content_item: ContentItem):
   """创建内容"""
   try:
       content_id = await content_manager.create_content(content_item)
       return {
           "success": True,
           "content_id": content_id,
           "message": "内容创建成功"
       }
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"内容创建失败: {str(e)}"
       )


@app.get("/api/content/{content_id}", response_model=ContentItem)
async def get_content(content_id: str):
   """获取内容"""
   try:
       content = await content_manager.get_content(content_id)
       if not content:
           raise HTTPException(
               status_code=status.HTTP_404_NOT_FOUND,
               detail="内容不存在"
           )
       return content
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"获取内容失败: {str(e)}"
       )


@app.put("/api/content/{content_id}", response_model=dict)
async def update_content(content_id: str, content_item: ContentItem):
   """更新内容"""
   try:
       # 设置正确的ID
       content_item.metadata.id = content_id
       success = await content_manager.update_content(content_id, content_item)
       if not success:
           raise HTTPException(
               status_code=status.HTTP_404_NOT_FOUND,
               detail="内容不存在"
           )
       return {
           "success": True,
           "message": "内容更新成功"
       }
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"内容更新失败: {str(e)}"
       )


@app.delete("/api/content/{content_id}", response_model=dict)
async def delete_content(content_id: str):
   """删除内容"""
   try:
       success = await content_manager.delete_content(content_id)
       if not success:
           raise HTTPException(
               status_code=status.HTTP_404_NOT_FOUND,
               detail="内容不存在"
           )
       return {
           "success": True,
           "message": "内容删除成功"
       }
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"内容删除失败: {str(e)}"
       )


@app.post("/api/content/search", response_model=ContentSearchResult)
async def search_content(request: ContentSearchRequest):
   """搜索内容"""
   try:
       result = await content_manager.search_content(request)
       return result
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"内容搜索失败: {str(e)}"
       )


@app.post("/api/content/export")
async def export_content(request: ContentExportRequest):
   """导出内容"""
   try:
       export_data = await content_manager.export_content(request)
       
       # 根据格式设置适当的响应头
       if request.format == "json":
           return Response(
               content=export_data,
               media_type="application/json",
               headers={
                   "Content-Disposition": f"attachment; filename=export.{request.format}"
               }
           )
       elif request.format == "txt":
           return Response(
               content=export_data,
               media_type="text/plain",
               headers={
                   "Content-Disposition": f"attachment; filename=export.{request.format}"
               }
           )
       else:
           # 默认返回JSON
           return Response(
               content=export_data,
               media_type="application/json",
               headers={
                   "Content-Disposition": f"attachment; filename=export.{request.format}"
               }
           )
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"内容导出失败: {str(e)}"
       )


@app.get("/api/content/stats", response_model=dict)
async def get_content_stats():
   """获取内容统计"""
   try:
       stats = await content_manager.get_content_stats()
       return stats
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"获取内容统计失败: {str(e)}"
       )


@app.get("/api/content/type/{content_type}", response_model=List[ContentItem])
async def list_content_by_type(
   content_type: str,
   status: Optional[str] = None
):
   """按类型列出内容"""
   try:
       contents = await content_manager.list_content_by_type(content_type, status)
       return contents
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"获取内容列表失败: {str(e)}"
       )


# AI调度系统相关端点
@app.post("/api/scheduler/submit", response_model=dict)
async def submit_task(
    task_type: str,
    parameters: dict,
    priority: SchedulerTaskPriority = SchedulerTaskPriority.MEDIUM,
    user_id: Optional[str] = None
):
    """提交新任务到调度器"""
    try:
        task_id = await ai_scheduler.submit_task(
            task_type=task_type,
            parameters=parameters,
            priority=priority,
            user_id=user_id
        )
        return {
            "success": True,
            "task_id": task_id,
            "message": "任务已提交到调度器"
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"任务提交失败: {str(e)}"
        )


@app.get("/api/scheduler/task/{task_id}", response_model=dict)
async def get_scheduler_task_status(task_id: str):
    """获取任务状态"""
    task = await ai_scheduler.get_task_status(task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    return {
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


@app.post("/api/scheduler/cancel/{task_id}", response_model=dict)
async def cancel_task(task_id: str):
    """取消任务"""
    try:
        success = await ai_scheduler.cancel_task(task_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="任务不存在或无法取消"
            )
        return {
            "success": True,
            "message": "任务已取消"
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"任务取消失败: {str(e)}"
        )


@app.get("/api/scheduler/stats", response_model=dict)
async def get_scheduler_stats():
    """获取调度器统计信息"""
    try:
        stats = ai_scheduler.get_queue_stats()
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取调度器统计失败: {str(e)}"
        )


@app.get("/api/scheduler/user-tasks/{user_id}", response_model=List[dict])
async def get_user_tasks(
    user_id: str,
    limit: int = 20,
    offset: int = 0
):
    """获取用户的所有任务"""
    try:
        tasks = await ai_scheduler.get_user_tasks(user_id, limit, offset)
        
        result = []
        for task in tasks:
            result.append({
                "id": task.id,
                "type": task.type,
                "status": task.status.value,
                "priority": task.priority.value,
                "created_at": task.created_at.isoformat(),
                "started_at": task.started_at.isoformat() if task.started_at else None,
                "completed_at": task.completed_at.isoformat() if task.completed_at else None,
                "error": task.error
            })
        
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取用户任务失败: {str(e)}"
        )


# 错误处理
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """HTTP异常处理"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "detail": f"HTTP {exc.status_code} 错误",
            "timestamp": datetime.now().isoformat()
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """通用异常处理"""
    return JSONResponse(
        status_code=500,
        content={
            "error": "服务器内部错误",
            "detail": str(exc),
            "timestamp": datetime.now().isoformat()
        }
    )














if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, reload=True)