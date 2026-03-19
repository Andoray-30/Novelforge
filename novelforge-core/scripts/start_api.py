#!/usr/bin/env python
"""
NovelForge API服务器启动脚本
"""

import uvicorn
import os
import sys
from pathlib import Path

# 添加项目根目录到Python路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

def main():
    """启动API服务器"""
    # 配置参数
    host = os.getenv("NOVELFORGE_API_HOST", "0.0.0.0")
    port = int(os.getenv("NOVELFORGE_API_PORT", "8001"))
    reload = os.getenv("NOVELFORGE_API_RELOAD", "true").lower() == "true"
    
    print(f"启动 NovelForge API 服务器...")
    print(f"主机: {host}")
    print(f"端口: {port}")
    print(f"热重载: {reload}")
    print(f"API文档: http://{host}:{port}/docs")
    print(f"备用文档: http://{host}:{port}/redoc")
    print("-" * 50)
    
    # 启动服务器
    uvicorn.run(
        "novelforge.api:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info"
    )

if __name__ == "__main__":
    main()