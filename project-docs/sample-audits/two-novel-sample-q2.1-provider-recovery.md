# Phase Q.2.1 Provider Recovery Probe & Fallback Readiness Report

> 生成日期：2026-06-22 21:09:28
> 分支：codex/novelforge-next
> 审计类型：Provider Recovery Probe（仅诊断，不执行 Q.2 Retry）

## 配置就绪性检查

| 项目 | 状态 |
|------|------|
| API Key | yes |
| Base URL | yes |
| Models | yes |
| Fast Model | deepseek-ai/deepseek-v4-flash |
| Pro Model | deepseek-ai/deepseek-v4-pro |
| Default Model | deepseek-ai/deepseek-v4-pro |

## 合成探测结果

| 路由 | 模型 | 超时设置(ms) | 开始时间 | 结束时间 | 延迟(ms) | 成功 | 错误类型 | HTTP 状态 | 响应解析 | 健康记录 |
|------|------|-------------|----------|----------|----------|------|----------|-----------|----------|----------|
| fast/flash | deepseek-ai/deepseek-v4-flash | 25000 | 2026-06-22T21:09:26.934329 | 2026-06-22T21:09:27.890397 | 956 | False | http_503 | 503 | False | True |
| pro | deepseek-ai/deepseek-v4-pro | 25000 | 2026-06-22T21:09:27.890397 | 2026-06-22T21:09:28.685330 | 794 | False | http_503 | 503 | False | True |

## Provider 状态判定

**状态：PROVIDER_STILL_UNAVAILABLE**

- 所有路由均 gateway_timeout / network_timeout / connection_error。
- Q.2 Retry 不允许。建议先修复 NewAPI gateway 或启用 fallback provider。

## Q.2 Retry 建议

- **不允许执行 Q.2 Retry**。当前 Provider（fast-newapi.sync-api.xyz:8848）返回 HTTP 503 Service Unavailable，所有探测路由均失败。
- 建议操作：
  1. 检查 NewAPI gateway 状态（fast-newapi.sync-api.xyz:8848）。
  2. **更换 provider base URL 到备用 gateway https://newapi.sync-api.xyz/v1（更稳定）**。
  3. 降低并发到 1 作为 preflight 检查。
  4. 在 UI 中增加 provider unavailable 提示。
  5. 考虑配置多 provider fallback 路由（模型 router 已支持候选池）。

## Fallback 建议（如 Provider 持续不可用）

| 策略 | 优先级 | 说明 |
|------|--------|------|
| 启用备用 Provider | high | 修改 .env 的 OPENAI_BASE_URL 到 https://newapi.sync-api.xyz/v1（比当前端点更稳定） |
| 降低并发 | medium | 将所有提取并发降为 1，减少 gateway 压力 |
| 仅探测健康门控 | medium | 在 extraction pipeline 前增加 provider 预检，失败即中止 |
| UI 不可用提示 | low | 在 frontend 增加 provider 状态 banner，避免用户误操作 |
| 增加模型候选池 | low | 在 EXTRACTOR_*_MODELS 中配置更多备选模型 |

## 与 Q.2 对比

| 指标 | Q.2 (2026-06-22) | Q.2.1 (2026-06-22) |
|------|-------------------|-------------------|
| fast/flash 状态 | gateway_timeout | http_503 (956ms) |
| pro 状态 | gateway_timeout | http_503 (794ms) |
| 错误演进 | 72,824ms 超时 | 956ms 快速 503 |
| 结论 | gateway 完全无响应 | gateway 响应 503，服务仍在但不可用 |

观察到 503 错误比 Q.2 的 gateway_timeout 有改善：响应时间从 72,824ms 降至 956ms，说明 gateway 本身可达，但后端服务处于不可用状态。

## 安全核查

| 项目 | 状态 |
|------|------|
| 小说文本发送 | no |
| 样本提交 | no |
| 原始 provider body 暴露 | no |
| API Key 暴露 | no |
| Q.2 Retry 执行 | no |

## 关联报告

- Q.2 原始审计：project-docs/sample-audits/two-novel-sample-q2.md
- 进度跟踪：project-docs/PROGRESS.md

---
*本报告由 Q.2.1 Provider Recovery Probe 自动生成，仅用于诊断目的。*
