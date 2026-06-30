# Phase D.0 Deployment Readiness Audit

> 生成日期：2026-06-30
> 分支：`codex/novelforge-next`
> HEAD：`fd4a5ce docs: add Sample A SiliconFlow extraction audit`
> 审计类型：文档审计，无源码修改、无 UI 实现、无 Sample A/B 执行；仅含 1 次合成 tiny provider probe（`ping` + `max_tokens=10`，无样本正文）

---

## Decision

**CONDITIONAL / PARTIAL**

Provider 已恢复（SiliconFlow `deepseek-ai/DeepSeek-V4-Flash`，tiny probe HTTP 200），Sample B 已完成完整提取（PASS），前端验证全通过，但后端定向测试存在 1 个失败用例，且 Sample A 尚未在凭证恢复后重跑。当前状态不具备完整上线条件，需要 D.0.1 修复确认和 D.1 重跑验证后才能进入部署。

---

## Executive Summary

D.0 是纯审计/文档阶段，目的是基于已有证据做出最小 MVP 部署决策。

关键发现：

1. **Provider 已恢复**：D.0 阶段 tiny probe 向 SiliconFlow 发送合成 `ping`（`max_tokens=10`，无样本正文），HTTP 200，延迟 11721ms，`parse_ok=true`。本地进程级凭证注入已恢复，支持本次 D.0 tiny probe；部署环境凭证注入仍需 D.1/D.2 验证。
2. **Sample B 完整提取通过**：Q.2.3 验证中，SiliconFlow DeepSeek-V4-Flash 完成 8/8 章节，0 失败，产出 15 个角色、22 条关系、32 个时间线事件、1 个世界设定，耗时 884.9s，未使用 fallback 或 pro 模型。
3. **Sample A 未执行**：Q.2.4 因 HTTP 401 凭证预检失败，Sample A 未发送到 provider，scheduler 未启动。凭证恢复后尚未重跑。
4. **前端验证全通过**：`npm test -- --run` 263 tests / 36 files PASS，`npx tsc --noEmit` PASS，`npm run build` PASS（Next.js 15.5.12，13 个静态页面）。
5. **后端定向测试存在 1 个失败**：`test_import_chapter_split_size_uses_extractor_fast_role_settings` 期望 `_resolve_import_chapter_max_chars()` 返回 `1200`，实际返回 `12000`。这是一个配置/代码不一致问题，需在 D.0.1 中解决。
6. **安全边界完整**：整个审计周期内未泄露 `.env`、API key、供应商原始响应内容、请求标识或样本正文。

---

## Current Evidence

### 证据来源

| 来源 | 阶段 | 结论 |
|------|------|------|
| Sample B 完整提取 | Q.2.3 | PASS，8/8 章节，结构化输出完整 |
| Sample A 预检 | Q.2.4 | PRECHECK_FAILED（HTTP 401），未执行 |
| Provider tiny probe | D.0 | PROVIDER_RECOVERED，HTTP 200，latency 11721ms |
| 前端验证 | D.0 | 全通过（test / tsc / build） |
| 后端定向测试 | D.0 | 93 passed，1 failed |

### Sample B 提取指标（Q.2.3）

| 指标 | 值 |
|------|-----|
| 模型 | `deepseek-ai/DeepSeek-V4-Flash` |
| 章节总数 | 8 |
| 成功章节 | 8 |
| 失败章节 | 0 |
| 角色数 | 15 |
| 关系数 | 22 |
| 时间线事件数 | 32 |
| 世界设定数 | 1 |
| 质量问题数 | 0 |
| 总耗时 | 884.9s |
| fallback 使用 | false |
| pro 模型使用 | false |

### Provider Tiny Probe 指标（D.0）

| 指标 | 值 |
|------|-----|
| 模型 | `deepseek-ai/DeepSeek-V4-Flash` |
| 输入 | 合成 `ping`，`max_tokens=10` |
| HTTP 状态 | 200 |
| 延迟 | 11721ms |
| parse_ok | true |
| 样本正文发送 | false |

### 前端验证（D.0）

