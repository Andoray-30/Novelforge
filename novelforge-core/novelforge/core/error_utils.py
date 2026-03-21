"""
NovelForge 错误处理工具模块

提供便捷的错误处理函数，用于在各模块中统一处理异常。
"""

import logging
from typing import Optional, Dict, Any, TypeVar, Callable
from functools import wraps
import asyncio

from .exceptions import NovelForgeError, ProcessingError
from .logging_config import get_logger

T = TypeVar('T')

logger = get_logger(__name__)


def handle_errors(
    error_type: type = ProcessingError,
    default_return: Any = None,
    log_level: str = "ERROR",
    context: Optional[str] = None
):
    """
    装饰器：自动处理函数中的异常
    
    Args:
        error_type: 要抛出的异常类型
        default_return: 发生错误时的默认返回值
        log_level: 日志级别
        context: 上下文信息
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except NovelForgeError:
                # 已经是NovelForgeError，直接重新抛出
                raise
            except Exception as e:
                error_msg = f"Error in {func.__name__}: {str(e)}"
                if context:
                    error_msg = f"[{context}] {error_msg}"
                
                logger.log(
                    getattr(logging, log_level.upper(), logging.ERROR),
                    error_msg,
                    exc_info=True
                )
                
                if default_return is not None:
                    return default_return
                
                raise error_type(
                    message=error_msg,
                    details={"function": func.__name__, "args": str(args), "kwargs": str(kwargs)},
                    context=context or func.__name__
                )
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except NovelForgeError:
                # 已经是NovelForgeError，直接重新抛出
                raise
            except Exception as e:
                error_msg = f"Error in {func.__name__}: {str(e)}"
                if context:
                    error_msg = f"[{context}] {error_msg}"
                
                logger.log(
                    getattr(logging, log_level.upper(), logging.ERROR),
                    error_msg,
                    exc_info=True
                )
                
                if default_return is not None:
                    return default_return
                
                raise error_type(
                    message=error_msg,
                    details={"function": func.__name__, "args": str(args), "kwargs": str(kwargs)},
                    context=context or func.__name__
                )
        
        # 检查是否是异步函数
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


def safe_call(
    func: Callable[..., T],
    *args,
    error_type: type = ProcessingError,
    default_return: Any = None,
    context: Optional[str] = None,
    **kwargs
) -> T:
    """
    安全调用函数，自动处理异常
    
    Args:
        func: 要调用的函数
        *args: 函数参数
        error_type: 要抛出的异常类型
        default_return: 发生错误时的默认返回值
        context: 上下文信息
        **kwargs: 函数关键字参数
        
    Returns:
        函数的返回值或默认返回值
    """
    try:
        return func(*args, **kwargs)
    except NovelForgeError:
        # 已经是NovelForgeError，直接重新抛出
        raise
    except Exception as e:
        error_msg = f"Error calling {func.__name__}: {str(e)}"
        if context:
            error_msg = f"[{context}] {error_msg}"
        
        logger.error(error_msg, exc_info=True)
        
        if default_return is not None:
            return default_return
        
        raise error_type(
            message=error_msg,
            details={"function": func.__name__, "args": str(args), "kwargs": str(kwargs)},
            context=context or func.__name__
        )


def log_and_raise(
    error: Exception,
    context: Optional[str] = None,
    log_level: str = "ERROR"
) -> None:
    """
    记录错误日志并重新抛出异常
    
    Args:
        error: 异常对象
        context: 上下文信息
        log_level: 日志级别
    """
    error_msg = str(error)
    if context:
        error_msg = f"[{context}] {error_msg}"
    
    logger.log(
        getattr(logging, log_level.upper(), logging.ERROR),
        error_msg,
        exc_info=True
    )
    
    raise error


def create_error_response(
    error: Exception,
    context: Optional[str] = None
) -> Dict[str, Any]:
    """
    创建标准化的错误响应字典
    
    Args:
        error: 异常对象
        context: 上下文信息
        
    Returns:
        标准化的错误响应字典
    """
    if isinstance(error, NovelForgeError):
        response = error.to_dict()
        if context:
            response["context"] = context
        return response
    else:
        return {
            "error": True,
            "type": error.__class__.__name__,
            "message": str(error),
            "category": "system",
            "severity": "high",
            "code": "SYSTEM_ERROR",
            "context": context,
            "retryable": False,
            "status_code": 500,
            "details": {}
        }