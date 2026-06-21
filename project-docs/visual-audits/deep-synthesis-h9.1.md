# Phase H.9.1: Manual Refresh Request Verification / Timing Fix

> 日期：2026-06-20
> 分支：codex/novelforge-next
> HEAD: d4bdb33
> 测试方式：Browser E2E with Playwright route mocking (closure-based counters) + synthetic data
> 结论：**PASS**

---

## 概述

Phase H.9.1 针对 Phase H.9 中标记为 PARTIAL 的手动刷新计数器问题进行完整 E2E 验证。本次运行覆盖 **完整链路**：preview → selection → dry-run → confirm apply → 等待 confirm auto-refresh → 手动刷新，全程使用 handler-side closure counters 记录每一次 history list 请求。

---

## 环境

| 项目 | 值 |
|------|------|
| 分支 | `codex/novelforge-next` |
| HEAD | `d4bdb33` |
| 后端 | Python 3.10+ FastAPI, uvicorn, port 8001 |
| 前端 | Next.js 15.5.12, TypeScript, Tailwind CSS, port 3000 |
| E2E 数据源 | Playwright route mocking（synthetic backend，无 catch-all passthrough） |
| 浏览器 | Playwright Chromium (headless) |

---

## 基线测试结果

| 步骤 | 命令 | 结果 |
|------|------|------|
| 1 | `npm test -- --run` | ✅ 36 files, 228 tests passed |
| 2 | `npm run build` | ✅ Compiled successfully（`/extract` 33.5 kB） |
| 3 | `npx tsc --noEmit --incremental false` | ✅ 0 errors |
| 4 | `pytest tests/api/test_attempt_retry_api.py -q` | ✅ 38 passed |
| 5 | `pytest tests/services/test_attempt_store.py -q` | ✅ 12 passed |
| 6 | `pytest tests/services/test_deep_synthesis.py -q` | ✅ 68 passed |

---

## 浏览器 E2E 完整链路

### 执行步骤

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 页面加载 | histInit: seq=1（无 parent_id）+ seq=2（有 parent_id） |
| 2 | 点击"生成 Deep Synthesis Preview" | preview mock 返回 3 个 proposed_changes |
| 3 | Accept h91-char-summary, Reject h91-event-outcome | selection state: 1 accepted, 1 rejected (event), 1 undecided (world) |
| 4 | 点击"预检应用（Dry Run）" | dry-run 请求：dry_run=true, accepted=[h91-char-summary], rejected=[h91-event-outcome] |
| 5 | 点击"确认写入资产库" | confirm 请求：dry_run=false, idempotency_key=present |
| 6 | 等待 confirm auto-refresh | `setApplyRefreshKey(prev+1)` → history component useEffect → loadHistory(0) → seq=3 |
| 7 | 等待刷新按钮 enabled | 按钮从 disabled/loading 恢复为 enabled |
| 8 | 点击"刷新"按钮 | 手动刷新请求 → seq=4 |
| 9 | 等待按钮恢复 | 按钮从 disabled/loading 恢复为 enabled |

### 请求计数器（handler-side closure counters）

| 计数器 | seq | phase | task_type | limit | offset | hasParentId | 说明 |
|--------|-----|-------|-----------|-------|--------|-------------|------|
| histInit | 1 | init | deep_synthesis_apply | 10 | — | false | 页面加载第 1 次 |
| histInit | 2 | init | deep_synthesis_apply | 10 | — | true | 页面加载第 2 次（含 parent_id） |
| histAfterConfirm | 3 | auto-refresh | deep_synthesis_apply | 10 | — | true | confirm 后 auto-refresh ✅ |
| histAfterManualRefresh | 4 | manual-refresh | deep_synthesis_apply | 10 | — | true | 手动刷新 ✅ |

### 计数器汇总

| 计数器 | 值 | 说明 |
|--------|-----|------|
| histInit | 2 | 页面加载（seq 1 + 2） |
| histAfterConfirm | 3 | confirm auto-refresh（seq 3） |
| histBeforeManualRefresh | 3 | 手动刷新前（同 histAfterConfirm） |
| histAfterManualRefresh | 4 | 手动刷新后（seq 4） |
| **confirm auto-refresh delta** | **+1** | `histAfterConfirm - histInit = 3 - 2 = 1` ✅ |
| **manual refresh delta** | **+1** | `histAfterManualRefresh - histBeforeManualRefresh = 4 - 3 = 1` ✅ |

