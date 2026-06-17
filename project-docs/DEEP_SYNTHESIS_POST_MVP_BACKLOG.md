# Deep Synthesis Post-MVP Hardening Backlog

## Purpose

此文件记录 Deep Synthesis MVP 完成后的 hardening / productization 任务，不再阻塞 MVP complete。

## P0 - Baseline / Safety

1. Fix performance-profile global scope failing tests
   * 当前已知：test_get_performance_profile_with_scope_global, test_post_rebuild_global_performance_profile
   * 分类：pre_existing_unrelated
   * 目标：恢复全量测试基线干净

2. Idempotency duplicate-submit protection
   * 防止 Confirm Apply 重复提交
   * 使用 idempotency_key 或 server-side apply operation record

3. Browser E2E for non-empty proposed_changes
   * 让 /extract 页面自然产生 proposed_changes 或注入测试数据源
   * 验证 accept → dry_run → confirm → readback

## P1 - Productization

1. Multi-asset / batch apply verification
2. Apply audit/history UI
3. Apply result → asset refresh linkage
4. UI data source enrichment for proposed_changes
5. Apply conflict resolution UX
6. Better empty-preview guidance
7. Apply operation summary download/export

## P2 - Advanced Capabilities

1. Rollback / undo strategy
2. Diff viewer for field-level patches
3. Conflict resolution assistant
4. Deep Synthesis apply performance profile
5. Multi-round synthesis tuning
6. Cross-asset dependency-aware apply
7. Scheduled post-apply consistency checks

## Not Now

* Do not add real provider smoke without explicit user authorization
* Do not use real novel text in tests
* Do not bypass ContentManager
* Do not mix hardening work with unrelated refactors

## Suggested Next Phase

Phase H.0 - System Reliability Cleanup / Baseline Fix

首要任务：Fix performance-profile global scope failures and restore clean full-test baseline.
