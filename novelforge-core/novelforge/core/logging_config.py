"""
NovelForge 结构化日志配置

提供统一的日志记录配置和工具函数。
"""

import logging
import logging.config
import json
import sys
from pathlib import Path
from typing import Optional, Dict, Any


def setup_logging(
    log_level: str = "INFO",
    log_file: Optional[str] = None,
    structured: bool = True,
    console_output: bool = True
) -> None:
    """
    设置NovelForge的日志配置
    
    Args:
        log_level: 日志级别 (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_file: 日志文件路径，如果为None则只输出到控制台
        structured: 是否启用结构化日志（JSON格式）
        console_output: 是否输出到控制台
    """
    # 确保日志级别有效
    log_level = log_level.upper()
    if log_level not in ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]:
        log_level = "INFO"
    
    # 基础配置
    config: Dict[str, Any] = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {},
        "handlers": {},
        "root": {
            "level": log_level,
            "handlers": []
        },
        "loggers": {
            "novelforge": {
                "level": log_level,
                "handlers": [],
                "propagate": False
            }
        }
    }
    
    # 添加格式化器
    config["formatters"]["standard"] = {
        "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    }
    
    # 如果需要结构化日志，可以使用自定义格式化器
    if structured:
        config["formatters"]["structured"] = {
            "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s - %(module)s:%(funcName)s:%(lineno)d"
        }
    
    # 控制台处理器
    if console_output:
        config["handlers"]["console"] = {
            "class": "logging.StreamHandler",
            "level": log_level,
            "formatter": "structured" if structured else "standard",
            "stream": "ext://sys.stdout"
        }
        config["root"]["handlers"].append("console")
        config["loggers"]["novelforge"]["handlers"].append("console")
    
    # 文件处理器
    if log_file:
        # 确保日志目录存在
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        
        config["handlers"]["file"] = {
            "class": "logging.handlers.RotatingFileHandler",
            "level": log_level,
            "formatter": "structured" if structured else "standard",
            "filename": log_file,
            "maxBytes": 10485760,  # 10MB
            "backupCount": 5
        }
        config["root"]["handlers"].append("file")
        config["loggers"]["novelforge"]["handlers"].append("file")
    
    try:
        logging.config.dictConfig(config)
    except Exception as e:
        # 如果结构化日志失败，回退到标准日志
        if structured:
            # 使用标准输出而不是print，避免在日志未配置时的问题
            import sys
            print(f"Warning: Structured logging failed, falling back to standard logging: {e}", file=sys.stderr)
            setup_logging(log_level=log_level, log_file=log_file, structured=False, console_output=console_output)
        else:
            import sys
            print(f"Error setting up logging: {e}", file=sys.stderr)


def get_logger(name: str = "novelforge") -> logging.Logger:
    """
    获取配置好的logger实例
    
    Args:
        name: logger名称
        
    Returns:
        配置好的logger实例
    """
    return logging.getLogger(name)


def log_exception(
    logger: logging.Logger,
    exc: Exception,
    context: str = "",
    level: str = "ERROR"
) -> None:
    """
    记录异常信息
    
    Args:
        logger: logger实例
        exc: 异常对象
        context: 上下文信息
        level: 日志级别
    """
    level = level.upper()
    if level == "CRITICAL":
        logger.critical(f"Exception in {context}: {exc}", exc_info=True)
    elif level == "ERROR":
        logger.error(f"Exception in {context}: {exc}", exc_info=True)
    elif level == "WARNING":
        logger.warning(f"Exception in {context}: {exc}", exc_info=True)
    else:
        logger.info(f"Exception in {context}: {exc}", exc_info=True)


# 初始化默认日志配置
setup_logging()