### Dry-Run / Confirm Payload 断言

| 断言项 | Dry-Run | Confirm | 结果 |
|--------|---------|---------|------|
| dry_run | true | false | ✅ |
| accepted_change_ids | [h91-char-summary] | [h91-char-summary] | ✅ |
| rejected_change_ids | [h91-event-outcome] | [h91-event-outcome] | ✅ |
| idempotency_key | null (absent) | present | ✅ |
| task_type（response） | deep_synthesis_apply | deep_synthesis_apply | ✅ |

### Confirm Auto-Refresh 验证

| 验证项 | 结果 |
|--------|------|
| confirm apply 后 `setApplyRefreshKey(prev+1)` 触发 | ✅ |
| history component useEffect 响应 refreshKey 变化 | ✅ |
| loadHistory(0) 发起新请求 | ✅（seq=3） |
| histAfterConfirm > histInit | ✅（3 > 2） |
| 请求包含 task_type=deep_synthesis_apply | ✅ |
| 请求包含 limit=10 | ✅ |

### 手动刷新验证

| 验证项 | 结果 |
|--------|------|
| 按钮 click 前 enabled | ✅ `disabled=false, loading=false` |
| click 后按钮进入 loading | ✅ `disabled=true, loading=true` |
| click 后触发新请求 | ✅（seq=4, delta=+1） |
| 加载完成后按钮恢复 | ✅ `disabled=false` |
| histAfterManualRefresh > histBeforeManualRefresh | ✅（4 > 3） |

---

## H.9 根因分析

### H.9 的现象

H.9 中手动刷新点击后 `histManual = histAfterConfirm = 4`（delta=0），表明手动刷新按钮点击后未触发额外的 history list 请求。

### H.9.1 的根因确认

**根因：harness timing issue（测试脚本时机问题），非产品缺陷。**

H.9 测试脚本在 confirm apply 的 auto-refresh 尚未完成时（`loading=true`）点击了手动刷新按钮。由于 `disabled={loading}`，浏览器忽略了点击事件。

H.9.1 验证了：
1. confirm auto-refresh 正常工作（histAfterConfirm - histInit = +1）
2. 手动刷新在 enabled 状态下点击正常工作（histAfterManualRefresh - histBeforeManualRefresh = +1）
3. 按钮的 disabled/loading 状态转换完全符合预期

**无需产品代码修改。**

---

## 安全验证

| 禁止字段 | 页面是否显示 |
|----------|-------------|
| `chapter_content` | ❌ 未显示 |
| `raw_response_text` | ❌ 未显示 |
| `raw_response_preview` | ❌ 未显示 |
| `provider_error_body` | ❌ 未显示 |
| `full_text` | ❌ 未显示 |
| `original_text` | ❌ 未显示 |
| `idempotency_key`（实际值） | ❌ 未显示 |
| `request_fingerprint` | ❌ 未显示 |

---

## 截图

| 文件名 | 内容 | 验证 |
|--------|------|------|
| `deep-synthesis-h9.1-before-refresh.png` | Preview + selection 区域 | ✅ |
| `deep-synthesis-h9.1-after-refresh.png` | Apply History 刷新后状态（"共 13 条记录"） | ✅ |
| `deep-synthesis-h9.1-request-counters.png` | 全页面截图（含完整链路上下文） | ✅ |
| `deep-synthesis-h9.1-mobile-refresh.png` | Mobile 390px 刷新按钮状态 | ✅ |

---

## Decision

**PASS**

H.9.1 完整 E2E 链路验证了：
1. **Confirm auto-refresh**: `histAfterConfirm(3) > histInit(2)`，delta=+1 ✅
2. **Manual refresh**: `histAfterManualRefresh(4) > histBeforeManualRefresh(3)`，delta=+1 ✅
3. 所有请求包含 `task_type=deep_synthesis_apply`、`limit=10` ✅
4. Dry-run / confirm payload 断言通过 ✅
5. UI 布局正确（Desktop 1440px + Mobile 390px）✅
6. 安全扫描无 forbidden fields ✅

**无需产品代码修改。**

---

## 推荐下一步

- **Phase H.10**（可选）：Apply History 高级筛选
