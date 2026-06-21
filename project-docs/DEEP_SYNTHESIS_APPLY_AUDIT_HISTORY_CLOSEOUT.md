# Deep Synthesis Apply Audit / History Hardening Closeout（Phase H.11）

> 阶段：H.11
> 日期：2026-06-21
> 分支：`codex/novelforge-next`
> HEAD：`a2efb48`
> 性质：文档级关闭（docs-only closeout）

---

## 1. 决策摘要 / Executive Decision

Phase H.11 是对 Apply Audit / History 强化子系统（H.4 ~ H.10）的正式关闭。本次关闭基于已验证的最新证据（H.10 与 H.9.1），不重新执行产品测试，除非在文档审查过程中发现证据不一致。

**最终决策：PASS for Apply Audit / History hardening through H.10，H.9 保留为 PARTIAL 历史证据，H.9.1 补全手动刷新证据缺口。**

---

## 2. 范围与非目标 / Scope and Non-Goals

### 2.1 范围（已交付）

- H.4：Apply Audit / History 规划与数据模型审计
- H.4.1 ~ H.6：后端 task_type 筛选、分页、API 响应净化；前端 Apply History 列表与 Detail Drawer
- H.7 Retry：Apply History 浏览器 E2E（列表 / 分页 / Drawer / 安全 / 布局）
- H.9：Confirm Apply 完整 E2E + 刷新请求验证（PARTIAL）
- H.9.1：手动刷新请求验证 /  timing 修复（PASS）
- H.10：Apply History 高级筛选（当前页客户端筛选）（PASS）

### 2.2 非目标（不在本次关闭范围内）

- 服务端 / 全局 / 跨页筛选
- 时间范围筛选
- 独立资产版本历史（asset version history）
- 回滚 / 撤销（rollback / undo）
- 导出 / 保留策略（export / retention policy）

---

## 3. 证据总账 / Evidence Ledger for H.4–H.10

| 阶段 | 结论 | 验证范围 | 关键证据 |
|------|------|----------|----------|
| H.4 | 规划 | 数据模型、API 设计、安全规则 | `DEEP_SYNTHESIS_APPLY_AUDIT_HISTORY_PLAN.md` |
| H.4.1 | PASS | Backend task_type 筛选 + 分页 + 测试 | API 测试 38 passed |
| H.5 | PASS | Frontend Apply History Tab + 工具函数 + 组件测试 | 前端 228 tests passed |
| H.6 | PASS | Detail Drawer 集成 + 类型修复 | 前端 220 tests passed |
| H.7 Retry | PASS | Browser E2E（列表 / 分页 / Drawer / 安全 / 布局） | `deep-synthesis-h7.md` + 6 张截图 |
| H.9 | PARTIAL | Confirm Apply 完整 E2E + 刷新请求验证 | `deep-synthesis-h9.md` + 5 张截图 |
| H.9.1 | PASS | 手动刷新请求验证 / timing 修复 | `deep-synthesis-h9.1.md` + 4 张截图 |
| H.10 | PASS | Apply History 高级筛选（客户端当前页） | 前端 263 tests passed |

---

## 4. 后端证据 / Backend Evidence

### 4.1 AttemptStore 记录安全

- `AttemptStore.record()` 在 `deep_synthesis` 和 `deep_synthesis_apply` 任务类型下，已剔除 `raw_response_preview` 和 `raw_response_hash`
- `task_type` 字段已存在于 `AttemptRecord`，用于区分 `deep_synthesis_apply`、`deep_synthesis` 和 `chapter_index`

### 4.2 查询与分页能力

- `AttemptStore.list_by_session(session_id, task_type, limit, offset)` 支持按 `task_type` 筛选和分页
- `AttemptStore.stats(session_id, task_type)` 支持按 `task_type` 汇总统计

### 4.3 API 端点

- `GET /api/extraction/attempts/summary` 接受 `task_type` 查询参数
- `GET /api/extraction/attempts` 接受 `task_type`、`limit` 和 `offset`，返回 `items`、`total`、`limit`、`offset`
- 单条详情端点返回经过净化的 attempt 数据

### 4.4 响应净化

- `_sanitize_attempt_item()` 从顶层和 `budget_summary` 中移除 `chapter_content`、`raw_response_text` 和 `provider_error_body`
- 不暴露 `idempotency_key`、`request_fingerprint` 和完整的 `budget_summary.idempotency.result` 快照

---

## 5. 前端证据 / Frontend Evidence

### 5.1 Apply History 列表

- 使用 `listApplyHistory` 调用，参数为 `taskType='deep_synthesis_apply'`、`limit=10` 和对应 `offset`
- `refreshKey` effect 在变更时调用 `loadHistory(0)` 重置到首页
- 手动刷新按钮调用 `loadHistory(offset)` 刷新当前页

### 5.2 Detail Drawer

- 渲染经过 `sanitizeDeepSynthesisDisplayValue` 处理的 `before/after` 预览值
- 不展示原始完整快照，不暴露 forbidden fields

### 5.3 H.10 筛选

