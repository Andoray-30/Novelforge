"""
文本处理API端点
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from typing import Optional
import tempfile
import os
from pathlib import Path

from novelforge.services.text_processing_service import text_processing_service
from novelforge.types.text_processing import TextProcessingConfig

router = APIRouter(prefix="/text-processing", tags=["text-processing"])


@router.post("/upload-and-process")
async def upload_and_process(
    file: UploadFile = File(...),
    remove_extra_whitespace: bool = Form(True),
    normalize_paragraphs: bool = Form(True),
    detect_chapters: bool = Form(True),
    extract_metadata: bool = Form(True),
    remove_headers_footers: bool = Form(True),
    preserve_line_breaks: bool = Form(False)
):
    """
    上传并处理文本文件
    
    Args:
        file: 上传的文件
        remove_extra_whitespace: 是否移除多余空白字符
        normalize_paragraphs: 是否标准化段落
        detect_chapters: 是否检测章节
        extract_metadata: 是否提取元数据
        remove_headers_footers: 是否移除页眉页脚
        preserve_line_breaks: 是否保留换行符
    
    Returns:
        处理后的文本结果
    """
    # 验证文件类型
    allowed_extensions = {'.txt', '.epub', '.pdf', '.docx'}
    file_extension = Path(file.filename).suffix.lower()
    
    if file_extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件格式: {file_extension}. 支持的格式: {', '.join(allowed_extensions)}"
        )
    
    # 检查文件大小 (最大50MB)
    # 注意：在FastAPI中，我们无法在读取之前直接检查上传文件的大小
    # 这里需要依赖服务器配置来限制上传大小
    
    try:
        # 创建临时文件来保存上传的内容
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as temp_file:
            # 将上传的文件内容写入临时文件
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name
        
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
            
            # 处理文件
            result = text_processing_service.process_file(temp_file_path, config)
            
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
        finally:
            # 删除临时文件
            os.unlink(temp_file_path)
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"文件处理错误: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


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
    from novelforge.types.text_processing import TextFormat
    
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