| 命令 | 结果 |
|------|------|
| `npm test -- --run` | 36 files / 263 tests PASS |
| `npx tsc --noEmit --incremental false` | PASS |
| `npm run build` | PASS（Next.js 15.5.12，13 静态页面） |

### 后端定向测试（D.0）

| 命令 | 结果 |
|------|------|
| `pytest tests/services/test_model_router.py tests/services/test_model_health.py tests/services/test_ai_scheduler_import.py tests/services/test_extraction_service.py` | 93 passed，1 failed，2 ACL warnings |

失败详情：`test_import_chapter_split_size_uses_extractor_fast_role_settings` 期望 `_resolve_import_chapter_max_chars()` 返回 `1200`，实际返回 `12000`。

---

## Readiness Matrix

| 维度 | 状态 | 说明 |
|------|------|------|
| Provider 连通性 | **PASS** | tiny probe HTTP 200，SiliconFlow DeepSeek-V4-Flash 可用 |
| Sample B 提取质量 | **PASS** | 8/8 章节，0 失败，15 角色 / 22 关系 / 32 时间线 / 1 世界设定 |
| Sample A 提取质量 | **BLOCKED** | Q.2.4 因 HTTP 401 未执行，凭证恢复后尚未重跑 |
| 前端测试 | **PASS** | 263 tests / 36 files，tsc，build 均通过 |
| 前端类型检查 | **PASS** | `npx tsc --noEmit --incremental false` 零错误 |
| 前端生产构建 | **PASS** | `npm run build` 编译成功 |
| 后端定向测试 | **BLOCKED** | 93 passed / 1 failed（split config 预期值不一致） |
| Provider Health Gate | **PASS** | R.0 实现已验证，probe_passed 属性和 health gate 逻辑测试通过 |
| 凭证管理 | **CONDITIONAL** | 本地 `.env` 已更新，gitignored，但未验证其他部署环境的凭证注入 |
| 部署配置加固 | **NOT_ASSESSED** | admin password / session secret / public deployment flag 未审计 |
| 服务端筛选 | **NOT_ASSESSED** | 未实现 |
| 资产版本回滚 | **NOT_ASSESSED** | 未实现 |
| 性能审计 | **NOT_ASSESSED** | 8-10 system split 章节的 UI 渲染性能未验证 |
| System split 元数据暴露 | **NOT_ASSESSED** | Q.2 发现结构化元数据未通过 Content API 暴露，未跟进 |

---

## Provider Deployment Recommendation

**推荐 SiliconFlow `deepseek-ai/DeepSeek-V4-Flash` 作为当前临时提取 provider。**

理由：
- Sample B 完整提取通过（PASS），产出质量可用
- Provider tiny probe 恢复（HTTP 200）
- 未使用 fallback 或 pro 模型，单模型链路已验证
- 本地 `novelforge-core/.env` 更新了 SiliconFlow 进程凭证（gitignored，未 committed），进程级配置覆盖生效

限制：
- Sample A 未验证，长篇（111k 字符）提取稳定性未知
- 单 provider 无 fallback，存在单点风险
- 延迟较高（probe 11.7s / 提取 884.9s / 8 章），生产环境需评估用户体验

---

## Minimal Deploy Checklist

以下为最小 MVP 部署前必须完成的检查项：

| # | 检查项 | 当前状态 | 负责阶段 |
|---|--------|----------|----------|
| 1 | 后端 split config 测试失败修复/确认 | ❌ 未完成 | D.0.1 |
| 2 | Sample A 在凭证恢复后重跑并 PASS | ❌ 未完成 | D.1 |
| 3 | Provider tiny probe 复验（部署环境） | ❌ 未完成 | D.1 |
| 4 | Admin password 配置确认 | ❌ 未审计 | D.2 |
| 5 | Session secret 配置确认 | ❌ 未审计 | D.2 |
| 6 | Public deployment flag 配置确认 | ❌ 未审计 | D.2 |
| 7 | `.env` 在部署环境的注入方式确认 | ❌ 未审计 | D.2 |

---

## Blockers

### B1：后端定向测试 1 个失败