- 筛选维度：status、conflict、run type
- 筛选变更时调用 `loadHistory(0)` 重置到首页
- **H.10 筛选为当前页客户端筛选**，仅对已加载的 `items` 进行本地过滤，不跨页，也不持久化查询条件

---

## 6. 安全矩阵 / Safety Matrix

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 禁止字段不返回 | ✅ | `chapter_content`、`raw_response_text`、`raw_response_preview`、`provider_error_body` 未在 API 响应和页面中出现 |
| `idempotency_key` 不暴露 | ✅ | 仅用于请求体，未渲染到页面或日志 |
| `request_fingerprint` 不暴露 | ✅ | 未在页面中出现 |
| 敏感值截断 | ✅ | `sanitizeDeepSynthesisDisplayValue` 限制 200 字符 |
| 无 provider 调用 | ✅ | H.7 ~ H.10 验证过程中未调用外部 provider |
| 无真实小说文本 | ✅ | 测试和验证均使用 synthetic data |

---

## 7. 阻断问题 vs 增强项 / Blockers vs Enhancements

### 7.1 阻断问题（Blockers）

**无。**

Apply Audit / History 子系统当前无阻断产品交付的问题。

### 7.2 增强项 backlog（Enhancements，非关闭前提）

| 增强项 | 说明 | 优先级 |
|--------|------|--------|
| 服务端 / 全局筛选 | 后端 API 支持 status、conflict、run type 等筛选参数，实现跨页筛选 | 未来 |
| 时间范围筛选 | 支持 `since` / `until` 参数 | 未来 |
| 独立资产版本历史 | 字段级变更日志，不依赖 AttemptRecord 的 idempotency snapshot | 未来 |
| 回滚 / 撤销 | 基于 asset version history 的 rollback / undo | 未来 |
| 导出 / 保留策略 | 审计记录导出和自动清理策略 | 未来 |

---

## 8. 已知限制 / Known Limitations

1. **H.10 筛选为当前页客户端筛选**：仅对已加载的当前页 `items` 进行本地过滤，不跨页，查询条件不持久化到 URL 或后端
2. **无服务端筛选**：后端 API 目前仅支持 `task_type` 筛选，不支持 status、conflict、run type 等服务端过滤
3. **无时间范围筛选**：API 暂不支持 `since` / `until` 参数
4. **无独立资产版本历史**：详细变更历史仍依赖 idempotency snapshot，尚未建立独立的 asset field-level change log
5. **无回滚 / 撤销**：apply 操作是单向写入，undo 机制未实现
6. **H.9 保留为 PARTIAL**：H.9 的手动刷新计数器 delta 未捕获，但 H.9.1 已补全该证据缺口

---

## 9. 验证与测试重跑说明 / Verification and Test Rerun Rationale

H.11 为文档级关闭（docs-only closeout）。关闭依据如下：

- **H.10 已验证**：前端 263 tests passed、build success、tsc 0 errors、后端 38+12+68 passed、浏览器筛选 QA passed
- **H.9.1 已验证**：`histInit=2`，`histAfterConfirm=3`，`histBeforeManualRefresh=3`，`histAfterManualRefresh=4`；confirm delta +1，manual delta +1；完整链路 E2E 通过
- **H.9 保留为 PARTIAL**：H.9 中 manual refresh 的 request-counter delta 未捕获，原因是测试脚本在 auto-refresh 完成前（`loading=true`）点击了手动刷新按钮，`disabled={loading}` 导致浏览器忽略点击事件。H.9.1 已证明该现象是 harness timing issue，非产品缺陷

**H.11 不重新执行产品测试**，除非在文档审查过程中发现证据不一致。当前未观察到证据不一致。

---

## 10. 最终决策 / Final Decision

**Final closeout decision: PASS for Apply Audit / History hardening through H.10, with H.9 preserved as PARTIAL historical evidence and H.9.1 closing the manual-refresh request-evidence gap. No product blocker remains for Apply Audit / History closeout. Remaining items are enhancements: server-side/global filters, time-range filters, independent asset version history, and rollback support. H.11 is docs-only and does not rerun product tests unless documentation evidence is found inconsistent.**

**中文结论：**

- Apply Audit / History 强化子系统（H.4 ~ H.10）正式关闭，**结论为 PASS**
- H.9 保留为 **PARTIAL** 历史证据；H.9.1 补全了手动刷新请求证据缺口
- H.9.1 的根因是 harness timing issue，非产品缺陷
- H.10 筛选为**当前页客户端筛选**，非服务端 / 全局 / 跨页筛选
- H.11 为**文档级关闭**，不重新执行产品测试，除非发现证据不一致
- 当前无阻断问题；剩余项均为增强 backlog

---

## 附录：参考文档

- `project-docs/DEEP_SYNTHESIS_APPLY_AUDIT_HISTORY_PLAN.md` — 原始规划
- `project-docs/visual-audits/deep-synthesis-h7.md` — H.7 Retry 审计报告
- `project-docs/visual-audits/deep-synthesis-h9.md` — H.9 审计报告（PARTIAL）
- `project-docs/visual-audits/deep-synthesis-h9.1.md` — H.9.1 审计报告（PASS）
- `project-docs/PROGRESS.md` — 完整进度记录
