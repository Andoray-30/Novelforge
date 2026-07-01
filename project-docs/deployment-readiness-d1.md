# Phase D.1：最小部署配置与安全加固

> 日期：2026-07-01
> 分支：`codex/novelforge-next`，D.1 基线 HEAD `eac2438`
> 决策：**PASS（文档/配置完备，主会话验证通过）**

---

## 决策

**PASS（文档/配置完备，主会话验证通过）**。D.1 交付物仅为文档和配置示例变更，未修改源代码。`.env.example` 已覆盖所有 Config 支持的环境变量，使用 placeholder-only 值，端口已对齐，SiliconFlow Flash 默认配置，Q.2.3 提取建议已包含。最小部署指南和本就绪记录已创建。

剩余生产加固项目已记录为 D.2 阻断项，有意排除在 D.1 范围之外。

**注意**：D.1 未重新运行 provider tiny probe，沿用 D.0 合成 `ping` 证据。D.1 未运行小说样本、未发送小说正文、未执行真实长篇提取。

---

## 摘要

D.1 聚焦于让 NovelForge 可以通过文档独立部署：

1. `.env.example` 全面重写：覆盖所有 Config 支持的环境变量，placeholder-only 值，SiliconFlow Flash 默认配置，Q.2.3 提取调优，安全变量文档。
2. `project-docs/DEPLOYMENT.md` 创建：最小部署指南，含 Windows/Linux 启动命令、Provider 配置、存储备份、安全检查清单、MVP 冒烟检查清单。
3. `project-docs/deployment-readiness-d1.md` 创建（本文件）。
4. `project-docs/PROGRESS.md` 更新 D.1 条目。
5. 三份 README 端口对齐：8000 → 8001，添加 DEPLOYMENT.md 链接。

---

## 变更文件

| 文件 | 变更 |
|------|------|
| `novelforge-core/.env.example` | 全面重写：SiliconFlow Flash 默认值，所有角色设置，安全变量，Q.2.3 提取调优，FRONTEND_ORIGIN 对齐 |
| `project-docs/DEPLOYMENT.md` | 新增：最小部署指南 |
| `project-docs/deployment-readiness-d1.md` | 新增：本就绪记录 |
| `project-docs/PROGRESS.md` | 顶部新增 D.1 条目 |
| `README.md` | 端口 8000 → 8001，添加 DEPLOYMENT.md 链接 |
| `novelforge-core/README.md` | 端口 8000 → 8001，添加 DEPLOYMENT.md 链接 |
| `novelforge-core/frontend/README.md` | 环境变量 `NEXT_PUBLIC_API_URL` → `NEXT_PUBLIC_NOVELFORGE_URL=http://localhost:8001`，添加 DEPLOYMENT.md 链接 |

---

## 环境变量覆盖

所有 `Config.__init__()` 环境变量已体现在 `.env.example` 中：

| 类别 | 变量 | 状态 |
|------|------|------|
| Provider | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `NOVELFORGE_FAST_MODEL`, `NOVELFORGE_PRO_MODEL`, `NOVELFORGE_DEFAULT_AI_MODE`, `OPENAI_FALLBACK_MODELS`, `OPENAI_STRICT_MODEL`, `NOVELFORGE_OPENAI_PROXY` | 已包含 |
| 模型路由 | `NOVELFORGE_ENABLE_MODEL_ROUTER`, `NOVELFORGE_ENABLE_MODEL_HEALTH_ROUTING`, `NOVELFORGE_MODEL_HEALTH_ROUTING_LIMIT`, `NOVELFORGE_MODEL_PROBE_TIMEOUT`, `NOVELFORGE_MODEL_COOLDOWN_SECONDS` | 已包含 |
| Profile 路由 | `NOVELFORGE_ENABLE_PROFILE_ROUTING`, `NOVELFORGE_PROFILE_ROUTING_MIN_CONFIDENCE`, `NOVELFORGE_PROFILE_ROUTING_SCOPE`, `NOVELFORGE_PROFILE_ROUTING_ALLOW_LOW_CONFIDENCE` | 已包含 |
| 模型候选池 | `NOVELFORGE_EXTRACTOR_FAST_MODELS`, `NOVELFORGE_EXTRACTOR_DEEP_MODELS`, `NOVELFORGE_EXTRACTOR_REPAIR_MODELS`, `NOVELFORGE_WRITER_FAST_MODELS`, `NOVELFORGE_WRITER_PRO_MODELS`, `NOVELFORGE_JUDGE_MODELS`, `NOVELFORGE_SCHEMA_REPAIR_MODELS` | 已包含 |
| 角色设置 | 全部 7 个角色 × 4 项设置（TIMEOUT, CONCURRENCY, CHUNK_SIZE, MAX_TOKENS） | 已包含 |
| Schema repair | `ENABLE_SCHEMA_REPAIR`, `ENABLE_MODEL_SCHEMA_REPAIR` | 已包含 |
| 温度 | `EXTRACTION_TEMPERATURE`, `CREATIVE_TEMPERATURE` | 已包含 |
| 并发 | `MIN_CONCURRENCY`, `MAX_CONCURRENCY`, `TARGET_SUCCESS_RATE`, `TARGET_RESPONSE_TIME` | 已包含 |
| 限流 | `RPM_LIMIT`, `TPM_LIMIT` | 已包含 |
| 重试 | `MAX_RETRIES`, `RETRY_BASE_DELAY`, `RETRY_MAX_DELAY`, `RETRY_DELAY` | 已包含 |
| 存储 | `NOVELFORGE_DATA_DIR`, `STORAGE_TYPE`, `USE_CONTENT_DATABASE`, `FILE_STORAGE_DIR`, `DATABASE_PATH`, `CONTENT_DATABASE_PATH` | 已包含 |
| 提取 | `MAX_TEXT_LENGTH`, `MAX_CHARACTERS`, `NOVELFORGE_IMPORT_CHAPTER_MAX_CHARS` | 已包含 |
| SillyTavern | `SILLYTAVERN_URL` | 已包含（已注释） |
| 安全 | `NOVELFORGE_PUBLIC_DEPLOYMENT`, `NOVELFORGE_AUTH_REQUIRED`, `NOVELFORGE_ADMIN_PASSWORD`, `NOVELFORGE_SESSION_SECRET`, `FRONTEND_ORIGIN`, `NOVELFORGE_ALLOW_RUNTIME_OPENAI_OVERRIDES` | 已包含 |
| 日志 | `LOG_LEVEL`, `LOG_FILE`, `STRUCTURED_LOGGING` | 已包含 |
| 开发/测试 | `NOVELFORGE_MOCK_TOOL_CALLS` | 已包含 |

