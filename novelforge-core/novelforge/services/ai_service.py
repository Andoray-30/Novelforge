"""
AI 服务模块 - 统一的 AI 调用接口
"""

import json
import asyncio
import time
from typing import Optional, TypeVar, Type
from openai import AsyncOpenAI
from pydantic import BaseModel

from ..core.config import Config, config as default_config
from ..base.rate_limiter import RateLimiter
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
            if not self.config.api_key:
                raise ValueError("未配置 API Key，请设置 OPENAI_API_KEY 环境变量")
            self._client = AsyncOpenAI(
                api_key=self.config.api_key,
                base_url=self.config.base_url,
            )
        return self._client
    
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
            # 限流
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
                
                return response.choices[0].message.content or ""
            except asyncio.TimeoutError:
                raise TimeoutError(f"API请求超时（{timeout}秒）")
            except Exception as e:
                response_time = time.time() - start_time
                raise
        
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
