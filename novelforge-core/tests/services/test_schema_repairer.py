"""Tests for SchemaRepairer orchestrator — LocalJsonRepairer → ModelSchemaRepairer pipeline."""

import json

import pytest

from novelforge.services.schema_repairer import (
    LocalJsonRepairer,
    ModelSchemaRepairer,
    SchemaRepairer,
    SchemaRepairResult,
)


class ScriptedAIService:
    """Fake AI service that returns scripted responses."""

    def __init__(self, response: str, *, should_fail: bool = False):
        self.response = response
        self.should_fail = should_fail
        self.model = "test-model"

    async def chat(self, prompt: str, *, timeout: float = 120.0) -> str:
        if self.should_fail:
            raise TimeoutError("Simulated timeout")
        return self.response


@pytest.mark.asyncio
async def test_schema_repairer_local_repair_success():
    """SchemaRepairer 必须优先使用本地修复。"""
    repairer = SchemaRepairer()

    result = await repairer.repair('```json\n{"key": "value"}\n```')

    assert result.success is True
    assert result.repair_layer == "local"
    assert json.loads(result.repaired_text) == {"key": "value"}
    assert result.model_used is None


@pytest.mark.asyncio
async def test_schema_repairer_model_repair_on_local_failure():
    """本地修复失败时，SchemaRepairer 必须调用模型修复。"""
    ai_service = ScriptedAIService('{"fixed": true}')
    model_repairer = ModelSchemaRepairer(ai_service=ai_service)
    repairer = SchemaRepairer(model_repairer=model_repairer)

    result = await repairer.repair('这不是JSON')

    assert result.success is True
    assert result.repair_layer == "model"
    assert json.loads(result.repaired_text) == {"fixed": True}
    assert result.model_used == "test-model"


@pytest.mark.asyncio
async def test_schema_repairer_returns_failure_when_both_fail():
    """本地和模型修复都失败时，SchemaRepairer 必须返回失败。"""
    ai_service = ScriptedAIService("还是不对", should_fail=False)
    model_repairer = ModelSchemaRepairer(ai_service=ai_service)
    repairer = SchemaRepairer(model_repairer=model_repairer)

    result = await repairer.repair('这不是JSON')

    assert result.success is False
    assert result.repair_layer == "model"
    assert result.error is not None


@pytest.mark.asyncio
async def test_schema_repairer_no_model_repairer():
    """没有模型修复器时，SchemaRepairer 必须只使用本地修复。"""
    repairer = SchemaRepairer()

    result = await repairer.repair('这不是JSON')

    assert result.success is False
    assert result.repair_layer == "none"


@pytest.mark.asyncio
async def test_schema_repairer_validates_repaired_is_dict():
    """SchemaRepairer 必须验证修复后的文本是 JSON 对象。"""
    ai_service = ScriptedAIService('[1, 2, 3]')  # 数组，不是对象
    model_repairer = ModelSchemaRepairer(ai_service=ai_service)
    repairer = SchemaRepairer(model_repairer=model_repairer)

    result = await repairer.repair('这不是JSON')

    # 数组不是有效的 chapter index 格式
    assert result.success is False


@pytest.mark.asyncio
async def test_schema_repairer_preserves_fixes_applied():
    """SchemaRepairer 必须保留修复记录。"""
    repairer = SchemaRepairer()

    result = await repairer.repair('```json\n{"key": "value",}\n```')

    assert result.success is True
    assert len(result.fixes_applied) >= 2
    assert "stripped_code_fence" in result.fixes_applied
    assert "removed_trailing_comma" in result.fixes_applied


@pytest.mark.asyncio
async def test_schema_repairer_tracks_latency():
    """SchemaRepairer 必须记录延迟。"""
    ai_service = ScriptedAIService('{"fixed": true}')
    model_repairer = ModelSchemaRepairer(ai_service=ai_service)
    repairer = SchemaRepairer(model_repairer=model_repairer)

    result = await repairer.repair('这不是JSON')

    assert result.latency_ms >= 0


@pytest.mark.asyncio
async def test_schema_repairer_with_schema_hint():
    """SchemaRepairer 必须传递 schema hint 给模型修复器。"""
    ai_service = ScriptedAIService('{"fixed": true}')
    model_repairer = ModelSchemaRepairer(ai_service=ai_service)
    repairer = SchemaRepairer(model_repairer=model_repairer, schema_hint="JSON object with name field")

    result = await repairer.repair('这不是JSON')

    assert result.success is True
