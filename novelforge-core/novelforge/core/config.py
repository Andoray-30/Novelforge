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


class Config:
    """配置类"""
    def __init__(self):
        project_root = Path(__file__).resolve().parents[2]

        def resolve_data_path(raw_value: str, default_relative: str) -> str:
            if isinstance(raw_value, str) and raw_value.strip():
                candidate = Path(raw_value.strip())
            else:
                candidate = project_root / default_relative
            if not candidate.is_absolute():
                candidate = project_root / candidate
            return str(candidate.resolve())
        # API 配置
        self.api_key: Optional[str] = os.getenv("OPENAI_API_KEY")
        self.base_url: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
        self.model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.strict_model: bool = os.getenv("OPENAI_STRICT_MODEL", "false").lower() == "true"
        self.fallback_models: list[str] = [
            item.strip()
            for item in os.getenv("OPENAI_FALLBACK_MODELS", "").split(",")
            if item.strip()
        ]
        
        # SillyTavern 配置
        self.sillytavern_url: Optional[str] = os.getenv("SILLYTAVERN_URL")
        
        # 提取配置
        self.max_text_length: int = int(os.getenv("MAX_TEXT_LENGTH", "5000"))
        self.max_characters: int = int(os.getenv("MAX_CHARACTERS", "20"))
        self.retry_delay: float = float(os.getenv("RETRY_DELAY", "1.0"))
        
        # 温度设置
        self.extraction_temperature: float = float(os.getenv("EXTRACTION_TEMPERATURE", "0.3"))
        self.creative_temperature: float = float(os.getenv("CREATIVE_TEMPERATURE", "0.8"))
        
        # 日志配置
        self.log_level: str = os.getenv("LOG_LEVEL", "INFO")
        self.log_file: Optional[str] = os.getenv("LOG_FILE")
        self.structured_logging: bool = os.getenv("STRUCTURED_LOGGING", "true").lower() == "true"
        
        # 动态并发配置
        self.min_concurrency: int = int(os.getenv("MIN_CONCURRENCY", "2"))
        self.max_concurrency: int = int(os.getenv("MAX_CONCURRENCY", "10"))
        self.target_success_rate: float = float(os.getenv("TARGET_SUCCESS_RATE", "0.95"))
        self.target_response_time: float = float(os.getenv("TARGET_RESPONSE_TIME", "5.0"))
        
        # 限流配置
        self.rpm_limit: int = int(os.getenv("RPM_LIMIT", "500"))
        self.tpm_limit: int = int(os.getenv("TPM_LIMIT", "2000000"))
        
        # 重试配置
        self.max_retries: int = int(os.getenv("MAX_RETRIES", "5"))
        self.retry_base_delay: float = float(os.getenv("RETRY_BASE_DELAY", "2.0"))
        self.retry_max_delay: float = float(os.getenv("RETRY_MAX_DELAY", "120.0"))
        
        # 存储配置
        # Keep all persistence paths stable across different working directories.
        self.data_dir: str = resolve_data_path(os.getenv("NOVELFORGE_DATA_DIR", ""), "data")
        self.storage_type: str = (os.getenv("STORAGE_TYPE", "file") or "file").strip().lower()
        self.use_content_database: bool = os.getenv("USE_CONTENT_DATABASE", "false").lower() == "true"
        self.file_storage_dir: str = resolve_data_path(
            os.getenv("FILE_STORAGE_DIR", ""),
            str(Path(self.data_dir) / "file_storage"),
        )
        self.database_path: str = resolve_data_path(
            os.getenv("DATABASE_PATH", ""),
            str(Path(self.data_dir) / "novelforge.db"),
        )
        self.content_database_path: str = resolve_data_path(
            os.getenv("CONTENT_DATABASE_PATH", ""),
            str(Path(self.data_dir) / "novelforge_content.db"),
        )

    def clone(self) -> "Config":
        """Clone the current config without reloading environment variables."""
        cloned = Config.__new__(Config)
        cloned.__dict__ = self.__dict__.copy()
        return cloned

    def with_openai_overrides(
        self,
        *,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        strict_model: Optional[bool] = None,
    ) -> "Config":
        """Return a cloned config with runtime OpenAI overrides applied."""
        cloned = self.clone()
        if api_key is not None:
            cloned.api_key = api_key.strip() or None
        if base_url is not None:
            normalized_base_url = base_url.strip()
            cloned.base_url = normalized_base_url.rstrip("/") if normalized_base_url else cloned.base_url
        if model is not None:
            normalized_model = model.strip()
            cloned.model = normalized_model or cloned.model
            if normalized_model:
                # Runtime-selected model should be honored as-is unless explicitly configured otherwise.
                cloned.strict_model = True
                cloned.fallback_models = []
        if strict_model is not None:
            cloned.strict_model = strict_model
        return cloned
    
    @classmethod
    def load(cls, config_path: Optional[str] = None) -> "Config":
        """加载配置"""
        if config_path and Path(config_path).exists():
            # 如果指定了配置文件，加载它
            load_dotenv(config_path)
        return Config()
    
    @classmethod
    def from_env(cls) -> "Config":
        """从环境变量创建配置实例"""
        return Config()


# 默认配置实例
config = Config.load()
