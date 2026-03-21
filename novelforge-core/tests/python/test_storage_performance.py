"""
存储性能测试脚本
测试文件存储 vs 数据库存储的性能差异
"""
import asyncio
import time
import os
from pathlib import Path

# 添加项目根目录到Python路径
import sys
sys.path.append(str(Path(__file__).parent))

from novelforge.storage.storage_manager import StorageManager
from novelforge.content.manager import ContentManager
from novelforge.content.models import ContentItem, ContentMetadata, ContentType, ContentStatus, ContentSearchRequest


async def create_test_content(count: int) -> list:
    """创建测试内容"""
    contents = []
    for i in range(count):
        metadata = ContentMetadata(
            title=f"Test Content {i}",
            type=ContentType.CHARACTER,
            status=ContentStatus.DRAFT,
            tags=[f"tag{i % 10}", f"common_tag"]
        )
        content = ContentItem(
            metadata=metadata,
            content=f"This is test content {i} with some sample text."
        )
        contents.append(content)
    return contents


async def test_file_storage_performance():
    """测试文件存储性能"""
    print("Testing file storage performance...")
    
    # 清理测试数据
    data_dir = Path("./data")
    if data_dir.exists():
        import shutil
        shutil.rmtree(data_dir)
    
    storage_manager = StorageManager("file")
    content_manager = ContentManager(storage_manager, use_database=False)
    
    # 创建测试内容
    contents = await create_test_content(100)
    
    # 测试创建性能
    start_time = time.time()
    for content in contents:
        await content_manager.create_content(content)
    create_time = time.time() - start_time
    
    # 测试搜索性能
    start_time = time.time()
    search_request = ContentSearchRequest(
        query="Test",
        content_type=ContentType.CHARACTER,
        tags=["common_tag"],
        limit=20,
        offset=0
    )
    result = await content_manager.search_content(search_request)
    search_time = time.time() - start_time
    
    print(f"File storage - Create 100 items: {create_time:.2f}s")
    print(f"File storage - Search (O(N) traversal): {search_time:.2f}s")
    print(f"File storage - Found {result.total} items")
    
    return create_time, search_time


async def test_database_storage_performance():
    """测试数据库存储性能"""
    print("Testing database storage performance...")
    
    # 清理测试数据
    db_path = Path("./data/novelforge_content.db")
    if db_path.exists():
        db_path.unlink()
    
    storage_manager = StorageManager("content_db")
    content_manager = ContentManager(storage_manager, use_database=True)
    
    # 创建测试内容
    contents = await create_test_content(100)
    
    # 测试创建性能
    start_time = time.time()
    for content in contents:
        await content_manager.create_content(content)
    create_time = time.time() - start_time
    
    # 测试搜索性能
    start_time = time.time()
    search_request = ContentSearchRequest(
        query="Test",
        content_type=ContentType.CHARACTER,
        tags=["common_tag"],
        limit=20,
        offset=0
    )
    result = await content_manager.search_content(search_request)
    search_time = time.time() - start_time
    
    print(f"Database storage - Create 100 items: {create_time:.2f}s")
    print(f"Database storage - Search (indexed query): {search_time:.2f}s")
    print(f"Database storage - Found {result.total} items")
    
    return create_time, search_time


async def main():
    """主测试函数"""
    print("Starting storage performance comparison...\n")
    
    # 测试文件存储
    file_result = await test_file_storage_performance()
    file_create_time, file_search_time = file_result
    print()
    
    # 测试数据库存储
    db_result = await test_database_storage_performance()
    db_create_time, db_search_time = db_result
    print()
    
    # 比较结果
    print("Performance Comparison:")
    print(f"Create performance: {'Database' if db_create_time < file_create_time else 'File'} is faster")
    print(f"Search performance: {'Database' if db_search_time < file_search_time else 'File'} is faster")
    print(f"Search speedup: {file_search_time / db_search_time:.2f}x faster with database")
    
    # 清理测试数据
    data_dir = Path("./data")
    if data_dir.exists():
        import shutil
        shutil.rmtree(data_dir)


if __name__ == "__main__":
    asyncio.run(main())