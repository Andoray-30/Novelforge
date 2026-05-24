# NovelForge 实施规划

## 目标
在不削减核心功能的前提下，将 NovelForge 完成为一个可用、完整、可持续迭代的小说生成助手产品。

## 总体原则
1. 不用 demo / fake / placeholder 充当完成功能。
2. 不靠删除功能换稳定，而是修通真实链路。
3. 先统一数据契约，再完善工作流与页面。
4. 所有主要页面必须最终接入真实数据与真实状态。
5. 项目内容库不仅是展示层存储，也是 AI 可检索、可在用户确认后写回的项目记忆库。

## 实施工作流

### Workstream 1 — 统一数据契约与持久化模型
- 统一 `novel / outline / character / world / timeline / relationship / chapter` 的标准资产结构。
- 明确：
  - `metadata`：身份、分类、session、层级
  - `extracted_data`：结构化 UI 真实数据
  - `content`：正文/摘要/可读文本
- 消除依赖 `JSON.parse(content)` 的临时读法。
- 为可编辑资产建立版本化语义：用户修改、AI 建议修改、AI 经确认后写回，必须共享同一 canonical asset contract。

### Workstream 2 — 修正后端工作流正确性
- 修复 extractor / service / API 的真实契约。
- 修复 scheduler 与 content_manager 的写入链路。
- 修复 timeline / relationship / world 的保存逻辑与当前模型不一致问题。
- 明确统一存储路径。
- 把导入/提取链路从“能提取”推进到“尽量完整提取”，为长文本建立更强的覆盖、召回、合并与质量度量机制。

