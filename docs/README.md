# NovelForge 文档中心

> 最后更新：2026-03-20

## 📁 文档目录结构

```
docs/
├── README.md                        # 本文件，文档导航入口
├── overview/
│   └── 项目架构说明.md               # ⭐ 核心：系统架构、技术栈、模块说明、开发进度
├── design/
│   └── 高质量角色卡和世界书提取方案.md # 角色/世界书提取的核心算法设计参考
├── guides/
│   ├── 使用指南.md                    # 用户操作指南
│   └── 导入角色和世界书步骤.md         # SillyTavern 导入流程
└── licenses/
    └── AGPL-3.0二次开发许可说明.md    # 开源许可证说明
```

## 🗺️ 快速导航

### 新加入开发者
1. 阅读 [`项目架构说明.md`](./overview/项目架构说明.md) — 了解整体架构和当前进度
2. 阅读根目录的 [`README.md`](../README.md) — 了解安装和启动方式

### 前端开发者
- 参考 `novelforge-core/frontend/docs/` 下的组件和系统文档：
  - `LAYOUT_SYSTEM.md` — 布局系统设计
  - `ERROR_HANDLING.md` — 错误处理机制
  - `FORM_ENHANCEMENT.md` — 表单增强方案

### 用户
- [`使用指南.md`](./guides/使用指南.md) — 完整使用流程
- [`导入角色和世界书步骤.md`](./guides/导入角色和世界书步骤.md) — SillyTavern 集成操作

---

> 如需查看系统 API 文档，启动后端后访问 `http://localhost:8000/docs`