# NovelForge 内测发布准备说明

Date: 2026-05-29

## 目标

本文件用于内测前检查。重点不是继续堆功能，而是确认 NovelForge 能稳定完成：

`登录/打开项目 -> 导入长篇 -> 提取资产 -> 查看质量 -> AI 写作候选 -> 用户确认保存 -> editor 继续管理`

## 配置要求

以 `novelforge-core/.env.example` 为模板，本地真实值只写入 `novelforge-core/.env` 或部署平台 secret，不提交到 git。

必填项：

- `OPENAI_BASE_URL`: OpenAI-compatible endpoint，例如 `https://fast-newapi.sync-api.xyz:8848/v1`。
- `OPENAI_API_KEY`: 服务端 provider key，不能放到前端公开变量。
- `OPENAI_MODEL`: 默认模型。
- `NOVELFORGE_FAST_MODEL`: 对话框 Fast 模式映射模型。
- `NOVELFORGE_PRO_MODEL`: 对话框 Pro 模式映射模型。
- `NOVELFORGE_ADMIN_PASSWORD`: 单管理员登录密码，内测/部署必须配置。
- `NOVELFORGE_SESSION_SECRET`: HttpOnly session cookie 签名密钥，内测/部署必须配置。
- `FRONTEND_ORIGIN`: 前端实际访问地址；公开部署不能保留 localhost。
- `NOVELFORGE_DATA_DIR`: 持久数据目录。
- `STORAGE_TYPE=content_db` 与 `USE_CONTENT_DATABASE=true`: 推荐内测/部署存储模式。

生成 session secret：

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

内测/公开部署建议：

```env
NOVELFORGE_PUBLIC_DEPLOYMENT=true
NOVELFORGE_AUTH_REQUIRED=true
NOVELFORGE_ALLOW_RUNTIME_OPENAI_OVERRIDES=false
STORAGE_TYPE=content_db
USE_CONTENT_DATABASE=true
```

启动检查行为：

- `NOVELFORGE_PUBLIC_DEPLOYMENT=true` 时，后端会严格检查管理员密码、session secret、AI key、非 localhost 前端来源、content_db 存储和数据目录可写性。
- 本地开发未配置管理员密码或 session secret 时不会阻止启动，但会输出中文提示，说明它们是内测/部署必填项。
- 设置页会显示安全的布尔状态，只提示是否配置，不暴露真实密钥。

## 质量语义

NovelForge 现在区分两个概念：

- **提取完成**：章节、角色、关系、时间线、世界观等资产已经生成并写入内容库。
- **创作就绪**：资产质量足以支撑较高质量 AI 写作，尤其是角色深度、关系张力、世界观可写性和章节来源。

因此，`analysis_status=completed` 但项目质量为 `needs_repair` 并不矛盾：

- 资产已经入库，可以开始写作。
- 但建议先修复关系、角色或世界观，以提升序章候选的情绪张力和人物选择。

状态规则保持不放宽：

- `ready`: 写作 gate 通过，且没有明显修复问题。
- `needs_repair`: 可以写作，但存在薄弱关系、低信息角色、候选堆积、弱世界观等问题。
- `insufficient`: 缺少关键资产，不建议直接生成正式候选。
- `unknown`: 尚无足够资产判断。

## 实验入口巡检

普通主导航当前保留：

- 工作台 `/`
- 导入 `/extract`
- 编辑器 `/editor`
- 角色 `/characters`
- 世界观 `/world`
- 项目状态 `/analytics`
- 设置 `/settings`

保留但不作为正式主入口的实验/兼容入口：

- `/ai-planning`: 仍可直接访问，页面自身标为旧版规划台/实验入口，并提供返回工作台。
- `/dashboard`: 兼容重定向到 `/analytics`。
- `/novel-editor`: 兼容重定向到 `/editor`。

未准备好的 debug/smoke/test 页面不应出现在普通导航中。

## 最小内测流程

1. 启动后端并确认 `/health` 正常。
2. 如果启用认证，登录管理员账号。
3. 打开工作台，创建或选择项目。
4. 在 `/extract` 上传长篇文本并等待导入任务完成。
5. 查看提取诊断与项目质量总览。
6. 若质量为 `needs_repair`，优先处理关系、角色或世界观修复。
7. 在工作台生成 800-1500 字序章候选，只保存为 AI 草稿/候选。
8. 打开 `/editor`，确认候选章节可定位、可筛选、可归档或转正式。

## 常见问题

- 配置缺失：设置页或启动日志会提示缺少管理员密码、session secret、AI key 或 content_db。
- Provider 超时：聊天流式接口会发送心跳，避免前端误判空白，但仍应记录 provider 失败原因。
- 提取完成但质量仍需修复：这是正常语义，说明资产已入库但写作质量 gate 更严格。
- 数据缺失：检查 `NOVELFORGE_DATA_DIR`、`CONTENT_DATABASE_PATH`、`DATABASE_PATH` 和 `FILE_STORAGE_DIR` 是否指向持久目录。

## Goal 20 复验记录

Date: 2026-05-29

输入来源：

- 使用本地未提交长篇样本。
- 原文和脚本复制出的临时输入不进入 git。
- 本文档只记录指标和诊断，不记录原文。

Provider：

- NewAPI-compatible endpoint 已切换到 `https://fast-newapi.sync-api.xyz:8848/v1`。
- `/v1/models` 通过 Node 客户端返回 200。
- 真实密钥只保存在本地环境，不写入文档或仓库。

长篇导入复验：

- session id: `smoke_import_20260529_144209`
- chapters: 10
- characters: 15
- relationships: 15
- timeline: 30
- world: 1
- analysis_status: `low_quality`
- quality issues:
  - `关系端点无法映射到角色池：帝`
- failed_chapters: 0
- unresolved relationship endpoints: 1
- timeline mismatch events: 0
- chapter detection result:
  - 章节检测成功，保存 10 个章节/片段。
  - 其中若干长章被拆成 `片段 01 / 片段 02`。
- mojibake:
  - UTF-8 解析结果和页面展示未见明显中文乱码。
  - PowerShell 默认编码读取 JSON 时会显示乱码，使用 UTF-8/Node 读取正常。
- timeout/failure:
  - 导入脚本命令级成功。
  - 未出现章节失败或 timeline 标题/描述错配。
  - 质量 gate 正确把未闭合关系端点降为 `low_quality`，没有误报 `completed`。

写作复验：

- 在长篇复验项目上请求 800-1500 字序章候选。
- Provider 返回成功。
- 对话中产生 save_asset 候选章节保存建议。
- 本轮只保留为候选保存建议 / AI 草稿路径验证，不转正式章节。

截图：

- `project-docs/screenshots/goal20/settings-auth-config-warning.png`
- `project-docs/screenshots/goal20/dashboard-quality-explained.png`
- `project-docs/screenshots/goal20/long-project-quality.png`
- `project-docs/screenshots/goal20/long-import-diagnostics.png`
- `project-docs/screenshots/goal20/extract-completed-next-step.png`
- `project-docs/screenshots/goal20/optional-long-save-card.png`
