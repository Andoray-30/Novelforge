"""
NovelForge 错误处理机制测试脚本
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))

from novelforge.core.exceptions import (
    NovelForgeError, ValidationError, ProcessingError, 
    ConfigurationError, APIError
)
from novelforge.core.logging_config import setup_logging, get_logger
from novelforge.core.error_utils import handle_errors, safe_call, create_error_response


def test_basic_exception():
    """测试基本异常类"""
    try:
        raise ProcessingError(
            message="测试处理错误",
            details={"test_key": "test_value"},
            context="test_context",
            retryable=True
        )
    except ProcessingError as e:
        print(f"捕获到ProcessingError: {e}")
        print(f"错误字典: {e.to_dict()}")
        return True
    return False


def test_validation_error():
    """测试验证错误"""
    try:
        raise ValidationError(
            message="输入数据无效",
            field="test_field",
            value="invalid_value",
            expected="valid_value"
        )
    except ValidationError as e:
        print(f"捕获到ValidationError: {e}")
        print(f"错误字典: {e.to_dict()}")
        return True
    return False


@handle_errors(error_type=ProcessingError, context="decorator_test")
def test_decorated_function():
    """测试装饰器错误处理"""
    raise ValueError("装饰器测试错误")


async def test_async_decorated_function():
    """测试异步装饰器错误处理"""
    @handle_errors(error_type=ProcessingError, context="async_decorator_test")
    async def async_func():
        raise ValueError("异步装饰器测试错误")
    
    try:
        await async_func()
    except ProcessingError as e:
        print(f"捕获到异步装饰器错误: {e}")
        return True
    return False


def test_safe_call():
    """测试安全调用"""
    def failing_function():
        raise ValueError("安全调用测试错误")
    
    try:
        result = safe_call(
            failing_function,
            error_type=ProcessingError,
            context="safe_call_test"
        )
    except ProcessingError as e:
        print(f"捕获到安全调用错误: {e}")
        return True
    return False


def test_error_response():
    """测试错误响应创建"""
    try:
        raise ProcessingError(
            message="测试错误响应",
            context="response_test"
        )
    except Exception as e:
        response = create_error_response(e, context="api_test")
        print(f"错误响应: {response}")
        return True
    return False


def main():
    """主测试函数"""
    print("=== NovelForge 错误处理机制测试 ===")
    
    # 设置日志
    setup_logging(log_level="INFO", structured=True)
    logger = get_logger("test_error_handling")
    
    tests = [
        ("基本异常测试", test_basic_exception),
        ("验证错误测试", test_validation_error),
        ("安全调用测试", test_safe_call),
        ("错误响应测试", test_error_response),
    ]
    
    passed = 0
    total = len(tests)
    
    for name, test_func in tests:
        try:
            if test_func():
                print(f"[OK] {name}: 通过")
                passed += 1
            else:
                print(f"[FAIL] {name}: 失败")
        except Exception as e:
            print(f"[FAIL] {name}: 异常 - {e}")
            logger.error(f"Test {name} failed: {e}", exc_info=True)
    
    # 测试装饰器
    try:
        test_decorated_function()
        print("[FAIL] 装饰器测试: 应该抛出异常")
    except ProcessingError as e:
        print(f"[OK] 装饰器测试: 通过 - {e}")
        passed += 1
    except Exception as e:
        print(f"[FAIL] 装饰器测试: 异常 - {e}")
    
    print(f"\n=== 测试结果: {passed}/{total + 1} 通过 ===")
    
    if passed == total + 1:
        print("[SUCCESS] 所有测试通过！")
        return True
    else:
        print("[WARNING] 部分测试失败")
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)