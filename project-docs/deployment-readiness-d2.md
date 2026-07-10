# Phase D.2：Public Deployment Guardrails Closure

> 日期：2026-07-10
> 分支：`codex/novelforge-next`
> 决策：**PASS**

## 决策依据

D.2 的代码、auth 测试、核心定向回归、前端静态验证、无 provider local smoke 和 focused review findings closure 已完成。Caddy/Nginx 仍仅完成静态审查，真实 TLS/代理 E2E 不在本轮完成声明中；因此本决策不代表 production certified。

D.0 与 D.1 是历史前置阶段，已由本轮工作继承，不再是当前 next step。

## 实现状态

| 能力 | 状态 | 证据 |
|------|------|------|
| 公开模式强制认证 | implemented / verified by test | `public_deployment=true` 且 `auth_required=false` 时启动 guardrail 阻断 |
| 管理员密码策略 | implemented / verified by test | 非空、非 placeholder、长度至少 12，包含大小写、数字、特殊字符 |
| Session Secret 策略 | implemented / verified by test | 非空、非 placeholder、长度至少 32 |
| override/mock/debug 阻断 | implemented / verified by test | 公开模式分别阻断不安全开关 |
| Public Origin | implemented / verified by test | 仅接受无 userinfo/path/query/fragment 的公开绝对 HTTPS Origin；拒绝 wildcard、local/loopback/`.local`/placeholder 和畸形 URL |
| CORS | implemented / verified by test | 公开模式仅返回配置的生产 Origin；本地模式保留 localhost 开发来源 |
| lifespan 集成 | implemented / verified by test | `TestClient` lifespan 实际触发 guardrail 并阻断无认证公开配置 |
| 用户可见 5xx 脱敏 | implemented / verified by test | 通用异常与公开模式 HTTP 5xx 不回显 supplied exception/secret 文本 |
| Caddy 模板 | implemented / static review only | 公开占位域名、前后端路由、请求体限制、安全头、长任务 timeout；明确 per-IP 限流需 CDN/WAF/经审计插件 |
| Nginx 模板 | implemented / static review only | HTTP→HTTPS、有效 HTTPS block、占位证书、WebSocket、请求体限制、长 timeout、安全头、API/login 限流 |
| local launch smoke | verified by local smoke | backend 8001 与 frontend 3000 同时运行；三个检查端点均为 HTTP 200；停止后两端口无残留监听 |
| 真实 TLS / proxy E2E | not verified | 未使用真实域名、IP、证书或公开服务器 |

## 本轮实际验证

| 命令 | 结果 | 证据等级 |
|------|------|----------|
| `.\.venv\Scripts\python.exe -m pytest -q tests/api/test_auth.py` | focused review 修复后 **52 passed**；1 个现有 `.pytest_cache` ACL 写入警告 | verified by test |
| `.\.venv\Scripts\python.exe -m pytest -q tests/services/test_model_router.py tests/services/test_model_health.py tests/services/test_ai_scheduler_import.py tests/services/test_extraction_service.py` | **94 passed**；1 个相同缓存警告 | verified by test |
| `npx tsc --noEmit --incremental false` | 退出码 0，零错误 | verified by test |
| `npm run build` | Next.js 15.5.12 编译成功，13/13 静态页面生成 | verified by test |
| `git diff --check` | 退出码 0 | verified by static check |
| backend 8001 + frontend 3000 smoke | 同时运行；backend `/health` 200、`/openapi.json` 200、frontend `/` 200；停止后 3000/8001 无残留监听 | verified by local smoke |

## Focused review

- 初始实质结果：0 critical、2 high、2 medium。
- 2 high：Origin canonicalization/CORS exact-match；placeholder 变体拦截。
- 2 medium：WHATWG/非规范 loopback；Nginx redirect 使用客户端可控 `$host`。
- 处理结果：四项全部 resolved，并通过 auth 52 项、核心回归 94 项和 `git diff --check`。
- 证据表述：有实质 focused review 且 findings resolved；不写作 independent reviewer PASS。

Windows ACL 警告只涉及 pytest 无法写入既有 `.pytest_cache`；未使用管理员权限，也未尝试反复强删。

## 错误摘要安全边界

本轮已覆盖的七文件范围内：

- public startup/config validation 只返回配置名或固定策略说明，不回显 supplied password、session secret、API key 或 Origin。
- general exception handler 固定返回安全消息。
- public deployment 下 HTTP 5xx handler 固定返回安全消息。

明确的 post-D.2 focused issue：provider/model routing 模块可能把上游非 JSON 响应或异常文本写入内部错误摘要。相关模块不在本轮允许修改文件中，因此本报告不声称该内部风险已修复。后续修复应使用固定错误类型或脱敏摘要，禁止存储 provider 原始 response body、Authorization header、API key、request id 或用户正文。

## 代理静态审查

### Caddy

- placeholder domain：有（保留 `.invalid` 域名）
- frontend `127.0.0.1:3000`：有
- backend `/api/*`、`/health`、`/openapi.json` → `127.0.0.1:8001`：有
- body limit / security headers / long-task timeout：有
- 无声明第三方插件依赖：是
- per-IP 限流边界：明确要求上游 CDN/WAF、经审计插件或 Nginx
- 状态：`STATIC_REVIEW_ONLY`

### Nginx

- placeholder domain / certificate paths：有
- HTTP→HTTPS redirect / 有效 HTTPS server block：有
- frontend/backend proxy：有
- WebSocket upgrade headers：有
- `client_max_body_size` / long-task timeout / security headers：有
- `limit_req_zone` / API 与 login endpoint limit：有
- 状态：`STATIC_REVIEW_ONLY`

本轮没有可用的目标服务器 Caddy/Nginx 二进制验证证据，也没有执行真实证书、TLS 或代理 E2E。

## 风险与范围外事项

1. Caddy/Nginx 仅静态审查，目标部署环境仍需语法检查和真实代理/TLS 验证。
2. provider/model routing 内部错误摘要风险为明确 post-D.2 issue。
3. SQLite 单写和公开部署容量规划不在 D.2 范围内。

## 安全记录

- provider called：no
- Sample A/B executed：no
- user novel text read or sent：no
- `.env` modified：no
- API key / admin password / session secret exposed：no
- provider raw body / request id exposed：no
- real domain / IP / certificate committed：no
- stage / commit / push performed：no

## Next Goal

**Local MVP Synthetic Import Acceptance**
