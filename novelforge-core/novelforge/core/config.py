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
        self.openai_proxy: str = os.getenv("NOVELFORGE_OPENAI_PROXY", "").strip()
        self.fast_model: str = os.getenv("NOVELFORGE_FAST_MODEL", "").strip()
        self.pro_model: str = os.getenv("NOVELFORGE_PRO_MODEL", "").strip()
        self.default_ai_mode: str = os.getenv("NOVELFORGE_DEFAULT_AI_MODE", "fast").strip().lower()
        if self.default_ai_mode not in {"fast", "pro"}:
            self.default_ai_mode = "fast"
        self.strict_model: bool = os.getenv("OPENAI_STRICT_MODEL", "false").lower() == "true"
        self.mock_tool_calls: bool = os.getenv("NOVELFORGE_MOCK_TOOL_CALLS", "false").lower() == "true"
        self.fallback_models: list[str] = [
            item.strip()
            for item in os.getenv("OPENAI_FALLBACK_MODELS", "").split(",")
            if item.strip()
        ]
        self.enable_model_router: bool = os.getenv("NOVELFORGE_ENABLE_MODEL_ROUTER", "true").lower() == "true"
        self.model_probe_timeout: float = float(os.getenv("NOVELFORGE_MODEL_PROBE_TIMEOUT", "25.0"))
        self.model_cooldown_seconds: float = float(os.getenv("NOVELFORGE_MODEL_COOLDOWN_SECONDS", "180.0"))
        self.model_pools: dict[str, list[str]] = {
            "extractor_fast": self._model_pool_from_env(
                "NOVELFORGE_EXTRACTOR_FAST_MODELS",
                [self.fast_model, self.model, *self.fallback_models],
            ),
            "extractor_deep": self._model_pool_from_env(
                "NOVELFORGE_EXTRACTOR_DEEP_MODELS",
                [self.pro_model, self.model, *self.fallback_models],
            ),
            "extractor_repair": self._model_pool_from_env(
                "NOVELFORGE_EXTRACTOR_REPAIR_MODELS",
                [self.pro_model, self.fast_model, self.model, *self.fallback_models],
            ),
            "writer_fast": self._model_pool_from_env(
                "NOVELFORGE_WRITER_FAST_MODELS",
                [self.fast_model, self.model, *self.fallback_models],
            ),
            "writer_pro": self._model_pool_from_env(
                "NOVELFORGE_WRITER_PRO_MODELS",
                [self.pro_model, self.model, *self.fallback_models],
            ),
            "judge": self._model_pool_from_env(
                "NOVELFORGE_JUDGE_MODELS",
                [self.pro_model, self.model, *self.fallback_models],
            ),
        }
        
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

        # Deployment/auth configuration. Local development stays open unless a password
        # or explicit public deployment flag is configured.
        self.public_deployment: bool = os.getenv("NOVELFORGE_PUBLIC_DEPLOYMENT", "false").lower() == "true"
        self.admin_password: Optional[str] = os.getenv("NOVELFORGE_ADMIN_PASSWORD")
        self.session_secret: Optional[str] = os.getenv("NOVELFORGE_SESSION_SECRET")
        self.auth_required: bool = (
            os.getenv("NOVELFORGE_AUTH_REQUIRED", "false").lower() == "true"
            or self.public_deployment
            or bool(self.admin_password)
        )
        self.frontend_origin: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").strip()
        self.allow_runtime_openai_overrides: bool = (
            os.getenv("NOVELFORGE_ALLOW_RUNTIME_OPENAI_OVERRIDES", "true").lower() == "true"
            and not self.public_deployment
        )

    def clone(self) -> "Config":
        """Clone the current config without reloading environment variables."""
        cloned = Config.__new__(Config)
        cloned.__dict__ = self.__dict__.copy()
        return cloned

    @staticmethod
    def _dedupe_model_names(model_names: list[str]) -> list[str]:
        result: list[str] = []
        for model_name in model_names:
            normalized = str(model_name or "").strip()
            if normalized and normalized not in result:
                result.append(normalized)
        return result

    @classmethod
    def _model_pool_from_env(cls, env_name: str, defaults: list[str]) -> list[str]:
        raw = os.getenv(env_name, "")
        if raw.strip():
            return cls._dedupe_model_names(raw.split(","))
        return cls._dedupe_model_names(defaults)

    def with_openai_overrides(
        self,
        *,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        ai_mode: Optional[str] = None,
        strict_model: Optional[bool] = None,
    ) -> "Config":
        """Return a cloned config with runtime OpenAI overrides applied."""
        cloned = self.clone()
        if ai_mode is not None:
            normalized_mode = ai_mode.strip().lower()
            mode_model = cloned.get_model_for_ai_mode(normalized_mode)
            if mode_model:
                cloned.model = mode_model
                cloned.strict_model = True
                cloned.fallback_models = []
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

    def get_model_for_ai_mode(self, ai_mode: Optional[str]) -> Optional[str]:
        """Resolve a user-facing AI mode into a configured backend model."""
        normalized_mode = (ai_mode or self.default_ai_mode or "fast").strip().lower()
        if normalized_mode == "pro":
            return self.pro_model or self.model
        if normalized_mode == "fast":
            return self.fast_model or self.model
        return None
    
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
