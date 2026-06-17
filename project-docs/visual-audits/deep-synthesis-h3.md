# Phase H.3 - Deep Synthesis Multi-Asset Apply Verification

## 目标

验证 Deep Synthesis apply 在同一次请求中处理多个结构化资产时的写入、跳过、冲突和幂等行为。

## 范围

- 仅使用 synthetic asset 数据，不包含真实小说正文。
- 仅新增后端服务层测试，不修改后端业务实现。
- 不运行真实 provider smoke，不触发外部模型调用。
- 不实现 rollback / undo。

## 覆盖场景

- `test_apply_multi_asset_accepted_success`
  - character asset accepted。
  - relationship asset accepted。
  - 两个资产均写入，写入次数为 2。
- `test_apply_multi_asset_mixed_decisions`
  - accepted 变更写入。
  - rejected 变更跳过且 reason 为 `rejected_by_user`。
  - undecided 变更跳过且 reason 为 `undecided`。
- `test_apply_multi_asset_conflict`
  - event asset 发生 version conflict。
  - 冲突资产不写入。
  - 其他 accepted 资产仍可写入，结果为 `partial`。
- `test_apply_multi_asset_idempotency_replay`
  - 同一 idempotency key + 相同 multi-asset request 重放。
  - 返回同一 `attempt_id`。
  - 不重复写入。
- `test_apply_multi_asset_idempotency_conflict`
  - 同一 idempotency key + 不同 request 触发 `DeepSynthesisConflictError`。
  - 冲突请求不产生额外写入。
- `test_apply_multi_asset_direct_construction`
  - 通过直接构造 `DeepSynthesisPreview` + `ProposedChange` + `DeepSynthesisApplyRequest` 验证 multi-asset apply。
  - character + relationship 双 accepted 写入。
  - 验证 `applied_count == 2` 且 `applied_changes` 长度为 2。

## 验证命令

```powershell
cd novelforge-core
.\.venv\Scripts\python.exe -m pytest tests/services/test_deep_synthesis.py -k "multi_asset" -v
.\.venv\Scripts\python.exe -m pytest tests/services/test_deep_synthesis.py -q
.\.venv\Scripts\python.exe -m pytest tests/api/test_deep_synthesis_api.py -q
```

## 验证结果

- Targeted multi-asset：6 passed（`-k "multi_asset"`）。
- Service full file：68 passed。
- API full file：21 passed。
- 仅出现既有 `.pytest_cache` 写入权限 warning，不影响测试结论。

## 结论

PASS。Deep Synthesis apply 已具备 multi-asset 验证覆盖：多资产 accepted 可写入，mixed decision 只写 accepted，单资产冲突不阻断其他 accepted 写入，幂等 replay 不重复写入，幂等 fingerprint 冲突会拒绝后续不同请求。

## 风险与未完成项

- 本阶段只覆盖服务层 synthetic 数据，不覆盖真实 provider smoke。
- 本阶段不覆盖浏览器 UI 交互；H.2 已覆盖前端 apply E2E 主流程。
- 本阶段不实现 rollback / undo。
