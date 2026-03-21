#!/usr/bin/env python3
"""
配置验证测试脚本
用于验证config.py中的配置项默认值在类属性和from_env方法中保持一致
"""

import os
import sys
from pathlib import Path

# 添加项目根目录到Python路径
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from novelforge.core.config import Config


def test_config_consistency():
    """测试配置一致性"""
    print("=== 配置一致性测试 ===")
    
    # 创建默认配置实例（不设置任何环境变量）
    config = Config()
    
    # 从环境变量加载配置（使用默认值）
    config_from_env = Config.from_env()
    
    # 比较所有字段
    fields_to_check = [
        'api_key', 'base_url', 'model', 'sillytavern_url',
        'max_text_length', 'max_characters', 'retry_delay',
        'extraction_temperature', 'creative_temperature',
        'min_concurrency', 'max_concurrency', 'target_success_rate', 'target_response_time',
        'rpm_limit', 'tpm_limit', 'max_retries', 'retry_base_delay', 'retry_max_delay'
    ]
    
    all_match = True
    for field in fields_to_check:
        default_value = getattr(config, field)
        env_value = getattr(config_from_env, field)
        
        if default_value != env_value:
            print(f"[FAIL] 不一致: {field}")
            print(f"   默认值: {default_value}")
            print(f"   环境值: {env_value}")
            all_match = False
        else:
            print(f"[OK] 一致: {field} = {default_value}")
    
    if all_match:
        print("\n[SUCCESS] 所有配置项默认值一致！")
        return True
    else:
        print("\n[FAIL] 存在不一致的配置项！")
        return False


def test_environment_override():
    """测试环境变量覆盖"""
    print("\n=== 环境变量覆盖测试 ===")
    
    # 设置环境变量
    os.environ['EXTRACTION_TEMPERATURE'] = '0.5'
    os.environ['CREATIVE_TEMPERATURE'] = '0.9'
    os.environ['MAX_RETRIES'] = '10'
    
    try:
        config_with_env = Config.from_env()
        
        assert config_with_env.extraction_temperature == 0.5, f"Expected 0.5, got {config_with_env.extraction_temperature}"
        assert config_with_env.creative_temperature == 0.9, f"Expected 0.9, got {config_with_env.creative_temperature}"
        assert config_with_env.max_retries == 10, f"Expected 10, got {config_with_env.max_retries}"
        
        print("[OK] 环境变量覆盖测试通过！")
        return True
    finally:
        # 清理环境变量
        if 'EXTRACTION_TEMPERATURE' in os.environ:
            del os.environ['EXTRACTION_TEMPERATURE']
        if 'CREATIVE_TEMPERATURE' in os.environ:
            del os.environ['CREATIVE_TEMPERATURE']
        if 'MAX_RETRIES' in os.environ:
            del os.environ['MAX_RETRIES']


if __name__ == "__main__":
    success1 = test_config_consistency()
    success2 = test_environment_override()
    
    if success1 and success2:
        print("\n[SUCCESS] 所有测试通过！配置修复成功！")
        sys.exit(0)
    else:
        print("\n[FAIL] 测试失败！")
        sys.exit(1)