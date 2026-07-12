# M.0 Local MVP Synthetic Import Acceptance

## Decision

**PARTIAL**

**功能链路验收：PASS。** 真实浏览器 UI 已通过 `/extract` 页面自带的“粘贴文本导入”提交本轮临时生成的 synthetic TXT 同一内容，并走通真实 upload、scheduler 与 content 链路。导入、结构化资产展示、Deep Synthesis preview/dry-run/apply、重复写入保护以及 Apply History/详情诊断均达到 M.0 功能要求。

总体结论降为 `PARTIAL`，原因有二：浏览器控制接口不提供 `setInputFiles`，因此原生文件选择器未执行，只验收了页面原生“粘贴文本导入”；另有一次 worker 工具输出曾显示受保护样本的 filename metadata。样本内容未读取，样本文件未修改、暂存或提交；本报告、JSON 与截图均不包含该名称。

## Scope

- synthetic input only: yes
- input method: 页面自带“粘贴文本导入”，内容与临时 synthetic TXT 相同
- mock/fake provider only: yes
- external provider called: no
- local novel samples read: no
- synthetic input SHA-256: `438bf74744babfcfdc882995564eee8c7473af2d5ddd3e39d165a3d60a25b82f`

## Environment

- backend: `127.0.0.1:8001`，`/health` 与 `/openapi.json` 均为 HTTP 200
- frontend: `127.0.0.1:3000`，`/` 与 `/extract` 均为 HTTP 200
- data dir: 本轮隔离的临时 runtime data dir（报告不记录本地绝对路径或运行 ID）
- provider mode: deterministic mock/fake provider；无真实 provider 调用
- external connections: runtime listener 进程的 `external_established_count=0`
- runtime logs: 4 个日志文件，总计 0 bytes

## Import Result

| Metric | Result |
|---|---|
| status | `completed_with_quality_warnings` |
| file chars | 6,294 |
| UI chars | 6,293 |
| chapters total | 3 |
| chapters completed | 3 |
| failed chapters | 0 |
| elapsed | 浏览器观察在 1,000 ms 内完成 |

页面显示“提取完成”、3 章，并显示所有结构化阶段完成。真实 mock 导入测试与 UI 均未发现失败章节；没有 `provider_unavailable`、fatal error 或 raw exception。

状态中的质量阈值警告来自资产数量低于面向长篇内容的建议阈值（例如角色数 `3 < 8`），不表示导入失败，也不违反 M.0 明示的最低资产下限。

## Asset Result

| Asset | Count |
|---|---:|
| characters | 3 |
| relationships | 2 |
| timeline events | 3 |
| world settings | 1 |

Characters、World 与 Analytics 页面均通过浏览器检查，显示的合成资产包括岚舟、砾星、弦月和云穹城浮核站。

## Deep Synthesis

- preview: success；生成 1 个 candidate；preview 阶段未写入；人工接受状态为 `true`；浏览器观察在 1,000 ms 内完成。
- dry-run: success；首次运行 0 conflict；服务端记录耗时 1 ms，UI History 可见。
- apply: success；`applied=1`、`skipped=0`、`conflict=0`；岚舟 description 从 v1 更新为 v2；服务端/History 记录耗时 47 ms。
- idempotency/conflict: apply 详情 drawer 可读取幂等快照。第二次 preview + dry-run 检测到 1 个“当前值不匹配”冲突，未再次写入。
- history: success；API 中有 3 条 `deep_synthesis_apply` attempt（2 次 dry-run，其中 1 次冲突；1 次实际 apply），UI History 与详情均可见。
- diagnostics: 浏览器 console error 0、warning 0、敏感信息匹配 0；未显示 fatal/raw exception。

## Browser Evidence

- `project-docs/screenshots/m0/01-import-complete.png`
- `project-docs/screenshots/m0/02-characters.png`
- `project-docs/screenshots/m0/03-deep-synthesis-preview.png`
- `project-docs/screenshots/m0/04-apply-history.png`
- `project-docs/screenshots/m0/05-apply-detail.png`
- visible failures: 0

截图不包含 API key、`.env`、本地小说样本名称、真实用户路径或 provider raw body。

## Tests

- backend required suite: `47 passed`
- backend AIService focused suite: `3 passed`
- frontend targeted suite: 4 files / `117 passed`
- TypeScript: `npx tsc --noEmit --incremental false` 通过
- frontend production build: 通过，13/13 静态页面生成
- Git whitespace check: `git diff --check` 通过

本节记录主验收流程提供的真实结果；本报告整理任务没有重新运行浏览器或测试。

## Focused Review

- review runs: 1
- status: `substantive`（不表述为 review PASS）
- findings: 0 critical / 0 high / 1 medium
- medium finding: 一次 worker 工具输出曾显示受保护样本的 filename metadata；未显示样本内容。
- disposition: 已通过将总体 Decision 降为 `PARTIAL` 并如实披露处理；样本未读、未改、未 stage、未 commit，报告/JSON/截图不含该名称。

## Cleanup

- synthetic file removed: **yes**
- temporary data removed: **yes**
- backend stopped: **yes**
- frontend stopped: **yes**
- port 3000 released: **yes**
- port 8001 released: **yes**
- cleanup 后工作树：仅剩 2 个预期受保护样本为 untracked，以及当时 8 个 M.0 delivery artifact 为 untracked

cleanup 已完成；未删除、打开或改动两个受保护样本。

## Known Limitations

- 浏览器控制接口无 `setInputFiles`，原生文件选择器未自动化；验收使用页面自带的“粘贴文本导入”入口提交与临时 synthetic TXT 相同的内容。
- 一次 worker 工具输出曾显示受保护样本的 filename metadata；内容未读取，文件未修改、暂存或提交，报告/JSON/截图均无该名称。
- `completed_with_quality_warnings` 包含面向长篇内容的建议资产阈值警告；本轮实际结果仍满足 M.0 明示最低资产下限。
- 本轮按要求仅使用 deterministic mock/fake provider，没有测试真实 provider 的可用性、延迟或输出质量。
- 显式 commit/push 尚待本轮后续步骤完成。

## Final MVP Assessment

- local MVP ready: **功能链路 PASS；M.0 总体 PARTIAL，保留上述原生文件选择器与 filename metadata 限制**
- internal deployment rehearsal ready: **可进入下一阶段，但必须保留上述 PARTIAL 结论，不得改写为完整端到端 PASS**
- final M.0 closure: **PARTIAL；cleanup 与 substantive review 已完成，commit/push 待主任务执行**

## Next Goal

**Internal Deployment Rehearsal**
