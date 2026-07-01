# NovelForge 最小部署指南

> D.1 交付物。覆盖本地开发和单机内部部署场景。
> 不是生产加固指南。安全检查清单中标注了已覆盖和未覆盖的项目。

---

## 适用范围

本指南覆盖：

- 本地开发启动（Windows + Linux）
- 单机内部部署
- 环境变量配置
- SiliconFlow + DeepSeek-V4-Flash Provider 配置
- 存储与备份基础
- 非公开部署安全检查清单

本指南**不**覆盖：

- 多实例 / 负载均衡部署
- HTTPS 终止 / 反向代理配置（需在前端使用 nginx/caddy）
- CI/CD 流水线配置
- 面向公众的生产部署加固
- 容器编排

---

## 环境要求

| 组件 | 最低版本 |
|------|----------|
| Python | >= 3.10 |
| Node.js | >= 18（推荐 LTS） |
| npm | >= 9 |
| 操作系统 | Windows 10+ 或 Linux（在 Windows 上测试） |
| 内存 | >= 4 GB |
| 磁盘 | >= 1 GB 可用空间（数据 + SQLite） |

---

## 环境变量

模板文件为 `novelforge-core/.env.example`。复制到 `novelforge-core/.env` 后填入实际值。

```powershell
cd novelforge-core
copy .env.example .env
# 编辑 .env 填写 API key 和其他配置
```

### 关键变量

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `OPENAI_API_KEY` | Provider API 密钥 | `replace-with-provider-api-key` |
| `OPENAI_BASE_URL` | Provider 端点 | `https://api.siliconflow.cn/v1` |
| `OPENAI_MODEL` | 默认模型 | `deepseek-ai/DeepSeek-V4-Flash` |
| `NOVELFORGE_FAST_MODEL` | "快速"模式模型 | `deepseek-ai/DeepSeek-V4-Flash` |
| `NOVELFORGE_PRO_MODEL` | "专业"模式模型 | `deepseek-ai/DeepSeek-V4-Flash` |
| `NOVELFORGE_IMPORT_CHAPTER_MAX_CHARS` | 章节拆分大小 | `12000` |
| `NOVELFORGE_DATA_DIR` | 数据目录路径 | `./data` |
| `STORAGE_TYPE` | 存储后端 | `content_db` |

### 端口

| 服务 | 端口 | 备注 |
|------|------|------|
| 后端 API | 8001 | uvicorn / FastAPI |
| 前端开发 | 3000 | Next.js 开发服务器 |
| SillyTavern | 8000 | 可选，集成时使用 |

前端 `next.config.js` 将 `/api/*` 请求代理到 `127.0.0.1:8001`。SillyTavern 路由代理到 `localhost:8000`。

---

## 后端启动

### Windows（本地开发）

```powershell
cd novelforge-core
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
copy .env.example .env
# 编辑 .env 填写 API key

# 启动后端（端口 8001）
uvicorn novelforge.api.main:app --reload --host 0.0.0.0 --port 8001
```

### Linux / 服务器

```bash
cd novelforge-core
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
# 编辑 .env 填写 API key

# 启动后端（端口 8001）
uvicorn novelforge.api.main:app --host 0.0.0.0 --port 8001
```

非开发环境请移除 `--reload`。后台部署建议使用 systemd、supervisord 或类似进程管理器。

### 验证后端是否运行

```powershell
# 健康检查
curl http://localhost:8001/health

# Swagger 文档
# 在浏览器中打开 http://localhost:8001/docs
```

---

## 前端启动

```powershell
cd novelforge-core/frontend
npm install

# 开发模式
npm run dev
# 前端地址：http://localhost:3000
```

前端环境变量（`.env.local`）：

```env
NEXT_PUBLIC_NOVELFORGE_URL=http://localhost:8001
```

前端**不需要** API key。公开部署模式下，浏览器通过 HttpOnly 登录 cookie 发送请求；API key 由后端服务端持有。

---

## Provider 配置

### SiliconFlow + DeepSeek-V4-Flash（默认）

