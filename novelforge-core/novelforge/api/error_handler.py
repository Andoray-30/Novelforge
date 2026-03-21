"""
NovelForge API 错误处理模块

提供统一的API错误响应格式和异常处理。
"""

from datetime import datetime
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi import status
from typing import Optional, Dict, Any
import logging

from ..core.exceptions import NovelForgeError

logger = logging.getLogger(__name__)


class APIErrorResponse:
    """API错误响应格式"""
    
    def __init__(
        self,
        error: str,
        detail: str,
        code: Optional[str] = None,
        category: Optional[str] = None,
        severity: Optional[str] = None,
        retryable: bool = False,
        timestamp: Optional[str] = None,
        context: Optional[str] = None
    ):
        self.error = error
        self.detail = detail
        self.code = code
        self.category = category
        self.severity = severity
        self.retryable = retryable
        self.timestamp = timestamp or datetime.now().isoformat()
        self.context = context
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        result: Dict[str, Any] = {
            "error": self.error,
            "detail": self.detail,
            "timestamp": self.timestamp
        }
        
        if self.code is not None:
            result["code"] = self.code
        if self.category is not None:
            result["category"] = self.category
        if self.severity is not None:
            result["severity"] = self.severity
        if self.retryable:
            result["retryable"] = self.retryable
        if self.context is not None:
            result["context"] = self.context
            
        return result


def create_api_error_response(
    exc: Exception,
    default_status_code: int = 500,
    context: Optional[str] = None
) -> tuple[Dict[str, Any], int]:
    """
    创建API错误响应
    
    Args:
        exc: 异常对象
        default_status_code: 默认状态码
        context: 上下文信息
        
    Returns:
        (错误响应字典, 状态码)
    """
    if isinstance(exc, NovelForgeError):
        # NovelForgeError - 使用详细信息
        status_code = exc.status_code or default_status_code
        
        # 根据严重程度映射HTTP状态码
        if exc.severity == "critical":
            status_code = 500
        elif exc.severity == "high":
            status_code = 500
        elif exc.severity == "medium":
            status_code = 422  # Unprocessable Entity
        elif exc.severity == "low":
            status_code = 400  # Bad Request
            
        response = APIErrorResponse(
            error=exc.__class__.__name__,
            detail=exc.message,
            code=exc.code,
            category=exc.category,
            severity=exc.severity,
            retryable=exc.retryable,
            context=context
        )
    elif isinstance(exc, HTTPException):
        # FastAPI HTTPException - 直接使用
        status_code = exc.status_code
        response = APIErrorResponse(
            error=str(exc.detail),
            detail=str(exc.detail),
            context=context
        )
    else:
        # 其他异常 - 转换为通用错误
        status_code = default_status_code
        response = APIErrorResponse(
            error="服务器内部错误",
            detail=str(exc),
            category="system",
            severity="high",
            context=context
        )
    
    return response.to_dict(), status_code


async def http_exception_handler(request: Request, exc: HTTPException):
    """HTTP异常处理"""
    logger.warning(f"HTTP {exc.status_code} error: {exc.detail}")
    response_data, status_code = create_api_error_response(
        exc, 
        exc.status_code, 
        f"HTTP {exc.status_code} error"
    )
    return JSONResponse(status_code=status_code, content=response_data)


async def general_exception_handler(request: Request, exc: Exception):
    """通用异常处理"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    response_data, status_code = create_api_error_response(
        exc, 
        500, 
        "Unhandled exception"
    )
    return JSONResponse(status_code=status_code, content=response_data)


def handle_validation_error(field: str, value: Any, expected: str, context: str = "") -> HTTPException:
    """处理验证错误"""
    from ..core.exceptions import ValidationError
    error = ValidationError(
        message=f"字段 '{field}' 的值 '{value}' 不符合预期格式: {expected}",
        field=field,
        value=value,
        expected=expected,
        context=context
    )
    return HTTPException(
        status_code=400,
        detail=error.message
    )


def handle_api_error(
    message: str,
    status_code: int = 500,
    api_name: Optional[str] = None,
    response_status: Optional[int] = None,
    context: str = ""
) -> HTTPException:
    """处理API错误"""
    from ..core.exceptions import APIError
    error = APIError(
        message=message,
        api_name=api_name,
        response_status=response_status,
        context=context
    )
    return HTTPException(
        status_code=status_code,
        detail=error.message
    )


# 导出异常处理函数
exception_handlers = {
    HTTPException: http_exception_handler,
    Exception: general_exception_handler
}