### Workstream 3 — 统一应用壳与 session 生命周期
- 统一首页和其他页面的 layout。
- 打通项目/session 在各页面间的恢复与共享。
- 取消假登录门禁依赖。
- 让导航只指向真实页面。
- 在项目之下引入“小说根资产 / 书级容器”语义，让同一项目内的多本书资产不再混杂在一个平面列表里。
- 书级容器第二轮继续要求：首页世界树/拓扑、导入完成默认落点、提取完成摘要都必须跟随当前小说收敛，不能只停留在列表页过滤。
- 书级容器第三轮已完成移动端小说选择入口与首页切书局部状态收口，下一步重点转向剩余读取路径与资产详情页的按小说边界审计。
- 书级容器第四轮已完成角色详情归属校验与编辑器新章节归书，下一步继续补详情页保护与其余入口的跨书边界一致性。
- 书级容器第五轮已补首页世界树入口保护与分析页范围显式提示，下一步继续把边界保护扩展到世界观/时间线/关系等细粒度资产链路。
- 书级容器第六轮已确认世界观页当前以页内视图为主、暂无独立详情路由；已补世界页当前小说范围显式提示，下一步继续审计关系资产真实入口与后续可编辑详情链路。
- 书级容器第七轮已补角色页关系网络直接读取真实 `relationship` 资产并保持按小说范围收敛，下一步继续检查 Artifact 保存链路与关系详情/编辑入口是否仍缺归属保护。
- 书级容器第八轮已补聊天 Artifact 保存链路透传当前 `selectedNovelId`，避免 AI 保存角色/世界观/时间线/关系/章节草稿时掉回项目平铺层；下一步继续审计关系资产的可重开/详情入口。
- 书级容器第九轮已补聊天消息内 Artifact 卡片的真实预览重开入口，并复用首页 ArtifactPanel 作为关系/时间线/世界观/角色草稿的统一详情面板；下一步继续补基于已保存 content item 的关系详情归属校验与可编辑视图收口。
- 书级容器第十轮已补首页工作台中已保存 `world / timeline / relationship` 资产的统一重开入口，并抽出 `openContentItemInArtifactPanel(...)` 复用小说归属校验；下一步继续把分析页最近资产与更细粒度详情页接入同一套真实编辑收口。
- 书级容器第十一轮已补分析页“最近更新的资产”真实重开入口：`chapter` 直达编辑器、`character` 直达角色详情、`world / timeline / relationship / outline` 复用统一 `ArtifactPanel` 打开并支持原位保存；下一步继续把基于已保存 content item 的统一重开链路扩展到更多细粒度详情页与可编辑视图。
- 书级容器第十二轮已补世界页细粒度入口收口：时间线事件、地点、文化、规则卡片点击后会复用同一套 reopen / save helper 打开已保存 `world / timeline` 资产，继续保持当前小说边界保护；下一步继续把关系资产与更多独立详情页入口并入同一链路。
- 书级容器第十三轮已补角色页关系网络入口收口：点击关系图中的已保存关系边会复用统一 helper 打开 `relationship` 资产并支持原位保存，继续沿用当前小说归属保护；下一步继续评估是否将网络图点击从“单边命中”升级为更精确的关系选择与详情控制器。
- 书级容器第十四轮已抽出共享 `content item reopen/save` helper，分析页 / 世界页 / 角色页改为共用同一套 content item 级 reopen 与保存控制逻辑，减少页面间重复胶水。
- 书级容器第十五轮已把首页工作台 / 世界树 / 章节列表 / 角色设定 / 世界观时间线关系入口也并入共享 `content item reopen/save` 控制器，首页不再维护独立已保存资产重开逻辑。
- 书级容器第十六轮已为已保存 content item 打开的 Artifact 携带 `contentItemId`，保存时优先按资产 ID 原位更新，避免同名资产或多候选资产误写回。
- 书级容器第十七轮已把角色关系图点击从“悬停节点后取第一条相关关系”升级为“鼠标命中关系边后打开对应关系资产”，关系入口选择更精确。
- 书级容器第十八轮已抽出首页 reopen smoke seam，并补 `chapter / character / world / timeline / relationship / outline` 首页分流与跨书阻断测试。
- 书级容器第十九轮已明确历史无 `parent_id` 小说级资产边界：选中小说时阻断未归属 `chapter / character / world / timeline / relationship` 直接编辑，全部小说聚合视图仍允许打开，`novel / outline` 保留项目级入口。
- 书级容器第二十轮已补首页未归属资产绑定入口：在当前小说视图中可将无 `parent_id` 的历史章节/角色/世界观/时间线/关系资产绑定到当前小说，并以测试固定绑定请求语义。
- 书级容器第二十一轮已抽出 focused asset helper，并让已保存资产保存后继续以 `contentItemId` 作为聊天上下文引用身份，避免从项目资产退化成临时 artifact。
- 书级容器第二十二轮已把未归属资产绑定能力抽为共享 `bindContentItemToNovel(...)`，并在分析页最近资产中补绑定入口。
- 书级容器第二十三轮已把未归属世界观/时间线资产绑定入口扩展到世界页，页面会提示并允许将当前展示的无 `parent_id` 世界资产原位绑定到当前小说。
- 书级容器第二十四轮已把未归属资产绑定入口扩展到角色页：角色页现在会识别无 `parent_id` 的 character 和 relationship 资产，在页面顶部显示绑定提示并支持一键绑定到当前小说；同时审计了批量保存后焦点资产的 `contentItemId` 持久化逻辑，确认无需额外修复。
- Workstream 4 写回闭环第一轮已落地文本协议版：系统提示支持 AI 追加 `<save_asset>` 保存建议，前端可解析多个保存建议并在聊天消息中展示确认/跳过按钮，用户确认后写入项目内容库并刷新上下文。
- Workstream 4 写回闭环第二轮已增强保存建议的精确写回：当 `<save_asset>` 或其 `data` 携带 `id / contentItemId / content_item_id` 时会直接更新指定资产，并保留原 metadata/session/parent/tags/relations；无 ID 时仍走 upsert 新建/合并，同时补齐解析和保存请求单元测试。
- Workstream 2/4 提取链路优先级已上调为当前最高：已确认本轮失败的直接原因是 `novel_import` 只保存了 novel + 1 个空正文 chapter，四个深度分析阶段全部 timeout；已先修复章节空正文 fallback，并把导入分析输入改为跨全文采样以降低超时风险，同时补后端回归测试锁定“不再保存空章节正文”。
- Workstream 2/4 提取链路第二轮已新增导入专用深度分析控制器：角色/时间线恢复全文分片提取，世界观/关系网使用跨全文采样控成本，关系边按已识别角色过滤，并通过 `low_quality / partial / failed` 显式暴露质量状态；下一步必须用真实 90k+ 文本 smoke 检查内容库产出质量，再决定是否继续改 extractor 内部并发。
- Workstream 2/4 提取链路第三轮已使用根目录真实样本 `超时空辉夜姬.txt` 做本地解析 smoke：修复 TXT 编码选择、预处理吞换行、页眉清理裁掉章节标题、短章节误合并等问题；样本现在可解析为约 90,759 字符、5 个非空章节。完整 AI 导入 smoke 因权限系统阻止外发用户小说正文而未执行，下一步需在明确授权外部模型调用后继续跑结构化资产质量检查。
- Workstream 2/4 提取链路第四轮已完成真实 AI 导入 smoke：`超时空辉夜姬.txt` 产出 5 章、4 角色、1 世界观、6 时间线、1 关系资产，`analysis_status=completed`；同时修复关系解析中 `evolution / chapter_references` 返回字符串导致整批关系丢失的问题。下一步重点从“是否产出”转为“质量优化”：过长章节二次切分、真实关系边保留、时间线标题/描述错配修正。
- Workstream 2/4 提取链路第五轮已补过长章节二次切分：导入保存前会把超过 18,000 字符的章节按自然边界拆成多段资产，`超时空辉夜姬.txt` 从 5 章展开为 8 个章节资产，最大章节约 17,997 字符；下一步继续复跑关系提取并优化时间线一致性。
- Workstream 2/4 提取链路第六轮已完成真实关系边保留验证：第二轮完整导入 smoke 产出 8 章、6 角色、1 世界观、6 时间线、2 真实关系边（酒寄彩叶→真实、酒寄彩叶→芦花，均为 FRIEND 且有原文证据），`analysis_status=completed`。提取链路已从死链路推进到可用状态；下一步把 `analysis_status` 接入导入完成 UI 并继续优化关系覆盖与时间线质量。
- Workstream 2/4 提取链路第七轮已将关系提取从 24k 采样改为全文 chunk 召回，并把硬过滤改为别名归一化 + 去重 + 质量门槛：关系数不足或主角无关系会标记 `low_quality`，不再误报完成；下一步需在授权外部模型调用后复跑真实样本验证关系数是否达到 8+。
- 额外治理：已清理提取链路中针对《超时空辉夜姬》的样本特化别名映射，角色与关系归一改为通用清洗/前后缀/别名字段规则，避免把当前样本优化写死成项目逻辑；后续所有优化都应保持小说无关的普适性。
- Workstream 2/4 提取链路架构升级第一轮：诊断出角色提取三大结构性瓶颈（召回+建档混一步、batch all-or-nothing、45秒硬限制），并完成修复：AIService 长任务超时放宽、extractor batch 容错改 partial-success、新增轻量角色普查只召回候选不建档、角色普查作为补充召回自动触发；下一步复跑 smoke 验证角色数稳定 ≥ 8。

