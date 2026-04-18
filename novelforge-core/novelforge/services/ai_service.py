"""
Unified AI service for OpenAI-compatible providers.
"""

import asyncio
import json
import logging
import re
import time
from typing import Any, List, Optional, Type, TypeVar

import httpx
from openai import AsyncOpenAI
from pydantic import BaseModel

from ..base.concurrency import AdaptiveConcurrency
from ..base.rate_limiter import RateLimiter
from ..base.retry_policy import RetryPolicy, retry_with_policy
from ..core.config import Config, config as default_config

T = TypeVar("T", bound=BaseModel)
logger = logging.getLogger(__name__)


class APIErrorWithStatus(Exception):
    """API error with an attached HTTP status code."""

    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.status_code = status_code


class AIService:
    """Thin wrapper around OpenAI-compatible chat and model endpoints."""

    def __init__(self, config: Optional[Config] = None):
        self.config = config or default_config
        self._client: Optional[AsyncOpenAI] = None
        self._http_client: Optional[httpx.AsyncClient] = None
        self._http_client_loop_id: Optional[int] = None

        self.rate_limiter = RateLimiter(
            rpm_limit=self.config.rpm_limit,
            tpm_limit=self.config.tpm_limit,
        )
        self.concurrency_controller = AdaptiveConcurrency(
            min_concurrency=2,
            max_concurrency=10,
            target_response_time=15.0,
        )
        self.retry_policy = RetryPolicy(
            max_retries=self.config.max_retries,
            base_delay=self.config.retry_base_delay,
            max_delay=self.config.retry_max_delay,
        )

    @property
    def client(self) -> Optional[AsyncOpenAI]:
        """Lazy OpenAI client, kept mainly for compatibility and mock checks."""
        if self._client is None:
            if not self.has_real_client():
                return None

            self._client = AsyncOpenAI(
                api_key=self.config.api_key,
                base_url=self.config.base_url,
                http_client=self._get_http_client(),
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
        strict_model: Optional[bool] = None,
    ) -> "AIService":
        """Create a new AI service instance with runtime OpenAI overrides."""
        runtime_config = self.config.with_openai_overrides(
            api_key=api_key,
            base_url=base_url,
            model=model,
            strict_model=strict_model,
        )
        return AIService(runtime_config)

    def _get_http_client(self) -> httpx.AsyncClient:
        """
        Create a reusable HTTP client.

        We intentionally ignore `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`
        because some user environments inject broken proxy env vars that
        affect Python clients but not browser or PowerShell requests.
        """
        current_loop_id: Optional[int]
        try:
            current_loop_id = id(asyncio.get_running_loop())
        except RuntimeError:
            current_loop_id = None

        if (
            self._http_client is None
            or self._http_client.is_closed
            or (
                current_loop_id is not None
                and self._http_client_loop_id is not None
                and self._http_client_loop_id != current_loop_id
            )
        ):
            self._http_client = httpx.AsyncClient(
                timeout=httpx.Timeout(connect=30.0, read=120.0, write=120.0, pool=120.0),
                follow_redirects=True,
                trust_env=False,
            )
            self._http_client_loop_id = current_loop_id
            self._client = None
        return self._http_client

    def _build_auth_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _extract_error_message(payload: Any) -> str:
        if isinstance(payload, dict):
            error = payload.get("error")
            if isinstance(error, dict):
                message = error.get("message")
                if isinstance(message, str) and message.strip():
                    return message
            message = payload.get("message")
            if isinstance(message, str) and message.strip():
                return message
        return "Unknown upstream error"

    @staticmethod
    def _extract_text_content(message_content: Any) -> str:
        if isinstance(message_content, str):
            return message_content

        if isinstance(message_content, list):
            parts: list[str] = []
            for item in message_content:
                if not isinstance(item, dict):
                    continue

                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
                    continue

                nested_content = item.get("content")
                if isinstance(nested_content, str):
                    parts.append(nested_content)

            return "".join(parts)

        return ""

    async def _request_json(
        self,
        method: str,
        path: str,
        *,
        json_body: Optional[dict[str, Any]] = None,
        timeout: float = 120.0,
    ) -> dict[str, Any]:
        if not self.has_real_client():
            raise ValueError("Please provide a valid OpenAI API key.")

        response = await asyncio.wait_for(
            self._get_http_client().request(
                method,
                f"{self.config.base_url.rstrip('/')}{path}",
                headers=self._build_auth_headers(),
                json=json_body,
            ),
            timeout=timeout,
        )

        try:
            payload = response.json()
        except ValueError as exc:
            raise RuntimeError(f"Upstream returned non-JSON response: {response.text[:500]}") from exc

        if response.status_code >= 400:
            raise APIErrorWithStatus(self._extract_error_message(payload), response.status_code)

        if not isinstance(payload, dict):
            raise RuntimeError("Upstream response is not a JSON object")

        return payload

    async def _chat_via_rest(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float,
        max_tokens: int,
        timeout: float,
    ) -> str:
        errors: list[APIErrorWithStatus] = []
        last_model = self.config.model
        candidate_timeout = min(timeout, 45.0)

        for model_name in self._candidate_models():
            last_model = model_name
            try:
                logger.info("Calling /chat/completions with model=%s", model_name)
                payload = await self._request_json(
                    "POST",
                    "/chat/completions",
                    json_body={
                        "model": model_name,
                        "messages": messages,
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                    },
                    timeout=candidate_timeout,
                )
                content = ""
                usage = payload.get("usage")
                if isinstance(usage, dict):
                    total_tokens = usage.get("total_tokens")
                    if isinstance(total_tokens, int):
                        self.rate_limiter.record(total_tokens)

                choices = payload.get("choices")
                if isinstance(choices, list) and choices:
                    first_choice = choices[0]
                    if isinstance(first_choice, dict):
                        message = first_choice.get("message")
                        if isinstance(message, dict):
                            content = self._extract_text_content(message.get("content"))

                if not content.strip():
                    errors.append(APIErrorWithStatus(f"Model {model_name} returned empty content", 502))
                    continue

                if model_name != self.config.model:
                    logger.warning(
                        "Primary model %s failed; falling back to %s",
                        self.config.model,
                        model_name,
                    )
                return content
            except APIErrorWithStatus as exc:
                errors.append(exc)
                if exc.status_code < 500 and exc.status_code not in {403, 429}:
                    raise
            except (httpx.HTTPError, RuntimeError, ValueError, TimeoutError) as exc:
                logger.warning(
                    "Model %s failed during chat request: %s",
                    model_name,
                    exc,
                )
                errors.append(APIErrorWithStatus(f"Model {model_name} request failed: {exc}", 503))
                continue

        if errors:
            raise errors[-1]
        raise APIErrorWithStatus(f"Failed to call chat completions for model {last_model}", 500)

    def _candidate_models(self) -> list[str]:
        candidates: list[str] = []

        def add(model_name: Optional[str]) -> None:
            if not isinstance(model_name, str):
                return
            normalized = model_name.strip()
            if normalized and normalized not in candidates:
                candidates.append(normalized)

        free_prefix = "\u005B\u514D\u8D39\u005D"
        primary_model = self.config.model
        add(primary_model)

        if getattr(self.config, "strict_model", False):
            return candidates

        for model_name in getattr(self.config, "fallback_models", []):
            add(model_name)

        if isinstance(primary_model, str) and primary_model and not primary_model.startswith(free_prefix):
            add(f"{free_prefix}{primary_model}")

        return candidates

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
        """Fetch available models from the configured provider."""
        payload = await self._request_json("GET", "/models", timeout=timeout)
        current_model = (self.config.model or "").strip().lower()
        models: List[dict] = []

        data = payload.get("data")
        if not isinstance(data, list):
            raise RuntimeError(f"API response is missing model data: {payload}")

        for item in data:
            if not isinstance(item, dict):
                continue

            model_id = item.get("id")
            if not isinstance(model_id, str) or not model_id:
                continue

            supported_endpoint_types = item.get("supported_endpoint_types")
            supports_openai_chat = True
            if isinstance(supported_endpoint_types, list) and supported_endpoint_types:
                supports_openai_chat = "openai" in supported_endpoint_types

            models.append(
                {
                    "id": model_id,
                    "owned_by": item.get("owned_by"),
                    "created": item.get("created"),
                    "supports_chat": supports_openai_chat and self._looks_chat_capable(model_id),
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
        max_tokens: int = 8000,
        timeout: float = 120.0,
    ) -> str:
        """Single-turn chat with retry and rate limiting."""
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        temp = temperature if temperature is not None else self.config.extraction_temperature
        estimated_tokens = len(prompt) // 4 + max_tokens

        async def _do_chat():
            if not self.has_real_client():
                await asyncio.sleep(1.5)
                if "角色" in prompt:
                    return "Mock response: created a dramatic antagonist with a hidden tragic past."
                if "世界" in prompt or "背景" in prompt:
                    return "Mock response: a world where steam technology and spiritual energy coexist."
                return f"Mock response: received prompt `{prompt}`. Configure a real API key to enable live generation."

            await self.concurrency_controller.acquire()
            await self.rate_limiter.acquire(estimated_tokens)
            start_time = time.time()
            try:
                response = await self._chat_via_rest(
                    messages,
                    temperature=temp,
                    max_tokens=max_tokens,
                    timeout=timeout,
                )
                await self.concurrency_controller.release(
                    success=True,
                    response_time=time.time() - start_time,
                )
                return response
            except asyncio.TimeoutError:
                await self.concurrency_controller.release(success=False, response_time=timeout)
                raise TimeoutError(f"API request timed out ({timeout}s)")
            except Exception:
                await self.concurrency_controller.release(
                    success=False,
                    response_time=time.time() - start_time,
                )
                raise

        return await retry_with_policy(_do_chat, self.retry_policy)

    async def chat_stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: int = 8000,
        timeout: float = 120.0,
    ):
        """Best-effort streaming chat yielding incremental thinking/content events."""
        full_text = await self.chat(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
        )

        thinking_match = re.search(r"<think>([\s\S]*?)</think>", full_text)
        thinking = thinking_match.group(1).strip() if thinking_match else ""
        answer = re.sub(r"<think>[\s\S]*?</think>", "", full_text).strip()

        if thinking:
            for chunk in self._chunk_text(thinking, 80):
                yield {"type": "thinking_delta", "delta": chunk}
                await asyncio.sleep(0.01)

        for chunk in self._chunk_text(answer, 120):
            yield {"type": "content_delta", "delta": chunk}
            await asyncio.sleep(0.01)

        yield {
            "type": "message_complete",
            "content": answer,
            "thinking": thinking,
            "full_text": full_text,
        }

    @staticmethod
    def _chunk_text(text: str, chunk_size: int) -> list[str]:
        if not text:
            return []
        return [text[index:index + chunk_size] for index in range(0, len(text), chunk_size)]

    async def chat_with_history(
        self,
        messages: list,
        temperature: Optional[float] = None,
        max_tokens: int = 8000,
        timeout: float = 120.0,
    ) -> str:
        """Multi-turn chat using a full messages array."""
        temp = temperature if temperature is not None else self.config.extraction_temperature
        estimated_tokens = sum(len(m.get("content", "")) for m in messages) // 4 + max_tokens

        async def _do_chat():
            if not self.has_real_client():
                await asyncio.sleep(1.0)
                last_user_msg = next(
                    (m.get("content", "") for m in reversed(messages) if m.get("role") == "user"),
                    "",
                )
                if "角色" in last_user_msg:
                    return "Mock response: here is a character concept with strong conflict and momentum."
                if "世界" in last_user_msg or "背景" in last_user_msg:
                    return "Mock response: here is a world concept with technology, factions, and tension."
                return f"Mock response: received `{last_user_msg}`."

            normalized_messages = [
                {
                    "role": str(message.get("role", "user")),
                    "content": str(message.get("content", "")),
                }
                for message in messages
                if isinstance(message, dict)
            ]

            await self.concurrency_controller.acquire()
            await self.rate_limiter.acquire(estimated_tokens)
            start_time = time.time()
            try:
                response = await self._chat_via_rest(
                    normalized_messages,
                    temperature=temp,
                    max_tokens=max_tokens,
                    timeout=timeout,
                )
                await self.concurrency_controller.release(
                    success=True,
                    response_time=time.time() - start_time,
                )
                return response
            except asyncio.TimeoutError:
                await self.concurrency_controller.release(success=False, response_time=timeout)
                raise TimeoutError(f"API request timed out ({timeout}s)")
            except Exception:
                await self.concurrency_controller.release(
                    success=False,
                    response_time=time.time() - start_time,
                )
                raise

        return await retry_with_policy(_do_chat, self.retry_policy)

    async def extract(
        self,
        prompt: str,
        response_type: Type[T],
        system_prompt: Optional[str] = None,
    ) -> T:
        """Extract structured data by asking the model for JSON output."""
        default_system = (
            "You are a precise information extraction assistant. "
            "Return valid JSON only, with no extra commentary."
        )

        if not self.has_real_client():
            await asyncio.sleep(2.0)
            mock_data = {
                "characters": [
                    {
                        "name": "Mo Ran",
                        "role": "antagonist",
                        "description": "Controller of iron technology",
                        "importance": "critical",
                    },
                    {
                        "name": "Qing Luo",
                        "role": "hero",
                        "description": "Sword-wielding guardian of the realm",
                        "importance": "high",
                    },
                ],
                "world": {
                    "name": "Iron Continent",
                    "description": "A fantasy world where steam and spiritual energy coexist.",
                    "locations": [],
                    "cultures": [],
                    "rules": [],
                },
                "timeline": {
                    "events": [
                        {
                            "title": "The Iron Revolt",
                            "date": "1024",
                            "description": "A war to unify the continent begins.",
                            "importance": "critical",
                        }
                    ],
                    "total_events": 1,
                },
                "relationships": {
                    "edges": [
                        {
                            "source": "Mo Ran",
                            "target": "Qing Luo",
                            "type": "rival",
                            "description": "They are enemies with deep personal history.",
                        }
                    ],
                    "nodes": ["Mo Ran", "Qing Luo"],
                    "total_relationships": 1,
                },
                "success": True,
            }

            if hasattr(response_type, "model_validate"):
                try:
                    return response_type.model_validate(mock_data)
                except Exception:
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
        """Extract a JSON array from model output."""
        default_system = (
            "You are a precise information extraction assistant. "
            "Return a valid JSON array only, with no extra commentary."
        )

        response = await self.chat(
            prompt=prompt,
            system_prompt=system_prompt or default_system,
            temperature=self.config.extraction_temperature,
        )
        return self._parse_json_list(response)

    def _parse_json(self, text: str, model_type: Type[T]) -> T:
        """Parse a JSON object or array into a Pydantic model or plain type."""
        cleaned = text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()

        json_match = self._extract_json_object(cleaned) or self._extract_json_array(cleaned)
        if json_match:
            try:
                data = json.loads(json_match)
                if model_type is dict or model_type is list:
                    return data
                return model_type.model_validate(data)
            except json.JSONDecodeError:
                pass

        try:
            data = json.loads(cleaned)
            if model_type is dict or model_type is list:
                return data
            return model_type.model_validate(data)
        except json.JSONDecodeError:
            cleaned = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]", "", cleaned)
            json_match = self._extract_json_object(cleaned) or self._extract_json_array(cleaned)
            if json_match:
                try:
                    data = json.loads(json_match)
                    if model_type is dict or model_type is list:
                        return data
                    return model_type.model_validate(data)
                except json.JSONDecodeError:
                    pass

            raise ValueError(f"JSON parse failed. Raw response: {text[:500]}")

    def _parse_json_list(self, text: str) -> list:
        """Parse a JSON list from model output."""
        cleaned = text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()

        json_match = self._extract_json_array(cleaned)
        if json_match:
            try:
                return json.loads(json_match)
            except json.JSONDecodeError:
                pass

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise ValueError(f"JSON list parse failed: {exc}\nRaw response: {text[:500]}") from exc

    def _extract_json_object(self, text: str) -> Optional[str]:
        """Extract the first valid JSON object from text."""
        start = text.find("{")
        if start == -1:
            return None

        depth = 0
        in_string = False
        escape = False

        for index, char in enumerate(text[start:], start):
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
                    candidate = text[start:index + 1]
                    try:
                        json.loads(candidate)
                        return candidate
                    except json.JSONDecodeError:
                        continue

        return None

    def _extract_json_array(self, text: str) -> Optional[str]:
        """Extract the first valid JSON array from text."""
        start = text.find("[")
        if start == -1:
            return None

        depth = 0
        in_string = False
        escape = False

        for index, char in enumerate(text[start:], start):
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
                    return text[start:index + 1]

        return None


ai_service = AIService()