1. 在 [SiliconFlow](https://siliconflow.cn) 注册并获取 API key。
2. 在 `.env` 中设置：

```env
OPENAI_API_KEY=your-siliconflow-api-key
OPENAI_BASE_URL=https://api.siliconflow.cn/v1
OPENAI_MODEL=deepseek-ai/DeepSeek-V4-Flash
```

### Provider 预检

导入小说前，运行合成 provider 探测脚本验证连通性：

```powershell
cd novelforge-core
python scripts/probe_provider_readiness.py
```

该脚本向配置的 provider 发送合成 `ping`（`max_tokens=10`）。**不会**发送小说文本、样本内容或任何用户数据。探测检查：

- Provider 端点是否可达
- API key 是否有效
- 模型是否可用

**探测脚本安全规则：**
- 不记录或打印 API key
- 不记录 provider 原始响应体
- 不记录 provider 请求 ID
- 不发送样本正文（仅合成 `ping`）

### 常见错误

| 错误 | 原因 | 修复方法 |
|------|------|----------|
| `provider_unavailable` | Provider 端点不可用 | 检查 `OPENAI_BASE_URL`，稍后重试 |
| `key invalid` / HTTP 401 | API key 错误 | 检查 `OPENAI_API_KEY` |
| HTTP 503 | Provider 服务暂时不可用 | 等待后重试 |
| 超时 | 网络或 provider 响应慢 | 检查网络，增大 `NOVELFORGE_MODEL_PROBE_TIMEOUT` |
| JSON/schema 无效 | 模型返回格式错误 | 启用 schema repair（`ENABLE_SCHEMA_REPAIR=true`） |

---

## 存储与备份

NovelForge 使用 SQLite 进行内容存储（当 `STORAGE_TYPE=content_db` 时）。

### 默认数据路径

| 文件 | 路径 |
|------|------|
| 内容数据库 | `./data/novelforge_content.db` |
| 元数据数据库 | `./data/novelforge.db` |
| 文件存储 | `./data/file_storage/` |

### 备份

SQLite 数据库可通过复制文件备份：

```powershell
# 先停止后端，或使用 SQLite 备份 API
copy data\novelforge_content.db backups\novelforge_content_$(Get-Date -Format yyyyMMdd).db
```

### 重置

删除 `data/` 目录可重新开始。这会销毁所有已导入的小说、提取资产和对话历史。

---

## 安全检查清单

### 本地开发（默认）

- [x] `NOVELFORGE_PUBLIC_DEPLOYMENT=false`（默认值）
- [x] 默认禁用认证
- [x] API key 保存在本地 `.env`（已 gitignore）
- [x] 允许运行时 OpenAI key 覆盖（用于测试）

### 内部 / 非公开部署

- [ ] 设置 `NOVELFORGE_ADMIN_PASSWORD` 为强密码
- [ ] 设置 `NOVELFORGE_SESSION_SECRET` 为长随机字符串
- [ ] 设置 `FRONTEND_ORIGIN` 为实际前端 URL
- [ ] 设置 `NOVELFORGE_ALLOW_RUNTIME_OPENAI_OVERRIDES=false`
- [ ] 确认 `.env` 未提交到版本控制
- [ ] 确认 `data/` 目录权限（仅服务用户可读）

### 公开部署（额外要求）

- [ ] 设置 `NOVELFORGE_PUBLIC_DEPLOYMENT=true`
- [ ] 上述内部部署所有项目
- [ ] 通过反向代理（nginx/caddy）进行 HTTPS 终止
- [ ] 强 `NOVELFORGE_ADMIN_PASSWORD`
- [ ] 确认 `FRONTEND_ORIGIN` 与 HTTPS 前端域名匹配

### Cookie 行为

NovelForge 使用 HttpOnly 会话 cookie：
- `HttpOnly`：JavaScript 不可访问
- `secure=true`：仅当 `NOVELFORGE_PUBLIC_DEPLOYMENT=true` 时生效
- `SameSite=Lax`：默认行为

---

## MVP 冒烟检查清单

启动后验证：

1. **后端健康**：`curl http://localhost:8001/health` 返回 OK
2. **Swagger 文档**：`http://localhost:8001/docs` 可加载
3. **前端**：`http://localhost:3000` 可加载
4. **Provider 探测**：`python scripts/probe_provider_readiness.py` 返回成功
5. **导入冒烟**：通过 Extract 页面上传一个小文本文件，验证章节已创建

---

## 已知限制

- **仅支持单机部署**：不支持多实例或水平扩展
- **SQLite**：不适合高并发写入场景；单用户 / 小团队使用足够
- **无内置 HTTPS**：需要外部反向代理提供 TLS
- **公开端点无限流**：公开部署需要外部限流
- **依赖 Provider**：提取质量和可用性取决于配置的 AI provider
- **章节拆分**：没有稳定源章节边界的长篇小说按字符数拆分（默认 12,000 字符）
