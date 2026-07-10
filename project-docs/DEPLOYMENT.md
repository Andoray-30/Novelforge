# NovelForge 部署指南

> D.1 是本指南的历史基础；D.2 增加公开部署启动 guardrails 和反向代理静态模板。
> 本指南不是生产认证，尚未证明真实域名、TLS、反向代理或公开网络 E2E。

---

## 适用范围

本指南覆盖：

- 本地开发启动（Windows + Linux）
- 单机内部部署
- 环境变量配置
- SiliconFlow + DeepSeek-V4-Flash Provider 配置
- 存储与备份基础
- 非公开部署安全检查清单
- D.2 公开模式启动 guardrails
- Caddy / Nginx 静态占位模板

本指南**不**覆盖：

- 多实例 / 负载均衡部署
- 真实域名、证书和反向代理 E2E
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

## 公开部署 Guardrails

当 `NOVELFORGE_PUBLIC_DEPLOYMENT=true` 时，后端在启动时会强制执行以下 guardrails。任何一项检查失败都会导致应用拒绝启动：

| Guardrail | 规则 | 失败时行为 |
|-----------|------|----------|
| 认证开关 | `NOVELFORGE_AUTH_REQUIRED=true` | 启动失败，错误仅指出配置名 |
| 管理员密码强度 | 非空、非 placeholder、长度 >= 12，且包含大小写字母、数字和特殊字符 | 启动失败，错误提示策略名（不含实际密码） |
| Session Secret 强度 | 非空、非 placeholder（如 `replace-with-a-long-random-string`）、长度 >= 32 | 启动失败，错误提示策略名（不含实际 secret） |
| Provider Key | 必须已配置 | 启动失败，错误提示 `OPENAI_API_KEY` |
| 前端 Origin | 仅接受绝对 HTTPS Origin；拒绝 wildcard、userinfo、local/loopback/`.local`/placeholder host、附加 path/query/fragment 和畸形 URL | 启动失败，错误不回显 Origin 值 |
| CORS | 公开模式仅允许已验证的 `FRONTEND_ORIGIN`；本地模式保留 localhost 开发来源 | 公开模式不注入 localhost 来源 |
| 运行时 OpenAI 覆盖 | `NOVELFORGE_ALLOW_RUNTIME_OPENAI_OVERRIDES` 必须为 `False` | 启动失败，错误提示覆盖策略 |
| Mock 工具调用 | `NOVELFORGE_MOCK_TOOL_CALLS` 必须为 `False` | 启动失败，错误提示 mock 策略 |
| Debug | `NOVELFORGE_DEBUG` 必须为 `False` | 启动失败，错误提示 debug 策略 |
| 内容数据库 | `STORAGE_TYPE` 必须为 `content_db`，`USE_CONTENT_DATABASE` 必须为 `True` | 启动失败，错误提示存储策略 |
| 错误消息安全 | 配置错误仅包含变量名 / 策略说明；通用异常及公开模式 HTTP 5xx 使用固定安全消息 | 不回显异常文本、密码、Session Secret 或 API Key 值 |

> **验证证据（2026-07-10）**：focused review 修复后，`tests/api/test_auth.py` 实际收集并通过 52 项；核心服务定向回归实际通过 94 项。真实公开部署 E2E 未执行。

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
- [ ] 设置 `NOVELFORGE_AUTH_REQUIRED=true`
- [ ] 上述内部部署所有项目
- [ ] 通过反向代理（nginx/caddy）进行 HTTPS 终止
- [ ] 强 `NOVELFORGE_ADMIN_PASSWORD`（非 placeholder、长度 >= 12，包含大小写字母、数字和特殊字符）
- [ ] 强 `NOVELFORGE_SESSION_SECRET`（非 placeholder、长度 >= 32）
- [ ] 确认 `FRONTEND_ORIGIN` 为无 userinfo/path/query/fragment 的公开 HTTPS Origin
- [ ] 设置 `NOVELFORGE_ALLOW_RUNTIME_OPENAI_OVERRIDES=false`
- [ ] 设置 `NOVELFORGE_MOCK_TOOL_CALLS=false`（公开部署禁止 mock）
- [ ] 设置 `NOVELFORGE_DEBUG=false`
- [ ] 确认 `STORAGE_TYPE=content_db` 且 `USE_CONTENT_DATABASE=true`
- [ ] 确认 `.env` 未提交到版本控制

> **Guardrails 说明**：当 `NOVELFORGE_PUBLIC_DEPLOYMENT=true` 时，后端启动会自动检查上述配置。若检查失败，应用将拒绝启动并返回包含变量名 / 策略说明的错误信息（不会泄漏实际密码或 secret 值）。

### Cookie 行为

NovelForge 使用 HttpOnly 会话 cookie：
- `HttpOnly`：JavaScript 不可访问
- `secure=true`：仅当 `NOVELFORGE_PUBLIC_DEPLOYMENT=true` 时生效
- `SameSite=Lax`：默认行为

---

