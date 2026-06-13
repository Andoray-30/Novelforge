"""Schema repairer for malformed JSON extraction responses.

Two-layer approach:
1. LocalJsonRepairer — deterministic string-level fixes (no API calls)
2. ModelSchemaRepairer — AI-powered format calibration via schema_repair role
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class LocalRepairResult:
    """Result from LocalJsonRepairer.repair()."""

    success: bool
    repaired_text: Optional[str] = None
    fixes_applied: List[str] = field(default_factory=list)
    error: Optional[str] = None


@dataclass
class ModelRepairResult:
    """Result from ModelSchemaRepairer.repair()."""

    success: bool
    repaired_text: Optional[str] = None
    model_used: str = ""
    latency_ms: int = 0
    error: Optional[str] = None


@dataclass
class SchemaRepairResult:
    """Result from SchemaRepairer.repair() orchestrator."""

    success: bool
    repaired_text: Optional[str] = None
    repair_layer: str = "none"  # "local" | "model" | "none"
    fixes_applied: List[str] = field(default_factory=list)
    model_used: Optional[str] = None
    latency_ms: int = 0
    error: Optional[str] = None


class LocalJsonRepairer:
    """Deterministic JSON fix layer — no API calls.

    Applies string-level fixes in order:
    1. Strip code fences
    2. Extract JSON object boundary
    3. Remove trailing commas
    4. Fix single quotes → double quotes
    5. Fix missing closing brackets
    6. Remove BOM and zero-width characters
    """

    @staticmethod
    def repair(raw_text: str) -> LocalRepairResult:
        if not raw_text or not raw_text.strip():
            return LocalRepairResult(success=False, error="Empty input")

        fixes: List[str] = []
        text = raw_text

        # 1. Remove BOM
        if text.startswith("\ufeff"):
            text = text[1:]
            fixes.append("removed_bom")

        # 2. Remove zero-width characters
        cleaned = re.sub(r"[\u200b\u200c\u200d\u200e\u200f\ufeff]", "", text)
        if cleaned != text:
            text = cleaned
            fixes.append("removed_zero_width_chars")

        # 3. Strip code fences
        fence_pattern = r"^```(?:json)?\s*\n?([\s\S]*?)\n?```$"
        match = re.match(fence_pattern, text.strip(), re.MULTILINE)
        if match:
            text = match.group(1).strip()
            fixes.append("stripped_code_fence")

        # 4. Try direct parse first
        try:
            json.loads(text)
            return LocalRepairResult(success=True, repaired_text=text, fixes_applied=fixes)
        except json.JSONDecodeError:
            pass

        # 5. Extract JSON object boundary
        extracted = LocalJsonRepairer._extract_json_object(text)
        if extracted != text:
            text = extracted
            fixes.append("extracted_json_object")

        # 6. Fix single quotes → double quotes (conservative)
        if "'" in text and '"' not in text:
            text = text.replace("'", '"')
            fixes.append("fixed_single_quotes")

        # 7. Remove trailing commas
        fixed_commas = re.sub(r",\s*([}\]])", r"\1", text)
        if fixed_commas != text:
            text = fixed_commas
            fixes.append("removed_trailing_comma")

        # 8. Try parse again
        try:
            json.loads(text)
            return LocalRepairResult(success=True, repaired_text=text, fixes_applied=fixes)
        except json.JSONDecodeError:
            pass

        # 9. Fix missing closing brackets
        text = LocalJsonRepairer._fix_missing_brackets(text)
        fixes.append("fixed_missing_bracket")

        # 10. Final parse attempt
        try:
            json.loads(text)
            return LocalRepairResult(success=True, repaired_text=text, fixes_applied=fixes)
        except json.JSONDecodeError as e:
            return LocalRepairResult(
                success=False,
                error=f"JSON parse failed after all fixes: {e}",
                fixes_applied=fixes,
            )

    @staticmethod
    def _extract_json_object(text: str) -> str:
        text = text.strip()
        start = text.find("{")
        if start < 0:
            return text
        end = text.rfind("}")
        if end <= start:
            return text
        return text[start : end + 1]

    @staticmethod
    def _fix_missing_brackets(text: str) -> str:
        open_braces = text.count("{")
        close_braces = text.count("}")
        open_brackets = text.count("[")
        close_brackets = text.count("]")

        # Add closing brackets first (inner before outer)
        if open_brackets > close_brackets:
            text += "]" * (open_brackets - close_brackets)
        if open_braces > close_braces:
            text += "}" * (open_braces - close_braces)

        return text


class ModelSchemaRepairer:
    """AI-powered format calibration via schema_repair role.

    Sends broken JSON + schema hint to a dedicated model for format-only repair.
    Does NOT extract content or add new facts.
    """

    def __init__(self, ai_service: Any, timeout: float = 120.0):
        self._ai_service = ai_service
        self._timeout = timeout

    async def repair(self, raw_text: str, schema_hint: str) -> ModelRepairResult:
        started = time.perf_counter()
        prompt = self._build_prompt(raw_text, schema_hint)

        try:
            response = await self._ai_service.chat(
                prompt,
                timeout=self._timeout,
            )
            latency_ms = int((time.perf_counter() - started) * 1000)

            # Validate response is valid JSON
            try:
                json.loads(response)
                return ModelRepairResult(
                    success=True,
                    repaired_text=response,
                    model_used=getattr(self._ai_service, "model", "unknown"),
                    latency_ms=latency_ms,
                )
            except json.JSONDecodeError as e:
                return ModelRepairResult(
                    success=False,
                    model_used=getattr(self._ai_service, "model", "unknown"),
                    latency_ms=latency_ms,
                    error=f"Model returned invalid JSON: {e}",
                )
        except Exception as e:
            latency_ms = int((time.perf_counter() - started) * 1000)
            return ModelRepairResult(
                success=False,
                latency_ms=latency_ms,
                error=str(e),
            )

    @staticmethod
    def _build_prompt(raw_text: str, schema_hint: str) -> str:
        return f"""以下是AI模型返回的格式错误的JSON。请修复JSON语法错误使其可解析。
