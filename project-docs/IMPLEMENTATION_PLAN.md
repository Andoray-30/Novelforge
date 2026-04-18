# NovelForge 实施规划

## 目标
在不削减核心功能的前提下，将 NovelForge 完成为一个可用、完整、可持续迭代的小说生成助手产品。

## 总体原则
1. 不用 demo / fake / placeholder 充当完成功能。
2. 不靠删除功能换稳定，而是修通真实链路。
3. 先统一数据契约，再完善工作流与页面。
4. 所有主要页面必须最终接入真实数据与真实状态。

## 实施工作流

### Workstream 1 — 统一数据契约与持久化模型
- 统一 `novel / outline / character / world / timeline / relationship / chapter` 的标准资产结构。
- 明确：
  - `metadata`：身份、分类、session、层级
  - `extracted_data`：结构化 UI 真实数据
  - `content`：正文/摘要/可读文本
- 消除依赖 `JSON.parse(content)` 的临时读法。

### Workstream 2 — 修正后端工作流正确性
- 修复 extractor / service / API 的真实契约。
- 修复 scheduler 与 content_manager 的写入链路。
- 修复 timeline / relationship / world 的保存逻辑与当前模型不一致问题。
- 明确统一存储路径。

### Workstream 3 — 统一应用壳与 session 生命周期
- 统一首页和其他页面的 layout。
- 打通项目/session 在各页面间的恢复与共享。
- 取消假登录门禁依赖。
- 让导航只指向真实页面。

### Workstream 4 — 打通完整创作闭环
- planning: outline -> characters -> world -> save
- chat artifact -> save -> reopen
- import/extract -> assets -> dashboard/editor/characters/world
- chapter generation -> save -> reopen -> continue editing

### Workstream 5 — 将假页面做成真实页面
- editor：真实章节编辑与保存
- analytics：真实项目统计
- settings：真实模型与偏好配置
- 角色/世界详情页接入真实编辑逻辑

### Workstream 6 — 异步任务、错误恢复与测试
- 统一任务状态与进度
- 增加用户可见错误提示
- 增加刷新恢复能力
- 补充后端接口测试与前端关键路径 smoke test

## 推荐执行顺序
1. Workstream 1 — 数据契约
2. Workstream 2 — 后端工作流正确性
3. Workstream 3 — 统一应用壳
4. Workstream 4 — 打通完整创作闭环
5. Workstream 5 — 做实 placeholder 页面
6. Workstream 6 — 测试与硬化

## 最终验收标准
- 可创建/切换/删除项目会话
- 可聊天并保存结构化 artifact
- 刷新后可恢复并重新打开已保存资产
- 可导入 txt / epub / pdf / docx 并异步处理
- 可完整执行 outline -> characters -> world -> save
- 可生成章节并继续编辑
- analytics / settings 为真实页面
- 主导航所有入口都是真功能
- 失败路径可见、可恢复、可诊断