---

## 安全检查清单

| 项目 | 状态 | 备注 |
|------|------|------|
| `.env.example` 仅含 placeholder | 已验证 | 无真实 key，无真实 secret |
| `FRONTEND_ORIGIN` 对齐 `http://localhost:3000` | 已验证 | 匹配实际前端开发端口 |
| 安全文档在 `.env.example` 中 | 已编写 | `NOVELFORGE_PUBLIC_DEPLOYMENT`, `NOVELFORGE_AUTH_REQUIRED`, `NOVELFORGE_ADMIN_PASSWORD`, `NOVELFORGE_SESSION_SECRET`, `NOVELFORGE_ALLOW_RUNTIME_OPENAI_OVERRIDES` |
| Cookie 行为已文档化 | 已编写 | HttpOnly，公开时启用 secure，SameSite=Lax |
| 部署指南含安全检查清单 | 已编写 | 本地 / 内部 / 公开三级 |
| 探测脚本安全规则已文档化 | 已编写 | 不记录 key、不记录响应体、不发送样本正文 |

---

## 验证

| 检查项 | 方法 | 状态 |
|--------|------|------|
| `.env.example` 无真实 key | 手动检查 + 安全扫描 | 已通过 |
| 所有 Config 环境变量在 `.env.example` 中 | 与 `config.py` 交叉比对 | 已通过 |
| 后端端口 8001 在所有文档中 | 阅读 / diff 复核 | 已通过 |
| 前端端口 3000 在所有文档中 | 阅读 / diff 复核 | 已通过 |
| `FRONTEND_ORIGIN=http://localhost:3000` | `.env.example` | 已通过 |
| DEPLOYMENT.md 结构完整 | 手动审查 | 已通过 |
| deployment-readiness-d1.md 结构完整 | 手动审查 | 已通过 |
| PROGRESS.md D.1 条目已添加 | 手动审查 | 已通过 |
| 后端定向 pytest (94/94) | `.\\.venv\\Scripts\\python.exe -m pytest -q tests/services/test_model_router.py tests/services/test_model_health.py tests/services/test_ai_scheduler_import.py tests/services/test_extraction_service.py` | 已通过（94 passed，1 个 `.pytest_cache` 权限 warning） |
| 前端类型检查 | `npx tsc --noEmit --incremental false` | 已通过 |
| 前端生产构建 | `npm run build` | 已通过 |
| Git diff whitespace | `$env:GIT_MASTER='1'; git diff --check` | 已通过 |
| Provider tiny probe（SiliconFlow Flash） | D.0 证据（HTTP 200, parse_ok=true） | 已通过（D.0，D.1 未重跑） |

**D.1 未运行的验证：**
- `probe_provider_readiness.py` 未重跑；引用 D.0 合成 `ping` 证据。
- `npm test -- --run` 未重跑；D.1 仅文档/配置示例变更，本轮已运行 `tsc` 与 production build。
- 未运行 Sample A / Sample B，未发送小说正文，未执行真实长篇提取。

---

## 剩余阻断项（移至 D.2）

1. **HTTPS 终止**：未内置；公开部署需要外部反向代理。
2. **公开端点限流**：API 路由无 per-IP 限流；需要外部限流器。
3. **多实例部署**：SQLite 为单写模式；不支持水平扩展。
4. **Sample A 全量提取冒烟**：D.0.1 修复后长篇提取质量未验证。
5. **管理员密码强度强制**：`NOVELFORGE_ADMIN_PASSWORD` 无最低复杂度检查。
6. **Session secret 轮换**：`NOVELFORGE_SESSION_SECRET` 无内置轮换机制。
7. **日志脱敏审计**：结构化日志字段未审计是否存在意外 secret/PII 泄漏。

---

## 下一步

**D.2：部署加固与生产就绪**

建议范围：
- 反向代理配置模板（nginx/caddy）
- 认证和提取端点 per-IP 限流
- 管理员密码复杂度强制
- Session secret 轮换策略
- 日志字段脱敏审计
- Sample A 全量提取冒烟（需用户授权）

---

## 安全边界

- 源代码：**未修改**
- 测试：**未修改**
- `.env`（本地）：**未修改**
- 样本：**未引用或提交**
- API key：**未暴露**
- Provider 原始响应体：**未暴露**
- Git：**最终通过显式文件列表 stage / commit / push；未 reset；样本不提交**
