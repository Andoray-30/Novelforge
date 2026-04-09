"""
AI 服务模块 - 统一的 AI 调用接口
"""

import json
import asyncio
import time
from typing import Optional, TypeVar, Type, List
from openai import AsyncOpenAI
from pydantic import BaseModel

from ..core.config import Config, config as default_config
from ..base.rate_limiter import RateLimiter
from ..base.concurrency import AdaptiveConcurrency
from ..base.retry_policy import RetryPolicy, retry_with_policy

T = TypeVar("T", bound=BaseModel)


class APIErrorWithStatus(Exception):
    """带有HTTP状态码的API错误"""
    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.status_code = status_code


class AIService:
    """AI 服务类 - 封装 OpenAI 兼容 API 调用"""
    
    def __init__(self, config: Optional[Config] = None):
        self.config = config or default_config
        self._client: Optional[AsyncOpenAI] = None
        
        # 初始化限流器
        self.rate_limiter = RateLimiter(
            rpm_limit=self.config.rpm_limit,
            tpm_limit=self.config.tpm_limit,
        )
        # 初始化动态并发控制器
        self.concurrency_controller = AdaptiveConcurrency(
            min_concurrency=2,
            max_concurrency=10,
            target_response_time=15.0
        )

        
        # 初始化重试策略
        self.retry_policy = RetryPolicy(
            max_retries=self.config.max_retries,
            base_delay=self.config.retry_base_delay,
            max_delay=self.config.retry_max_delay,
        )
    
    @property
    def client(self) -> AsyncOpenAI:
        """懒加载 OpenAI 客户端"""
        if self._client is None:
            # 如果是占位符或者为空，暂不抛出异常，让 chat 内部处理 Mock
            if not self.config.api_key or "your-api-key-here" in self.config.api_key:
                return None # 标记为 Mock 模式
            
            self._client = AsyncOpenAI(
                api_key=self.config.api_key,
                base_url=self.config.base_url,
            )
        return self._client

    def has_real_client(self) -> bool:
        """Whether the current config contains a usable upstream API key."""
        return bool(self.config.api_key and "your-api-key-here" not in self.config.api_key)

    def with_overrides(
        self,
        *,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
    ) -> "AIService":
        """Create a new AI service instance with runtime OpenAI overrides."""
        runtime_config = self.config.with_openai_overrides(
            api_key=api_key,
            base_url=base_url,
            model=model,
        )
        return AIService(runtime_config)

    @staticmethod
    def _looks_chat_capable(model_id: str) -> bool:
        """Best-effort filter for obviously non-chat models returned by /models."""
        lowered = model_id.lower()
        incompatible_markers = (
            "embedding",
            "rerank",
            "moderation",
            "omni-moderation",
            "tts",
            "transcribe",
            "whisper",
            "image",
            "imagen",
            "video",
            "veo",
            "imagine",
            "lyria",
            "dall-e",
            "gpt-image",
        )
        return not any(marker in lowered for marker in incompatible_markers)

    async def list_models(self, timeout: float = 20.0) -> List[dict]:
        """Fetch available models from the configured OpenAI-compatible provider."""
        if not self.has_real_client():
            raise ValueError("请先提供有效的 OpenAI API Key。")

        current_model = (self.config.model or "").strip().lower()
        models: List[dict] = []

        async with AsyncOpenAI(
            api_key=self.config.api_key,
            base_url=self.config.base_url,
        ) as client:
            page = await asyncio.wait_for(client.models.list(), timeout=timeout)
            async for item in page:
                model_id = getattr(item, "id", None)
                if not model_id:
                    continue
                models.append(
                    {
                        "id": model_id,
                        "owned_by": getattr(item, "owned_by", None),
                        "created": getattr(item, "created", None),
                        "supports_chat": self._looks_chat_capable(model_id),
                    }
                )

        models.sort(
            key=lambda item: (
                item["id"].lower() != current_model,
                not item["supports_chat"],
                item["id"].lower(),
            )
        )
        return models
    
    async def chat(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: int = 8000,  # 增加最大输出token数以应对复杂提取任务
        timeout: float = 120.0,
    ) -> str:
        """
        基础聊天接口（带限流和重试）
        
        Args:
            prompt: 用户提示词
            system_prompt: 系统提示词
            temperature: 温度参数
            max_tokens: 最大 token 数
            
        Returns:
            AI 响应文本
        """
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        temp = temperature if temperature is not None else self.config.extraction_temperature
        
        # 估算 token 数量（粗略估算：1 token ≈ 4 字符）
        estimated_tokens = len(prompt) // 4 + max_tokens
        
        # 使用重试策略执行
        async def _do_chat():
            # 检查是否处于 Mock 模式
            if self.client is None:
                await asyncio.sleep(1.5) # 模拟网络延迟感
                # 针对不同场景提供高质量的 Mock 回复
                if "角色" in prompt:
                    return "已为您构思好一名反派角色：名字叫『墨染』，身披玄铁重铠，背后有一段被背叛的伤感往事。他的性格孤傲且充满魅力，是一个典型的悲剧英雄。"
                if "世界" in prompt or "背景" in prompt:
                    return "这是一个处于蒸汽朋克与修仙交织的世界，齿轮驱动着灵气，浮空岛屿上悬挂着巨大的转轮。文明在崩溃的边缘挣扎，而规则由那些掌握玄铁科技的宗门制定。"
                return f"『模拟响应』：您的输入是「{prompt}」。我已接收到创作指令，目前由于后端 API Key 尚未配置，我正以【幻影模式】为您展示交互效果。请在 .env 文件中填入真实的 Key 以开启全量 AI 创作功能！"

            # 限流
            await self.concurrency_controller.acquire()
            await self.rate_limiter.acquire(estimated_tokens)
            
            start_time = time.time()
            try:
                response = await asyncio.wait_for(
                    self.client.chat.completions.create(
                        model=self.config.model,
                        messages=messages,
                        temperature=temp,
                        max_tokens=max_tokens,
                    ),
                    timeout=timeout
                )
                response_time = time.time() - start_time
                
                # 检查 response 是否为 None
                if response is None:
                    raise RuntimeError("API返回了空响应")
                
                # 检查 response 是否有 status 字段（API错误响应）
                if hasattr(response, 'status') and response.status:
                    msg = getattr(response, 'msg', f'API返回错误状态码: {response.status}')
                    raise APIErrorWithStatus(msg, response.status)
                
                # 检查 response.choices 是否存在且不为 None
                if not hasattr(response, 'choices') or response.choices is None:
                    raise RuntimeError(f"API响应缺少choices字段，响应内容: {response}")
                
                # 检查 choices 是否有元素
                if len(response.choices) == 0:
                    raise RuntimeError(f"API响应的choices为空，响应内容: {response}")
                
                # 检查 message 是否存在
                if not hasattr(response.choices[0], 'message') or response.choices[0].message is None:
                    raise RuntimeError(f"API响应的choices[0].message为空，响应内容: {response}")
                
                # 记录实际 token 使用量
                if hasattr(response, 'usage') and response.usage:
                    tokens_used = response.usage.total_tokens
                    self.rate_limiter.record(tokens_used)
                
                await self.concurrency_controller.release(success=True, response_time=time.time() - start_time)
                return response.choices[0].message.content or ""
            except asyncio.TimeoutError:
                await self.concurrency_controller.release(success=False, response_time=timeout)
                raise TimeoutError(f"API请求超时（{timeout}秒）")
            except Exception as e:
                response_time = time.time() - start_time
                raise
        
        return await retry_with_policy(_do_chat, self.retry_policy)

    async def chat_with_history(
        self,
        messages: list,
        temperature: Optional[float] = None,
        max_tokens: int = 8000,
        timeout: float = 120.0,
    ) -> str:
        """
        多轮对话接口，接受完整的 messages 数组（包含 system / user / assistant）
        这是实现多轮记忆的核心方法
        """
        temp = temperature if temperature is not None else self.config.extraction_temperature
        estimated_tokens = sum(len(m.get('content', '')) for m in messages) // 4 + max_tokens

        async def _do_chat():
            # Mock 模式
            if self.client is None:
                await asyncio.sleep(1.0)
                last_user_msg = next(
                    (m['content'] for m in reversed(messages) if m['role'] == 'user'), ''
                )
                if '角色' in last_user_msg:
                    return "已为您构思好一名角色：名字叫『墨染』，身披玄铁重铠，背后有一段被背叛的伤感往事。他的性格孤傲且充满魅力，是一个典型的悲剧英雄。"
                if '世界' in last_user_msg or '背景' in last_user_msg:
                    return "这是一个处于蒸汽朋克与修仙交织的世界，齿轮驱动着灵气，浮空岛屿上悬挂着巨大的转轮。"
                return f"《模拟响应》：您的输入是「{last_user_msg}」。目前正处于《幻影模式》。"

            await self.concurrency_controller.acquire()
            await self.rate_limiter.acquire(estimated_tokens)
            start_time = time.time()
            try:
                response = await asyncio.wait_for(
                    self.client.chat.completions.create(
                        model=self.config.model,
                        messages=messages,
                        temperature=temp,
                        max_tokens=max_tokens,
                    ),
                    timeout=timeout
                )
                if response is None:
                    raise RuntimeError("空响应")
                if hasattr(response, 'usage') and response.usage:
                    self.rate_limiter.record(response.usage.total_tokens)
                return response.choices[0].message.content or ""
            except asyncio.TimeoutError:
                await self.concurrency_controller.release(success=False, response_time=timeout)
                raise TimeoutError(f"API请求超时（{timeout}秒）")

        return await retry_with_policy(_do_chat, self.retry_policy)
    
    async def extract(
        self,
        prompt: str,
        response_type: Type[T],
        system_prompt: Optional[str] = None,
    ) -> T:
        """
        结构化数据提取（带限流和重试）
        
        Args:
            prompt: 提取提示词
            response_type: 期望的返回类型 (Pydantic 模型)
            system_prompt: 系统提示词
            
        Returns:
            解析后的结构化数据
        """
        default_system = (
            "你是一个专业的数据提取助手，擅长从文本中提取结构化信息。"
            "请严格按照要求的 JSON 格式输出结果，不要添加任何额外说明。"
        )
        
        # Mock 模式下的提取逻辑，直接返回符合业务逻辑的示例数据
        if self.client is None:
            await asyncio.sleep(2.0)
            mock_data = {
                "characters": [
                    {"name": "墨染", "role": "反派宗主", "description": "玄铁科技的掌控者", "importance": "critical"},
                    {"name": "青涟", "role": "正道圣女", "description": "手持灵气长剑，试图拯救世界", "importance": "high"}
                ],
                "world": {"name": "玄铁大陆", "description": "蒸汽与灵气共存的奇幻世界", "locations": [], "cultures": [], "rules": []},
                "timeline": {"events": [
                    {"title": "玄铁之乱", "date": "1024年", "description": "墨染发动了旨在统一大陆的战争", "importance": "critical"},
                    {"title": "灵气枯竭", "date": "1026年", "description": "由于过度抽取灵气驱动机械，世界陷入能源危机", "importance": "high"}
                ], "total_events": 2},
                "relationships": { "edges": [
                    {"source": "墨染", "target": "青涟", "type": "宿敌", "description": "相爱相杀的对立关系"}
                ], "nodes": ["墨染", "青涟"], "total_relationships": 1},
                "success": True
            }
            # 如果请求的是 Pydantic 模型，尝试验证
            if hasattr(response_type, "model_validate"):
                try: 
                    # 这里尝试根据 response_type 调整数据结构（简单版）
                    return response_type.model_validate(mock_data)
                except:
                    return mock_data 
            return mock_data

        response = await self.chat(
            prompt=prompt,
            system_prompt=system_prompt or default_system,
            temperature=self.config.extraction_temperature,
        )
        
        return self._parse_json(response, response_type)
    
    async def extract_list(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
    ) -> list:
        """
        提取列表数据（带限流和重试）
        
        Args:
            prompt: 提取提示词
            system_prompt: 系统提示词
            
        Returns:
            解析后的列表
        """
        default_system = (
            "你是一个专业的数据提取助手。请以 JSON 数组格式输出结果。"
        )
        
        response = await self.chat(
            prompt=prompt,
            system_prompt=system_prompt or default_system,
            temperature=self.config.extraction_temperature,
        )
        
        return self._parse_json_list(response)
    
    def _parse_json(self, text: str, model_type: Type[T]) -> T:
        """解析 JSON 响应为 Pydantic 模型"""
        # 清理 markdown 代码块
        cleaned = text.strip()
        if cleaned.startswith("```"):
            # 移除代码块标记
            lines = cleaned.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if len(lines) > 0 and lines[-1].startswith("```"):
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()
        
        # 尝试提取 JSON 对象或数组
        json_match = self._extract_json_object(cleaned)
        if not json_match:
            json_match = self._extract_json_array(cleaned)
        
        if json_match:
            try:
                data = json.loads(json_match)
                # 如果 model_type 是 dict 或 list，直接返回
                if model_type is dict or model_type is list:
                    return data
                return model_type.model_validate(data)
            except json.JSONDecodeError:
                pass
        
        # 尝试直接解析
        try:
            data = json.loads(cleaned)
            # 如果 model_type 是 dict 或 list，直接返回
            if model_type is dict or model_type is list:
                return data
            return model_type.model_validate(data)
        except json.JSONDecodeError:
            # 如果直接解析失败，尝试更激进的清理
            import re
            # 移除可能的控制字符和非打印字符
            cleaned = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]', '', cleaned)
            # 尝试再次提取JSON
            json_match = self._extract_json_object(cleaned)
            if not json_match:
                json_match = self._extract_json_array(cleaned)
            
            if json_match:
                try:
                    data = json.loads(json_match)
                    # 如果 model_type 是 dict 或 list，直接返回
                    if model_type is dict or model_type is list:
                        return data
                    return model_type.model_validate(data)
                except json.JSONDecodeError as e:
                    pass
            
            # 如果仍然失败，抛出异常
            raise ValueError(f"JSON 解析失败: 原始响应: {text[:500]}")
    
    def _parse_json_list(self, text: str) -> list:
        """解析 JSON 列表"""
        cleaned = text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()
        
        # 提取 JSON 数组
        json_match = self._extract_json_array(cleaned)
        if json_match:
            try:
                return json.loads(json_match)
            except json.JSONDecodeError:
                pass
        
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            raise ValueError(f"JSON 列表解析失败: {e}\n原始响应: {text[:500]}")
    
    def _extract_json_object(self, text: str) -> Optional[str]:
        """从文本中提取 JSON 对象（改进版，处理字符串和转义）"""
        start = text.find("{")
        if start == -1:
            return None
        
        depth = 0
        in_string = False
        escape = False
        
        for i, char in enumerate(text[start:], start):
            if escape:
                escape = False
                continue
            if char == "\\":
                escape = True
                continue
            if char == '"' and not escape:
                in_string = not in_string
                continue
            if in_string:
                continue
                
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    # 验证JSON完整性
                    json_str = text[start:i + 1]
                    try:
                        json.loads(json_str)
                        return json_str
                    except json.JSONDecodeError:
                        continue  # 继续寻找下一个可能的JSON
        return None
    
    def _extract_json_array(self, text: str) -> Optional[str]:
        """从文本中提取 JSON 数组"""
        start = text.find("[")
        if start == -1:
            return None
        
        depth = 0
        in_string = False
        escape = False
        
        for i, char in enumerate(text[start:], start):
            if escape:
                escape = False
                continue
            if char == "\\":
                escape = True
                continue
            if char == '"' and not escape:
                in_string = not in_string
                continue
            if in_string:
                continue
            if char == "[":
                depth += 1
            elif char == "]":
                depth -= 1
                if depth == 0:
                    return text[start:i + 1]
        return None


# 默认服务实例
ai_service = AIService()
