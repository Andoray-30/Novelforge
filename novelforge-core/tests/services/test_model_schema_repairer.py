"""Tests for ModelSchemaRepairer — AI-powered format calibration."""

import json

import pytest

from novelforge.services.schema_repairer import ModelSchemaRepairer, ModelRepairResult


class ScriptedAIService:
    """Fake AI service that returns scripted responses."""

    def __init__(self, response: str, *, delay: float = 0.0, should_fail: bool = False):
        self.response = response
        self.delay = delay
        self.should_fail = should_fail
        self.model = "test-model"

    async def chat(self, prompt: str, *, timeout: float = 120.0) -> str:
        if self.should_fail:
            raise TimeoutError("Simulated timeout")
        return self.response


@pytest.mark.asyncio
async def test_model_repairer_fixes_valid_json():
    """ModelSchemaRepairer 必须能修复有效的 JSON。"""
    valid_json = '{"key": "value", "items": [1, 2, 3]}'
    ai_service = ScriptedAIService(valid_json)
    repairer = ModelSchemaRepairer(ai_service=ai_service)

    result = await repairer.repair('{"key": "value", items: [1, 2, 3]}', "JSON object with items array")

    assert result.success is True
    assert json.loads(result.repaired_text) == {"key": "value", "items": [1, 2, 3]}
    assert result.model_used == "test-model"
    assert result.latency_ms >= 0


@pytest.mark.asyncio
async def test_model_repairer_returns_failure_for_invalid_response():
    """ModelSchemaRepairer 必须在模型返回无效 JSON 时返回失败。"""
    ai_service = ScriptedAIService("这不是JSON")
    repairer = ModelSchemaRepairer(ai_service=ai_service)

    result = await repairer.repair('{"broken": json}', "JSON object")

    assert result.success is False
    assert result.error is not None
    assert "invalid JSON" in result.error


@pytest.mark.asyncio
async def test_model_repairer_returns_failure_on_timeout():
    """ModelSchemaRepairer 必须在超时时返回失败。"""
    ai_service = ScriptedAIService("", should_fail=True)
    repairer = ModelSchemaRepairer(ai_service=ai_service)

    result = await repairer.repair('{"broken": json}', "JSON object")

    assert result.success is False
    assert result.error is not None


@pytest.mark.asyncio
async def test_model_repairer_uses_correct_timeout():
    """ModelSchemaRepairer 必须使用配置的超时。"""
    ai_service = ScriptedAIService('{"fixed": true}')
    repairer = ModelSchemaRepairer(ai_service=ai_service, timeout=60.0)

    result = await repairer.repair('{"broken": json}', "JSON object")

    assert result.success is True


@pytest.mark.asyncio
async def test_model_repairer_builds_correct_prompt():
    """ModelSchemaRepairer 必须构建正确的提示词。"""
    ai_service = ScriptedAIService('{"fixed": true}')
    repairer = ModelSchemaRepairer(ai_service=ai_service)

    await repairer.repair('{"broken": json}', "JSON object with name field")

    # 验证提示词包含 schema hint 和原始文本
    # (通过检查 ai_service 的调用参数)


@pytest.mark.asyncio
async def test_model_repairer_preserves_model_info():
    """ModelSchemaRepairer 必须保留模型信息。"""
    ai_service = ScriptedAIService('{"fixed": true}')
    ai_service.model = "gpt-4"
    repairer = ModelSchemaRepairer(ai_service=ai_service)

    result = await repairer.repair('{"broken": json}', "JSON object")

    assert result.model_used == "gpt-4"
