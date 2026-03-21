"""
NovelForge 统一异常处理模块

提供标准化的异常类层次结构，用于整个项目的错误处理。
"""

import logging
from typing import Optional, Dict, Any


class NovelForgeError(Exception):
    """
    NovelForge 基础异常类
    
    所有自定义异常都应该继承此类，提供统一的错误信息结构。
    """
    
    def __init__(
        self,
        message: str,
        category: str = "unknown",
        severity: str = "medium",
        code: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        context: Optional[str] = None,
        retryable: bool = False,
        status_code: Optional[int] = None
    ):
        super().__init__(message)
        self.message = message
        self.category = category
        self.severity = severity
        self.code = code or f"{category.upper()}_ERROR"
        self.details = details or {}
        self.context = context
        self.retryable = retryable
        self.status_code = status_code
        
        # 记录错误日志
        self._log_error()
    
    def _log_error(self):
        """记录结构化错误日志"""
        logger = logging.getLogger(__name__)
        
        # 根据严重程度选择日志级别
        log_data = {
            "error_code": self.code,
            "category": self.category,
            "severity": self.severity,
            "context": self.context,
            "retryable": self.retryable,
            "details": self.details
        }
        
        if self.severity == "critical":
            logger.critical(f"Critical error [{self.code}]: {self.message}", extra=log_data)
        elif self.severity == "high":
            logger.error(f"High severity error [{self.code}]: {self.message}", extra=log_data)
        elif self.severity == "medium":
            logger.warning(f"Medium severity error [{self.code}]: {self.message}", extra=log_data)
        else:
            logger.info(f"Low severity error [{self.code}]: {self.message}", extra=log_data)
    
    def to_dict(self) -> Dict[str, Any]:
        """将错误转换为字典格式，便于序列化和API响应"""
        return {
            "error": True,
            "type": self.__class__.__name__,
            "message": self.message,
            "category": self.category,
            "severity": self.severity,
            "code": self.code,
            "context": self.context,
            "retryable": self.retryable,
            "status_code": self.status_code,
            "details": self.details
        }
    
    def __str__(self) -> str:
        """字符串表示"""
        return f"[{self.code}] {self.message}"


# 具体异常类定义


class ValidationError(NovelForgeError):
    """验证错误 - 输入数据不符合要求"""
    
    def __init__(self, message: str, field: Optional[str] = None, value: Any = None, expected: Any = None, **kwargs):
        # 将验证相关的字段信息放入details中
        details = kwargs.get('details', {})
        if field is not None:
            details['field'] = field
        if value is not None:
            details['value'] = value
        if expected is not None:
            details['expected'] = expected
        kwargs['details'] = details
        
        super().__init__(
            message=message,
            category="validation",
            severity="low",
            code="VALIDATION_ERROR",
            **kwargs
        )


class NetworkError(NovelForgeError):
    """网络错误 - 连接问题、超时等"""
    
    def __init__(self, message: str, **kwargs):
        # 如果没有显式提供retryable，则默认为True
        if 'retryable' not in kwargs:
            kwargs['retryable'] = True
        super().__init__(
            message=message,
            category="network",
            severity="medium",
            code="NETWORK_ERROR",
            **kwargs
        )


class APIError(NovelForgeError):
    """API调用错误 - 第三方API返回错误"""
    
    def __init__(self, message: str, response_status: Optional[int] = None, **kwargs):
        # 根据状态码确定严重程度
        severity = "medium"
        if response_status and response_status >= 500:
            severity = "high"
        elif response_status and response_status == 429:  # 限流
            severity = "low"
            
        super().__init__(
            message=message,
            category="api",
            severity=severity,
            code="API_ERROR",
            retryable=response_status in [429, 503, 504],  # 限流和网关错误可重试
            status_code=response_status,
            **kwargs
        )


class StorageError(NovelForgeError):
    """存储错误 - 文件系统、数据库等存储操作失败"""
    
    def __init__(self, message: str, **kwargs):
        super().__init__(
            message=message,
            category="storage",
            severity="high",
            code="STORAGE_ERROR",
            **kwargs
        )


class ProcessingError(NovelForgeError):
    """数据处理错误 - 文本分析、提取、转换等处理失败"""
    
    def __init__(self, message: str, **kwargs):
        # 如果没有显式提供retryable，则默认为True
        if 'retryable' not in kwargs:
            kwargs['retryable'] = True
        super().__init__(
            message=message,
            category="processing",
            severity="medium",
            code="PROCESSING_ERROR",
            **kwargs
        )


class ConfigurationError(NovelForgeError):
    """配置错误 - 缺少必要配置或配置无效"""
    
    def __init__(self, message: str, **kwargs):
        super().__init__(
            message=message,
            category="configuration",
            severity="critical",
            code="CONFIGURATION_ERROR",
            **kwargs
        )


class ExternalServiceError(NovelForgeError):
    """外部服务错误 - SillyTavern、第三方服务等"""
    
    def __init__(self, message: str, **kwargs):
        # 如果没有显式提供retryable，则默认为True
        if 'retryable' not in kwargs:
            kwargs['retryable'] = True
        super().__init__(
            message=message,
            category="external_service",
            severity="high",
            code="EXTERNAL_SERVICE_ERROR",
            **kwargs
        )


class SystemError(NovelForgeError):
    """系统错误 - 内存不足、权限问题等系统级错误"""
    
    def __init__(self, message: str, **kwargs):
        super().__init__(
            message=message,
            category="system",
            severity="critical",
            code="SYSTEM_ERROR",
            **kwargs
        )