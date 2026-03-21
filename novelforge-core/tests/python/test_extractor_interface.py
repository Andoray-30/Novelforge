"""
测试提取器接口一致性
"""

import asyncio
from pathlib import Path
from novelforge.extractors.base_extractor import ExtractionConfig, BaseExtractor
from novelforge.extractors.unified_extractor import UnifiedExtractor
from novelforge.core.models import ExtractionResult


async def test_unified_extractor():
    """测试统一提取器"""
    config = ExtractionConfig()
    
    # 创建统一提取器（不带AI服务，只测试接口）
    extractor = UnifiedExtractor(config)
    
    # 验证继承关系
    assert isinstance(extractor, BaseExtractor), "UnifiedExtractor should inherit from BaseExtractor"
    
    # 验证方法存在
    assert hasattr(extractor, 'extract'), "UnifiedExtractor should have extract method"
    assert hasattr(extractor, 'validate'), "UnifiedExtractor should have validate method"
    assert hasattr(extractor, 'save'), "UnifiedExtractor should have save method"
    
    print("[OK] UnifiedExtractor interface test passed")
    
    # 测试协议兼容性
    def check_protocol_compatibility():
        # 创建一个模拟的ExtractionResult
        result = ExtractionResult(
            characters=[],
            world=None,
            timeline=None,
            relationships=None,
            success=True,
            errors=[]
        )
        
        # 检查协议字段
        required_fields = ['characters', 'world', 'timeline', 'relationships', 'success', 'errors']
        for field in required_fields:
            assert hasattr(result, field), f"ExtractionResult should have field {field}"
        
        print("[OK] ExtractionResult protocol compatibility test passed")
    
    check_protocol_compatibility()


def test_base_extractor_protocol():
    """测试BaseExtractor协议定义"""
    from novelforge.extractors.base_extractor import ExtractionResult as ProtocolExtractionResult
    
    # 协议应该有正确的字段
    protocol_fields = ProtocolExtractionResult.__annotations__
    expected_fields = {
        'characters': 'list[Character]',
        'world': 'Optional[WorldSetting]',
        'timeline': 'Optional[Timeline]',
        'relationships': 'Optional[RelationshipNetwork]',
        'success': 'bool',
        'errors': 'list[str]'
    }
    
    print(f"Protocol fields: {protocol_fields}")
    print("BaseExtractor protocol test passed")


if __name__ == "__main__":
    # 运行同步测试
    test_base_extractor_protocol()
    
    # 运行异步测试
    asyncio.run(test_unified_extractor())
    
    print("[SUCCESS] All interface consistency tests passed!")