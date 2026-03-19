# NovelForge 一键启动指南

## 启动脚本说明

本项目提供了一键启动脚本来方便启动服务。

### Windows 系统

#### 启动后端服务（API）
```bash
# 在 novelforge-core 目录下运行
.\start_backend.ps1
# 或者
start_services.bat
```

#### 启动前端服务
```bash
# 在 novelforge-core/frontend 目录下运行
.\start_frontend.bat
```

### 手动启动方式

#### 启动后端 API 服务
```bash
cd f:/Cyber-Companion/NovelForge/novelforge-core
.venv\Scripts\Activate.ps1
uvicorn novelforge.api:app --host 0.0.0.0 --port 8001 --reload
```

#### 启动前端服务
```bash
cd f:/Cyber-Companion/NovelForge/novelforge-core/frontend
npm install
npm run dev
```

## 访问服务

- **前端界面**: [http://localhost:3000](http://localhost:3000)
- **API 文档**: [http://localhost:8001/docs](http://localhost:8001/docs)
- **API 健康检查**: [http://localhost:8001/health](http://localhost:8001/health)

## 功能入口

- **主界面**: http://localhost:3000
- **AI规划**: http://localhost:3000/ai-planning
- **元素可视化**: http://localhost:3000/elements-visualization
- **角色管理**: http://localhost:3000/characters
- **小说编辑器**: http://localhost:3000/novel-editor

## 注意事项

1. 请确保已安装 Python 3.10+ 和 Node.js
2. 后端和前端需要分别启动
3. 启动脚本会自动激活虚拟环境
4. 首次运行可能需要等待几分钟进行依赖安装