"""
文本处理API端点
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Form, status
from fastapi.responses import JSONResponse
from typing import Optional
import tempfile
import os
import uuid
from pathlib import Path
from importlib.util import find_spec
import json

from ..core.config import Config
from ..content.manager import ContentManager
from ..services.ai_scheduler import TaskPriority as SchedulerTaskPriority
from ..services.ai_scheduler import get_ai_scheduler
from ..services.ai_service import AIService
from ..storage.storage_manager import StorageManager
from ..services.text_processing_service import text_processing_service
from ..types.text_processing import TextProcessingConfig


def _use_content_database(storage_type: Optional[str]) -> bool:
    normalized = (storage_type or "").strip().lower()
    if normalized in {"database", "content_db"}:
        return True
    if normalized in {"file", "memory"}:
        return False
    return True


def _get_shared_ai_scheduler():
    config = Config.load()
    ai_service = AIService(config)
    storage_manager = StorageManager(
        default_storage=config.storage_type if config.storage_type in {"file", "memory", "database", "content_db"} else "file",
        file_storage_dir=config.file_storage_dir,
        database_path=config.database_path,
        content_db_path=config.content_database_path,
    )
    content_manager = ContentManager(
        storage_manager,
        use_database=config.use_content_database or _use_content_database(config.storage_type),
    )
    return get_ai_scheduler(ai_service, storage_manager, config, content_manager)


def _validate_format_dependencies(file_extension: str) -> None:
    """在任务提交前检查格式依赖，避免后台任务秒失败。"""
    required_modules: dict[str, list[str]] = {
        ".epub": ["ebooklib", "bs4"],
        ".pdf": ["PyPDF2"],
        ".docx": ["docx"],
    }
    missing = [
        module
        for module in required_modules.get(file_extension, [])
        if find_spec(module) is None
    ]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{file_extension} 导入缺少依赖: {', '.join(missing)}",
        )

router = APIRouter(prefix="/text-processing", tags=["text-processing"])


@router.post("/upload-and-process")
async def upload_and_process(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    openai_config: Optional[str] = Form(None), # 新增：支持从 Form 中接收自定义配置
    parent_id: Optional[str] = Form(None),
    remove_extra_whitespace: bool = Form(True),
    normalize_paragraphs: bool = Form(True),
    detect_chapters: bool = Form(True),
    extract_metadata: bool = Form(True),
    remove_headers_footers: bool = Form(True),
    preserve_line_breaks: bool = Form(False)
):
    """
    异步上传并处理文本文件，支持用户隔离的 AI 配置
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="上传文件缺少文件名",
        )

    if not session_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="session_id 不能为空",
        )

    # 验证文件类型
    allowed_extensions = {'.txt', '.epub', '.pdf', '.docx'}
    file_extension = Path(file.filename).suffix.lower()
    
    if file_extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件格式: {file_extension}"
        )

    _validate_format_dependencies(file_extension)
    
    temp_file_path = None

    try:
        # 1. 保存临时文件
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as temp_file:
            content = await file.read()
            if not content:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="上传文件为空",
                )
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        # 2. 准备处理配置
        process_config = {
            "remove_extra_whitespace": remove_extra_whitespace,
            "normalize_paragraphs": normalize_paragraphs,
            "detect_chapters": detect_chapters,
            "extract_metadata": extract_metadata,
            "remove_headers_footers": remove_headers_footers,
            "preserve_line_breaks": preserve_line_breaks
        }

        # 解析 openai_config
        parsed_openai_config = None
        if openai_config:
            try:
                parsed_openai_config = json.loads(openai_config)
                if parsed_openai_config is not None and not isinstance(parsed_openai_config, dict):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="openai_config 必须是 JSON 对象",
                    )
            except json.JSONDecodeError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="openai_config 不是合法 JSON",
                )
        
        # 3. 提交异步任务，将用户指定的模型配置注入任务参数
        ai_scheduler = _get_shared_ai_scheduler()
        if not ai_scheduler.is_running:
            await ai_scheduler.start()
        task_id = await ai_scheduler.submit_task(
            task_type="novel_import",
            parameters={
                "file_path": temp_file_path,
                "book_title": Path(file.filename).stem,
                "session_id": session_id,
                "parent_id": parent_id,
                "config": process_config,
                "openai_config": parsed_openai_config, # 注入模型配置
                "source_file_name": file.filename,
                "import_run_id": f"import_{uuid.uuid4().hex[:12]}",
            },
            priority=SchedulerTaskPriority.HIGH
        )
        
        return {
            "success": True,
            "task_id": task_id,
            "message": "导入分析任务已提交"
        }
    except HTTPException:
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except OSError:
                pass
        raise
    except Exception as e:
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except OSError:
                pass
        raise HTTPException(status_code=500, detail=f"提交导入任务失败: {str(e)}")


