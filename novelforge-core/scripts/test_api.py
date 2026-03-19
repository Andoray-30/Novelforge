#!/usr/bin/env python
"""
测试NovelForge API服务器
"""

import asyncio
import aiohttp
import json
from datetime import datetime


async def test_api_endpoints():
    """测试API端点"""
    base_url = "http://localhost:8000"
    
    print(f"[{datetime.now()}] 开始测试NovelForge API...")
    print(f"API地址: {base_url}")
    print("-" * 60)
    
    async with aiohttp.ClientSession() as session:
        # 1. 测试健康检查
        print("1. 测试健康检查端点...")
        try:
            async with session.get(f"{base_url}/health") as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ 健康检查通过: {data}")
                else:
                    print(f"❌ 健康检查失败: {response.status}")
        except Exception as e:
            print(f"❌ 健康检查异常: {e}")
        
        print()
        
        # 2. 测试故事架构生成
        print("2. 测试故事架构生成...")
        story_data = {
            "novel_type": "fantasy",
            "theme": "友谊与背叛",
            "length": "medium",
            "target_audience": "general",
            "constraints": ["包含魔法元素", "有龙的角色"]
        }
        
        try:
            async with session.post(
                f"{base_url}/api/ai/generate-story-outline",
                json=story_data,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ 故事架构生成成功")
                    print(f"标题: {data.get('title')}")
                    print(f"类型: {data.get('genre')}")
                    print(f"情节点数量: {len(data.get('plotPoints', []))}")
                    print(f"角色数量: {len(data.get('characterRoles', []))}")
                else:
                    error_data = await response.text()
                    print(f"❌ 故事架构生成失败: {response.status}")
                    print(f"错误信息: {error_data}")
        except Exception as e:
            print(f"❌ 故事架构生成异常: {e}")
        
        print()
        
        # 3. 测试角色设计
        print("3. 测试角色设计...")
        character_data = {
            "context": "一个关于友谊与背叛的奇幻故事，背景是中世纪的魔法世界",
            "roles": ["protagonist", "antagonist", "mentor"]
        }
        
        try:
            async with session.post(
                f"{base_url}/api/ai/design-characters",
                json=character_data,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ 角色设计成功")
                    print(f"设计角色数量: {len(data)}")
                    for i, char in enumerate(data):
                        print(f"  角色{i+1}: {char.get('name')} ({char.get('role')})")
                else:
                    error_data = await response.text()
                    print(f"❌ 角色设计失败: {response.status}")
                    print(f"错误信息: {error_data}")
        except Exception as e:
            print(f"❌ 角色设计异常: {e}")
        
        print()
        
        # 4. 测试世界构建
        print("4. 测试世界构建...")
        # 使用之前生成的故事架构作为输入
        world_data = {
            "story_outline": {
                "title": "友谊与背叛的故事",
                "genre": "fantasy",
                "theme": "友谊与背叛",
                "plotPoints": [
                    {"title": "开端", "description": "故事开始"},
                    {"title": "发展", "description": "冲突升级"},
                    {"title": "高潮", "description": "最终对决"},
                    {"title": "结局", "description": "冲突解决"}
                ],
                "characterRoles": [
                    {"name": "主角", "role": "protagonist"},
                    {"name": "反派", "role": "antagonist"}
                ],
                "worldElements": ["魔法系统", "古老传说"]
            }
        }
        
        try:
            async with session.post(
                f"{base_url}/api/ai/build-world-setting",
                json=world_data,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ 世界构建成功")
                    print(f"世界名称: {data.get('name')}")
                    print(f"地点数量: {len(data.get('locations', []))}")
                    print(f"文化数量: {len(data.get('cultures', []))}")
                    print(f"规则数量: {len(data.get('rules', []))}")
                else:
                    error_data = await response.text()
                    print(f"❌ 世界构建失败: {response.status}")
                    print(f"错误信息: {error_data}")
        except Exception as e:
            print(f"❌ 世界构建异常: {e}")
        
        print()
        
        # 5. 测试工作流
        print("5. 测试工作流管理...")
        workflow_data = {
            "ai_plan": {
                "title": "测试故事",
                "genre": "fantasy",
                "theme": "测试主题"
            },
            "source_text": "这是一个测试用的源文本"
        }
        
        try:
            async with session.post(
                f"{base_url}/api/workflow/start-process",
                json=workflow_data,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ 工作流启动成功")
                    print(f"任务ID: {data.get('taskId')}")
                    print(f"状态: {data.get('status')}")
                    
                    # 测试获取工作流状态
                    task_id = data.get('taskId')
                    if task_id:
                        print(f"   获取任务状态...")
                        async with session.get(f"{base_url}/api/workflow/status/{task_id}") as status_response:
                            if status_response.status == 200:
                                status_data = await status_response.json()
                                print(f"   ✅ 任务状态: {status_data.get('status')}")
                                print(f"   进度: {status_data.get('progress')}%")
                            else:
                                print(f"   ❌ 获取任务状态失败: {status_response.status}")
                else:
                    error_data = await response.text()
                    print(f"❌ 工作流启动失败: {response.status}")
                    print(f"错误信息: {error_data}")
        except Exception as e:
            print(f"❌ 工作流异常: {e}")
    
    print("-" * 60)
    print(f"[{datetime.now()}] API测试完成")


if __name__ == "__main__":
    print("NovelForge API测试工具")
    print("确保API服务器正在运行在 http://localhost:8000")
    print()
    
    # 运行测试
    asyncio.run(test_api_endpoints())