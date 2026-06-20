# Phase H.7: Apply History Browser E2E Audit Report

> 日期：2026-06-20
> 分支：codex/novelforge-next
> 测试方式：Baseline tests (pre-browser QA)
> 结论：**BLOCKED — H.7.1 前置修复必须**

---

## 概述

Phase H.7 原计划对 Apply History 进行完整的浏览器 E2E QA 验证，包括：
- History 列表渲染与 `task_type=deep_synthesis_apply` 筛选
- Detail drawer（可用/不可用/冲突三种状态）
- 分页、刷新、Confirm Apply 后自动刷新
- 安全脱敏验证
- Desktop 1440px / Mobile 390px 布局

然而在基线测试阶段发现 **TypeScript 编译和生产构建均失败**，原因是在 Phase H.6 集成 `DeepSynthesisApplyDetailDrawer` 时，`DeepSynthesisApplyHistoryDetail` 类型定义从未添加到 `types/index.ts`。

---

## 环境

| 项目 | 值 |
|------|------|
| 分支 | `codex/novelforge-next` |
| 后端 | Python 3.10+ FastAPI, uvicorn |
| 前端 | Next.js 15.5.12, TypeScript, Tailwind CSS |
| 后端端口 | 8001 |
| 前端端口 | 3000 |

---

## 基线测试结果

### 后端测试（全部通过）

| 命令 | 结果 |
|------|------|
| `pytest tests/api/test_attempt_retry_api.py -q` | ✅ 38 passed |
| `pytest tests/services/test_attempt_store.py -q` | ✅ 12 passed |
| `pytest tests/services/test_deep_synthesis.py -q` | ✅ 68 passed |

### 前端测试（通过，但有类型缺陷）

| 命令 | 结果 |
|------|------|
| `npm test -- --run` | ✅ 36 files, 228 tests passed |
| `npx tsc --noEmit --incremental false` | ❌ 12 errors |
| `npm run build` | ❌ Failed to compile |

---

## 阻断问题

### 缺失类型：`DeepSynthesisApplyHistoryDetail`

**根因**：Phase H.6 在 `deep-synthesis-apply-detail-drawer.tsx`、`deep-synthesis-apply-history.tsx` 和 `novelforge-api.ts` 中引用了 `DeepSynthesisApplyHistoryDetail` 类型，但从未将其添加到 `types/index.ts`。

**受影响文件**：
- `novelforge-core/frontend/src/app/extract/deep-synthesis-apply-detail-drawer.tsx` — 3 个 import 错误 + 6 个隐式 any
- `novelforge-core/frontend/src/app/extract/deep-synthesis-apply-history.tsx` — 1 个 import 错误
- `novelforge-core/frontend/src/lib/api/novelforge-api.ts` — 1 个 import 错误
- `novelforge-core/frontend/src/app/extract/deep-synthesis-apply-detail-drawer.test.tsx` — 1 个 import 错误

**预期类型定义**（基于使用推断）：

```typescript
export interface DeepSynthesisApplyHistoryDetail {
  detail_available: boolean;
  unavailable_reason?: string | null;
  idempotency_snapshot_available: boolean;
  status?: string | null;
  summary?: {
    applied_count?: number;
    skipped_count?: number;
    conflict_count?: number;
    accepted_count?: number;
    rejected_count?: number;
    dry_run?: boolean;
  };
  applied_changes?: Array<{
    change_id?: string;
    asset_type?: string;
    asset_id?: string;
    field_path?: string;
    version_before?: string | null;
    version_after?: string | null;
    value_preview_before?: string | null;
    value_preview_after?: string | null;
  }>;
  skipped_changes?: Array<{
    change_id?: string;
    reason?: string;
    asset_type?: string;
    asset_id?: string;
    field_path?: string;
  }>;
  conflicts?: Array<{
    change_id?: string;
    asset_id?: string | null;
    field_path?: string | null;
    reason?: string;
    expected_preview?: string | null;
    actual_preview?: string | null;
  }>;
  warnings?: string[];
}
```

**修复方式**：在 `types/index.ts` 末尾新增上述接口定义。

---

## 安全验证

未执行浏览器 QA，无法验证安全脱敏。但代码审查确认：
- `novelforge-api.ts` 的 `getApplyHistoryDetail` 已对 `value_preview_before/after` 调用 `sanitizeDeepSynthesisDisplayValue`
- `expected_preview/actual_preview` 同样经过脱敏
- 不返回 `budget_summary.idempotency.result` 完整快照

---

## 截图

未产出（浏览器 QA 被阻断）。

---

## Decision

**BLOCKED — 需要 H.7.1 前置修复**

Phase H.7 的浏览器 E2E QA 无法启动，因为前端生产构建因缺失类型定义而失败。必须先修复 `DeepSynthesisApplyHistoryDetail` 类型定义，再重新执行 H.7 浏览器验证。

---

## 推荐下一步

1. **H.7.1**：在 `types/index.ts` 新增 `DeepSynthesisApplyHistoryDetail` 接口定义
2. 验证 `tsc --noEmit` 和 `npm run build` 通过
3. 重新执行 H.7 浏览器 E2E QA