@router.post("/process-text")
async def process_text(
    text: str = Form(...),
    remove_extra_whitespace: bool = Form(True),
    normalize_paragraphs: bool = Form(True),
    detect_chapters: bool = Form(True),
    extract_metadata: bool = Form(True),
    remove_headers_footers: bool = Form(True),
    preserve_line_breaks: bool = Form(False)
):
    """
    直接处理文本内容
    
    Args:
        text: 待处理的文本
        remove_extra_whitespace: 是否移除多余空白字符
        normalize_paragraphs: 是否标准化段落
        detect_chapters: 是否检测章节
        extract_metadata: 是否提取元数据
        remove_headers_footers: 是否移除页眉页脚
        preserve_line_breaks: 是否保留换行符
    
    Returns:
        处理后的文本结果
    """
    try:
        # 创建处理配置
        config = TextProcessingConfig(
            remove_extra_whitespace=remove_extra_whitespace,
            normalize_paragraphs=normalize_paragraphs,
            detect_chapters=detect_chapters,
            extract_metadata=extract_metadata,
            remove_headers_footers=remove_headers_footers,
            preserve_line_breaks=preserve_line_breaks
        )
        
        # 处理文本
        result = text_processing_service.process_text(text, config)
        
        # 返回处理结果
        return {
            "success": True,
            "data": {
                "content": result.content,
                "metadata": {
                    "title": result.metadata.title,
                    "author": result.metadata.author,
                    "language": result.metadata.language,
                    "word_count": result.metadata.word_count,
                    "char_count": result.metadata.char_count,
                    "paragraph_count": result.metadata.paragraph_count,
                    "chapter_count": result.metadata.chapter_count,
                    "reading_time_minutes": result.metadata.reading_time_minutes,
                    "format": result.metadata.format.value if result.metadata.format else None,
                    "tags": result.metadata.tags
                },
                "chapters": [
                    {
                        "title": chapter.title,
                        "content": chapter.content,
                        "start_position": chapter.start_position,
                        "end_position": chapter.end_position,
                        "index": chapter.index
                    } for chapter in result.chapters
                ],
                "warnings": result.warnings
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


@router.post("/validate-file")
async def validate_file_endpoint(file: UploadFile = File(...)):
    """
    验证上传的文件
    
    Args:
        file: 待验证的文件
    
    Returns:
        验证结果
    """
    try:
        # 创建临时文件来验证上传的内容
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        try:
            # 验证文件
            validation_result = text_processing_service.validate_file(temp_file_path)
            return {
                "success": True,
                "data": validation_result
            }
        finally:
            # 删除临时文件
            os.unlink(temp_file_path)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"验证过程中发生错误: {str(e)}")


@router.get("/supported-formats")
async def get_supported_formats():
    """
    获取支持的文件格式
    
    Returns:
        支持的文件格式列表
    """
    from ..types.text_processing import TextFormat
    
    return {
        "success": True,
        "data": {
            "formats": [fmt.value for fmt in TextFormat],
            "description": {
                "txt": "纯文本文件",
                "epub": "电子书格式",
                "pdf": "便携式文档格式",
                "docx": "Microsoft Word文档"
            }
        }
    }