- **现象**：`test_import_chapter_split_size_uses_extractor_fast_role_settings` 期望 `_resolve_import_chapter_max_chars()` 返回 `1200`，实际返回 `12000`
- **分类**：配置/代码预期值不一致，非 extraction 逻辑缺陷
- **影响**：如果默认 split 尺寸从 1200 变更为 12000，其他依赖旧默认值的测试或行为可能受影响
- **负责阶段**：D.0.1
- **建议**：确认 `_resolve_import_chapter_max_chars()` 的设计意图，修复测试预期或修复实现，确保一致性

### B2：Sample A 未执行

- **现象**：Q.2.4 因 HTTP 401 凭证预检失败，Sample A 未发送到 provider
- **分类**：凭证问题，非 extraction 逻辑缺陷
- **影响**：长篇（111k 字符，预期 ~10 段）提取质量未验证
- **负责阶段**：D.1
- **建议**：凭证恢复后重跑 Sample A，确认与 Sample B 一致的提取质量

---

## Non-blocking Known Limitations

| # | 限制 | 影响 | 建议阶段 |
|---|------|------|----------|
| 1 | Sample A 尚未在凭证恢复后执行 | 长篇提取质量未验证 | D.1 |
| 2 | 服务端筛选未实现 | Apply History 仅支持客户端当前页过滤 | 未来增强 |
| 3 | 资产版本回滚未实现 | Apply 后无法撤销变更 | 未来增强 |
| 4 | 性能审计未执行 | 8-10 system split 章节的 UI 渲染性能未知 | D.1+ |
| 5 | System split 结构化元数据未通过 API 暴露 | 拆分信息仅体现在章节标题中，程序化处理受限 | 未来增强 |

---

## Next Phase

### D.0.1：后端 Split Config 测试修复

- 目标：解决 `test_import_chapter_split_size_uses_extractor_fast_role_settings` 失败
- 范围：确认 `_resolve_import_chapter_max_chars()` 设计意图，修复测试或实现
- 预期产出：后端定向测试全通过（94/94）

### D.1：Provider 复验 + Sample A 重跑

- 前置条件：D.0.1 通过
- 目标：
  - 在部署环境执行 Provider tiny probe 复验
  - 在用户授权后重跑 Sample A SiliconFlow Flash smoke
- 预期产出：Sample A PASS，双样本提取质量基线建立

### D.2：部署配置加固

- 前置条件：D.1 通过
- 目标：
  - Admin password / session secret 配置审计
  - Public deployment flag 审计
  - `.env` 注入方式确认
- 预期产出：部署配置检查清单全通过

---

## Safety

本报告遵守以下安全边界：

| 检查项 | 状态 | 说明 |
|--------|------|------|
| `.env` 内容未包含 | ✅ | - |
| API key 值未包含 | ✅ | - |
| API key 未以常见密钥前缀暴露 | ✅ | - |
| 供应商原始响应内容未包含 | ✅ | - |
| 供应商请求标识未包含 | ✅ | - |
| 样本 `.txt` 内容/片段未包含 | ✅ | - |
| 样本文件名未包含 | ✅ | - |
| 运行时 DB / content DB dump 未包含 | ✅ | - |
| 日志 / 缓存 / smoke JSON 未包含 | ✅ | - |
| Chrome profile 未包含 | ✅ | - |
| 源代码未修改 | ✅ | - |
| 验证与内容生成阶段未变更 Git 状态 | ✅ | 未 stage/commit/push/reset；最终 D.0 文档提交仅允许包含本报告与 `PROGRESS.md` |
| `.env` 本地进程凭证注入 | ✅ | 本地 `novelforge-core/.env` 在 D.0 验证前更新了 SiliconFlow 进程凭证，gitignored，未打印、未 staged、未 committed |

D.0 阶段为文档审计，不涉及源码修改、样本执行或浏览器自动化。仅执行了 1 次合成 tiny provider probe（`ping` + `max_tokens=10`，无样本正文），确认本地进程级凭证注入已恢复。本地 `novelforge-core/.env` 在验证前更新了 SiliconFlow 进程凭证，该文件 gitignored，未打印、未 staged、未 committed；最终 D.0 提交仅允许包含本报告与 `PROGRESS.md`。
