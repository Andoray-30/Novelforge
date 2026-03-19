"""
配置管理
"""

import os
from pathlib import Path
from typing import Optional
from pydantic import BaseModel
from dotenv import load_dotenv

# 加载 .env 文件 - 按优先级尝试多个位置
_env_loaded = False
_env_paths = [
    Path.cwd() / ".env",  # 当前工作目录
    Path(__file__).parent.parent.parent / ".env",  # novelforge-core/.env
    Path.cwd() / "novelforge-core" / ".env",  # 项目根目录下的 novelforge-core/.env
]

for _env_path in _env_paths:
    if _env_path.exists():
        load_dotenv(_env_path)
        _env_loaded = True
        break

# 如果都没找到，尝试默认加载
if not _env_loaded:
    load_dotenv()


class Config(BaseModel):
    """配置类"""
    # API 配置
    api_key: Optional[str] = None
    base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4o-mini"
    
    # SillyTavern 配置
    sillytavern_url: Optional[str] = None
    
    # 提取配置
    max_text_length: int = 5000  # 单次分析最大文本长度
    max_characters: int = 20  # 最大提取角色数
    retry_count: int = 3
    retry_delay: float = 1.0
    
    # 温度设置
    extraction_temperature: float = 0.3  # 提取任务温度
    creative_temperature: float = 0.8  # 创意任务温度
    
    # 动态并发配置
    min_concurrency: int = 2  # 最小并发数
    max_concurrency: int = 10  # 最大并发数
    target_success_rate: float = 0.95  # 目标成功率
    target_response_time: float = 5.0  # 目标响应时间（秒）
    
    # 限流配置
    rpm_limit: int = 500  # 每分钟请求数限制
    tpm_limit: int = 2_000_000  # 每分钟 Token 数限制
    
    # 重试配置
    max_retries: int = 5  # 最大重试次数
    retry_base_delay: float = 2.0  # 重试基础延迟（秒）
    retry_max_delay: float = 120.0  # 重试最大延迟（秒）
    
    @classmethod
    def from_env(cls) -> "Config":
        """从环境变量加载配置"""
        return cls(
            api_key=os.getenv("OPENAI_API_KEY"),
            base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            sillytavern_url=os.getenv("SILLYTAVERN_URL"),
            max_text_length=int(os.getenv("MAX_TEXT_LENGTH", "5000")),
            max_characters=int(os.getenv("MAX_CHARACTERS", "20")),
            retry_count=int(os.getenv("RETRY_COUNT", "3")),
            retry_delay=float(os.getenv("RETRY_DELAY", "1.0")),
            # 动态并发配置
            min_concurrency=int(os.getenv("MIN_CONCURRENCY", "2")),
            max_concurrency=int(os.getenv("MAX_CONCURRENCY", "10")),
            target_success_rate=float(os.getenv("TARGET_SUCCESS_RATE", "0.95")),
            target_response_time=float(os.getenv("TARGET_RESPONSE_TIME", "5.0")),
            # 限流配置
            rpm_limit=int(os.getenv("RPM_LIMIT", "500")),
            tpm_limit=int(os.getenv("TPM_LIMIT", "2000000")),
            # 重试配置
            max_retries=int(os.getenv("MAX_RETRIES", "3")),
            retry_base_delay=float(os.getenv("RETRY_BASE_DELAY", "1.0")),
            retry_max_delay=float(os.getenv("RETRY_MAX_DELAY", "60.0")),
        )
    
    @classmethod
    def load(cls, config_path: Optional[str] = None) -> "Config":
        """加载配置"""
        if config_path and Path(config_path).exists():
            # 如果指定了配置文件，加载它
            load_dotenv(config_path)
        return cls.from_env()


# 默认配置实例
config = Config.load()