### Workstream 4 — 打通完整创作闭环
- planning: outline -> characters -> world -> save
- chat artifact -> save -> reopen
- import/extract -> assets -> dashboard/editor/characters/world
- chapter generation -> save -> reopen -> continue editing
- 让内容库演进为项目记忆库：AI 可检索角色/世界观/时间线/关系/章节，并在用户确认下提出修改或执行结构化写回。
- 建立“AI 请求资产 / AI 请求修改 / 用户确认 / 内容库更新 / 回流聊天上下文”的受控 agent 式工作流。
- 所有导入、提取、编辑、分析页面都要支持“以书为中心”组织资产：引用书名即可收敛到该书旗下角色、世界观、时间线、关系与章节，而不是只按项目平铺混放。

### Workstream 5 — 将假页面做成真实页面
- editor：真实章节编辑与保存
- analytics：真实项目统计
- settings：真实模型与偏好配置
- 角色/世界详情页接入真实编辑逻辑
- 让角色 / 世界观 / 时间线 / 关系资产详情页成为同一内容库上的真实编辑视图，而不是只读投影视图。
- 让 characters / world / editor / analytics 等页面都支持按“项目 -> 小说 -> 资产”层级浏览与过滤。

### Workstream 6 — 异步任务、错误恢复与测试
- 统一任务状态与进度
- 增加用户可见错误提示
- 增加刷新恢复能力
- 补充后端接口测试与前端关键路径 smoke test
- 补工程配置清洁项：确保 Next.js workspace root / 构建 tracing / lockfile 相关警告被显式收口，不把环境噪音留到发布前。
- `outputFileTracingRoot` 已完成落地并通过 lint/build 复验，下一轮可继续回到异步任务恢复、错误提示与 smoke test 硬化。

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
- AI 能按当前项目检索内容库资产，并在用户确认后写回角色 / 世界观 / 时间线 / 关系 / 章节等内容
- 同一项目下支持以书名为入口聚合该书全部资产，避免多本书的角色、世界观、时间线、章节相互混杂
- analytics / settings 为真实页面
- 主导航所有入口都是真功能
- 失败路径可见、可恢复、可诊断