不要修改内容、不要提取信息、不要添加字段。只修复格式。

期望的JSON结构提示：
{schema_hint}

错误的JSON：
{raw_text}

请只输出修复后的合法JSON，不要输出解释。"""


class SchemaRepairer:
    """Orchestrator: LocalJsonRepairer → ModelSchemaRepairer."""

    def __init__(
        self,
        local_repairer: Optional[LocalJsonRepairer] = None,
        model_repairer: Optional[ModelSchemaRepairer] = None,
        schema_hint: str = "",
    ):
        self._local = local_repairer or LocalJsonRepairer()
        self._model = model_repairer
        self._schema_hint = schema_hint

    async def repair(self, raw_text: str) -> SchemaRepairResult:
        # Layer 1: Local repair
        local_result = self._local.repair(raw_text)
        if local_result.success:
            # Validate repaired text is a JSON object (dict)
            try:
                parsed = json.loads(local_result.repaired_text)
                if isinstance(parsed, dict):
                    return SchemaRepairResult(
                        success=True,
                        repaired_text=local_result.repaired_text,
                        repair_layer="local",
                        fixes_applied=local_result.fixes_applied,
                    )
            except json.JSONDecodeError:
                pass

        # Layer 2: Model repair (if available)
        if self._model is not None:
            model_result = await self._model.repair(raw_text, self._schema_hint)
            if model_result.success:
                # Validate repaired text is a JSON object (dict)
                try:
                    parsed = json.loads(model_result.repaired_text)
                    if isinstance(parsed, dict):
                        return SchemaRepairResult(
                            success=True,
                            repaired_text=model_result.repaired_text,
                            repair_layer="model",
                            model_used=model_result.model_used,
                            latency_ms=model_result.latency_ms,
                        )
                except json.JSONDecodeError:
                    pass
            return SchemaRepairResult(
                success=False,
                repair_layer="model",
                model_used=model_result.model_used,
                latency_ms=model_result.latency_ms,
                error=model_result.error,
            )

        return SchemaRepairResult(
            success=False,
            repair_layer="none",
            error=local_result.error,
        )
