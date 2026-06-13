"""Tests for LocalJsonRepairer — deterministic JSON fix layer."""

import json

import pytest

from novelforge.services.schema_repairer import LocalJsonRepairer, LocalRepairResult


def test_strips_markdown_code_fence():
    """必须去除 markdown code fence。"""
    raw = '```json\n{"key": "value"}\n```'
    result = LocalJsonRepairer.repair(raw)
    assert result.success is True
    assert json.loads(result.repaired_text) == {"key": "value"}
    assert "stripped_code_fence" in result.fixes_applied


def test_strips_markdown_code_fence_without_json_tag():
    """必须去除不带 json 标签的 code fence。"""
    raw = '```\n{"key": "value"}\n```'
    result = LocalJsonRepairer.repair(raw)
    assert result.success is True
    assert json.loads(result.repaired_text) == {"key": "value"}
    assert "stripped_code_fence" in result.fixes_applied


def test_extracts_json_object_from_surrounding_text():
    """必须从周围文本中提取 JSON 对象。"""
    raw = 'Here is the result:\n{"key": "value"}\nDone.'
    result = LocalJsonRepairer.repair(raw)
    assert result.success is True
    assert json.loads(result.repaired_text) == {"key": "value"}
    assert "extracted_json_object" in result.fixes_applied


def test_fixes_trailing_comma_before_brace():
    """必须修复对象末尾的尾逗号。"""
    raw = '{"key": "value",}'
    result = LocalJsonRepairer.repair(raw)
    assert result.success is True
    assert json.loads(result.repaired_text) == {"key": "value"}
    assert "removed_trailing_comma" in result.fixes_applied


def test_fixes_trailing_comma_before_bracket():
    """必须修复数组末尾的尾逗号。"""
    raw = '{"items": [1, 2, 3,]}'
    result = LocalJsonRepairer.repair(raw)
    assert result.success is True
    data = json.loads(result.repaired_text)
    assert data["items"] == [1, 2, 3]
    assert "removed_trailing_comma" in result.fixes_applied


def test_fixes_single_quotes_to_double_quotes():
    """必须将单引号替换为双引号。"""
    raw = "{'key': 'value'}"
    result = LocalJsonRepairer.repair(raw)
    assert result.success is True
    assert json.loads(result.repaired_text) == {"key": "value"}
    assert "fixed_single_quotes" in result.fixes_applied


def test_fixes_chinese_quotes():
    """必须修复中文引号。"""
    raw = '{"key": "value"}'  # 中文引号
    result = LocalJsonRepairer.repair(raw)
    assert result.success is True
    assert json.loads(result.repaired_text) == {"key": "value"}


def test_fixes_missing_closing_brace():
    """必须修复缺失的闭合大括号。"""
    raw = '{"key": "value"'
    result = LocalJsonRepairer.repair(raw)
    assert result.success is True
    assert json.loads(result.repaired_text) == {"key": "value"}
    assert "fixed_missing_bracket" in result.fixes_applied


def test_fixes_missing_closing_bracket():
    """必须修复缺失的闭合方括号。"""
    raw = '{"items": [1, 2, 3'
    result = LocalJsonRepairer.repair(raw)
    assert result.success is True
    data = json.loads(result.repaired_text)
    assert data["items"] == [1, 2, 3]


def test_removes_bom():
    """必须去除 BOM 字符。"""
    raw = '\ufeff{"key": "value"}'
    result = LocalJsonRepairer.repair(raw)
    assert result.success is True
    assert json.loads(result.repaired_text) == {"key": "value"}
    assert "removed_bom" in result.fixes_applied


def test_removes_zero_width_characters():
    """必须去除零宽字符。"""
    raw = '{"key": "value"\u200b\u200c\u200d}'
    result = LocalJsonRepairer.repair(raw)
    assert result.success is True
    assert json.loads(result.repaired_text) == {"key": "value"}
    assert "removed_zero_width_chars" in result.fixes_applied


def test_handles_already_valid_json():
    """已经合法的 JSON 不需要修复。"""
    raw = '{"key": "value", "number": 42}'
    result = LocalJsonRepairer.repair(raw)
    assert result.success is True
    assert json.loads(result.repaired_text) == {"key": "value", "number": 42}
    assert result.fixes_applied == []


def test_returns_failure_for_completely_invalid():
    """完全无法修复的文本必须返回失败。"""
    raw = "这不是JSON，只是普通文本"
    result = LocalJsonRepairer.repair(raw)
    assert result.success is False
    assert result.repaired_text is None
    assert result.error is not None


def test_returns_failure_for_empty_string():
    """空字符串必须返回失败。"""
    raw = ""
    result = LocalJsonRepairer.repair(raw)
    assert result.success is False
    assert result.repaired_text is None


def test_fixes_multiple_issues():
    """必须能同时修复多个问题。"""
    raw = '```json\n{"key": "value", "items": [1, 2,],}\n```'
    result = LocalJsonRepairer.repair(raw)
    assert result.success is True
    data = json.loads(result.repaired_text)
    assert data == {"key": "value", "items": [1, 2]}
    assert len(result.fixes_applied) >= 2


def test_preserves_chinese_content():
    """必须保留中文内容。"""
    raw = '{"name": "张三", "description": "这是一个测试"}'
    result = LocalJsonRepairer.repair(raw)
    assert result.success is True
    data = json.loads(result.repaired_text)
    assert data["name"] == "张三"
    assert data["description"] == "这是一个测试"


def test_handles_nested_json():
    """必须能处理嵌套 JSON。"""
    raw = '{"outer": {"inner": "value", "list": [1, 2, 3,]}}'
    result = LocalJsonRepairer.repair(raw)
    assert result.success is True
    data = json.loads(result.repaired_text)
    assert data["outer"]["inner"] == "value"
    assert data["outer"]["list"] == [1, 2, 3]