## 本地启动冒烟检查清单（Wave 4）

> 以下检查项必须在**前后端均启动后**执行。仅启动前端而不启动后端会导致 API 调用失败、数据不返回、测试结果不可靠。

### 1. 后端启动验证

```powershell
cd novelforge-core
.\.venv\Scripts\Activate.ps1
uvicorn novelforge.api.main:app --reload --port 8001
```

- [ ] 后端启动无异常，无 guardrails 报错
- [ ] `curl http://localhost:8001/health` 返回 OK
- [ ] `http://localhost:8001/docs` 可加载

### 2. 前端启动验证

```powershell
cd novelforge-core/frontend
npm run dev
```

- [ ] 前端启动无编译错误
- [ ] `http://localhost:3000` 可加载
- [ ] 前端可正常代理 API 请求到 `127.0.0.1:8001`

### 3. Provider 凭证预检

在尝试真实提取之前，先运行 provider 探测脚本验证连通性和凭证有效性：

```powershell
cd novelforge-core
python scripts/probe_provider_readiness.py
```

- [ ] 探测脚本返回成功（`parse_ok=true`）
- [ ] 若失败，根据错误类型排查：
  - `provider_unavailable` → 检查 `OPENAI_BASE_URL`
  - `key invalid` / HTTP 401 → 检查 `OPENAI_API_KEY`
  - HTTP 503 → Provider 服务暂时不可用，稍后重试
  - 超时 → 检查网络，增大 `NOVELFORGE_MODEL_PROBE_TIMEOUT`

> **安全提示**：探测脚本仅发送合成 `ping`（`max_tokens=10`），不会发送小说正文或用户数据。脚本输出不含 API key、原始请求体、原始响应体或请求标识。

### D.2 本轮验证记录（2026-07-10）

| 检查 | 状态 | 本轮证据 |
|------|------|----------|
| public/auth guardrails | verified by test | `tests/api/test_auth.py`: 52 passed |
| 核心服务回归 | verified by test | 指定四个 services 测试文件：94 passed |
| frontend typecheck | verified by test | `npx tsc --noEmit --incremental false`：零错误 |
| frontend production build | verified by test | Next.js 15.5.12 build 成功，13/13 静态页面生成 |
| Caddy / Nginx | static review only | 本轮未发现可用二进制，未执行目标服务器语法检查 |
| 前后端同时启动 smoke | verified by local smoke | backend 8001 与 frontend 3000 同时运行；`/health`、`/openapi.json`、frontend `/` 均为 HTTP 200；停止后两端口均无残留监听 |
| 真实 TLS / proxy E2E | not verified | D.2 不进行真实公开部署 |
| Provider / Extract | not run | 本轮禁止 provider、样本和真实提取 |

Focused review 返回 0 critical、2 high、2 medium；四项均已修复并通过上述回归。该记录表示 findings resolved，不写作 independent reviewer PASS。

### 4. 导入冒烟

- [ ] 通过 Extract 页面上传一个小文本文件（如 < 1,000 字符的短文本）
- [ ] 验证章节已创建并可在 UI 中查看
- [ ] 验证无前端控制台报错或 API 500 错误

---

## 反向代理示例（Phase D.2）

公开部署时建议使用反向代理（nginx 或 Caddy）提供 HTTPS 终止和请求路由。后端自身不提供 HTTPS，也不内置 per-IP 限流；这些能力必须由外部反向代理或 WAF 提供。

| 模板 | 路径 | 关键特性 |
|------|------|----------|
| Caddy | `deploy/caddy/Caddyfile.example` | 自动 HTTPS、请求体限制、前后端路由、有效安全头、长任务 timeout；per-IP 限流需 CDN/WAF 或经审计插件 |
| Nginx | `deploy/nginx/novelforge.conf.example` | HTTP→HTTPS、有效 HTTPS block、WebSocket、请求体限制、长超时、安全头、API/login per-IP 限流 |

> ⚠️ **警告**：以上仅为占位示例，使用时必须：
> - 将 `novelforge.example.invalid` 替换为真实域名
> - 配置真实 TLS 证书路径（或启用自动 HTTPS）
> - 根据实际环境调整端口、路径和超时参数
> - 验证并测试所有配置后再上线
>
> 这些模板**不能**使部署自动达到生产级安全标准，仍需结合实际情况进行加固。

模板状态为 `STATIC_REVIEW_ONLY`：未执行 Caddy/Nginx 二进制语法检查，也未执行真实 TLS/代理 E2E。

---

## 已知限制

- **仅支持单机部署**：不支持多实例或水平扩展
- **SQLite**：不适合高并发写入场景；单用户 / 小团队使用足够
- **无内置 HTTPS**：需要外部反向代理提供 TLS
- **公开端点无限流**：公开部署需要外部限流
- **依赖 Provider**：提取质量和可用性取决于配置的 AI provider
- **章节拆分**：没有稳定源章节边界的长篇小说按字符数拆分（默认 12,000 字符）
