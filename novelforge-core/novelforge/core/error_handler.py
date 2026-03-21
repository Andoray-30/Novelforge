"""
NovelForge 错误处理工具

提供统一的错误处理函数和装饰器。
"""

import functools
import logging
from typing import Optional, Callable, Any, TypeVar, cast
from .exceptions import NovelForgeError, APIError, ValidationError, ProcessingError
from .config import config

# 类型变量用于泛型装饰器
F = TypeVar('F', bound=Callable[..., Any])

logger = logging.getLogger(__name__)


def handle_errors(
    category: str = "unknown",
    context: Optional[str] = None,
    reraise: bool = True,
    log_level: str = "ERROR"
):
    """
    错误处理装饰器
    
    Args:
        category: 错误分类
        context: 上下文信息
        reraise: 是否重新抛出异常
        log_level: 日志级别
    """
    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except NovelForgeError:
                # 已经是NovelForgeError，直接重新抛出或记录
                if reraise:
                    raise
                else:
                    return None
            except Exception as e:
                # 转换为NovelForgeError
                error_context = context or f"Function {func.__name__}"
                novel_forge_error = NovelForgeError(
                    message=str(e),
                    category=category,
                    context=error_context
                )
                
                if not reraise:
                    return None
                
                raise novel_forge_error from e
        
        return cast(F, wrapper)
    return decorator


def safe_call(
    func: Callable,
    *args,
    default_return: Any = None,
    category: str = "unknown",
    context: Optional[str] = None,
    **kwargs
) -> Any:
    """
    安全调用函数，捕获并处理异常
    
    Args:
        func: 要调用的函数
        default_return: 默认返回值
        category: 错误分类
        context: 上下文信息
        *args, **kwargs: 函数参数
        
    Returns:
        函数结果或默认返回值
    """
    try:
        return func(*args, **kwargs)
    except NovelForgeError as e:
        logger.warning(f"Safe call failed: {e}")
        return default_return
    except Exception as e:
        error_context = context or f"Safe call to {func.__name__}"
        novel_forge_error = NovelForgeError(
            message=str(e),
            category=category,
            context=error_context
        )
        logger.warning(f"Safe call failed: {novel_forge_error}")
        return default_return


def validate_input(
    validator_func: Callable,
    error_message: str = "Input validation failed",
    field: Optional[str] = None
):
    """
    输入验证装饰器
    
    Args:
        validator_func: 验证函数
        error_message: 错误消息
        field: 字段名称
    """
    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            try:
                if not validator_func(*args, **kwargs):
                    raise ValidationError(
                        message=error_message,
                        field=field,
                        context=f"Validation for {func.__name__}"
                    )
                return func(*args, **kwargs)
            except ValidationError:
                raise
            except Exception as e:
                raise ValidationError(
                    message=f"Validation error: {str(e)}",
                    field=field,
                    context=f"Validation for {func.__name__}"
                ) from e
        
        return cast(F, wrapper)
    return decorator


# 初始化日志配置
from .logging_config import setup_logging
setup_logging(
    log_level=config.log_level,
    log_file=config.log_file,
    structured=config.structured_logging
)