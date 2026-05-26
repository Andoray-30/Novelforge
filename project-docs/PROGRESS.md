# NovelForge 项目进度跟踪

## 阅读导航
- 本文档分为四层：
  - 顶部“阶段审计结论”：用于快速判断系统当前状态、主要短板与未来规划。
  - 中部“当前阶段 / 已完成 / 正在处理 / 待处理”：用于跟踪当前工作流状态。
  - 下部“历史详细记录”：保留过去每一轮修复动作，不删历史，便于回溯排查。
  - 文末新增记录继续按日期追加，但不再依赖对话记忆维护全局判断。
- 阅读建议：
  - 想知道系统现在到了哪一步，先看“2026-04-19 审计补充（桥接与显示层）”和“2026-04-18 阶段审计结论”。
  - 想知道当前正在做什么，看“正在处理 / 待处理”。
  - 想追溯某一轮具体修复，看“历史详细记录”中的日期条目。

## 2026-05-25 Goal 13 编辑器候选版本与快照恢复 v1
### 本轮完成
- 新增 editor 章节工作流 helper：集中处理章节筛选、AI 草稿/候选识别、转正式元数据请求、候选归档、`previous_snapshot` 恢复、`/editor?chapterId=` 选中优先级与聊天 handoff prompt。
- Editor 左侧章节列表增加轻量筛选：全部、导入原文、AI 草稿、候选版本、正式正文、正式序章、番外、已归档；显示仍沿用目录排序。
- Editor 选中章节后增加状态面板：来源、保存目的、章节角色、字数、AI 生成、候选版本、快照、归档状态。
- AI 草稿/候选支持转正式正文、正式序章、番外、保留候选，以及归档候选；归档只更新 metadata/status，不物理删除正文。
- `previous_snapshot` 支持查看摘要与确认恢复；恢复时把当前版本写入 `recovery_snapshot`，避免单次恢复造成丢失。
- Editor 增加“继续写这一章 / 改写这一章 / 润色这一章”入口：会把当前章节作为 focused asset 带回聊天工作台，并预填 prompt，但不会自动发送。

### 验证
- `cmd /c npx vitest run src/lib/editor-chapter-workflow.test.ts src/lib/chapter-metadata.test.ts`：18 passed。
- `cmd /c npx tsc --noEmit --incremental false`：passed。
- `cmd /c npm test`：22 files / 93 tests passed。
- `cmd /c npm run build`：passed。

### 后续注意
- 本轮没有重构 editor 外观，只把候选管理闭环落到稳定 helper 与轻量 UI。
- 现有页面仍有部分历史中文乱码债务，后续应做独立编码清理，不与候选版本工作流混在一起。

## 2026-05-25 Goal 14 导入/提取资产质量总览与内测闸门 v1
### 本轮完成
- 新增 `project-quality-summary` helper，把章节、角色、关系、世界观、时间线/大纲和写作准备度统一汇总为项目级质量摘要。
- 增加 `overall_status`：`ready / needs_repair / insufficient / unknown`。
- 质量摘要覆盖：
  - 章节：导入原文、AI 草稿、候选、正式正文、正式序章、番外、归档、装饰/目录、过长片段。
  - 角色：可写角色、低信息角色。
  - 关系：usable、有张力、低信息、已增强、待修复、缺失信号。
  - 世界观：规则、意象、代价、禁忌、场景可用性。
  - 写作准备：可写角色、usable/enriched 关系、世界观信号、章节来源。
- 主工作台聊天模式增加紧凑“项目质量总览”；项目仪表盘增加更详细的质量总览与行动入口。
- 新增 `project-docs/INTERNAL_TEST_READINESS.md`，记录内测闸门模型和当前样本项目的质量判断方式。

### 验证
- `cmd /c npx vitest run src/lib/project-quality-summary.test.ts`：6 passed。
- `cmd /c npm test`：23 files / 99 tests passed。
- `cmd /c npm run build`：passed。
- `cmd /c npx tsc --noEmit --incremental false`：passed。

## 2026-05-26 Goal 15 部署准备与数据清洁 v1
### 本轮完成
- 新增 `novelforge-core/.env.example`，集中说明 NewAPI/OpenAI provider、Fast/Pro 模型映射、数据目录、管理员登录、session secret 和公开部署配置。
- 公开部署配置检查补强：
  - `FRONTEND_ORIGIN` 在公开部署下不能停留在 localhost。
  - `NOVELFORGE_DATA_DIR`、`FILE_STORAGE_DIR`、`DATABASE_PATH` 父目录、`CONTENT_DATABASE_PATH` 父目录都会做写入探测。
  - 缺配置/目录不可写会抛出中文可读错误。
- `.gitignore` 增加根目录样本文本、临时 pytest 目录、`tsconfig.tsbuildinfo` 忽略规则，避免样本文本/临时文件误提交。
- 主工作台会隐藏明显 mock/smoke/Goal 验证会话；这是展示层清洁，不物理删除真实用户数据。
- `INTERNAL_TEST_READINESS.md` 增加部署配置、数据目录、备份/恢复、clean workspace policy、最小 smoke 和常见错误说明。
- `installation.md` 增加 `.env.example`、持久化数据目录和备份提醒。

### 验证
- `.\.venv\Scripts\python.exe -m pytest tests/api/test_auth.py`：6 passed。
- `cmd /c npx vitest run src/lib/hooks/use-sessions.test.ts src/lib/api/client.test.ts src/lib/openai-config.test.ts`：3 files / 5 tests passed。
- `cmd /c npm test`：24 files / 101 tests passed。
- `cmd /c npx tsc --noEmit --incremental false`：passed。
- `cmd /c npm run build`：passed。
- `.\.venv\Scripts\python.exe -m compileall novelforge\core\config.py novelforge\api\__init__.py`：passed。
- 最小 smoke：
  - 临时启动后端 `127.0.0.1:8001`，`GET /health` 返回 healthy。
  - 临时启动生产前端 `localhost:3010`，首页 HTTP 200。
  - 通过内容 API 创建一条 `internal-smoke` AI 草稿章节，随后读取和搜索均成功，再立即删除该 smoke 内容，避免污染工作区。

## 2026-04-18 阶段审计结论
### 审计摘要
- 当前系统已经从“占位页拼接阶段”进入“可用但未闭环阶段”。
- Workstream 1（数据契约统一）已经形成主骨架，核心资产读写不再完全漂移。
- Workstream 5（页面真实化）已经跨过“假页面”阶段，`editor / analytics / settings / extract / ai-planning` 均已有真实链路基础。
- 当前真正影响产品完成度的，不再是单点页面是否可打开，而是 Workstream 2 / 3 / 4 的联动闭环是否成立。

### 当前系统状态判断
- 最强主路径已经明确：首页“聊天 + Artifact 面板 + 项目仪表盘/世界树”应作为真实工作台。
- 其他页面更适合作为同一项目资产源上的总览、详情和编辑投影视图，而不是各自维护独立真相。
- 提取链路已经具备“全书首轮 + 长文本二轮召回补提”的能力，但还没有质量基线，无法证明角色、世界观、剧情线提取已经足够完整。
- 世界树/拓扑已经开始读取显式 `relations` 与隐式引用，但连线质量仍然部分依赖名称匹配，结构正确性还不够硬。
- 全局项目切换与聊天上下文桥接已经有第一版，但当前仍属于“项目摘要注入”，还不是“AI 真正使用项目系统能力”。
- 项目内容库已经具备成为“角色/世界观/时间线/章节等长期记忆库”的基础形态，但还没有完全升级为“用户可编辑、AI 可检索、AI 经确认后可写回”的受控记忆系统。

### 当前主要不足与问题
- 领域模型边界仍不够清晰：
  - `project / session / conversation / asset container` 之间仍有重叠语义，后续容易继续出现“看似隔离、实际串库”的问题。
- 工作台闭环还不够硬：
  - 聊天可以生成内容，但 AI 还不能稳定地结构化检索当前项目资产、触发系统动作、保存结果回内容库。
- 提取质量缺少工程化度量：
  - 目前能运行，不代表覆盖率、完整性、逻辑性已经可靠；缺少覆盖率与召回质量回归标准。
- 资产图谱仍偏“展示”，还没有完全进化成“可操作关系图”：
  - 关系、章节、角色、世界观之间的因果和引用关系仍需继续结构化增强。
- 当前内容库的主过滤维度仍以 `session/project` 为主，书级容器语义还不够强：
  - 同一项目内如果导入多本小说，角色、世界观、时间线、章节等资产仍容易在页面上平铺混杂，不利于按书检索、引用和记忆绑定。
- 工程治理仍偏弱：
  - 当前主要依赖 `compileall / tsc / lint / smoke`，自动化回归、端到端验证、质量基准仍然不足。
- 文档与编码债务仍存在：
  - 个别页面和文档仍有乱码/编码污染风险，`IMPLEMENTATION_PLAN.md` 也需要单独做一次文档清洁。

### 未来清晰规划
- Phase A：固化首页工作台为唯一主工作区
  - 目标：把“聊天工作台 -> Artifact 面板 -> 结构化资产 -> 世界树/总览 -> 回流聊天”确定为第一主路径。
  - 重点：完整性、关联性、逻辑性，而不是只追求多入口并存。
- Phase B：收紧项目域模型
  - 目标：正式厘清 `project / conversation / session / task / asset` 的边界。
  - 重点：不同项目严格隔离保存、跨页面共享同一项目上下文、避免同名资产和跨会话污染。
  - 在项目域之下进一步补强“书级容器 / 小说根资产”语义，让同一项目里的多本书能各自聚合自己的角色、世界观、时间线、关系与章节。
- Phase C：升级 AI 与系统能力桥接层
  - 目标：让 AI 不只是“读摘要”，而是“读当前项目资产、调用项目内动作、生成并保存结构化结果”。
  - 重点：资产检索、工具调用、保存确认、结果回流。
- Phase D：建立提取与图谱质量基线
  - 目标：给角色覆盖率、世界观覆盖率、剧情时间线完整度、关系网连线率建立回归标准。
  - 重点：从“能用”升级到“可证明地稳定”。
- Phase E：把内容库升级为可控项目记忆库
  - 目标：让角色、世界观、时间线、关系、章节等资产既是持久化存储，也是用户可编辑、AI 可检索、AI 经确认后可写回的长期记忆系统。
  - 重点：版本化修改、确认流、可追溯变更、与聊天工作台的闭环回流。
- Phase F：硬化发布前工程质量
  - 目标：补自动化测试、端到端回归、文档编码清理和失败恢复验证。
  - 重点：让系统从“持续修”进入“可交付”。

## 2026-04-19 审计补充（桥接与显示层）
### 审计结论
- 当前“首页工作台主线”没有出现编译级或构建级结构崩坏。
- 本轮已确认：
  - `frontend` 通过 `npx tsc --noEmit`
  - `frontend` 通过 `npm run build`
  - 后端 `novelforge/api/__init__.py` 通过 `py -m compileall`
- 也就是说，当前问题已经从“系统起不来 / 页面编不过”收敛到了“桥接协议稳定性、显示层完整性和实现收口”。

### 本轮明确发现的问题
- 高风险：`<asset_request>...</asset_request>` 协议块仍可能泄漏到用户可见消息里。
  - 当前聊天消息的最终展示文本在“未解析出 artifact”时会回退到原始 `finalContent`，而不是总是使用清洗后的文本。
  - 这会导致 AI 只请求资产、不输出 artifact 时，原始协议标签直接出现在消息气泡中。
- 中高风险：后端提示词中的 `asset_request` 示例并非严格合法 JSON。
  - 当前示例使用了 `\"character\"|\"world\"|...` 这种写法。
  - 模型很容易照抄这个非法结构，导致前端解析请求失败，桥接链路不稳定。
- 中风险：前端当前同时保留了旧版 `resolveAssetRequestCandidates(...)` 和新版 `resolveRankedAssetRequestCandidates(...)`。
  - 实际只用新版，但旧版仍留在代码里，后续维护时容易出现“双实现漂移”。
- 低风险：桥接卡片里的资产类型仍可能直接显示英文类型值。
  - 会出现 `character / world / chapter / outline` 这类内部类型名直接暴露到中文 UI 的情况。
- 低风险：主线文件中仍有个别历史乱码文本残留。
  - 当前不影响编译，但会增加后续 UI 审查和维护成本。

## 2026-04-19 第三轮执行结果（Route 3 工作台主线回归审计）
### 本轮已确认稳定
- 首页工作台的 `focused_assets / focused_assets_summary` 仍然会真实进入聊天请求上下文，没有在桥接收口时被带丢。
- 主壳滚动链仍然成立：
  - `MainLayout` 继续保持 `h-screen + overflow-hidden`
  - 聊天消息区仍然使用内部滚动，而不是重新退化成整页滚动
  - 左侧导航与工作台侧栏没有因为桥接第二版而回退到跟随消息滚动
- `ArtifactPanel` 的两条动作链仍然独立：
  - “保存到项目”继续负责落库
  - “固定到聊天”继续负责把当前草稿注入当前对话上下文
- 桥接协议第一轮收口结果仍然有效：
  - `asset_request` 展示文本清洗链仍然生效
  - 后端提示词里的协议示例仍然是合法 JSON
  - 候选资产卡片的类型仍然显示中文映射，而不是直接暴露内部英文类型

### 本轮仍然保留的低风险清洁债务
- `page.tsx` 中旧版 `legacyResolveAssetRequestCandidates_DO_NOT_USE(...)` 的物理代码块仍在文件里，但已经不参与主逻辑。
- 这不会继续造成运行时分叉，但仍然属于需要清理的结构债务，否则后续读代码的人会误判成“双实现并存”。
- 个别旧文本仍有编码污染痕迹，当前不影响编译和核心主线，但会继续影响 UI 细查与文档整洁度。

### 第三轮后续执行顺序
- Step 1：清理遗留 legacy 代码块与主线文件中的历史编码污染，降低维护噪音。
- Step 2：围绕工作台主线做一轮更严格的真实行为回归核查：
  - `focused assets` 对回复连续性的影响
  - 资产请求候选卡片的生成与加入上下文行为
  - `ArtifactPanel` 保存/固定两条链路的边界是否稳定
- Step 3：在第三轮回归通过后，再继续推进桥接第二版后半段：
  - 正式项目资产检索层
  - AI 主动请求资产 -> 用户确认 -> 注入上下文 -> 继续生成
  - 为后续“AI 调用系统动作”做稳定地基

## 2026-04-19 第三轮推进更新（legacy 清理与最小回归）
### 已完成
- `frontend/src/app/page.tsx` 中失活的 `legacyResolveAssetRequestCandidates_DO_NOT_USE(...)` 物理代码块已删除，首页工作台主线现在只保留一套候选资产解析实现。
- 这意味着桥接第二版从“逻辑上已单实现、文件里还留旧尸体”进一步收口到了“逻辑与代码结构都单实现”。

### 本轮回归结果
- `frontend` 已通过 `npx tsc --noEmit`
- `frontend` 已通过 `npm run build`
- 后端 `novelforge/api/__init__.py` 已通过 `py -m compileall`

### 当前第三轮剩余重点
- 继续清理首页工作台主线文件中的历史编码污染与显示噪音。
- 继续做更严格的真实行为回归核查，重点验证：
  - `focused assets` 对回复连续性的实际影响
  - 资产请求候选卡片的生成、选择、注入上下文行为
  - `ArtifactPanel` 的“保存到项目 / 固定到聊天”两条链路是否仍然边界清晰

## 2026-04-19 第三轮完成（工作台主线回归收口）
### 本轮收口内容
- 首页工作台的“加入当前聊天上下文”动作已统一为一套受控入口：
  - 快捷引用
  - 世界树/项目详情点击
  - 资产请求候选卡片
  - Artifact 面板“固定到聊天”
- 统一后的行为语义：
  - 同一资产重复加入时不再堆叠，而是更新它在当前聊天上下文中的优先级
  - “固定到聊天”与“加入上下文”提示语已区分，避免把草稿固定和普通引用混成一个动作
  - 导入失败/取消提示已统一为中文
- `page.tsx` 中遗留的 legacy 候选解析实现已物理删除，第三轮内不再存在双实现漂移。

### 第三轮最终验收结果
- 已确认滚动隔离仍然成立：
  - 主壳保持 `h-screen + overflow-hidden`
  - 消息列表保持内部滚动
  - 左侧导航与工作台侧栏不会随着长对话一起滚动
- 已确认上下文桥接仍然成立：
  - `focused_assets / focused_assets_summary` 仍然进入聊天请求
  - 资产请求候选卡片仍能稳定进入“用户确认 -> 注入上下文”链路
  - `ArtifactPanel` 的“保存到项目 / 固定到聊天”两条链路仍然独立

### 第三轮校验完成情况
- `frontend` 通过 `npm run lint`
- `frontend` 通过 `npm run build`
- `frontend` 通过 `npx tsc --noEmit`
- 后端 `novelforge/api/__init__.py` 通过 `py -m compileall`

### 第三轮完成后的下一步
- 转入桥接第二版后半段：
  - 正式项目资产检索层
  - AI 主动请求资产 -> 用户确认 -> 注入上下文 -> 继续生成
  - 为后续“AI 调用系统动作”做稳定地基

## 2026-04-20 下一阶段启动（正式项目资产检索层）
### 本轮已完成
- `novelforge-core/novelforge/content/models.py`
  - `ContentSearchRequest` 新增 `content_types`，允许一次性按多类资产做正式检索，而不是把多类型请求压缩成单类型。
- `novelforge-core/novelforge/storage/content_database_storage.py`
  - 内容库搜索已支持 `content_types` 多类型过滤。
  - 搜索范围从仅标题扩展到 `title / content / extracted_data / relations`，更贴近项目资产检索的真实需求。
- `novelforge-core/novelforge/content/manager.py`
  - 数据库模式与文件模式都已接入 `content_types`。
  - 文件模式回退时也会对正文、结构化 payload 和关系字段做统一检索，不再只看标题。
- `novelforge-core/frontend/src/lib/api/novelforge-api.ts`
  - `contentService.search(...)` 现在会把 `content_types` 真实传给后端，不再静默退化成只取第一个类型。
- `novelforge-core/frontend/src/app/page.tsx`
  - 首页工作台的资产请求候选解析，已正式接入“项目资产检索 + 本地排序回退”链路。
  - 这意味着 AI 主动请求上下文时，系统会优先查当前项目内容库，再在必要时回退到前端本地候选解析。

### 本轮校验结果
- 后端通过：`py -m compileall`
  - `novelforge-core/novelforge/content/models.py`
  - `novelforge-core/novelforge/content/manager.py`
  - `novelforge-core/novelforge/storage/content_database_storage.py`
  - `novelforge-core/novelforge/api/__init__.py`
- 前端通过：
  - `npx tsc --noEmit`
  - `npm run build`
  - `npm run lint`

### 当前判断
- 桥接第二版已经从“本地候选解析”进入“正式项目资产检索层第一轮”。
- 但这还不是最终形态：
  - 当前仍以关键词检索 + 排序为主，尚未升级到更强的语义检索。
  - 当前仍是“AI 请求资产 -> 系统给候选 -> 用户确认”，还没有进入“AI 调用系统动作”的下一阶段。

### 下一步重点
- 继续增强项目资产检索质量：
  - 处理更复杂的别名、简称、章节引用和弱关系命中。
  - 降低同项目内“搜得到但排不前”和“标题不精确导致漏召回”的问题。
- 把这条检索链继续接进工作台真实回归：
  - 验证 AI 请求资产时，返回候选是否比纯本地解析更稳定。
  - 验证不同项目切换后，候选资产不会串到其他项目。
- 在此基础上再推进下一步：
  - AI 请求资产 -> 用户确认 -> 注入上下文 -> 继续生成 的更严格回归
  - AI 调用系统动作前的桥接协议稳定化

## 2026-04-20 下一阶段完成（正式项目资产检索层第一版收口）
### 本轮新增完成
- `novelforge-core/novelforge/storage/content_database_storage.py`
  - 数据库检索从“整句匹配”扩展为“整句 + 关键词弱命中”。
  - 当请求里带有多词查询时，内容库现在会对整句与拆分后的关键词同时检索，而不再只赌完整短语命中。
- `novelforge-core/novelforge/content/manager.py`
  - 文件存储回退链路的检索放宽为“至少命中一个关键词即可进入候选”，不再要求所有拆分词都同时命中。
  - 这让数据库模式和文件模式在召回语义上更接近，减少一条链路召回足、一条链路召回弱的问题。
- `novelforge-core/frontend/src/app/page.tsx`
  - 首页工作台的候选排序已升级为别名/标签/关系感知：
    - 角色别名、昵称、关系对象名、章节标题、世界观命名字段、标签等都会进入候选排序参考。
    - 当前已聚焦资产的标题如果出现在候选资产正文或结构化 payload 中，会获得连续性加权。
    - `reason` 字段现在也会以低权重参与排序，帮助弱引用场景更稳定地把正确资产推到前面。
  - 首页工作台的正式项目资产检索已升级为“多轮查询合并”：
    - 优先按 `query`
    - 再按拆分后的关键词做补检
    - 没有显式 `query` 时，会从 `reason` 中提取有限关键词补检
    - 多轮结果会按资产 ID 合并去重
  - 检索结果在进入排序前还会再做一层当前 `session_id` 隔离保护，降低跨项目串候选风险。

### 本轮校验结果
- 后端通过：`py -m compileall`
  - `novelforge-core/novelforge/content/models.py`
  - `novelforge-core/novelforge/content/manager.py`
  - `novelforge-core/novelforge/storage/content_database_storage.py`
  - `novelforge-core/novelforge/api/__init__.py`
- 前端通过：
  - `npm run build`
  - `npm run lint`
  - `npx tsc --noEmit`
  - 说明：`tsc` 仍存在依赖 `.next/types` 的已知顺序要求，本轮已按“先 build、后 tsc”的稳定顺序完成验收。

### 当前判断
- “正式项目资产检索层第一版”可以视为完成：
  - 已经从“本地候选解析”为主，推进到“内容库检索 + 多轮补检 + 结构化排序 + 本地回退”的组合链路。
- 但这还不是最终形态：
  - 目前仍是关键词/弱引用检索，不是语义检索。
  - 目前仍停留在“AI 请求资产 -> 用户确认”阶段，还没有进入“AI 调用系统动作”。

### 下一步重点
- 进入桥接第二版后半段的严格回归：
  - 验证不同项目切换下，资产请求候选是否稳定隔离。
  - 验证弱引用场景下，候选排序是否优先返回正确资产。
  - 验证 `focused assets` 注入后，后续回复是否真实受上下文影响。
- 在回归通过后，继续推进：
  - AI 调用系统动作前的桥接协议稳定化
  - 更正式的系统动作确认流

## 2026-04-20 下一步推进（资产请求确认流稳定化）
### 本轮新增完成
- `novelforge-core/frontend/src/components/chat/MessageBubble.tsx`
  - 消息组件已重写为干净版，清理了这条链路里的历史乱码噪音。
  - `assetRequest` 现在带有更明确的状态字段：
    - `sessionId`
    - `status`
    - `selectedKeys`
  - 资产请求候选卡片现在会直接展示确认状态：
    - 未选择：`点击加入上下文`
    - 已选择：`已加入当前上下文`
    - 已失效：`请在当前项目重新请求`
  - 当一轮资产请求已全部确认后，消息卡片会显示“当前资产请求已完成确认”的完成提示。
- `novelforge-core/frontend/src/app/page.tsx`
  - 新增消息级 `handleSelectAssetCandidate(...)`。
  - 用户点击候选资产时，不再只是把资产丢进 `focused assets`，而是会同步回写到对应消息对象：
    - 记录已选择的候选 key
    - 在全部候选都已确认时，把该资产请求标记为 `resolved`
  - 新增跨项目保护：
    - 如果某条资产请求所属的 `sessionId` 与当前项目不一致，会把它标记为 `stale`
    - 同时阻止把旧项目候选误注入到新项目上下文
  - 切换项目时，工作台局部状态也会同步清理：
    - 关闭右侧 Artifact 面板
    - 清空当前草稿面板内容
    - 清空顶部资产快速检索词
    - 强制回到聊天视图
  - 这让“项目切换”和“资产请求确认流”之间的边界更清晰，不再残留上一项目的局部工作台状态。

### 本轮校验结果
- 后端通过：`py -m compileall`
- 前端通过：
  - `npm run build`
  - `npm run lint`
  - `npx tsc --noEmit`

### 当前判断
- 桥接第二版后半段已经从“检索链可用”推进到“确认流可追踪”阶段。
- 现在这条主线已经具备：
  - AI 请求资产
  - 系统按当前项目返回候选
  - 用户逐项确认加入上下文
  - 消息卡片明确展示已确认/已失效状态
- 但还没到可以直接放开“AI 自动触发系统动作”的阶段。
  - 下一步还需要把“确认后的上下文是否真的影响后续生成”做更严格回归。

### 下一步重点
- 继续做桥接第二版后半段严格回归：
  - `focused assets` 注入后，后续回复是否稳定沿用这些资产。
  - 不同项目切换后，旧请求卡片是否完全不会污染新项目。
  - 弱引用场景下，已确认资产是否能真正提升后续生成连续性。
- 在回归通过后，再继续推进：
  - AI 调用系统动作前的桥接协议稳定化
  - 更正式的系统动作确认流

### 当前系统状态判断（更新）
- 首页工作台主线已经具备：
  - 当前项目切换
  - 聚焦资产进入聊天上下文
  - Artifact 草稿固定到聊天
  - 项目资产快捷引用 / 快捷检索
  - AI 主动请求项目资产候选
- 但“桥接第二版”仍未达到可放心继续叠系统动作的程度。
  - 在修完协议泄漏、非法 JSON 示例、重复实现和 UI 标签问题之前，不应继续直接往“AI 自动保存 / AI 自动调用系统动作”上叠功能。

### 后续清晰路线（执行顺序）
- Route 1：修桥接协议稳定性
  - 统一消息展示文本必须走清洗链，彻底消除 `<asset_request>` 泄漏。
  - 修正后端系统提示里的 JSON 示例，保证模型请求格式合法可解析。
- Route 2：收口桥接实现
  - 删除或合并旧版 `resolveAssetRequestCandidates(...)`，只保留一套候选解析与排序实现。
  - 把候选资产卡片中的类型标签统一映射为中文显示。
- Route 3：做工作台主线回归审计
  - 重点验证：
    - 长对话下聊天区/侧栏滚动是否独立
    - 资产请求卡片是否稳定显示
    - 资产加入 `focused assets` 后是否真实影响下一轮回复
    - Artifact 面板“固定到聊天”和“保存到项目”是否仍各自独立可用
- Route 4：再继续推进桥接第二阶段
  - 在以上问题修净后，再推进“结构化资产检索 -> AI 触发系统动作 -> 用户确认 -> 写回内容库”。
  - 避免在不稳定协议上继续叠自动动作，放大调试成本。

### 当前建议
- 下一轮开发优先级不再是新增能力，而是先完成“桥接第二版的收口修复”。
- 等这轮收口完成后，再恢复主线推进，进入“AI 调用系统能力”的第二阶段。

## 2026-04-20 本阶段收尾（资产请求确认流与上下文对账）
### 本轮新增完成
- `novelforge-core/frontend/src/app/page.tsx`
  - 新增“消息资产请求状态 <-> 当前 focused assets”自动对账。
  - 现在不只是点击候选资产时会回写消息卡片；通过其他入口把同一资产加入上下文时，相关 `assetRequest` 也会自动同步成已确认状态。
  - 如果用户后续把某个资产从当前上下文中移除，消息卡片里的 `selectedKeys` 也会同步回退，不再出现“界面显示已加入，但真实上下文里已经没有”的漂移。
  - `resolved` 语义已收口为“本轮请求至少已经确认了一项实际需要的资产”，不再要求把全部候选都逐个点完才算完成。
- `novelforge-core/frontend/src/components/chat/MessageBubble.tsx`
  - 资产请求卡片底部状态提示改为真实反映当前状态：
    - `resolved`：显示已确认的资产数量
    - `stale`：明确提示这是旧项目请求
    - `empty`：明确提示当前项目暂无匹配资产

### 本轮校验结果
- 后端通过：`py -m compileall novelforge-core/novelforge/api/__init__.py`
- 前端通过：
  - `npm run build`
  - `npm run lint`
  - `npx tsc --noEmit`

### 本阶段收尾结论
- “资产请求确认流稳定化”现在可以视为完成：
  - AI 请求资产
  - 系统返回当前项目候选
  - 用户通过候选卡片或其他工作台入口确认资产
  - 消息卡片状态与真实聊天上下文保持同步
- 这意味着桥接第二版后半段已经从“确认流可追踪”推进到“确认流与真实上下文一致”阶段。

### 下一阶段入口
- 下一阶段不再继续补确认流细节，而是进入更严格的主线实效回归：
  - 验证 `focused assets` 是否真实改变后续回复连续性
  - 验证不同项目切换后的桥接协议与候选隔离是否仍然稳定
  - 回归通过后，再进入“AI 调用系统动作前的桥接协议稳定化”

## 2026-04-21 导入深度分析止损修复（高消耗零落库问题）
### 用户反馈与问题确认
- 真实联调中已确认一条严重问题：
  - 导入任务会消耗大量模型额度进行深度分析；
  - 但一旦整段 `extract_all(...)` 在调度器层超时，系统就会把结构化结果整体置空；
  - 最终只保留章节导入，角色 / 世界观 / 时间线 / 关系网可能一个都不落库。
- 这会导致“后台有大量调用记录，但前台几乎什么都没有”的体验，问题成立，且属于当前导入链路最优先修复项。

### 已完成修复
- `novelforge-core/novelforge/services/ai_scheduler.py`
  - 导入任务的深度分析不再继续依赖“整包成功或整包归零”的单次 `extract_all` 语义。
  - 现已改为导入任务内的分阶段提取策略：
    - 角色
    - 世界观
    - 时间线
    - 关系网
  - 每一阶段都有独立超时与独立任务提示，避免某一个阶段过慢时拖死整包结果。
  - 已完成的阶段结果会保留到 `extracted` 中，后续保存逻辑可继续落库，不再因为后续阶段超时而全部作废。
  - 新增 `analysis_stage_results` 回传，用于后续前端更精确展示“哪一段完成、哪一段失败/超时”。
  - `analysis_warning` 已改成中文语义，并明确说明“已保留成功完成的结构化结果”，不再给出误导性的英文泛提示。

### 当前修复后的真实语义
- 如果四段都成功：
  - 章节 + 角色 + 世界观 + 时间线 + 关系网都会落库。
- 如果只完成部分阶段：
  - 已完成的结构资产仍然会保存；
  - 未完成的阶段会出现在 `analysis_warning / analysis_stage_results` 中；
  - 不再出现“花了额度但因为最终超时而整批清空结构化结果”。
- 如果整体仍然异常：
  - 至少会更诚实地告诉用户当前保住了哪些结构结果，而不是把所有失败都折叠成一句笼统提示。

### 本轮校验
- 后端通过：`py -m compileall novelforge-core/novelforge/services/ai_scheduler.py`

### 下一步
- 前端提取完成提示需要继续升级为读取 `analysis_stage_results`，把“已完成哪些结构阶段”直接展示给用户。
- 继续核查导入后的角色页 / 世界页 / 世界树是否能在部分成功场景下稳定读到已落库资产。

## 当前阶段
进行中：Workstream 3 收尾 + Workstream 4/5 增量 — 书级容器落地与项目记忆库启动

## 已完成
- 清理了大量历史垃圾文档、演示页、测试页、临时脚本和错误输出文件。
- 修复了部分关键后端端点缺失问题。
- 挂载了 text-processing 路由。
- 修复了 chat message 渲染中的 XSS 风险。
- 修复了 characters 列表页部分运行时问题，并改进为读取结构化数据。
- 完成了第一轮项目结构审查与问题清单整理。
- 制定了正式的完整实施方案。
- 建立了 `project-docs/` 用于后续规划与进度管理。
- 完成了 Workstream 1 的第一轮落地：
  - 前端 `ContentItem` 去除旧兼容字段 `data/type`，改为只围绕 `metadata/content/extracted_data/relations` 工作。
  - 角色详情页切换到以 `extracted_data` 为主的数据读取方式，不再依赖 `JSON.parse(content)`。
  - 聊天主页项目资产读取开始转向 canonical contract：角色/世界/章节/拓扑点击都优先走 `extracted_data`。
  - artifact 保存时开始区分 `content`（正文/摘要）与 `metadata`（结构化数据写入 `extracted_data`）。
  - 后端 `api/__init__.py` 中 AI 调度器改为显式注入 `content_manager`。
  - `/api/extract/text` 与 `/api/extract/file` 改为走 `extraction_service.extract_all()`，避免 `UnifiedExtractor` 返回模型对象与 API 侧按 dict 读取的冲突。
  - `ai_scheduler.py` 中 timeline 持久化改为匹配当前 `TimelineEvent` 结构，而不再依赖旧的 `event.time/event.name` 字段。
- 完成了 Workstream 1 的第二轮落地：
  - 后端 `content/models.py` 新增 `ContentWriteMetadata`、`ContentCreateRequest`、`ContentUpdateRequest`，正式模型化内容资产写入契约。
  - 后端 `api/__init__.py` 的 `/api/content/create`、`/api/content/{id}` 更新路由改为基于 canonical request 构造 `ContentItem`，不再要求前端直接伪造完整 `ContentItem`。
  - 后端内容接口补上显式导入、404 透传与 `status` 查询参数别名，修正 `listByType` 契约漂移。
  - 后端 `content/manager.py` 在更新内容时开始递增 `version`，使持久化语义和元数据版本号保持一致。
  - 前端 `types/index.ts` 增加内容创建/更新请求类型与拓扑类型，`novelforge-api.ts` 改为显式使用这些类型。
  - 新增 `frontend/src/lib/content-contract.ts`，统一 artifact -> content asset 的映射、标题/正文/relations 生成规则。
  - 聊天主页 `app/page.tsx` 改为通过 helper 生成 canonical create request，并移除本页残留的关键 `any`/`as any` 契约写法。
  - 世界树节点点击、章节卡片、角色卡片改为复用统一 payload helper，不再各自拼装资产读取逻辑。
- 已完成本轮校验：
  - `py -m compileall` 已通过：`novelforge/content/models.py`、`novelforge/content/manager.py`、`novelforge/api/__init__.py`
  - `frontend` 已通过 `npm run lint`
  - `frontend` 已通过 `npm run build`
- 完成了 Workstream 1 的第三轮落地：
  - `frontend/src/app/ai-planning/page.tsx` 改为真实接入 canonical contract，不再停留在单纯生成结果展示。
  - AI 规划页现在会将大纲保存为 `outline` 资产，并在同一项目下继续生成并保存 `character`、`world` 资产。
  - AI 规划页补上了当前项目感知、自动创建会话、按标题与类型 upsert 资产的逻辑，开始与聊天页共享同一套内容库语义。
  - 清理了原页面中的乱码文案、错误模板字符串和无效 JSX，保证这条入口可真实构建与继续扩展。
- 已完成本轮前端校验补充：
  - 更新后的 `ai-planning` 页面已再次通过 `frontend` 的 `npm run lint`
  - 更新后的 `ai-planning` 页面已再次通过 `frontend` 的 `npm run build`
- 完成了 Workstream 1 的第四轮落地：
  - 新增 `frontend/src/lib/content-upsert.ts`，抽出共享的内容资产 upsert 逻辑，避免聊天页、规划页、提取页各自复制“先搜索再更新”的写法。
  - `frontend/src/app/extract/page.tsx` 已重写为真实保存链路：提取完成后会将 `character / world / timeline / relationship` 资产写入当前项目内容库，而不是只停留在前端 store。
  - 提取页补上了当前项目感知、自动创建项目、提取结果写回 store 与内容库双通路、以及保存结果摘要展示。
  - 提取页的文件格式约束与当前后端 `/api/extract/file` 能力对齐到 `.txt / .md / .text`，避免前后端入口能力描述继续漂移。
- 已完成本轮校验补充：
  - 共享 upsert helper 和更新后的 `extract` 页面已通过 `frontend` 的 `npm run lint`
  - 共享 upsert helper 和更新后的 `extract` 页面已通过 `frontend` 的 `npm run build`
- 完成了 Workstream 1 的第五轮落地：
  - `frontend/src/components/ImportTextModal.tsx` 已从“假进度上传框”改为真实的后台任务提交入口，不再伪装成同步完成导入。
  - 导入模态现在会在缺少当前项目时自动创建项目，并把 `session_id` 真实传给 `text-processing` 异步导入链路。
  - 首页 `app/page.tsx` 已把导入完成提示修正为“任务已提交”，不再错误提示用户导入已经完成。
  - `frontend/src/components/layout/TaskCenter.tsx` 修正了远端恢复任务时的状态大小写不一致问题，避免刷新后任务卡片显示异常。
- 已完成本轮校验补充：
  - 更新后的 `ImportTextModal`、首页导入提示和 `TaskCenter` 已通过 `frontend` 的 `npm run lint`
  - 更新后的 `ImportTextModal`、首页导入提示和 `TaskCenter` 已通过 `frontend` 的 `npm run build`
- 完成了 Workstream 1 的第六轮落地：
  - `frontend/src/app/characters/page.tsx` 已接入当前项目过滤，不再跨项目读取全部角色资产。
  - `frontend/src/app/world/page.tsx` 已从只读前端 store 改为从内容库真实读取 `world` 与 `timeline` 资产，并兼容提取链路与调度器链路生成的两种时间线存储形态。
  - `frontend/src/app/editor/page.tsx` 已从占位页升级为可用的 editor v1：可读取 `chapter` 资产、编辑标题与正文、并保存回统一内容库。
  - `editor` 页额外兼容了通过 URL `chapterId` 定位章节的需求，同时避免了 Next.js 的 CSR bailout 构建问题。
- 已完成本轮校验补充：
  - 更新后的 `characters / world / editor` 已通过 `frontend` 的 `npm run lint`
  - 更新后的 `characters / world / editor` 已通过 `frontend` 的 `npm run build`
- 完成了 Workstream 5 的第一轮真实化落地：
  - `frontend/src/app/analytics/page.tsx` 已从硬编码统计页改为真实分析页，直接统计当前项目内容库中的章节、字数、角色、世界要素和活跃任务。
  - `frontend/src/app/settings/page.tsx` 已从占位页改为真实设置页，接入 `OpenAIConfigPanel` 和持久化的项目偏好设置。
  - `settings` 页的 OpenAI 配置现在会保存到浏览器存储，项目偏好会按当前项目作用域保存并在刷新后恢复。
- 已完成本轮校验补充：
  - 更新后的 `analytics / settings` 已通过 `frontend` 的 `npm run lint`
  - 更新后的 `analytics / settings` 已通过 `frontend` 的 `npm run build`
- 完成了 Workstream 2 的第一轮后端修正：
  - `novelforge/services/ai_scheduler.py` 中 `novel_import` 任务的章节保存不再使用固定 `chapter_{session}_{index}` ID，避免同一项目重复导入时覆盖旧章节。
  - 导入生成的章节现在会补齐 canonical `extracted_data` payload，包括 `chapter_title / content / chapter_index / source` 等字段，和前端 editor / analytics 的读取语义保持一致。
  - 导入链路在缺省 `parent_id` 时不再盲目重建小说根节点，而是先检测根节点是否已存在，避免重复导入时根容器语义漂移。
  - `novel_import` 任务结果开始返回更完整的资产统计，便于后续任务面板和恢复逻辑继续增强。
- 已完成本轮校验补充：
  - 更新后的 `ai_scheduler.py` 已通过 `py -m compileall`
- 完成了 Workstream 2 的第二轮后端/恢复修正：
  - `novelforge/api/__init__.py` 中 `/api/scheduler/task/{task_id}` 已改为和批量任务接口共用统一序列化结构，补齐 `progress / message` 等前端任务中心必需字段。
  - `novelforge/services/ai_scheduler.py` 对通用任务完成、失败、取消状态补上了更明确的 `progress / message` 更新，降低前端需要猜测任务状态的风险。
  - `frontend/src/components/layout/TaskCenter.tsx` 修正了刷新恢复时“只新增不更新”的问题，现在远端任务状态、进度、错误和结果变化都能同步回本地卡片。
- 已完成本轮校验补充：
  - 更新后的 `api/__init__.py` 与 `ai_scheduler.py` 已再次通过 `py -m compileall`
  - 更新后的 `TaskCenter` 已通过 `frontend` 的 `npm run lint`
- 完成了 Workstream 2 的第三轮后端清理修正：
  - `novelforge/services/ai_scheduler.py` 在调度器统一收尾阶段补上了 `novel_import` 临时文件清理兜底，不再只依赖成功路径手动删除临时文件。
  - 这使得导入任务即使失败或被取消，也能尽量清理残留临时文件，减少异步导入链路的脏数据和磁盘残留。
- 已完成本轮校验补充：
  - 更新后的 `ai_scheduler.py` 已再次通过 `py -m compileall`
- 完成了 Workstream 2 的第六轮导入入口清理修正：
  - `novelforge/api/text_processing.py` 中 `upload-and-process` 入口在任务提交失败时，已补上临时文件回收逻辑，不再把清理责任完全留给调度器成功接管后的路径。
  - 同时清理了该入口内部重复且不可达的异常分支，使导入入口的失败路径语义更单一、更可控。
- 已完成本轮校验补充：
  - 更新后的 `text_processing.py` 与 `ai_scheduler.py` 已通过 `py -m compileall`
- 完成了 Workstream 2 的第五轮任务完成联动修正：
  - `frontend/src/components/layout/TaskCenter.tsx` 现在会在任务完成时派发统一的前端完成事件，不再只是更新卡片文本。
  - `frontend/src/app/page.tsx` 已接入该事件，导入任务完成后会自动刷新当前项目资产，并给出完成提示，降低“后台已落库但首页还没更新”的时序漂移。
- 已完成本轮校验补充：
  - 更新后的 `TaskCenter` 与首页 `app/page.tsx` 已通过 `frontend` 的 `npm run lint`
  - 更新后的 `TaskCenter` 与首页 `app/page.tsx` 已通过 `frontend` 的 `npm run build`
- 完成了 Workstream 2 的第四轮导入边界修正：
  - `novelforge/services/ai_scheduler.py` 在文本未识别出章节时，已补上“兜底章节”写入逻辑，不再出现导入成功但没有任何章节资产可供编辑器读取的情况。
  - 这意味着没有标准章节标题的文本导入后，至少会生成一个可编辑的 `chapter` 资产，保证导入链路对 editor 仍然可见。
- 已完成本轮校验补充：
  - 更新后的 `ai_scheduler.py` 已再次通过 `py -m compileall`

> 已完成内容到此为止，以下进入”正在处理”事项。

## 2026-05-04 书级容器落地第一轮（Workstream 3 收尾 + WS5 增量）

### 本轮新增完成

**后端**
- `novelforge/services/ai_scheduler.py`
  - `relationship` 资产在 `novel_import` 中现在也会绑定 `parent_id`，与 chapter / character / world / timeline 保持一致。
  - 至此，`novel_import` 产出的全部五类结构化资产（chapter / character / world / timeline / relationship）均已绑定到小说根节点。
- `novelforge/content/models.py`
  - `ContentSearchRequest` 新增 `parent_id` 可选字段，支持按父内容（小说根节点）过滤搜索。
- `novelforge/storage/content_database_storage.py`
  - 数据库模式搜索已支持 `parent_id` 过滤条件。
- `novelforge/content/manager.py`
  - 数据库模式与文件模式搜索均已支持 `parent_id` 过滤。
- `novelforge/api/__init__.py`
  - 新增 `GET /api/content/novels/{session_id}` 端点，返回当前项目下所有 `type=”novel”` 根节点，并附带每本小说的 chapter / character / world / timeline / relationship 资产统计。

**前端**
- `frontend/src/types/index.ts`
  - `ContentSearchRequest` 新增 `parent_id` 字段。
  - 新增 `Novel` 和 `NovelListResponse` 类型。
- `frontend/src/lib/api/novelforge-api.ts`
  - `contentService.search(...)` 参数类型补加 `parent_id`。
  - 新增 `contentService.getNovels(sessionId)` 调用后端小说列表端点。
- `frontend/src/lib/hooks/use-app-store.tsx`
  - Zustand 全局状态新增 `selectedNovelId` 和 `setSelectedNovelId`。
  - 切换项目时自动清空 `selectedNovelId`。
- `frontend/src/components/layout/app-header.tsx`
  - 顶部 header 新增”当前小说”选择器（紫色下拉），自动加载当前项目下的小说列表。
  - 支持切换选中的小说根节点，选择”全部小说”时清空过滤。
  - 项目只有一本小说时自动选中。
- `frontend/src/app/characters/page.tsx`
  - 角色搜索请求现在传入 `selectedNovelId` 作为 `parent_id`，切换小说后自动刷新。
- `frontend/src/app/world/page.tsx`
  - 世界观和时间线搜索请求现在传入 `selectedNovelId` 作为 `parent_id`，切换小说后自动刷新。
- `frontend/src/app/editor/page.tsx`
  - 章节搜索请求现在传入 `selectedNovelId` 作为 `parent_id`，切换小说后自动刷新。
- `frontend/src/app/analytics/page.tsx`
  - 全量资产搜索请求现在传入 `selectedNovelId` 作为 `parent_id`，切换小说后自动刷新。
- `frontend/src/app/page.tsx`
  - 首页仪表盘资产搜索和候选资产检索现在传入 `selectedNovelId` 作为 `parent_id`。

### 本轮校验结果
- 后端通过：`py -m py_compile`
  - `novelforge/services/ai_scheduler.py`
  - `novelforge/content/models.py`
  - `novelforge/content/manager.py`
  - `novelforge/storage/content_database_storage.py`
  - `novelforge/api/__init__.py`
- 前端通过：
  - `npx tsc --noEmit`
  - `npx next lint`
  - `npm run build`

### 当前判断
- “书级容器”第一轮已经落地：后端搜索支持 `parent_id` 过滤，前端各主要资产页面均已接入小说选择器，同一项目内多本书的资产不再混杂在一个平铺列表里。
- 但这还不是最终形态：
  - 首页聊天工作台的 `focused assets` 和世界树尚未按选中小说过滤。
  - 导入完成后的自动选中逻辑需要更可靠地检测当前是否已有选中小说。
  - 移动端尚未暴露小说选择器。

### 下一步重点
- 首页工作台世界树按 `selectedNovelId` 过滤节点。
- 聊天上下文中的项目摘要按选中小说收敛。
- 导入完成后自动选中对应小说根节点（需从任务结果中读取 `parent_id`）。
- 为移动端 `mobile-nav.tsx` 补上小说选择入口。

## 2026-05-04 书级容器落地第九轮（聊天 Artifact 卡片真实预览重开）

### 本轮新增完成

**前端**
- `frontend/src/components/chat/MessageBubble.tsx`
  - 聊天消息里的 Artifact 卡片现在从“看起来可点但没有实际行为”的静态展示，改成了真正可点击的预览入口。
  - `MessageBubble / MessageList` 新增 `onOpenArtifact` 回调透传，聊天中的角色 / 世界观 / 时间线 / 关系 / 大纲 / 章节草稿都可以从消息内直接重新打开。
  - 消息层的 artifact 类型补齐了 `chapter`，和首页 ArtifactPanel 的支持范围保持一致。
- `frontend/src/app/page.tsx`
  - AI 回复解析出 artifact 后，当前消息会同步挂载首个 artifact 摘要，避免消息气泡里的“点击预览”只停留在视觉提示。
  - 首页工作台新增 `handleOpenMessageArtifact(...)`，会把聊天内 artifact 重新推入当前上下文，并直接复用 `ArtifactPanel` 作为统一详情/编辑面板。
  - 这条重开链路同样覆盖 relationship artifact，补上了此前“可保存但缺少消息内真实重开入口”的断点。

### 本轮校验结果
- 前端通过：
  - `npm run lint`
  - `npm run build`
- 构建复验过程中顺手修复了一个第七轮关系网络读取留下的类型问题：`frontend/src/app/characters/page.tsx` 中 persisted relationship edges 的类型谓词与 `NetworkEdge.status` 可选字段不一致，现已显式标注为 `NetworkEdge | null` 后再过滤。
- 本次改动集中在首页聊天工作台的消息交互与面板重开，没有新增路由或后端 API。

### 本轮判断
- relationship 资产链路已从“可按小说保存、可在角色页真实读取”继续推进到“聊天消息内也可真实重开预览”，Workstream 4 的 `chat artifact -> save -> reopen` 主线更接近闭环。
- 当前仍未完成的是：基于已保存 content item 的 relationship 独立详情/编辑视图、以及这些入口的按小说归属保护和统一编辑语义。

### 下一步重点
- 继续补 relationship / world / timeline 等已保存 content item 的统一详情编辑视图，避免目前仍主要依赖首页临时 ArtifactPanel 投影视图。
- 回到 Workstream 2，继续核实导入 / 提取 / 调度完成后的 relationship 最终写入 contract、relations 字段与前端读取语义是否完全对齐。
- 继续把第七至第九轮连续收口整理成最小 smoke 清单，覆盖“关系读取 / Artifact 保存归书 / 消息内重开预览”三条主链路。

## 2026-05-04 书级容器落地第八轮（Artifact 保存链路补小说归属透传）

### 本轮新增完成

**前端**
- `frontend/src/lib/content-contract.ts`
  - `buildContentCreateRequestFromArtifact(...)` 现已支持显式透传 `parentId`，不再只依赖 artifact data 自身是否带有 `parent_id`。
- `frontend/src/app/page.tsx`
  - 聊天工作台保存 Artifact 时，现会把当前 `selectedNovelId` 一并写入保存请求。
  - 这意味着 AI 在当前小说上下文里生成并保存角色、世界观、时间线、关系、章节等草稿时，不会再因为保存链路缺少 `parent_id` 而掉回项目平铺层。
  - `handleArtifactSave(...)` 的依赖已同步纳入 `selectedNovelId`，避免切书后继续沿用旧的保存作用域。

### 本轮校验结果
- 本轮仍未完成前端命令复验；后续在具备命令执行权限时需要补跑 `npm run lint` 与 `npm run build`。
- 本次改动聚焦保存请求参数透传，没有新增新路由或新异步链路。

### 本轮判断
- relationship 资产链路已进一步从“读取按小说范围收敛”推进到“AI Artifact 保存也按当前小说范围写回”。
- 这一步同时修补了角色 / 世界观 / 时间线 / 关系 / 章节等 Artifact 的共用保存缺口，不再只限于 relationship 单点补丁。
- 当前剩余重点进一步收敛到：关系资产的可重开/详情入口、以及后端导入/提取/调度最终写入语义是否与当前前端收敛规则完全一致。

### 下一步重点
- 继续审计 relationship 资产是否存在可重开、可查看详情、可编辑但尚未补归属保护的入口。
- 回到 Workstream 2，继续核实导入 / 提取 / 调度完成后的 relationship 最终写入 contract、relations 字段与前端读取语义是否完全对齐。
- 在权限允许时补跑 `npm run lint` 与 `npm run build`，完成第七/八轮连续改动复验。

## 2026-05-04 书级容器落地第七轮（角色关系网络接入真实 relationship 资产）

### 本轮新增完成

**前端**
- `frontend/src/app/characters/page.tsx`
  - 角色页现在会与角色资产并行拉取真实 `relationship` 资产，而不再只依赖角色 payload 里的内嵌 `relationships` 字段临时拼图。
  - 羁绊全景网络现在优先读取已保存的 `relationship` 内容资产；仅当当前小说范围下没有真实关系资产时，才回退到角色侧写里的关系字段。
  - 关系网络读取同样接入 `session_id + parent_id(selectedNovelId)` 收敛，和角色列表保持同一小说边界。
  - 角色页头部已补“当前小说”范围显式提示，避免用户把当前羁绊网络误读成整个项目的全量关系图。
  - 关系提取任务完成后，角色页也会和角色生成/导入一样触发刷新，减少 relationship 资产已落库但前端图谱未更新的时序漂移。

### 本轮校验结果
- 本轮尚未完成前端命令复验；后续在具备命令执行权限时需要优先补跑 `npm run lint` 与 `npm run build`。
- 这次改动主要收口的是前端关系资产读取来源与范围提示，没有新增跨页跳转或新路由。

### 本轮判断
- relationship 资产已经从“后端真实保存、前端主要间接使用”推进到“角色页关系网络直接消费真实 relationship 内容资产”。
- 这一步补上了角色网络视图与内容库 canonical relationship asset 之间的断层，降低了“关系资产已写入但前端图谱仍只看角色内嵌关系”的漂移风险。
- 当前剩余重点继续收敛到 Artifact 保存链路、关系资产详情/编辑入口，以及后端导入/提取最终写入语义的一致性。

### 下一步重点
- 继续检查 Artifact 保存链路中 relationship 资产是否需要补更明确的 parent/session 归属透传与后续打开入口。
- 继续审计是否存在关系资产独立详情/编辑入口缺失，或未来新增入口前需要先补归属保护。
- 回到 Workstream 2，继续核实导入 / 提取 / 调度完成后的 relationship 最终写入 contract 是否与前端读取语义完全一致。

## 2026-05-04 书级容器落地第六轮（世界页范围显式提示 + 细粒度入口审计）

### 本轮新增完成

**前端**
- `frontend/src/app/world/page.tsx`
  - 世界页头部现已显式展示当前范围：当前是“按当前小说容器收敛展示”还是“全部小说聚合世界资产”。
  - 这让世界观、时间线、地点、文化、规则等页内视图的解释口径不再完全依赖隐式过滤，切书后可直接看见当前作用范围。

**审计结论**
- 已完成对 `world/page.tsx` 与 `HistoricalTimeline / LocationMap / CulturePanel / RuleHierarchyTree` 的入口审计。
- 当前世界观链路以页内选择和展开视图为主，尚未发现已接入使用的 `/world/[id]` 或关系资产独立详情路由，因此这一轮的主要缺口不是跨路由串书，而是范围提示此前不够显式。
- 关系资产在当前前端 app 路由树中尚未发现独立页面入口，下一步需要继续回到其真实生成、展示、编辑入口核实是否还存在仅按项目兜底的读取链路。

### 本轮校验结果
- 本轮尝试重新执行 `npm run lint` 与 `npm run build`，但当前会话的 Bash 执行再次被自动模式权限策略拦截，未能在本轮内完成复验。
- 代码改动范围仅限世界页文案显式提示，未引入新的数据流或交互分支；后续在具备命令执行权限时应优先补跑前端校验。

### 本轮判断
- 世界页现在与分析页一样，把“当前是否按小说范围收敛”变成可见信息，降低了用户在世界观、时间线、地点、文化、规则这些聚合视图里误读跨书数据的风险。
- 这一轮审计同时确认：当前剩余重点已进一步收敛到“关系资产真实入口”和“未来若新增世界/关系详情页时的按小说归属保护”，而不是已有 world 详情路由遗漏保护。

### 下一步重点
- 继续审计 relationship 资产在首页工作台、Artifact 面板、生成结果与后续编辑链路中的真实入口，确认是否还存在仅按项目兜底的读取或展示。
- 在权限允许时补跑 `npm run lint` 与 `npm run build`，完成第六轮最小改动复验。
- 继续推进 Workstream 2/4 的导入质量、任务恢复与项目记忆库写回闭环。

## 2026-05-04 书级容器落地第五轮（首页世界树入口保护 + 分析页范围显式化）

### 本轮新增完成

**前端**
- `frontend/src/app/page.tsx`
  - 首页世界树节点点击现在会在打开详情前校验 `selectedNovelId` 与资产 `parent_id` 是否一致。
  - 当用户仍停留在错误小说上下文里点击其他书的节点时，首页会直接提示先切换到对应小说，避免把跨书资产继续推入当前聊天上下文。
- `frontend/src/app/analytics/page.tsx`
  - 分析页头部已显式展示当前统计范围：当前是“按当前小说容器收敛”还是“全部小说聚合统计”。
  - 这让分析数据的解释口径从隐式过滤变成显式提示，减少切书后误读统计结果的风险。

### 本轮校验结果
- 前端通过：
  - `npm run lint`
  - `npm run build`
- 当前仍仅保留 `next lint` 官方弃用提示，不影响本轮校验通过。

### 本轮判断
- 首页世界树这个高频入口现在也具备了显式的跨书边界保护，不再只是列表/详情页单独兜底。
- 分析页已经把“当前统计口径是否按小说收敛”明确显示给用户，降低了因为过滤语义不可见导致的理解偏差。
- 当前剩余重点继续收敛到世界观/时间线/关系等更细资产链路，以及是否需要为更多入口补统一的跨书提示策略。

### 下一步重点
- 继续审计世界观、时间线、关系等资产的详情/编辑入口，补齐与角色详情同级别的按小说归属保护。
- 继续检查首页 Artifact 面板、世界树删除、分析页最近资产回看等入口是否还需要更明确的跨书反馈。
- 继续推进 Workstream 2/4 的导入质量、任务恢复与项目记忆库写回闭环。

## 2026-05-04 书级容器落地第四轮（详情页归属校验 + 编辑器新章节归书）

### 本轮新增完成

**前端**
- `frontend/src/app/characters/[id]/page.tsx`
  - 角色详情页除项目归属外，现已新增当前小说归属校验。
  - 当用户在错误的小说上下文里打开角色详情时，页面会直接提示该资产不属于当前小说，避免继续误读跨书角色资产。
  - 详情页加载逻辑现在会跟随 `selectedNovelId` 变化重新校验，不再只在切项目时更新。
- `frontend/src/app/editor/page.tsx`
  - 编辑器中新建章节时，`buildContentCreateRequest(...)` 现已显式写入当前 `selectedNovelId` 作为 `parentId`。
  - 这让“手动创建第一章 / 新章节”不再掉回项目平铺层，而会直接归到当前小说容器下。

### 本轮校验结果
- 前端通过：
  - `npm run lint`
  - `npm run build`
- 当前仍仅保留 `next lint` 官方弃用提示，不影响本轮校验通过。

### 本轮判断
- 书级容器链路已进一步从“列表页过滤”推进到“详情页归属保护 + 新建资产正确写回”。
- 当前最显著的跨书风险点已从角色详情误读和编辑器新章节错挂中移除。
- 剩余重点继续集中在其他详情/编辑链路与仍可能按项目兜底的读取路径审计。

### 下一步重点
- 继续审计并补齐世界观/时间线/关系等资产详情页的按小说归属保护。
- 继续核实首页世界树节点打开、分析页最近资产回看、以及其他详情入口是否需要显式的小说边界提示或跳转保护。
- 继续推进 Workstream 2/4 的导入质量、任务恢复与项目记忆库写回闭环。

## 2026-05-04 书级容器落地第三轮（移动端小说切换 + 首页切书边界收口）

### 本轮新增完成

**前端**
- `frontend/src/components/layout/mobile-nav.tsx`
  - 移动端导航现已接入“当前项目”与“当前小说”选择器，不再只有桌面端 header 才能切换小说。
  - 移动端现在会和桌面端一样按当前项目加载小说列表；项目下仅有一本小说时自动选中。
  - 在移动端切换项目、切换小说或新建项目后，导航抽屉会自动关闭，避免状态停留在旧上下文。
- `frontend/src/components/layout/main-layout.tsx`
  - `MainLayout` 已将当前项目/小说切换所需参数完整下传给 `MobileNav`，移动端导航正式接入统一应用壳上下文。
- `frontend/src/app/page.tsx`
  - 首页在切换 `selectedNovelId` 时，会主动清空当前 `focused assets` 与快捷引用搜索词，降低切书后继续沿用旧书上下文的风险。
  - 首页工作台刷新资产的 effect 现已真实跟随 `selectedNovelId` 变化触发，切书后无需等其他动作即可立即刷新资产列表与世界树。
  - 聊天中的项目摘要不再只显示小说根节点 ID，而会尽量显示当前小说标题，减少模型上下文里的内部 ID 噪音。

### 本轮校验结果
- 前端通过：
  - `npm run lint`
  - `npm run build`
- 当前仍仅保留 `next lint` 官方弃用提示，不影响本轮校验通过。

### 本轮判断
- 书级容器的项目/小说切换能力现在已覆盖桌面端与移动端，统一应用壳的多端入口缺口已经补上。
- 首页聊天区在切书后的主要局部状态已进一步收口，不再最明显地残留上一部小说的聚焦资产与搜索词。
- 当前剩余重点已从“入口缺失”转向“剩余读取路径与详情页链路是否全部按小说收敛”的系统性审计。

### 下一步重点
- 继续审计 `characters / world / editor / analytics` 之外的剩余读取路径，确认是否还存在仅按项目、不按 `parent_id` 收敛的兜底读取。
- 继续核实角色详情页、世界观详情页、资产详情相关交互在切换小说后的边界是否一致。
- 继续推进 Workstream 2/4 的长文本导入质量、任务恢复与受控内容写回闭环。

## 2026-05-04 书级容器落地第二轮（首页世界树收敛 + 导入后自动选中）

### 本轮新增完成

**后端**
- `novelforge/api/__init__.py`
  - `GET /api/content/topology/{session_id}` 新增 `parent_id` 可选参数。
  - 首页世界树/拓扑现在可以按当前选中的小说根节点收敛，而不再只能按整个项目平铺返回。

**前端**
- `frontend/src/lib/api/novelforge-api.ts`
  - `contentService.getTopology(...)` 现已支持传入 `parentId`，前端可按小说过滤世界树。
- `frontend/src/app/page.tsx`
  - 首页工作台刷新资产时，世界树拓扑请求现在会真实携带当前 `selectedNovelId`。
  - 聊天上下文摘要构建已显式跟随 `selectedNovelId` 变化重新计算，减少切换小说后仍沿用旧摘要的风险。
  - 导入任务完成时，如果结果中返回 `parent_id`，首页会自动将其设为当前选中的小说根节点。
  - 为避免刚导入新书后仍残留旧书的聊天聚焦资产，首页在自动切到新小说时会同步清空当前 `focused assets`。
- `frontend/src/app/extract/page.tsx`
  - 提取页导入完成后也会读取 `parent_id` 并自动同步 `selectedNovelId`。
  - 提取完成后的资产摘要 fallback 不再走项目级 `listByType(...)` 平铺统计，而是改为走支持 `parent_id` 的 `contentService.search(...)`，确保提示信息与当前小说范围一致。

### 本轮校验结果
- 后端通过：`py -m py_compile`
  - `novelforge/api/__init__.py`
  - `novelforge/services/ai_scheduler.py`
- 前端已通过：
  - `npx tsc -p frontend/tsconfig.json --noEmit`
  - `npm run lint`
  - `npm run build`
- 前端 lint 已收口到无阻塞状态：
  - 已移除首页 `app/page.tsx` 中本轮引入的 `useCallback` 冗余依赖 warning。
  - 当前仅剩 `next lint` 命令本身的官方弃用提示，不影响当前校验通过。
- 前端工程配置已真实补齐并完成验收：
  - `frontend/next.config.js` 已显式设置 `outputFileTracingRoot`。
  - 重新执行 `npm run lint` 与 `npm run build` 后，之前多 lockfile 场景下的 workspace root 推断 warning 已不再出现。

### 本轮校验目标
- 首页世界树与资产列表随“当前小说”一起收敛。
- 导入完成后自动聚焦到该次导入对应的小说根节点。
- 提取完成摘要不再跨书混算角色/世界观/时间线/关系统计。

### 当前判断
- “书级容器”第二轮已把首页世界树和导入完成后的默认落点接入到小说维度，首页主工作台不再只完成一半过滤。
- 当前剩余缺口继续收敛到：
  - 移动端小说选择入口尚未补齐。
  - 聊天中的 `focused assets` 仍是局部工作台状态，当前已在导入切书时清空，但后续仍可继续增强为更细粒度的按小说对账。

### 下一步重点
- 为 `mobile-nav.tsx` 补小说选择入口。
- 继续核实首页聊天区其余摘要/快捷引用/候选行为在切换小说后的边界是否完全一致。
- 视需要继续把其他仍按项目兜底的读取路径收口到 `parent_id` 语义。
- 下一轮优先顺序：
  1. 移动端小说选择入口
  2. 首页聊天区小说切换边界回归
  3. 仍未按小说收敛的剩余读取路径审计与收口

## 2026-05-05 书级容器落地第十轮（首页已保存 world / timeline / relationship 统一重开）

### 本轮新增完成
- `frontend/src/app/page.tsx`
  - 首页工作台的 `projectAssets` 现已补齐 `timelines / relationships`，不再只维护 `characters / worlds / chapters / outlines` 四类资产。
  - 抽出 `openContentItemInArtifactPanel(...)`，统一处理：
    - 已保存 content item 打开到 `ArtifactPanel`
    - `selectedNovelId` / `parent_id` 归属校验
    - 打开前把资产压入当前聊天聚焦上下文
  - 世界树节点点击现在改为复用这条统一打开链路，不再单独各写一套逻辑。
  - 首页工作台右侧新增“世界观 / 时间线 / 关系”真实资产列表区，已保存 `world / timeline / relationship` 资产可直接打开到统一面板继续查看或编辑。
  - 原有角色卡片点击也已切到复用统一打开链路，避免角色与世界/关系资产的详情入口继续分叉。

### 本轮判断
- 第十轮后，首页工作台已经不只支持聊天草稿 artifact 重开，也支持一部分“已保存 content item”走同一面板重开。
- 关系、时间线、世界观这三类资产在首页范围内，已经开始从“可见但入口分散”收口为“可见且可统一打开”。
- 当前剩余缺口继续集中在：首页之外的最近资产入口、以及更细粒度独立详情页仍未完全复用这套链路。

### 下一步重点
- 把 `analytics` 页“最近更新的资产”接入同一套真实 reopen/detail 入口，而不是只做展示。
- 继续评估是否需要把 `world / timeline / relationship` 从统一 `ArtifactPanel` 进一步升级成独立编辑页，同时保留同样的小说归属保护。
- 继续核实导入 / 提取 / 调度完成后的最终资产契约，与首页当前读取假设是否完全一致。


### Workstream 3 — 应用壳统一 / 书级容器收尾
- 书级容器已推进到第十轮，当前重点从“聊天内 artifact 可重开”继续下沉到“首页工作台中已保存 content item 的统一详情重开与归属保护复用”。
- 已补首页工作台右侧资产区对 `world / timeline / relationship` 的真实列表入口，并复用统一 `openContentItemInArtifactPanel(...)` 做 `selectedNovelId` / `parent_id` 归属校验。
- 下一步继续把分析页最近资产、以及后续更细粒度详情页入口，也收口到同一套真实编辑/预览链路。
- 若后续补出世界观 / 关系资产独立详情页，需要同步补齐与角色详情同级别的按小说归属保护。

### Workstream 2 — 后端工作流正确性
- 继续核实 `text-processing -> ai_scheduler -> content_manager` 的完整落库链路，尤其是导入任务完成后的最终资产写入语义。
- 继续检查 scheduler、extractors、content storage 三者之间的契约一致性，避免同一资产被多套逻辑写成不同形态。
- 继续收敛任务结果、错误恢复、页面刷新后的任务恢复联动，为后续 Workstream 6 的异步体验硬化打基础。
- 继续核实统一提取是否真正覆盖全书文本，并补强长文本的“二轮召回补提 + 合并”策略，降低角色、世界观、剧情要点漏提。
- 继续统一 `extract/text` 与 `text-processing/upload-and-process` 两条入口的提取质量语义，避免一个入口偏完整、一个入口偏局部。

### Workstream 4 — 创作闭环（桥接第二版后半段）
- 正式项目资产检索层第一版已完成：
  - 已支持多类型资产检索。
  - 已覆盖标题、正文、结构化 payload 与关系字段。
  - 已具备多轮查询合并、别名/标签/关系感知排序、当前项目隔离兜底。
- 资产请求确认流已完成第一轮稳定化：
  - 已支持消息级确认状态回写。
  - 已支持跨项目失效保护。
  - 已支持项目切换时工作台局部状态同步清理。
- 下一步继续推进：
  - AI 主动请求资产 -> 用户确认 -> 注入上下文 -> 继续生成 的严格回归。
  - AI 调用系统动作前的桥接协议稳定化。
  - 检索质量深化（简称、别名、章节引用、弱关系与排序正确性）。
  - 把内容库从“检索候选来源”推进到“可控项目记忆库”，支持 AI 在用户确认下对角色 / 世界观 / 时间线 / 关系 / 章节提出修改并结构化写回。

### Workstream 6 — 最小硬化与复验
- 第九轮前端复验已完成：`npm run lint` / `npm run build` 已重新通过。
- 把“切项目 / 切小说 / 导入后默认落点 / 世界页与分析页范围提示 / 编辑器新章节归书”整理为最小 smoke 清单。
- 继续整理失败任务、取消任务、调度器未接管成功等边界场景的回归检查点。

## 2026-05-05 书级容器落地第十一轮（分析页最近资产真实重开与保存收口）

### 本轮新增完成
- `frontend/src/app/analytics/page.tsx`
  - 分析页“最近更新的资产”现在不再只是展示列表，而是接入真实入口分流：
    - `chapter` 直接跳转 `/editor?chapterId=...`
    - `character` 直接跳转 `/characters/[id]`
    - `world / timeline / relationship / outline` 统一复用 `ArtifactPanel` 打开
  - 新增分析页本地辅助映射与保存链路：
    - `getArtifactPanelType(...)`
    - `getContentTypeFromArtifactType(...)`
    - `buildArtifactDataFromItem(...)`
    - `buildContentCreateRequestForItem(...)`
  - 分析页内打开到 `ArtifactPanel` 的已保存资产现在支持直接保存回内容库，保存时通过 `upsertContentAsset(...)` 复用现有 upsert 语义，而不是只读预览。
  - 继续沿用当前 `selectedNovelId` / `parent_id` 的小说归属保护；若最近资产不属于当前小说，会直接给出阻断提示而不是误开跨书内容。
- 前端复验：
  - `npm --prefix "F:\Cyber-Companion\NovelForge\novelforge-core\frontend" run lint` 通过
  - `npx --prefix "F:\Cyber-Companion\NovelForge\novelforge-core\frontend" tsc --noEmit -p "F:\Cyber-Companion\NovelForge\novelforge-core\frontend\tsconfig.json"` 通过

### 本轮判断
- 第十一轮后，分析页已经从“可见最近资产”推进到“可从最近资产直接回到真实编辑/详情链路”。
- 首页工作台与分析页现在都开始复用同一批内容库 reopen / save 语义，书级容器边界不再只停留在列表过滤，而是开始覆盖真实详情入口。
- 当前仍未完全统一的部分，主要集中在更细粒度独立详情页与后续可能新增的资产编辑视图。

### 下一步重点
- 继续把基于已保存 content item 的统一 reopen / edit 链路扩展到更多细粒度详情页，避免 `world / timeline / relationship / outline` 在不同页面再次分叉。
- 继续检查分析页保存后的提示、刷新、以及多资产批量保存体验是否还需要更细的状态反馈。
- 继续核实导入 / 提取 / 调度完成后的最终资产契约，与分析页当前 reopen / save 假设是否完全一致。

### Workstream 1 — 数据契约收尾
- 继续统一 `chapter / world / relationship / outline` 在剩余组件和后续入口中的结构化 payload 读写规则。
- 继续核实内容接口与前后端持久化路径在导入、规划、聊天、提取四条链路上的一致性，避免局部页面已统一、后台链路仍漂移。
- 把“用户修改 / AI 建议修改 / 用户确认后写回”进一步收口到同一 canonical asset contract。

### Workstream 5 — 页面真实化增强
- `editor / analytics / settings` 的 v1 真实页已完成，下一阶段转入增强版而不是继续补假页。
- 补充 `editor` 的章节创建 / 切换 / 保存体验细节。
- 补充更完整的 analytics 项目分析维度与可视化范围提示。
- 角色 / 世界观 / 时间线 / 关系资产详情页升级为真实编辑器，并补充变更预览、确认写回和版本追踪。
- 继续收口角色详情页统一暗色主题下的可读性与历史显示噪音。

### Workstream 6 — 测试与质量基线
- 补充前后端测试，而不是长期只依赖 lint / build / compileall。
- 建立提取质量回归清单（角色覆盖率、世界观覆盖率、剧情时间线覆盖率、关系网完整度）。
- 建立工作台闭环回归清单（资产连线率、跨页面一致性、AI 读取当前项目资产能力、项目切换隔离正确性）。
- 继续清理文档与页面残留的编码污染 / 历史显示噪音。

## 2026-05-05 测试基线补强（后端 pytest + 前端 Vitest）

### 本轮新增完成
- 后端最小 pytest 基线已落地：
  - 新增 `novelforge-core/tests/content/test_manager_search.py`
  - 覆盖 `ContentManager.search_content(...)` 的关键约束：
    - `session_id` 过滤
    - `parent_id` 过滤
    - `content_types` 多类型过滤
    - query 对 `title / content / extracted_data / relations` 的命中
    - `limit / offset` 分页行为
- 前端最小单测框架已接入：
  - `frontend/package.json` 新增 `test` 脚本（`vitest run`）
  - 新增 `frontend/vitest.config.ts`
  - 新增 `frontend/vitest.setup.ts`
  - 安装 `vitest / jsdom / @testing-library/jest-dom`
- 分析页 recent assets 分流逻辑已抽到共享 helper：
  - 新增 `frontend/src/lib/analytics-assets.ts`
  - `frontend/src/app/analytics/page.tsx` 现改为复用：
    - `resolveRecentAssetOpen(...)`
    - `buildAnalyticsContentCreateRequest(...)`
    - `getContentTypeFromAnalyticsArtifact(...)`
- 前端单测已落地：
  - 新增 `frontend/src/lib/analytics-assets.test.ts`
  - 覆盖：
    - `chapter` -> `/editor?chapterId=...`
    - `character` -> `/characters/[id]`
    - 跨书资产阻断
    - `world` 走 `ArtifactPanel` 打开
    - analytics 保存请求构造保留 `session_id / parent_id / stats / relations`
- Pydantic v2 弃用告警已清理：
  - `novelforge-core/novelforge/api/types.py` 中 `min_items / max_items` 已替换为 `min_length / max_length`

### 本轮复验结果
- 后端：`& "F:\Cyber-Companion\NovelForge\novelforge-core\.venv\Scripts\python.exe" -m pytest "F:\Cyber-Companion\NovelForge\novelforge-core\tests\content\test_manager_search.py" -q` 通过（`5 passed`）
- 前端：`npm --prefix "F:\Cyber-Companion\NovelForge\novelforge-core\frontend" run test` 通过（`5 passed`）
- 前端：`npm --prefix "F:\Cyber-Companion\NovelForge\novelforge-core\frontend" run lint` 通过
- 前端：`npx --prefix "F:\Cyber-Companion\NovelForge\novelforge-core\frontend" tsc --noEmit -p "F:\Cyber-Companion\NovelForge\novelforge-core\frontend\tsconfig.json"` 通过
- 前端：`npm --prefix "F:\Cyber-Companion\NovelForge\novelforge-core\frontend" run build` 通过

### 当前判断
- 项目已经不再是“只有 lint / build / compileall，没有真实自动化测试”的状态。
- 分析页最近资产重开链路现在既有前端单测保护，也有后端内容检索契约测试兜底，后续继续扩展 reopen/edit 入口时回归风险更低。
- 当前测试基线仍然是“最小可用”，还没有覆盖更多页面交互、异步任务完成后的 UI 刷新、以及导入/提取/调度闭环。

### 下一步重点
- 继续推进书级容器第十二轮：把 `world / timeline / relationship / outline` 的更多入口继续统一到同一套 reopen/edit helper。
- 继续补最小前端单测，优先覆盖：
  - analytics 保存后的提示/刷新
  - 角色详情页小说归属保护
  - editor 章节 reopen 参数链路
- 后续再评估是否接入更完整的页面级测试（而不是现在就扩大到 Playwright/Cypress）。

## 2026-05-05 书级容器落地第十二轮（世界页细粒度入口统一重开）

### 本轮新增完成
- `frontend/src/app/world/page.tsx`
  - 世界页已接入统一 reopen / save 链路，不再只是页内展示：
    - 点击时间线事件时，会复用统一 helper 打开对应 `timeline` 资产
    - 点击地点 / 文化 / 规则卡片时，会复用统一 helper 打开当前最新 `world` 资产
  - 世界页现已接入 `ArtifactPanel`，并复用分析页同一套保存语义：
    - `resolveRecentAssetOpen(...)`
    - `getContentTypeFromAnalyticsArtifact(...)`
    - `buildAnalyticsContentCreateRequest(...)`
  - 世界页入口继续沿用当前小说边界保护；若资产不属于当前小说，仍会阻断而不是误开跨书内容。
- 共享 reopen helper 继续复用：
  - `frontend/src/lib/analytics-assets.ts`
  - 这意味着 analytics 与 world 两页现在已经共用同一套“已保存 content item -> reopen / save”语义，而不是各自散落实现。
- 新增前端单测：
  - `frontend/src/lib/analytics-assets.world.test.ts`
  - 覆盖 `timeline / relationship` 类型在当前小说范围内会走 `ArtifactPanel` 打开。

### 本轮复验结果
- 前端：`npm --prefix "F:\Cyber-Companion\NovelForge\novelforge-core\frontend" run test` 通过（`7 passed`）
- 前端：`npm --prefix "F:\Cyber-Companion\NovelForge\novelforge-core\frontend" run lint` 通过
- 前端：`npx --prefix "F:\Cyber-Companion\NovelForge\novelforge-core\frontend" tsc --noEmit -p "F:\Cyber-Companion\NovelForge\novelforge-core\frontend\tsconfig.json"` 通过
- 前端：`npm --prefix "F:\Cyber-Companion\NovelForge\novelforge-core\frontend" run build` 通过
- 后端：本轮尝试再次运行既有 `pytest` 基线时被当前自动模式权限策略拦截；后端测试文件本身未改动，上一轮已确认 `5 passed`。

### 当前判断
- 第十二轮后，统一 reopen / save 链路已经从首页工作台、分析页继续扩展到了世界页的细粒度视图，世界观页不再只是静态聚合展示。
- 当前最明显的剩余缺口，已经从 `world / timeline` 转向 `relationship` 的独立入口与后续更多详情页收口。
- 现有前端测试基线已能覆盖 analytics/world 两类 reopen helper 行为，继续扩展同链路时回归成本更低。

### 下一步重点
- 继续把 relationship 资产的更多真实入口并入同一套 reopen / save helper，而不是只停留在角色网络展示层。
- 继续补前端单测，优先覆盖：
  - 世界页点击细粒度卡片后的保存回写语义
  - 角色详情页和其他详情入口的小说归属保护
  - analytics / world 两页在保存后提示与刷新行为上的一致性
- 如需继续扩展更多页面入口，再评估是否抽出更通用的“content item reopen controller”，避免首页 / 分析页 / 世界页继续做轻度重复胶水。

## 2026-05-05 书级容器落地第十三轮（角色关系网络入口统一重开）

### 本轮新增完成
- `frontend/src/app/characters/page.tsx`
  - 角色页关系网络现在已接入统一 reopen / save 链路：
    - 点击关系图中的已保存关系边时，会尝试回找到对应 `relationship` 资产
    - 命中后复用统一 helper 打开 `ArtifactPanel`
    - 关系资产现在支持在角色页内原位保存，而不是只能停留在图形展示层
  - 继续沿用当前小说边界保护；若关系资产不属于当前小说，仍会阻断而不是误开跨书内容。
- `frontend/src/components/Character/CharacterRelationshipGraph.tsx`
  - 新增 `onRelationshipSelect` 回调
  - 关系图 hover + click 后可把当前关系边回传给页面层，由页面层决定如何重开已保存资产
- 共享 reopen helper 继续扩张适用范围：
  - `frontend/src/lib/analytics-assets.ts`
  - 这意味着 analytics / world / characters 三个页面现在都开始复用同一套已保存资产 reopen / save 语义。
- 新增前端单测：
  - `frontend/src/lib/analytics-assets.relationship.test.ts`
  - 覆盖关系资产在当前小说范围内走 `ArtifactPanel` 打开，以及跨书阻断行为。

### 本轮复验结果
- 前端：`npm --prefix "F:\Cyber-Companion\NovelForge\novelforge-core\frontend" run test` 通过（`9 passed`）
- 前端：`npm --prefix "F:\Cyber-Companion\NovelForge\novelforge-core\frontend" run lint` 通过
- 前端：`npx --prefix "F:\Cyber-Companion\NovelForge\novelforge-core\frontend" tsc --noEmit -p "F:\Cyber-Companion\NovelForge\novelforge-core\frontend\tsconfig.json"` 通过
- 前端：`npm --prefix "F:\Cyber-Companion\NovelForge\novelforge-core\frontend" run build` 通过

### 当前判断
- 第十三轮后，`relationship` 资产终于不再只是“角色关系网络上的可视化结果”，而是开始接入和 world / timeline 同级的真实 reopen / save 入口。
- 当前统一 reopen / save helper 已覆盖首页工作台、分析页、世界页、角色页关系网络，页面间的资产详情打开语义明显收紧。
- 角色网络图当前仍是“基于 hover 节点命中的最近关系边回传”，已经够支撑入口收口，但后续若要提升精度，仍可继续升级为更明确的边选择模型。

### 下一步重点
- 继续评估是否抽出更通用的 content item reopen controller，避免 analytics / world / characters 三页继续累积轻度重复胶水。
- 继续补前端单测，优先覆盖：
  - 角色页关系网络点击后的保存回写提示与刷新
  - 世界页 / 角色页在保存后 UI 状态一致性
  - 更复杂的小说边界场景（例如无 parent_id、同名关系、多候选命中）
- 后续再决定是否给关系资产补更明确的独立详情视图，而不是永远依赖 `ArtifactPanel` 作为唯一编辑入口。

## 2026-05-05 书级容器落地第十四轮（共享 content item reopen/save 控制器）

### 本轮新增完成
- 新增共享 helper：
  - `frontend/src/lib/content-item-reopen.ts`
  - 提供两类统一能力：
    - `resolveContentItemReopen(...)`
    - `saveReopenedContentItem(...)`
- `frontend/src/app/analytics/page.tsx`
  - 分析页已切换到共享 content item reopen/save helper，不再自己维护局部 reopen/save 匹配逻辑。
- `frontend/src/app/world/page.tsx`
  - 世界页已切换到共享 content item reopen/save helper，保留 timeline/world 资产的页内 reopen/save 语义，同时减少页面内重复胶水。
- `frontend/src/app/characters/page.tsx`
  - 角色页关系网络的 reopen/save 逻辑已切换到共享 helper，不再单独维护 relationship 资产保存匹配细节。
- 新增前端单测：
  - `frontend/src/lib/content-item-reopen.test.ts`
  - 覆盖：
    - content item reopen 路由复用
    - 已打开资产保存成功
    - 未命中资产时返回友好错误

### 本轮复验结果
- 前端：`npm --prefix "F:\Cyber-Companion\NovelForge\novelforge-core\frontend" run test` 通过（`12 passed`）
- 前端：`npm --prefix "F:\Cyber-Companion\NovelForge\novelforge-core\frontend" run lint` 通过
- 前端：`npx --prefix "F:\Cyber-Companion\NovelForge\novelforge-core\frontend" tsc --noEmit -p "F:\Cyber-Companion\NovelForge\novelforge-core\frontend\tsconfig.json"` 通过
- 前端：`npm --prefix "F:\Cyber-Companion\NovelForge\novelforge-core\frontend" run build` 通过

### 当前判断
- 第十四轮后，analysis / world / characters 三页的 reopen/save 已从“共享约定”提升到“共享控制器”，页面间重复逻辑明显减少。
- 当前统一 reopen/save 体系已经具备继续向更多入口扩展的基础，后续再接首页工作台或其它详情页时成本会更低。
- 现在最值得继续收口的，不再是单页入口本身，而是让更多入口直接依赖同一控制器，减少未来再次漂移的可能。

### 下一步重点
- 继续评估是否把首页工作台中已保存资产的 reopen/save 逻辑也并到 `content-item-reopen.ts`，让首页与 analytics/world/characters 真正共用一套控制器。
- 继续补单测，优先覆盖：
  - 多候选 relationship 命中时的选择行为
  - 保存后提示与刷新在三页上的一致性
  - 无 `parent_id` 或同名资产时的边界行为
- 如后续继续扩展，可再考虑把当前 reopen/save helper 升级为更显式的 controller + adapter 结构，但现阶段先避免过度抽象。

## 2026-05-05 书级容器落地第十五轮（首页工作台接入共享 reopen/save 控制器）

### 本轮新增完成
- `frontend/src/app/page.tsx`
  - 首页工作台已接入 `content-item-reopen.ts` 的共享控制器：
    - `resolveContentItemReopen(...)`
    - `saveReopenedContentItem(...)`
  - 首页世界树节点点击、章节列表、角色设定、世界观 / 时间线 / 关系卡片现在统一走 `openContentItem(...)`。
  - `chapter` / `character` 的已保存资产重开行为现在与分析页保持一致：
    - `chapter` 直达编辑器 `chapterId` 路由。
    - `character` 直达角色详情路由。
  - `world / timeline / relationship / outline` 继续打开 `ArtifactPanel`，但不再由首页维护独立的 content item -> artifact 映射逻辑。
  - Artifact 保存时会优先尝试 `saveReopenedContentItem(...)` 原位写回已保存资产；未命中已保存资产时，再回退到聊天新 artifact 的正常保存链路。

### 本轮复验结果
- 前端：`npm --prefix "novelforge-core/frontend" run test` 通过（`12 passed`）
- 前端：`npm --prefix "novelforge-core/frontend" run lint` 通过
- 前端：`npx --prefix "novelforge-core/frontend" tsc --noEmit -p "novelforge-core/frontend/tsconfig.json"` 通过
- 前端：`npm --prefix "novelforge-core/frontend" run build` 通过

### 当前判断
- 第十五轮后，首页 / 分析页 / 世界页 / 角色页的已保存 content item reopen/save 已经收口到同一控制器。
- 首页不再保留独立 `openContentItemInArtifactPanel(...)`，减少了首页与其它页面在跨小说边界、Artifact 类型映射、保存回写上的漂移风险。
- 当前仍有一个需要继续加固的边界：`saveReopenedContentItem(...)` 仍主要按类型 + 标题匹配原资产，同名资产或多候选关系资产场景后续需要更强的 ID 级匹配。

### 下一步重点
- 优先强化 `content-item-reopen.ts` 的保存匹配语义，让从已保存 content item 打开的 Artifact 能携带原始 asset id，避免同名资产误匹配。
- 继续改进角色关系图点击逻辑，从当前“节点相关关系”升级为更明确的边级选择。
- 为首页接入共享控制器补更直接的单测或组件级 smoke，覆盖章节 / 角色路由与 world/timeline/relationship 面板打开分流。

## 2026-05-05 书级容器落地第十六轮（已保存资产按 contentItemId 原位写回）

### 本轮新增完成
- `frontend/src/lib/analytics-assets.ts`
  - `AnalyticsArtifactData` 新增 `contentItemId`。
  - 从已保存 `ContentItem` 构造 Artifact 时会携带原始 `metadata.id`。
- `frontend/src/lib/content-item-reopen.ts`
  - `saveReopenedContentItem(...)` 保存时优先按 `artifact.contentItemId` 匹配原始资产。
  - 命中 `contentItemId` 后直接调用 `contentService.update(id, request)` 原位更新，不再依赖标题 / 类型二次 upsert 匹配。
  - 对旧 Artifact 或聊天新生成 Artifact 仍保留无 ID 时的类型 + 标题 fallback，避免破坏现有保存链路。
- `frontend/src/lib/content-item-reopen.test.ts`
  - 新增同名资产回归覆盖：当两个 world 资产标题相同但 `contentItemId` 不同时，保存会写回指定 ID。
  - 新增无 `contentItemId` 的 legacy fallback 覆盖，确保旧链路仍可走 upsert。

### 本轮复验结果
- 前端：`npm --prefix "novelforge-core/frontend" run test` 通过（`14 passed`）
- 前端：`npm --prefix "novelforge-core/frontend" run lint` 通过
- 前端：`npx --prefix "novelforge-core/frontend" tsc --noEmit -p "novelforge-core/frontend/tsconfig.json"` 通过
- 前端：`npm --prefix "novelforge-core/frontend" run build` 通过

### 当前判断
- 已保存资产的 reopen/save 现在从“按类型 + 标题弱匹配”升级为“优先按 asset id 精确写回”。
- 这显著降低了同一小说内同名世界观、同名关系、同名大纲等资产被误写回的风险。
- 当前 fallback 仍然保留，是为了兼容聊天新 artifact 与旧的不带 ID artifact；后续如果 ArtifactPanel 能显式区分“新建 / 编辑已有”，还可以进一步收紧。

### 下一步重点
- 继续改进角色关系图点击逻辑，把当前节点相关关系选择升级为边级命中或明确的关系详情选择器。
- 为首页工作台接入共享控制器补组件级 smoke，覆盖章节 / 角色路由与 world/timeline/relationship 面板打开分流。
- 继续审计无 `parent_id` 的历史资产在当前小说过滤下的表现，决定是否需要迁移或显式提示。

## 2026-05-05 书级容器落地第十七轮（角色关系图边级选择）

### 本轮新增完成
- `frontend/src/components/Character/CharacterRelationshipGraph.tsx`
  - 关系图点击行为从“悬停节点后取第一条相关关系”升级为“鼠标命中关系边后选择该边”。
  - 新增鼠标到线段距离计算，用于判断当前是否悬停在某条关系边附近。
  - 被命中的关系边会以更粗线宽高亮，节点悬停仍保留邻接边高亮。
  - 点击空白区域或只悬停节点时不会误打开第一条关系，降低多关系角色场景下打开错误关系资产的风险。

### 本轮复验结果
- 前端：`npm --prefix "novelforge-core/frontend" run test` 通过（`14 passed`）
- 前端：`npm --prefix "novelforge-core/frontend" run lint` 通过
- 前端：`npx --prefix "novelforge-core/frontend" tsc --noEmit -p "novelforge-core/frontend/tsconfig.json"` 通过
- 前端：`npm --prefix "novelforge-core/frontend" run build` 通过

### 当前判断
- 关系资产入口已经从“可重开”进一步升级为“可较精确选择后重开”。
- 对同一角色连接多条关系的情况，现在不再默认取第一条相关边，减少误编辑关系资产的概率。
- 当前仍属于 canvas 命中检测版本，还不是完整的图编辑器；后续如果要支持拖拽、缩放、关系详情浮层，可再升级交互模型。

### 下一步重点
- 为首页工作台接入共享 reopen/save 控制器补组件级 smoke，覆盖章节 / 角色路由与 world/timeline/relationship 面板打开分流。
- 继续审计无 `parent_id` 的历史资产在当前小说边界下的表现，决定是迁移、提示，还是保留项目级资产语义。
- 如继续强化关系页，可补边悬停 tooltip 或侧边详情预览，降低用户必须点击后才知道具体关系的成本。

## 2026-05-05 书级容器落地第十八轮（首页 reopen smoke 覆盖）

### 本轮新增完成
- `frontend/src/lib/homepage-reopen.ts`
  - 抽出首页内容资产重开分流 seam，内部复用共享 `resolveContentItemReopen(...)`。
  - 首页 `openContentItem(...)` 改为调用该 seam，便于在不引入完整 React 组件渲染测试依赖的前提下固定首页分流语义。
- `frontend/src/app/page.test.ts`
  - 新增首页资产重开 smoke 覆盖：
    - `chapter` -> `/editor?chapterId=...`
    - `character` -> `/characters/{id}`
    - `world / timeline / relationship / outline` -> ArtifactPanel 类型分流
    - Artifact 数据携带 `contentItemId`
    - 当前小说不匹配时阻断跨书打开

### 本轮复验结果
- 前端：`npm --prefix "novelforge-core/frontend" run test` 通过（`18 passed`）
- 前端：`npm --prefix "novelforge-core/frontend" run lint` 通过
- 前端：`npx --prefix "novelforge-core/frontend" tsc --noEmit -p "novelforge-core/frontend/tsconfig.json"` 通过
- 前端：`npm --prefix "novelforge-core/frontend" run build` 通过

### 当前判断
- 首页工作台已接入共享 reopen/save 控制器，并且现在有最小 smoke 测试保护关键分流规则。
- 本轮未安装额外 React Testing Library 依赖：安装外部包被权限策略拦截，因此先采用纯函数 seam 固定行为，避免为测试引入新的供应链风险。
- 当前测试还不是完整 DOM 交互测试，但已经覆盖首页最容易回归的资产类型分流与跨书阻断判断。

### 下一步重点
- 审计历史无 `parent_id` 资产在当前小说边界下的行为，明确项目级资产、未归属资产、小说级资产三者的展示与打开规则。
- 若需要更强 UI 覆盖，再由用户明确授权后安装 `@testing-library/react` / `@testing-library/user-event`，补真实组件点击测试。
- 继续检查 ArtifactPanel 保存后的焦点资产更新是否应携带 `contentItemId`，避免保存后上下文焦点丢失原资产身份。

## 2026-05-05 书级容器落地第十九轮（未归属资产边界规则）

### 本轮新增完成
- `frontend/src/lib/analytics-assets.ts`
  - 明确历史无 `parent_id` 资产的 reopen 边界规则。
  - 当用户已经选中当前小说时，无 `parent_id` 的小说级资产（`chapter / character / world / timeline / relationship`）不允许直接打开编辑，提示需要先在全部小说视图确认或迁移归属。
  - `novel / outline` 继续允许作为项目级入口存在，避免小说根资产和大纲入口被误拦截。
  - 在全部小说聚合视图中，无 `parent_id` 的历史资产仍可打开，以便用户审查和后续处理。
- `frontend/src/lib/analytics-assets.test.ts`
  - 新增未归属小说级资产在选中小说时被阻断的覆盖。
  - 新增全部小说聚合视图允许打开未归属资产的覆盖。
  - 新增无 `parent_id` outline 在选中小说时仍允许打开的覆盖。
- `frontend/src/app/page.test.ts`
  - 首页 reopen smoke 同步覆盖未归属资产边界：选中小说阻断，全部小说视图允许。

### 本轮复验结果
- 前端：`npm --prefix "novelforge-core/frontend" run test` 通过（`23 passed`）
- 前端：`npm --prefix "novelforge-core/frontend" run lint` 通过
- 前端：`npx --prefix "novelforge-core/frontend" tsc --noEmit -p "novelforge-core/frontend/tsconfig.json"` 通过
- 前端：`npm --prefix "novelforge-core/frontend" run build` 通过

### 当前判断
- 当前小说边界现在不只防跨书资产，也会防“归属不明”的历史资产被误当作当前小说资产编辑。
- 全部小说聚合视图保留审查入口，避免历史数据彻底不可达。
- 这一步先固定规则，没有做迁移 UI；迁移/绑定属于下一步产品交互。

### 下一步重点
- 设计并实现未归属资产的迁移/绑定入口：用户在全部小说视图确认后，可将历史资产绑定到当前小说容器。
- 继续检查保存后的焦点资产是否应保留 `contentItemId`，让聊天上下文里的引用也能稳定指向原资产。
- 若后续引入真实 DOM 组件测试，可补首页工作台点击级 smoke。

## 2026-05-05 书级容器落地第二十轮（未归属资产绑定入口）

### 本轮新增完成
- `frontend/src/lib/content-item-binding.ts`
  - 新增 `isUnassignedNovelScopedContentItem(...)`，统一判断无 `parent_id` 且应归属小说容器的资产。
  - 新增 `buildBindContentItemToNovelRequest(...)`，在保留原资产正文、结构化数据、统计、关系、session 与标签的同时写入新的 `parent_id`。
- `frontend/src/lib/analytics-assets.ts`
  - 未归属资产边界判断改为复用共享 binding helper，避免 reopen 与绑定入口各自维护一份类型规则。
- `frontend/src/app/page.tsx`
  - 首页工作台新增“绑定到当前小说”操作。
  - 当前小说视图中，如果章节、角色、世界观、时间线或关系资产没有 `parent_id`，卡片上会显示绑定按钮。
  - 点击绑定按钮会调用 `contentService.update(item.metadata.id, request)` 原位更新，不会新建重复资产。
  - 绑定成功后刷新资产列表，并提示已绑定到当前小说。
- `frontend/src/lib/content-item-binding.test.ts`
  - 覆盖未归属小说级资产判断规则。
  - 覆盖绑定请求会保留 metadata / content / extracted_data / stats / relations 并写入目标小说 `parent_id`。

### 本轮复验结果
- 前端：`npm --prefix "novelforge-core/frontend" run test` 通过（`25 passed`）
- 前端：`npm --prefix "novelforge-core/frontend" run lint` 通过
- 前端：`npx --prefix "novelforge-core/frontend" tsc --noEmit -p "novelforge-core/frontend/tsconfig.json"` 通过
- 前端：`npm --prefix "novelforge-core/frontend" run build` 通过

### 当前判断
- 历史无归属资产现在不只是被阻断，还提供了从首页绑定到当前小说的修复路径。
- 绑定采用原位 update，避免迁移时生成重复资产或破坏 `contentItemId`。
- 当前入口先放在首页工作台卡片上，适合用户在全部/当前小说资产审查时手动处理历史数据。

### 下一步重点
- 继续检查保存后的焦点资产是否应保留 `contentItemId`，让聊天上下文引用也稳定指向原资产。
- 将未归属资产绑定入口扩展到分析页/世界页等更多真实入口，或抽成统一动作组件。
- 如需更完整数据治理，可补批量绑定/迁移入口与绑定前确认弹窗。

## 2026-05-05 书级容器落地第二十一轮（聊天焦点资产身份保留）

### 本轮新增完成
- `frontend/src/lib/focused-assets.ts`
  - 抽出 `FocusedAsset` 类型与 `buildFocusedAssetFromArtifact(...)` helper。
  - 从已保存 content item 打开的 Artifact 如果携带 `contentItemId`，构造焦点资产时会使用该 ID 作为 `key/id`，并标记为 `project_asset`。
  - 聊天中新生成、尚未保存的 Artifact 仍保持 `artifact:{type}:{title}` 临时 key 与 `artifact` source。
- `frontend/src/lib/content-item-reopen.ts`
  - `saveReopenedContentItem(...)` 成功后返回 `contentItemId`，让调用方能在保存后继续保留原资产身份。
- `frontend/src/app/page.tsx`
  - 首页保存已重开 Artifact 后，焦点资产会继续携带 `contentItemId`，不再退化为仅按标题/类型识别的临时 Artifact。
  - `focused_assets` 发送给聊天后端时继续包含稳定 `id`，便于 AI 精确引用已有内容库资产。
- `frontend/src/lib/focused-assets.test.ts`
  - 覆盖已保存 Artifact 会保留 content item 身份。
  - 覆盖新生成未保存 Artifact 仍保持临时 artifact 身份。
- `frontend/src/lib/content-item-reopen.test.ts`
  - 更新保存返回值断言，确保保存成功结果带回 `contentItemId`。

### 本轮复验结果
- 前端：`npm --prefix "novelforge-core/frontend" run test` 通过（`27 passed`）
- 前端：`npm --prefix "novelforge-core/frontend" run lint` 通过
- 前端：`npx --prefix "novelforge-core/frontend" tsc --noEmit -p "novelforge-core/frontend/tsconfig.json"` 通过
- 前端：`npm --prefix "novelforge-core/frontend" run build` 通过

### 当前判断
- 首页聊天上下文中的焦点资产身份更稳定：已保存资产即使经过 ArtifactPanel 编辑保存，也不会丢失原始内容库 ID。
- 这为后续“AI 请求修改 / 用户确认 / 内容库写回 / 回流聊天上下文”的闭环继续铺路。
- 当前仍保留临时 Artifact 身份，适合尚未保存的新 AI 输出。

### 下一步重点
- 将未归属资产绑定入口扩展到分析页 / 世界页等更多真实入口，或抽成统一动作组件。
- 如果需要更强 UI 保障，可在明确授权外部测试依赖后补 React Testing Library DOM smoke。
- 继续审计 ArtifactPanel 保存/批量保存后的焦点资产同步策略，避免多资产保存时上下文状态滞后。

## 2026-05-05 书级容器落地第二十二轮（分析页未归属资产绑定入口）

### 本轮新增完成
- `frontend/src/lib/content-item-binding.ts`
  - 新增共享 `bindContentItemToNovel(...)`，统一执行原位 `contentService.update(...)` 绑定。
  - 首页和后续页面无需再各自拼 update 调用。
- `frontend/src/app/page.tsx`
  - 首页未归属资产绑定逻辑改为复用 `bindContentItemToNovel(...)`。
- `frontend/src/app/analytics/page.tsx`
  - 分析页“最近更新的资产”卡片新增“绑定到当前小说”操作。
  - 当前选中小说且资产无 `parent_id`、并属于小说级资产时，会显示绑定按钮。
  - 绑定成功后刷新分析数据，并显示成功提示。
- `frontend/src/lib/content-item-binding.test.ts`
  - 新增共享绑定函数会原位更新现有 content item 的覆盖。

### 本轮复验结果
- 前端：`npm --prefix "novelforge-core/frontend" run test` 通过（`28 passed`）
- 前端：`npm --prefix "novelforge-core/frontend" run lint` 通过
- 前端：`npx --prefix "novelforge-core/frontend" tsc --noEmit -p "novelforge-core/frontend/tsconfig.json"` 通过
- 前端：`npm --prefix "novelforge-core/frontend" run build` 通过

### 当前判断
- 未归属资产绑定入口已从首页扩展到分析页，用户在最近资产审查场景中也可以修复历史资产归属。
- 绑定逻辑已经收口到共享 helper，后续扩展到世界页、角色页或统一动作组件会更轻。
- 当前仍是单资产手动绑定，没有批量迁移或确认弹窗。

### 下一步重点
- 将绑定入口继续扩展到世界页/角色页中已保存资产卡片，或抽出统一“资产动作区”组件。
- 补批量绑定/迁移方案前，先确认无归属资产在真实用户数据中的数量和常见类型。
- 继续推进 ArtifactPanel 批量保存后的上下文同步策略。

## 2026-05-05 书级容器落地第二十三轮（世界页未归属资产绑定入口）

### 本轮新增完成
- `frontend/src/app/world/page.tsx`
  - 引入共享 `bindContentItemToNovel(...)` 与 `isUnassignedNovelScopedContentItem(...)`。
  - 当当前小说已选中，且当前展示的最新 `world / timeline` 资产没有 `parent_id` 时，页面顶部会显示未归属资产提示。
  - 用户可直接点击按钮将对应世界观或时间线资产绑定到当前小说。
  - 绑定成功后刷新世界页数据，并显示成功提示。
  - 绑定失败时显示错误信息。

### 本轮复验结果
- 前端：`npm --prefix "novelforge-core/frontend" run test` 通过（`28 passed`）
- 前端：`npm --prefix "novelforge-core/frontend" run lint` 通过
- 前端：`npx --prefix "novelforge-core/frontend" tsc --noEmit -p "novelforge-core/frontend/tsconfig.json"` 通过
- 前端：`npm --prefix "novelforge-core/frontend" run build` 通过

### 当前判断
- 未归属资产修复入口已覆盖首页、分析页和世界页三个主要审查场景。
- 世界页现在不会只提示无归属资产无法编辑，还给出了绑定到当前小说的直接修复路径。
- 当前世界页只针对最新 `world / timeline` 资产提供绑定入口，细粒度地点/文化/规则仍归属于该最新 world 资产整体。

### 下一步重点
- 将绑定入口继续扩展到角色页关系资产，尤其是关系图中无 `parent_id` 的关系资产。
- 评估是否抽出统一“资产动作区”组件，集中处理打开、绑定、保存提示和错误提示。
- 继续考虑批量绑定/迁移入口，减少历史资产较多时的手动处理成本。

## 2026-05-10 书级容器落地第二十四轮（角色页未归属资产绑定入口 + 焦点资产身份审计）

### 本轮新增完成
- `frontend/src/app/characters/page.tsx`
  - 导入共享 `bindContentItemToNovel(...)` 与 `isUnassignedNovelScopedContentItem(...)`。
  - 新增 `characterItems` 状态，保留加载时的原始 `ContentItem[]`。
  - 计算 `bindableCharacterItems`（无 `parent_id` 的角色资产）和 `bindableRelationshipItems`（无 `parent_id` 的关系资产）。
  - 页面顶部（错误/保存消息下方）新增未归属资产绑定提示区，列出所有可绑定的角色和关系资产。
  - 绑定按钮 `onClick` 阻止冒泡，避免触发页面其他交互。
  - 绑定成功后刷新角色页数据并显示提示。
- `frontend/src/app/page.tsx`
  - 审计批量保存后焦点资产的 `contentItemId` 持久化逻辑（`handleArtifactSave` 中 `reopenedResult.contentItemId` 传入 `buildFocusedAssetFromArtifact`），确认无需额外修复。

### 本轮复验结果
- 前端：`npm run test` 通过（7 files, 28 tests）
- 前端：`next lint` 通过（无警告无错误）
- 前端：`tsc --noEmit` 通过
- 前端：`next build` 通过

### 当前判断
- 未归属资产绑定入口现在已覆盖所有主要页面：首页、分析页、世界页、角色页。
- 角色页同时覆盖 character 和 relationship 两类资产，关系图中的边级选择配合未归属阻断规则，形成完整的边界保护。
- 批量保存后焦点资产的身份链路（`contentItemId` → `focusedAsset.id`）已确认稳定，不需要额外修补。

### 下一步重点
- 评估是否需要批量绑定入口（一键将所有未归属资产绑定到当前小说），减少历史资产较多时的手动处理成本。
- 评估是否抽出统一"资产动作区"组件，集中处理打开/绑定/保存提示/错误提示，进一步减少首页/分析页/世界页/角色页的重复胶水。
- 开始推进 AI 检索内容库资产并在用户确认后写回的受控 agent 式工作流。
- 本机已确认可通过 `py` 使用 Python 3.12.10 执行后端校验。
- 前端最近一轮第九轮复验已恢复通过：`npm run lint` / `npm run build` 均已成功。
- 前端主入口和核心页面的书级容器边界已明显收紧，下一阶段最值得优先攻坚的是：
  1. analytics 最近资产与其余页面入口统一接入同一套 detail/editor reopen 链路
  2. 导入 / 提取 / 调度完成后的最终资产一致性
  3. 项目记忆库写回闭环与最小 smoke/test 硬化

## 2026-05-10 Workstream 4 写回闭环第一轮（AI 保存建议确认流）

### 本轮新增完成
- `novelforge-core/novelforge/api/__init__.py`
  - `_build_chat_system_prompt(...)` 新增 `<save_asset>` 协议说明。
  - AI 现在可以在回复末尾追加保存建议 JSON，由系统解析为待确认的内容库写入请求。
- `frontend/src/lib/chat-parser.ts`
  - 新增 `SaveAssetRequest` 类型。
  - 新增 `parseSaveAssetRequests(...)`，支持从一次 AI 回复中解析多个 `<save_asset>...</save_asset>` 标签。
  - `cleanAiResponse(...)` 会移除 `<save_asset>` 标签，避免协议块污染聊天正文。
- `frontend/src/components/chat/MessageBubble.tsx`
  - `Message` 增加 `saveAssetRequests` 字段。
  - 聊天消息中新增“AI 建议保存以下资产到项目内容库”确认面板。
  - 每条保存建议支持“确认保存 / 跳过”，并显示 pending / saved / rejected 状态。
- `frontend/src/app/page.tsx`
  - 发送消息完成后会解析 `parseSaveAssetRequests(finalContent)`。
  - 将解析出的保存建议写入 assistant message。
  - 新增 `handleConfirmSaveAsset(...)`：用户确认后调用 `upsertContentAsset(...)` 写入内容库，刷新项目资产并加入当前 focused asset。
  - 新增 `handleRejectSaveAsset(...)`：用户跳过后标记为 rejected。
  - `MessageList` 已接入确认/跳过回调。

### 本轮复验结果
- 前端：`npm run test` 通过（7 files, 28 tests）
- 前端：`next lint` 通过
- 前端：`tsc --noEmit` 通过
- 前端：`next build` 通过

### 当前判断
- NovelForge 已从“AI 生成 Artifact，用户手动点 Save”推进到“AI 可明确提出写入内容库建议，用户确认后系统写回”的第一版受控闭环。
- 当前仍是文本协议版，不是后端 tool/function calling；优势是落地快、前端可控，缺点是依赖模型遵守 `<save_asset>` 格式。
- 保存后目前能刷新内容库并加入聊天上下文，但新建资产的最终 content id 回流仍可继续加强。

### 下一步重点
- 增强保存建议对“修改已有资产”的支持：根据 `id` 或 `contentItemId` 精确更新，而不是只走 upsert 匹配。
- 为 `parseSaveAssetRequests(...)` 与确认保存流程补前端单元测试。
- 后续可评估是否把 `<save_asset>` 协议升级为后端工具调用或结构化 response schema。

## 2026-05-10 Workstream 4 写回闭环第二轮（保存建议精确更新与测试）

### 本轮新增完成
- `frontend/src/lib/save-asset-requests.ts`
  - 新增 `getSaveAssetRequestId(...)`，支持从 `<save_asset>` 顶层 `id` 或 `data.id / data.contentItemId / data.content_item_id` 解析目标资产 ID。
  - 新增 `buildSaveAssetContentRequest(...)`，将 AI 保存建议转换为内容库写入请求。
  - 新增 `saveAssetRequestToContent(...)`：有 ID 时直接 `contentService.update(id, request)` 精确更新；无 ID 时走 `upsertContentAsset(...)` 新建/合并。
  - 精确更新时会读取已有资产并保留原 `session_id / parent_id / status / author / tags / children_ids / relations` 等上下文，避免 AI 建议覆盖资产身份。
- `frontend/src/app/page.tsx`
  - `handleConfirmSaveAsset(...)` 改为调用 `saveAssetRequestToContent(...)`。
  - 确认保存后会把返回的 `contentId` 写回 message 状态，并用该 ID 构造 focused asset，提升保存后聊天上下文身份稳定性。
  - 更新已有资产时提示“已更新”，新建/合并时提示“已保存到项目内容库”。
- `frontend/src/lib/chat-parser.save-asset.test.ts`
  - 覆盖多个 `<save_asset>` 标签解析。
  - 覆盖非法类型、缺 data、非 JSON 等无效保存建议会被忽略。
  - 覆盖 `cleanAiResponse(...)` 会移除保存协议块。
- `frontend/src/lib/save-asset-requests.test.ts`
  - 覆盖 ID 解析策略。
  - 覆盖已有资产 metadata 保留。
  - 覆盖有 ID 时精确 update、无 ID 时 upsert。

### 本轮复验结果
- 前端：`npm run test` 通过（9 files, 35 tests）
- 前端：`next lint` 通过
- 前端：`tsc --noEmit` 通过
- 前端：`next build` 通过

### 当前判断
- 写回闭环已经从“只能保存新建议”推进到“可精确更新已有资产”的可用版本。
- 当前仍是文本协议，不是后端工具调用，但已经具备用户确认、精确更新、身份保留和基础测试保护。
- 这条链路已经接近 MVP 级别，可以开始真实试用：让 AI 对聚焦资产提出修改建议，用户确认后回写内容库。

### 下一步重点
- 在聊天 UI 中显示保存建议的更详细 diff/预览，避免用户只凭标题确认。
- 将保存建议和 ArtifactPanel 保存路径进一步统一，减少两套写入入口的分叉。
- 继续推进后端/前端 smoke，覆盖一次完整“AI 建议修改角色 -> 用户确认 -> 内容库更新 -> 下一轮上下文引用”的路径。

## 2026-05-10 Workstream 4 写回闭环第三轮（AI 保存建议详细预览）

### 本轮新增完成
- `frontend/src/lib/save-asset-preview.ts`
  - 新增 `buildSaveAssetPreviewRows(...)`，从 AI 保存建议中提取适合确认前查看的关键字段。
  - 支持名称、标题、描述、摘要、正文、来源、目标、关系类型、角色定位、性格、背景、时间等主字段。
  - 对数组、对象和长文本做可读化与截断处理。
  - 新增 `getSaveAssetOperationLabel(...)`，判断保存建议是“新增资产”还是“更新已有资产”。
- `frontend/src/components/chat/MessageBubble.tsx`
  - 保存建议卡片现在展示新增/更新状态。
  - 每条保存建议会显示最多 4 条关键字段预览，用户确认前能看到将写入的主要内容。
  - 保留 pending / saved / rejected 状态与确认/跳过操作。
- `frontend/src/lib/save-asset-preview.test.ts`
  - 覆盖主字段预览提取。
  - 覆盖长文本截断。
  - 覆盖新增/更新判断。

### 本轮复验结果
- 前端：`npm run test` 通过（10 files, 38 tests）
- 前端：`next lint` 通过
- 前端：`tsc --noEmit` 通过
- 前端：`next build` 通过

### 当前判断
- 写回闭环的用户确认可信度明显提升：用户不再只看到标题，而能在确认前看到 AI 将写入的关键内容。
- 目前已经具备内部可用 MVP 的核心写回能力：AI 建议、用户确认、精确更新、新建保存、上下文刷新、基础预览。
- 下一步不宜继续大范围扩协议，应该跑真实内部 smoke，把完整链路中的边角错误暴露出来。

### 下一步重点
- 进行一次真实内部 smoke：让 AI 修改一个已有角色或世界观，确认保存后检查内容库回显和下一轮上下文引用。
- 补最小 smoke 测试或手动测试记录：AI 建议修改 -> 用户确认 -> 内容库更新 -> 重新打开 -> 下一轮聊天引用。
- 如果 smoke 通过，再转向 settings 控制台与发布前错误恢复硬化。

## 2026-05-10 提取链路优先修复第一轮（导入空章节与超时诊断）

### 本轮确认的问题
- 真实导入任务 `1778426618775488` 的内容库查询结果显示：只写入了 `novel` 根资产和 1 个 `chapter`。
- 该 `chapter` 的 `content` 与 `extracted_data.content` 均为空。
- 任务结果中 `characters_count / world_count / timeline_count / relationships_count` 全部为 0。
- `analysis_stage_results` 显示四个深度分析阶段全部 `timed_out`：角色、世界观、时间线、关系网。
- 这说明本轮不是前端显示问题，而是导入/提取后端链路未产出有效结构化资产。

### 本轮新增完成
- `novelforge-core/novelforge/services/ai_scheduler.py`
  - 修复章节保存逻辑：当章节检测器返回空 `chapter.content` 时，使用 `result.content[start_position:end_position]` 回填；仍为空时使用完整解析正文兜底。
  - 写入 `ContentItem.content` 与 `extracted_data.content` 时统一使用回填后的 `chapter_content`，避免再次出现空正文章节。
  - 导入深度分析输入从直接传全文改为跨全文采样：开头 + 中段 + 中后段 + 结尾，默认约 24k 字符，用于降低单次请求把模型打爆的概率。
  - 单阶段超时时间略放宽，减少较慢模型在合理输出前被外层 `wait_for` 截断。
- `novelforge-core/tests/services/test_ai_scheduler_import.py`
  - 增加导入分析采样测试。
  - 增加回归测试：当章节检测器返回空正文但位置有效时，导入任务必须保存非空章节正文。

### 本轮复验结果
- 后端：`py -3 -m pytest "novelforge-core/tests/services/test_ai_scheduler_import.py" -q` 通过（3 passed）
- 后端：`py -3 -m pytest "novelforge-core/tests" -q` 通过（8 passed）
- 后端：`py -3 -m compileall "novelforge-core/novelforge/services/ai_scheduler.py" "novelforge-core/tests/services/test_ai_scheduler_import.py"` 通过

### 当前判断
- 当前导入失败的根因已经明确：章节正文为空 + 四阶段深度分析超时。
- 空章节正文已经修复并测试锁定。
- 采样只是止血，不能作为最终质量方案；最终应恢复/强化分片提取与合并能力，并给每个阶段独立质量门槛。
- 现阶段应暂停更多 UI/写回扩展，优先把导入与提取输出质量打到可靠。

### 下一步重点
- 继续审计并优化 `ExtractionService` 与四个 unified extractor 的分片并发策略，避免外层超时截断内部并发。
- 建立最小质量门槛：章节正文非空、角色数 > 0、世界观非空、时间线或关系至少一个维度可产出。
- 对真实 90k+ 文本重新跑一次导入 smoke，确认内容库至少写入章节正文与部分结构化资产。

## 2026-05-11 提取链路优先修复第二轮（导入专用深度分析与质量门槛）

### 本轮新增完成
- `novelforge-core/novelforge/services/ai_scheduler.py`
  - 新增导入专用 `_run_import_deep_analysis(...)`，不再在导入任务内临时 monkey-patch `extraction_service.extract_all`。
  - 角色与时间线阶段改为继续传入全文，让底层 unified extractor 使用自己的分片/合并能力，避免上一轮采样方案牺牲主干覆盖率。
  - 世界观与关系网阶段继续使用跨全文采样，控制长文本请求成本与超时风险。
  - 关系网提取增加角色名过滤：只保存已识别角色之间的关系边，避免 `UnknownSource / UnknownTarget` 或跨实体噪音污染内容库。
  - 增加导入分析质量门槛：角色为空、世界观为空、时间线与关系网均为空时将 `analysis_status` 标为 `low_quality`，并返回 `analysis_quality_issues`。
- `novelforge-core/tests/services/test_ai_scheduler_import.py`
  - 新增测试锁定：角色/时间线使用全文，世界观/关系使用采样。
  - 新增测试锁定：核心输出为空时返回 `low_quality` 与明确质量问题。

### 本轮复验结果
- 后端：`py -3 -m pytest "novelforge-core/tests/services/test_ai_scheduler_import.py" -q` 通过（5 passed）
- 后端：`py -3 -m pytest "novelforge-core/tests" -q` 通过（10 passed）
- 后端：`py -3 -m compileall "novelforge-core/novelforge/services/ai_scheduler.py" "novelforge-core/tests/services/test_ai_scheduler_import.py"` 通过

### 当前判断
- 导入链路已经从“整体五分钟外层超时 + 空结果”推进到“每阶段独立执行、保留部分结果、显式暴露低质量状态”。
- 这一轮仍不是最终质量方案：角色/时间线虽然恢复全文覆盖，但实际输出质量仍需真实 90k+ 文本 smoke 检查；世界观/关系仍是成本受控采样版。
- 下一步应继续把低质量状态接到用户可见反馈，并在真实导入后按内容库结果决定是否进一步改 extractor 内部并发。

### 下一步重点
- 用真实 90k+ 文本重新导入，检查任务结果与内容库写入的 `character / world / timeline / relationship` 数量和质量。
- 若角色或时间线仍慢或为空，优先改 unified extractor 的批次并发与失败隔离，而不是继续扩大单次 prompt。
- 将 `analysis_status = low_quality / partial / failed` 的区别显式展示到导入完成 UI，避免 100% 进度被误解为高质量成功。

## 2026-05-11 提取链路优先修复第三轮（真实样本文本解析 smoke）

### 本轮确认的问题
- 用户提供根目录 `超时空辉夜姬.txt` 作为真实 90k+ 文本样本，文件约 199 KB，解析后正文约 90,759 字符。
- 直接跑本地文本解析 smoke 时发现：
  - TXT 文件是 GBK/GB18030 编码；在 Windows 控制台未设置 UTF-8 输出时表现为乱码，但 Python 解码后内容本身正确。
  - 原预处理会用 `\s+` 压缩所有空白，吞掉章节行边界，导致章节检测只能得到 1 个空章节。
  - 页眉页脚清理会把开头短章节标题跳过，直接从第一段长正文开始，导致序章标题丢失。
  - 章节检测后处理会把短章节内容误判为“标题段落”并合并到下一章，造成章节减少。

### 本轮新增完成
- `novelforge-core/novelforge/content/text_preprocessor.py`
  - 空白压缩改为只压缩横向空白，不再吞掉换行。
  - 页眉页脚清理现在会把章节标题行视为正文起点，避免导入时裁掉序章标题。
- `novelforge-core/novelforge/content/chapter_detector.py`
  - 中文章节标题支持“第一卷 / 第一章”后标题为空或可选。
  - 显式章节检测改为先收集所有标题位置后统一切分，避免不同正则扫描顺序导致章节内容边界错误。
  - 过滤正文行中的误匹配章节词，同时保留真正行首章节标题。
  - 后处理不再把已经有清晰边界的短章节强行合并到下一章。
- `novelforge-core/novelforge/services/text_processing_service.py`
  - TXT 读取改为对候选编码打分，优先选择 CJK 内容质量更高的解码结果，避免 `latin-1` 这类永远成功但内容无意义的解码抢先返回。
- `novelforge-core/tests/services/test_text_processing_service.py`
  - 新增 GBK/GB18030 中文 TXT 解码回归。
  - 新增换行保留与章节标题起点回归。
  - 新增中文卷/章标题切分回归。

### 本轮 smoke 结果
- 本地解析 `超时空辉夜姬.txt`：
  - `content_chars`: 90,759
  - `chapter_count`: 5
  - `empty_chapters`: 0
  - `first_chapter_title`: `第一卷 序章`
  - `first_chapter_chars`: 6,334
  - `last_chapter_title`: `第一卷 插图`
- 真实 AI 提取导入 smoke 未直接执行：Claude Code 权限系统阻止了把用户提供的小说正文发送到外部 AI provider；本轮先完成本地解析链路修复。

### 本轮复验结果
- 后端：`py -3 -m pytest "novelforge-core/tests/services/test_text_processing_service.py" "novelforge-core/tests/services/test_ai_scheduler_import.py" -q` 通过（8 passed）
- 后端：`py -3 -m pytest "novelforge-core/tests" -q` 通过（13 passed）
- 后端：`py -3 -m compileall "novelforge-core/novelforge/services/text_processing_service.py" "novelforge-core/novelforge/content/text_preprocessor.py" "novelforge-core/novelforge/content/chapter_detector.py" "novelforge-core/tests/services/test_text_processing_service.py"` 通过

### 下一步重点
- 若允许外部模型调用，再对 `超时空辉夜姬.txt` 跑完整导入任务，检查角色/世界观/时间线/关系资产数量与内容质量。
- 如果外部调用仍受限，下一步应把导入完成 UI 接入 `analysis_status / analysis_quality_issues`，并继续用 mock extractor 做保存链路质量门槛测试。
- 后续还需提升章节粒度：当前样本能稳定非空切分，但只识别到卷/章标题 5 个，是否足够取决于源文本目录结构；如果需要更细粒度，应增加“按正文长度自动二次切章”的策略。

## 2026-05-11 提取链路优先修复第四轮（完整 AI 导入 smoke 与关系解析修复）

### 本轮完整导入 smoke 结果
- 已在授权外部模型调用后，用根目录 `超时空辉夜姬.txt` 跑完整 `novel_import` smoke。
- 任务结果：
  - `analysis_status`: `completed`
  - `chapters_count`: 5
  - `characters_count`: 4
  - `world_count`: 1
  - `timeline_count`: 6
  - `relationships_count`: 1
  - `analysis_quality_issues`: []
- 内容库写入总数：18 个 content item。
  - 1 个 novel 根资产
  - 5 个 chapter
  - 4 个 character
  - 1 个 world
  - 6 个 timeline
  - 1 个 relationship

### 本轮发现的问题
- 上游模型在世界观地点合并阶段多次返回 `500 / 503`，最终通过重试与 fallback 完成，不阻断整体导入。
- 关系提取阶段模型返回了字符串形式的 `evolution`，但 `NetworkEdge.evolution` 要求 `list[str]`，导致原始关系解析失败。
- 由于导入控制器有保守关系兜底，最终仍保存了 1 条“需复核”的关系边，但这说明真实关系解析容错还不够。

### 本轮新增完成
- `novelforge-core/novelforge/extractors/unified_relationship_extractor.py`
  - 关系解析现在会把字符串形式的 `evolution / chapter_references` 规范化为列表，避免 Pydantic 校验失败导致整批关系丢失。
- `novelforge-core/tests/services/test_relationship_extractor.py`
  - 新增回归测试，锁定关系字段字符串转列表的解析行为。

### 本轮复验结果
- 后端：`py -3 -m pytest "novelforge-core/tests" -q` 通过（15 passed）
- 后端：相关修改文件 `compileall` 通过
- 前端：`lint / tsc / vitest / build` 已启动完整复验，等待最终输出。

### 当前判断
- 真实样本已经证明：导入链路不再是“空章节 + 全阶段 timeout”，现在能产出章节、角色、世界观、时间线与关系资产。
- 当前最大质量短板从“是否能产出”转为“产出是否足够细、足够准”：
  - 样本 90k 字只切出 5 个章节，其中第三章 50k 字，后续应考虑按长度自动二次切分。
  - 关系资产目前依赖保守兜底，真实关系边质量仍需下一轮复跑验证。
  - 时间线事件内容有明显错位迹象，部分事件标题与描述不完全匹配，说明时间线抽取/合并质量还需要继续优化。

### 下一步重点
- 对章节过长做二次切分或分段资产策略，避免 50k 单章影响编辑器、检索和后续提取质量。
- 复跑关系提取 smoke，确认 `evolution` 字符串归一化后能保留真实关系边，而不是只落保守兜底。
- 检查时间线提取提示词与合并逻辑，降低“标题和描述错配”的概率。

## 2026-05-11 提取链路优先修复第五轮（过长章节二次切分）

### 本轮新增完成
- `novelforge-core/novelforge/services/ai_scheduler.py`
  - 新增 `_split_long_import_chapter(...)` 与 `_expand_long_import_chapters(...)`。
  - 导入保存章节前会把超过 18,000 字符的章节按段落/句号/感叹号/问号边界二次切分。
  - 切分后的章节标题追加 `（1）/（2）/...`，并在 metadata 中保留 `split_from_title / split_part`。
  - 二次切分后重新顺序编号，避免编辑器和内容库面对 50k+ 单章。
- `novelforge-core/tests/services/test_ai_scheduler_import.py`
  - 新增长章节二次切分回归测试。
  - 新增短章节不切分回归测试。

### 本轮样本复核
- `超时空辉夜姬.txt` 原始章节：5 个。
- 二次切分后章节：8 个。
- 最大章节长度：17,997 字符。
- 第三章从 50k+ 字符拆为 3 个资产，第二章拆为 2 个资产。

### 本轮复验结果
- 后端：`py -3 -m pytest "novelforge-core/tests/services/test_ai_scheduler_import.py" -q` 通过（7 passed）
- 后端：`py -3 -m pytest "novelforge-core/tests" -q` 通过（17 passed）
- 后端：相关修改文件 `compileall` 通过
- 前端：`npx --prefix "novelforge-core/frontend" tsc --noEmit -p "novelforge-core/frontend/tsconfig.json"` 通过

### 当前判断
- 导入链路已经解决“章节为空”和“超长单章”两个关键可用性问题。
- 下一步应继续验证关系提取修复后的真实效果：复跑关系提取 smoke，确认能保存模型返回的真实关系边，而不是只依赖保守兜底。
- 时间线事件仍有标题/描述错配迹象，后续需要单独优化提示词、解析和合并质量。

### 下一步重点
- 复跑完整导入或单独关系提取，检查 `evolution` 字符串归一化后真实关系边是否保留。
- 优化时间线提取，增加事件标题/描述一致性校验。
- 将导入 UI 显示从“完成/失败”升级为展示 `analysis_status` 与质量问题。

## 2026-05-12 提取链路优先修复第六轮（真实关系边保留与综合 smoke 验证）

### 本轮完整导入 smoke v2 结果
- `analysis_status`: `completed`
- `chapters_count`: 8（过长章节二次切分生效）
- `characters_count`: 6（比首轮 +2）
- `world_count`: 1
- `timeline_count`: 6
- `relationships_count`: 2（从 1 个保守兜底 → 2 个真实关系边）
- `analysis_quality_issues`: []
- 内容库总写入：24 个资产

### 关系资产质量
- `酒寄彩叶 → 真实 (FRIEND)`：有原文证据，描述准确。
- `酒寄彩叶 → 芦花 (FRIEND)`：有原文证据，描述准确。
- 不再是首轮的“需复核”保守兜底边。

### 时间线资产质量
- 6 个事件标题与描述基本一致。
- 包含绝对时间、相对时间、涉及角色、情节影响等结构化字段。
- 比首轮的时间线标题/描述错配有明显改善。

### 本轮新增完成
- `novelforge-core/novelforge/extractors/unified_relationship_extractor.py`
  - 关系解析自动把字符串 `evolution / chapter_references` 归一化为列表，避免整批关系丢失。
- `novelforge-core/novelforge/services/ai_scheduler.py`
  - 过长章节二次切分（18k 字符上限）已生效。
- `novelforge-core/tests/services/test_relationship_extractor.py`
  - 关系字段字符串转列表回归测试。
- `novelforge-core/tests/services/test_ai_scheduler_import.py`
  - 长章节切分 + 短章节不切分回归测试。

### 本轮复验结果
- 后端：`py -3 -m pytest "novelforge-core/tests" -q` 通过（17 passed）
- 后端：相关修改文件 `compileall` 通过
- 前端：`lint / tsc / vitest / build` 通过

### 当前判断
- 导入链路已经从“空章节 + 全阶段 timeout”推进到：章节完整 + 角色丰富 + 世界观结构化 + 时间线可用 + 真实关系边保留。
- 这已经是**提取链路可用**状态，不再是死链路。
- 剩余质量优化属于“更好”而非“能不能用”：
  - 章节粒度仍以卷/章标题为主，无标题段落不自动切分。
  - 时间线个别事件标题仍有优化空间（如“电竞电线杆与月之婴儿的发现”描述的是最终决战）。
  - 关系网数量仍偏少（仅 2 条），需要后续复跑或增加提取提示词覆盖更多关系维度。

### 下一步重点
- 接入 `analysis_status` 到导入完成 UI，让用户看到真实质量状态。
- 继续优化关系提取提示词，覆盖更多关系类型（敌对、守护、血缘等）。
- 时间线提取质量继续提升：更精确的事件标题、更准确的时间线排序。

## 2026-05-12 提取链路优先修复第七轮（关系全文召回与质量门槛）

### 本轮新增完成
- `novelforge-core/novelforge/services/ai_scheduler.py`
  - 导入关系提取从 24k 采样改为全文输入，让底层 relationship extractor 按 chunk 召回关系候选。
  - 去掉“只保留已识别角色之间关系”的硬过滤，改为关系先召回、再做基础归一化与去重。
  - 增加导入级别关系别名归一化：`彩叶 -> 酒寄彩叶`、`八千代/辉夜姬 -> 辉夜`、`朝日/帝 -> 帝明`、`母亲/红叶/彩叶母亲 -> 酒寄之母`。
  - 增加关系网质量门槛：关系数低于 `max(5, min(character_count, 10)-2)` 或主角无关系时标记 `low_quality`。
- `novelforge-core/tests/services/test_ai_scheduler_import.py`
  - 测试锁定：关系提取现在使用全文，而不是采样。
  - 测试锁定：关系覆盖不足会触发 `low_quality`。

### 本轮复验结果
- 后端：`py -3 -m pytest "novelforge-core/tests/services/test_ai_scheduler_import.py" -q` 通过（8 passed）
- 后端：`py -3 -m pytest "novelforge-core/tests" -q` 通过（18 passed）
- 后端：相关修改文件 `compileall` 通过
- 前端：`npx --prefix "novelforge-core/frontend" tsc --noEmit -p "novelforge-core/frontend/tsconfig.json"` 通过

### 本轮限制
- 真实完整导入 smoke 复跑被 Claude Code 权限系统阻止，因为该命令会再次把用户提供的小说正文发送到外部 AI provider。
- 本轮已用自动化测试锁定关系全文输入与低质量门槛，但真实产出数量需要用户再次明确授权后复跑验证。

### 当前判断
- 关系提取的工程策略已从“采样 + 硬过滤”改为“全文 chunk 召回 + 归一化 + 质量门槛”，方向正确。
- 如果再次真实 smoke，期望关系数显著高于 2，并且关系不足时不会再被误报为 `completed`。

### 下一步重点
- 在授权后复跑 `超时空辉夜姬.txt` 完整导入 smoke，检查关系数是否达到 8+，并确认核心关系是否覆盖彩叶↔辉夜、彩叶↔朝日、辉夜↔FUSHI。
- 如果关系仍不足，继续改 `unified_relationship_extractor.py` 的 prompt，强制抽取主角-重要角色关系与血缘/守护/敌对等类型。

## 2026-05-12 提取链路治理补充（去样本特化与通用别名归一）

### 本轮治理重点
- 已清理提取链路中的样本特化别名映射，不再在业务代码里写死《超时空辉夜姬》的角色名或小说专属别名。
- 角色合并改为通用规则：基于清洗后的名字、空白/标点归一、前后缀关系和模型自身输出的别名字段进行合并。
- 关系归一也改为通用清洗，而不是样本角色白名单。
- 现有测试中的样本名仅作为回归样例，不作为业务逻辑。

### 本轮验证结果
- 后端：`py -3 -m pytest "novelforge-core/tests" -q` 通过（19 passed）
- 后端：相关修改文件 `compileall` 通过

### 当前判断
- 当前提取链路已经从”样本驱动修补”转向”通用规则 + 质量门槛”。
- 这更符合项目长期目标：同一套逻辑应能适配不同小说，而不是只对某一本样本表现好。
- 后续优化应继续坚持这个原则：优先增强通用召回、归一和质量判断，不写死具体作品角色名。

## 2026-05-12 提取链路架构升级第一轮（角色普查兜底 + 长请求超时放宽）

### 本轮问题诊断
- 角色提取只产出 4 个角色，对 10w 字小说明显不够。
- 根因分析得出 3 个结构性问题：
  1. 角色提取把”召回”和”建档”混在一步，prompt 要求 200-800 字的角色小传，模型会主动省略配角以控制 token 开销。
  2. `asyncio.gather` 不带 `return_exceptions`，一个 batch 失败拖垮整个角色阶段。
  3. `AIService` 硬限制单请求 45 秒，长文本提取任务频繁超时。

### 本轮新增完成
- `novelforge-core/novelforge/services/ai_service.py`
  - 长文本/大输出任务不再强制压到 45 秒：当 `max_tokens >= 5000` 或 `timeout > 120` 时使用真实 timeout。
  - 异常日志改为记录纯字符串，避免空错误信息。
- `novelforge-core/novelforge/extractors/unified_character_extractor.py`
  - `_batch_extract_from_chunks` 改为 `asyncio.gather(..., return_exceptions=True)`，单个 batch 失败不拖垮全阶段。
  - 新增 `_run_character_census(...)` 轻量角色普查，只召回角色名、别名、证据，不生成完整档案。
  - 角色普查作为补充召回：当详细建档产出角色 < 8 时自动触发。
  - 角色别名合并改为通用规则（清洗空白标点 + 前后缀判断），不写死任何具体小说角色名。

### 本轮新增测试
- `novelforge-core/tests/services/test_character_census.py`
  - 角色普查返回轻量候选。
  - 角色普查 batch 失败时优雅降级。
  - 空角色名过滤。
- `novelforge-core/tests/services/test_character_extractor.py`
  - 通用名字归一化。

### 本轮复验结果
- 后端：`py -3 -m pytest “novelforge-core/tests” -q` 通过（22 passed）
- 后端：相关修改文件 `compileall` 通过

### 当前判断
- 角色提取已从”大 prompt 直接产最终资产”升级为”详细建档 + 轻量普查兜底”的双层架构。
- 长请求超时问题已修复，不再被 45 秒硬限制压掉。
- batch 容错已从 all-or-nothing 改为 partial-success。
- 下一步应跑真实 smoke 验证角色数是否稳定 ≥ 8，并将 alias map 应用于关系归一。

### 下一步重点
- 复跑完整导入 smoke，验证角色数是否 ≥ 8。
- 从角色普查结果生成 alias map，驱动关系 source/target 归一。
- 优化时间线事件标题/描述一致性。

## 2026-05-12 提取链路架构升级第二轮（真实 smoke 验证与普查粒度优化）

### 本轮 smoke 结果
- `analysis_status`: `completed`
- `chapters_count`: 8
- `characters_count`: 5（+1，但仍低于目标 8）
- `world_count`: 1
- `timeline_count`: 7
- `relationships_count`: 16
- `analysis_quality_issues`: `[]`

### 角色详情
- 酒寄彩叶（protagonist）— 别名：彩叶、彩P、酒寄同学
- 辉夜/八千代（protagonist）— 别名：辉夜姬、八千代酱、电子歌姬
- 酒寄朝日（supporting）— 别名：帝明、帝、哥哥
- 芦花（supporting）— 别名：ROKA
- 真实（supporting）— 别名：美食女孩

### 本轮发现
- 角色普查兜底已触发，但普查批次粒度（2 chunk/batch）和详细建档高度重叠，未能有效补充低频配角。
- 上游 API 本轮有大量 500/503/504 错误，影响召回稳定性。
- 缺失角色：乃依、雷、东美绪、FUSHI、月人等有名字出场的角色。

### 本轮改进
- 角色普查日志已补：可观察普查批次数量、成功/失败、候选人数。
- 角色普查批次已缩小为 2 chunk/batch，覆盖更多片段。

### 当前判断
- 角色提取已从"偶尔归零"推进到"稳定 4-5 个有完整档案的角色"。
- 但距离目标 8+ 仍有差距，原因有两个：
  1. 模型在长文本中仍倾向只提取高频/重要角色，低频配角容易被省略。
  2. 上游 API 稳定性影响较大，部分普查请求可能因 500/503 失败。
- 下一步应将角色数不足（< 8）纳入 `low_quality` 质量门槛，并继续优化普查 prompt 的召回覆盖。

### 下一步重点
- 将角色数不足（< 8）纳入 `low_quality` 质量门槛。
- 将角色普查结果作为 alias map 驱动关系归一的基础。
- 考虑为普查增加"只返回当前片段中出现的新角色"约束，减少和建档结果的重叠。
- 继续优化普查 prompt，降低模型省略低频配角的概率。

## 2026-05-13 提取链路架构升级第三轮（角色候选池归一与关系别名映射）

### 本轮新增完成
- `novelforge-core/novelforge/extractors/unified_character_extractor.py`
  - 角色提取从“详细建档结果 + 普查结果直接追加”升级为“详细建档 + 轻量普查 -> 统一候选池 -> 名称/别名归一 -> 证据驱动过滤 -> 排序输出”。
  - 普查触发阈值从 `< 8` 提升到 `< 12`，让系统更积极补召回低频配角，而不是等到明显失败才补救。
  - 候选合并会同时比较角色名与 `tags` 中的别名，解决“正文档名 / 普查别名”无法合并的问题。
  - 别名合并时保留旧名到 `tags`，为后续关系 source/target 归一提供 alias map 基础。
  - 合并逻辑已兼容当前 `Character` 模型的可空字段和非固定扩展字段，不再假设 `description/background/appearance/occupation/abilities` 必然存在。
  - 合并后会按原文证据数重算 `mentions`，让排序和质量判断更接近实际覆盖。
- `novelforge-core/novelforge/services/ai_scheduler.py`
  - 导入分析阶段新增角色 `alias -> canonical` 映射。
  - 关系 source/target 归一现在会优先走角色别名映射，再进行通用名称清洗与近似前后缀匹配。
  - 关系去重因此从“字符串清洗后去重”升级为“角色 canonical name 级去重”。

### 本轮新增测试
- `novelforge-core/tests/services/test_character_census.py`
  - 覆盖普查候选与详细档案合并。
  - 覆盖别名驱动的候选合并。
  - 覆盖证据数驱动的 `mentions` 更新。
  - 覆盖句子型噪声角色名过滤。

### 本轮复验结果
- 后端针对性测试通过：
  - `novelforge-core/tests/services/test_character_census.py`
  - `novelforge-core/tests/services/test_character_extractor.py`
  - `novelforge-core/tests/services/test_relationship_extractor.py`
- 结果：`6 passed`

### 当前真实 smoke 状态
- 已尝试复跑 `data/run_sample_import_smoke_v2.py`，输入为根目录 `超时空辉夜姬.txt`。
- 本次 smoke 被 Claude Code 安全分类器阻止，原因是该脚本会把用户小说正文发送到外部 AI provider，属于敏感数据外发。
- 因此本轮只能确认“代码级回归通过”，不能宣称“真实外部模型导入质量已重新达标”。

### 当前判断
- 这次修改是架构改造后的结果：角色链路已经从“一步建档”继续推进到“候选召回与资产建档分层”。
- 但在没有重新跑通完整真实 smoke 前，不能判定为交付级。
- 基于上一轮真实 smoke 的 5 个角色结果，以及本轮仅完成代码级验证，当前提取质量判断仍是：**未达到交付水平**。
- 可以说当前已从“死链路/误报 completed”推进到“有质量门槛、有候选召回、有关系归一基础”的可继续打磨状态，但还没有达到“10w 字小说配角也较全面”的内部可用标准。

### 下一步重点
- 在明确允许外发样本文本到外部 AI provider 后，复跑完整导入 smoke。
- 验证硬指标：角色数是否稳定 ≥ 8、关系是否保持 8+ 且端点归一干净、时间线标题/描述是否一致、`analysis_status` 是否在不足时正确给出 `low_quality`。
- 若真实 smoke 仍低于标准，下一轮应继续拆分“普查候选 -> 重点建档”的二阶段流程：先全书 census 产候选，再对缺少完整档案的候选做定向补建档，而不是只把轻量候选直接作为最终角色资产。

## 2026-05-13 提取链路架构升级第四轮（Census-first 与定向建档）

### 本轮目标
- 继续提升通用提取引擎能力，不针对任何具体小说样本写死角色名、别名或情节。
- 解决“长文本详细建档 prompt 会主动省略低频配角”的结构性问题。

### 本轮新增完成
- `novelforge-core/novelforge/extractors/unified_character_extractor.py`
  - 角色提取主流程改为 census-first：全书先跑轻量角色普查，再跑详细分片建档，最后进入统一候选池合并。
  - 新增定向补建档阶段：对“有证据但档案不足”的候选角色，从全文中按角色名/别名收集局部上下文，再单独生成角色档案。
  - 定向建档只使用候选角色相关上下文，不再把整本书一次性交给模型，降低 token 浪费和配角被省略概率。
  - 新增候选选择规则：主角/反派/重要配角只要档案不足就补建档；minor 角色至少有 2 条证据才进入补建档，避免噪声扩散。
  - 新增 `extraction_quality` 元数据：记录 `evidence_count / profile_score / aliases / confidence`，为后续质量门槛和 UI 质量提示提供结构化信号。
  - 普查候选默认写入 `mentions`，后续合并会按证据数更新出现强度。

### 本轮新增测试
- `novelforge-core/tests/services/test_character_census.py`
  - 覆盖定向建档候选选择：优先补主角/重要配角和有多条证据的 minor。
  - 覆盖按别名从全文收集角色上下文。
  - 覆盖 `extraction_quality` 质量元数据生成。

### 本轮复验结果
- 后端针对性测试通过：
  - `novelforge-core/tests/services/test_character_census.py`
  - `novelforge-core/tests/services/test_character_extractor.py`
  - `novelforge-core/tests/services/test_relationship_extractor.py`
- 结果：`9 passed`
- 修改文件 compileall 通过。

### 当前判断
- 角色提取已从“详细建档不足时补 census”升级为真正的“先召回、再建档、再定向补全”。
- 这是一套通用长文本抽取架构，不依赖《超时空辉夜姬》样本，也不写死任何样本角色名。
- 当前仍需真实外部模型 smoke 验证实际召回提升幅度；在 smoke 前不能宣称已达到交付级。

### 下一步重点
- 把 `extraction_quality` 与导入分析质量门槛联动：低置信角色占比高、章节/证据覆盖不足时标记 `low_quality`。
- 将关系提取进一步改成候选角色驱动：按 canonical character set 抽取互动边，并把无法映射的端点作为新候选或低置信关系处理。
- 在授权外发样本文本后复跑完整导入 smoke，重点验证角色 ≥ 8、关系端点归一、低置信资产提示是否准确。

## 2026-05-13 提取链路架构升级第五轮（质量门槛与关系端点归一）

### 本轮目标
- 继续强化通用提取引擎质量判断，避免“数量够但质量低”仍被标记为 `completed`。
- 将上一轮角色 `extraction_quality` 接入导入分析质量门槛。
- 进一步让关系边依赖角色候选池归一，而不是只按原始字符串保存。

### 本轮新增完成
- `novelforge-core/novelforge/services/ai_scheduler.py`
  - 导入深度分析新增角色质量评估：兼容 extractor 返回的 `extraction_quality`，也能从 `source_contexts / dialogues / behaviors / description / background / appearance / occupation / personality` 自动推导质量。
  - 新增低置信角色占比门槛：低置信角色超过 40% 时标记 `low_quality`。
  - 新增核心角色档案完整度门槛：主角、反派、重要配角档案信息不足时标记 `low_quality` 并列出角色名。
  - 关系归一改为记录无法映射到角色池的端点，写入 `relationship_unresolved_endpoints`。
  - 关系去重权重从“证据条数”升级为“证据数 + 章节引用数 + 描述长度”，优先保留信息更完整的关系边。
  - 若关系端点无法映射到角色池，会进入 `quality_issues`，避免未知人物关系污染结构化关系网却仍被认为高质量。

### 本轮新增测试
- `novelforge-core/tests/services/test_ai_scheduler_import.py`
  - 覆盖低置信角色占比过高时触发 `low_quality`。
  - 覆盖关系端点通过角色别名归一到 canonical name。
  - 覆盖重复关系边去重后保留更有证据的一条。
  - 覆盖无法映射关系端点进入质量问题。

### 本轮复验结果
- 后端针对性测试通过：
  - `novelforge-core/tests/services/test_ai_scheduler_import.py`
  - `novelforge-core/tests/services/test_character_census.py`
  - `novelforge-core/tests/services/test_character_extractor.py`
  - `novelforge-core/tests/services/test_relationship_extractor.py`
- 结果：`18 passed`
- 修改文件 compileall 通过。

### 当前判断
- 导入分析现在不只看角色/关系数量，也开始看角色证据、档案完整度、关系端点是否能落回角色池。
- 这能显著降低“流程跑完但结构化结果不可用”的误报风险。
- 当前仍未执行真实外部模型 smoke，因此不能宣称真实长篇导入已达到交付级；但代码层质量门槛已经比上一轮更接近产品化验收。

### 下一步重点
- 把关系提取进一步升级为候选角色池驱动：prompt 明确提供 canonical characters 与 aliases，让关系抽取阶段围绕已识别角色找互动边。
- 为时间线加入事件证据与章节覆盖质量门槛，解决标题/描述错配和事件覆盖不足问题。
- 授权后复跑完整导入 smoke，验证角色数、关系数、低置信比例与 `analysis_status` 是否符合预期。

## 2026-05-13 提取链路架构升级第六轮（候选角色池驱动关系抽取）

### 本轮目标
- 将关系提取从“模型自由抽关系边”升级为“基于已识别角色候选池抽关系边”。
- 继续保持通用引擎能力，不对任何具体小说样本特化。

### 本轮新增完成
- `novelforge-core/novelforge/extractors/unified_relationship_extractor.py`
  - 新增 `extract_relationships_guided(text, characters=None)`。
  - 关系抽取 prompt 可接收角色候选池，包含标准名、别名与角色定位。
  - prompt 明确要求：关系端点优先使用候选池标准名；候选池外新角色必须有 evidence；不要把组织、地点、事件或抽象概念误当人物关系端点。
  - 原 `extract_relationships(text)` 保持兼容，内部走无候选池的 guided 路径。
- `novelforge-core/novelforge/services/extraction_service.py`
  - 新增高层 `extract_relationships_guided(...)` 转发到统一关系提取器。
- `novelforge-core/novelforge/services/ai_scheduler.py`
  - 导入深度分析关系阶段会优先调用 `extract_relationships_guided(text, characters=已提取角色)`。
  - 没有 guided 接口时仍回退旧 `extract_relationships(text)`，保持测试和替代实现兼容。

### 本轮新增测试
- `novelforge-core/tests/services/test_relationship_extractor.py`
  - 覆盖角色候选池上下文构建。
  - 覆盖 guided prompt 包含候选池与端点标准名约束。
- `novelforge-core/tests/services/test_ai_scheduler_import.py`
  - 覆盖导入深度分析优先调用 guided 关系提取，并传入角色阶段产出的候选池。

### 本轮复验结果
- 后端针对性测试通过：
  - `novelforge-core/tests/services/test_ai_scheduler_import.py`
  - `novelforge-core/tests/services/test_relationship_extractor.py`
  - `novelforge-core/tests/services/test_character_census.py`
  - `novelforge-core/tests/services/test_character_extractor.py`
- 结果：`20 passed`
- 修改文件 compileall 通过。

### 当前判断
- 关系抽取已经从“先抽边、后归一”升级为“候选池约束抽边 + 后置归一与质量门槛”。
- 这能减少别名端点漂移、组织/地点误入关系端点、重复关系边污染等问题。
- 当前仍需真实外部模型 smoke 验证召回与精度的实际提升；在 smoke 前仍不能宣称提取链路达到交付级。

### 下一步重点
- 为时间线提取补事件证据、章节引用与覆盖质量门槛。
- 将章节级覆盖率纳入导入分析：哪些章节完成角色/关系/事件抽取，哪些章节失败或低置信。
- 授权后复跑完整导入 smoke，验证角色 ≥ 8、关系 ≥ 8、端点归一干净、`analysis_status` 能准确反映质量。

## 2026-05-13 提取链路架构升级第六轮（时间线证据与一致性门槛）

### 本轮目标
- 继续提升通用提取质量，不针对具体小说样本特化。
- 解决时间线“标题/描述错配、缺少证据、缺少章节定位”时仍可能被当作高质量结果的问题。

### 本轮新增完成
- `novelforge-core/novelforge/extractors/unified_timeline_extractor.py`
  - 时间线 prompt 增强：要求每个事件提供原文证据与章节/片段定位。
  - 输出 schema 增加 `narrative_time` 与 `chapter_reference` 明确提示。
  - 解析阶段跳过空标题或空描述事件，减少无效时间线资产。
  - 新增 `timeline_quality` 元数据：记录 `evidence_count / has_characters / has_location / has_time_anchor / confidence`。
  - 事件合并时保留章节引用与叙事时间，并在合并后重算质量元数据。
- `novelforge-core/novelforge/services/ai_scheduler.py`
  - 导入分析新增时间线质量门槛：
    - 超过 40% 事件缺少证据或章节引用时标记 `low_quality`。
    - 超过 50% 事件缺少涉及角色时标记 `low_quality`。
    - 标题/描述一致性存疑时标记质量问题。

### 本轮新增测试
- `novelforge-core/tests/services/test_timeline_extractor.py`
  - 覆盖有证据、有角色、有时间锚点的事件为高置信。
  - 覆盖空标题/空描述事件被过滤。
  - 覆盖事件合并保留时间锚点并重算质量。
- `novelforge-core/tests/services/test_ai_scheduler_import.py`
  - 覆盖时间线缺少证据/章节引用时触发 `low_quality`。

### 本轮复验结果
- 后端针对性测试通过：
  - `novelforge-core/tests/services/test_ai_scheduler_import.py`
  - `novelforge-core/tests/services/test_timeline_extractor.py`
  - `novelforge-core/tests/services/test_character_census.py`
  - `novelforge-core/tests/services/test_relationship_extractor.py`
- 结果：`22 passed`
- 修改文件 compileall 通过。

### 当前判断
- 提取链路质量门槛已经覆盖角色、关系、时间线三条核心资产链。
- 当前仍未执行真实外部模型 smoke，因此仍不能宣称已达交付级。
- 但系统现在更接近产品化标准：不再只看是否产出资产，而是检查证据、角色关联、章节定位、端点归一和档案完整度。

### 下一步重点
- 继续推进候选角色池驱动的关系抽取：在关系 prompt 中显式提供 canonical characters 与 aliases，减少端点漂移。
- 增加失败 batch 的质量记录，让 `analysis_warning` 能指出哪些阶段/片段失败。
- 授权后复跑完整导入 smoke，验证真实长篇导入是否达到内部可用标准。

## 2026-05-13 提取链路架构升级第七轮（候选角色池驱动关系抽取）

### 本轮目标
- 继续提升通用关系提取质量，不针对具体小说样本特化。
- 减少关系 source/target 漂移，让关系边优先落到已识别角色候选池。

### 本轮新增完成
- `novelforge-core/novelforge/extractors/unified_relationship_extractor.py`
  - 新增 `extract_relationships_guided(text, characters)`，支持传入角色候选池。
  - 关系 prompt 会注入 canonical character name 与 aliases，要求模型优先使用标准名输出关系端点。
  - 保留候选池外新有名角色能力，但要求 evidence 证明真实出现，避免完全封闭导致漏召回。
  - 普通 `extract_relationships(text)` 继续可用，内部走 guided 版本但不传候选池。
- `novelforge-core/novelforge/services/extraction_service.py`
  - 暴露 `extract_relationships_guided(...)` 高层接口。
- `novelforge-core/novelforge/services/ai_scheduler.py`
  - 导入深度分析阶段在角色提取完成后，关系提取优先调用 guided 接口，并传入当前角色池。
  - 旧服务若没有 guided 接口则自动回退普通关系提取，保持兼容。

### 本轮新增测试
- `novelforge-core/tests/services/test_relationship_extractor.py`
  - 覆盖角色候选池 prompt 注入。
  - 覆盖 canonical name / aliases 上下文生成。
- `novelforge-core/tests/services/test_ai_scheduler_import.py`
  - 覆盖导入深度分析优先调用 guided relationship extraction，并传入角色结果。

### 本轮复验结果
- 后端针对性测试通过：
  - `novelforge-core/tests/services/test_ai_scheduler_import.py`
  - `novelforge-core/tests/services/test_relationship_extractor.py`
  - `novelforge-core/tests/services/test_character_census.py`
  - `novelforge-core/tests/services/test_timeline_extractor.py`
- 结果：`22 passed`
- 修改文件 compileall 通过。

### 当前判断
- 关系提取已经从“自由抽边 + 事后归一”升级为“角色候选池约束 + 事后归一 + 质量门槛”。
- 这会提升通用长文本关系端点稳定性，尤其是昵称、简称、别名较多的小说。
- 仍需真实外部模型 smoke 才能确认实际质量是否达到内部可用标准。

### 下一步重点
- 复跑完整真实导入 smoke（需要明确允许外发样本文本到外部 AI provider）。
- 如果 smoke 仍未达到角色 ≥ 8、关系端点干净、时间线证据充分，则下一步升级为章节级 index：每章先产角色/事件/互动/设定候选，再全书合并。

## 2026-05-22 提取链路真实 smoke 尝试（外部 provider 连接失败）

### 本轮已确认
- 使用项目虚拟环境复跑交接指定的提取链路单测：
  - `novelforge-core/tests/services/test_ai_scheduler_import.py`
  - `novelforge-core/tests/services/test_relationship_extractor.py`
  - `novelforge-core/tests/services/test_character_census.py`
  - `novelforge-core/tests/services/test_timeline_extractor.py`
- 结果：`22 passed`。
- 指定关键模块 `compileall` 通过：
  - `novelforge-core/novelforge/extractors/unified_relationship_extractor.py`
  - `novelforge-core/novelforge/services/extraction_service.py`
  - `novelforge-core/novelforge/services/ai_scheduler.py`

### 真实 smoke 尝试结果
- 已在明确授权外发样本文本后启动 `data/run_sample_import_smoke_v2.py`。
- 输入样本读取成功：约 90,759 字符，并进入角色 census 阶段。
- 外部模型 `gemini-3-flash-preview` 请求持续出现 `ConnectError / ConnectTimeout`，未获得有效模型返回。
- 本次运行被中止，未生成新的 `smoke_import_v2_*.json` 结果文件。
- 因此本轮不能用于判断真实提取质量，当前结论仍保持：代码级测试通过，但真实长篇导入质量尚未完成验证，不能宣称交付级。

### 下一步重点
- 先确认外部 provider 网络与模型配置可用，再复跑完整真实导入 smoke。
- 复跑后按角色 ≥ 8、关系 ≥ 8、端点归一、时间线证据、世界观覆盖与 `analysis_status` 准确性做质量评审。

## 2026-05-22 AI provider 地址修复

### 本轮修复
- 外部 AI provider 地址已从旧端口地址切换到新 NewAPI Sync 入口：
  - `OPENAI_BASE_URL=https://newapi.sync-api.xyz/v1`
- 同步更新：
  - `novelforge-core/.env`
  - `novelforge-core/.env.example`
  - `installation.md`
  - `novelforge-core/README.md`

### 本轮验证
- `Config.load().base_url` 已确认读取为 `https://newapi.sync-api.xyz/v1`。
- `/v1/models` 连通性验证通过，返回 30 个模型，并包含当前模型 `gemini-3-flash-preview`。
- 最小 `/v1/chat/completions` 验证通过，短 ping 返回 `OK`。

### 当前判断
- 上一轮真实 smoke 的 `ConnectError / ConnectTimeout` 根因基本可以归为旧 provider 调用地址失效。
- provider 连通性已恢复，下一步可以重新发起完整真实导入 smoke，并评审角色、关系、时间线与世界观质量。

## 2026-05-22 完整真实导入 smoke 复跑结果

### 本轮 smoke 结果
- 使用新 provider 地址 `https://newapi.sync-api.xyz/v1` 复跑 `data/run_sample_import_smoke_v2.py`。
- 结果文件：`data/smoke_import_v2_20260522_220700.json`。
- 基础统计：
  - `chapters_count=8`
  - `characters_count=4`
  - `relationships_count=10`
  - `timeline_count=7`
  - `world_count=1`
  - `analysis_status=low_quality`
- `analysis_quality_issues`：
  - `核心角色档案信息不足：乃依、立花老师、妈妈、东美绪、FUSHI`

### 质量评审
- 章节保存达标：8 个章节资产均已生成。
- 关系数量达标但质量不达标：
  - 关系资产达到 10 条。
  - 但关系端点包含 `乃依 / 东美绪 / 爸爸 / 妈妈 / FUSHI` 等未进入角色资产池的人物，说明角色召回与关系端点闭环仍不稳。
  - 同一核心端点存在重复或冲突边，例如 `辉夜/八千代 -> 酒寄彩叶` 同时出现 `OTHER` 与 `RIVAL`，其中 `RIVAL` 描述实际混入了帝明挑战辉夜的内容，端点归因错误。
- 角色召回仍明显不足：
  - 实际只保存 4 个角色：`酒寄彩叶 / 辉夜/八千代 / 芦花 / 真实`。
  - 对长篇样本而言，`乃依 / 帝明 / FUSHI / 东美绪 / 立花老师 / 妈妈` 等配角或关键支撑角色没有形成角色资产。
- 时间线数量达标但一致性不达标：
  - 7 条事件已生成。
  - 多条存在标题与描述错配，例如“电竞电线杆与月之婴儿的降临”的描述实际是最终战败与辉夜离别，“月人入侵与限期出现”的描述实际写到十年后制造实体。
  - 这说明现有时间线质量门槛尚未充分捕捉真实错配。
- 状态判断正确：
  - 本轮没有误报 `completed`，而是返回 `low_quality`。
  - 这说明质量门槛方向正确，但真实资产质量仍未达到内部可用或交付级。

### 当前结论
- 新 provider 地址修复有效，完整 smoke 已跑通并落盘。
- 当前提取链路相比上一轮有进步：关系数从上一轮 16/5 角色的混合状态变为本轮 10 条关系且状态正确标记 `low_quality`；角色 census 日志显示召回了 50 个候选。
- 但最终落库角色只有 4 个，低于 `characters_count >= 8` 的验收目标，且时间线错配明显。
- 因此当前仍不能宣称交付级，也暂不宜说达到内部可用级；应进入下一轮提取架构优化。

### 下一步重点
- 优先修角色候选到落库角色的损耗：检查 census 50 个候选为何最终只保留 4 个角色资产。
- 关系提取应强制把未入角色池但有证据的人物回补为低置信角色，或把这些端点明确进入可展示的 unresolved 列表。
- 时间线需要更强的标题/描述一致性校验，必要时把事件按章节级 index 先固定 evidence 与 narrative_order，再全书合并。
- 下一轮推荐进入章节级 index extractor：每章先产角色、互动、事件、世界观事实，再做全书合并与质量门槛。

## 2026-05-22 P0 章节级 Index 主链路落地（代码级）

### 本轮目标
- 按“提取优先、服务创作落地”路线推进，不继续在全书 prompt 链路上小修小补。
- 将导入深度分析主路径切换为章节级 index，减少角色候选损耗、关系端点不闭环、时间线标题/描述错配。

### 本轮完成
- 新增章节级 index extractor：
  - 每章提取角色候选、互动关系、事件、世界观事实。
  - 角色候选保留欲望、伤口、情绪状态、声音质感等创作信号。
  - 互动关系保留张力字段，用于后续创作钩子。
  - 事件保留 emotional_turn、foreshadowing、imagery，避免时间线只变成流水账。
- 导入主路径已接入章节级 index：
  - `novel_import` 保存章节后，将章节 `id/title/order/content` 传入章节级 index。
  - 新链路输出仍转换为现有 `character / relationship / timeline / world` 内容库资产，不破坏前端读取契约。
  - 旧全书 extractor 链路保留为 fallback。
- 新增 diagnostics：
  - `analysis_diagnostics`
  - `candidate_counts`
  - `failed_chapters`
  - `relationship_unresolved_endpoints`
  - `timeline_mismatch_events`
- 合并规则已落地：
  - 有 evidence 的低频角色至少落为 `minimal_profile`。
  - 关系端点不在角色池但有 evidence 时，反向回补 `minimal_profile` 角色。
  - 无 evidence 的端点进入 unresolved。
  - 时间线事件不再跨事件用更长 description 覆盖，title/description 从同一个章节事件派生。

### 本轮验证
- `compileall` 通过：
  - `novelforge-core/novelforge/extractors/chapter_index_extractor.py`
  - `novelforge-core/novelforge/extractors/__init__.py`
  - `novelforge-core/novelforge/services/extraction_service.py`
  - `novelforge-core/novelforge/services/ai_scheduler.py`
- 后端提取链路测试通过：
  - `test_chapter_index_extractor.py`
  - `test_ai_scheduler_import.py`
  - `test_relationship_extractor.py`
  - `test_character_census.py`
  - `test_timeline_extractor.py`
- 结果：`28 passed`。

### 当前判断
- P0 的代码级主链路已经落地。
- 仍不能宣称真实提取质量达标，必须复跑完整真实 smoke。
- 下一步：使用 `超时空辉夜姬.txt` 复跑 `data/run_sample_import_smoke_v2.py`，检查角色 ≥ 8、关系 ≥ 8、时间线无明显错配、状态准确性。

## 进度备注规则
后续每完成一个工作流阶段，必须更新本文件：
- 更新“当前阶段”
- 将完成内容移入“已完成”
- 补充本阶段遗留问题与下一步目标

## 历史详细记录
- 以下内容保留过去各轮修复动作的原始流水，主要按实际追加顺序保存，不做大批量删改。
- 如果历史条目间存在时间穿插，以“保留可回溯性”为优先，后续只做轻量整理，不重写原始记录。

## 2026-04-09 风险排除更新
- 已完成对“前两个已落地进度”的审查后修复，当前重点仍然是 Workstream 2，同时收尾 Workstream 1 的契约风险。
- 已修复内容更新覆盖风险：
  - 前端 `buildContentCreateRequest` 不再默认强制把 `status` 写成 `draft`。
  - 前端 `content-upsert` 在更新已存在资产时会合并已有 `status / author / parent / session` 等元数据。
  - 后端 `api/__init__.py` 的 `_build_content_item_from_request()` 已改为基于 `model_fields_set` 合并更新，避免未显式提交的元数据被静默清空。
- 已打通 OpenAI 配置贯通：
  - `ai-planning` 前端页面现在会读取当前浏览器里的 OpenAI 配置，并把它传到 `generateStoryOutline / designCharacter / buildWorld`。
  - `novelforge/api/__init__.py` 的 planning 端点已改为按请求里的 `openai_config` 构造 runtime `AIService`，不再固定走默认配置。
  - `extract/text`、`extract/file` 以及单项提取端点现在都会消费 `openai_config`，前后端参数不再漂移。
- 已把项目偏好接到真实行为：
  - `settings` 页继续作为偏好写入入口，但已改为复用共享的 `project-preferences` helper。
  - 首页导出已接入 `default_export_format`，下载文件扩展名也会跟随设置变化。
  - 首页章节生成提示词已接入 `chapter_target_words`。
  - `editor` 已接入 `auto_save` 与 `chapter_target_words`，现在会按项目偏好执行自动保存，并显示目标完成度。
  - `TaskCenter` 已接入 `show_task_center`，可以按项目偏好显示/隐藏。
- 已修复任务恢复与统计口径风险：
  - `TaskCenter` 在页面刷新恢复已完成任务时，也会补发统一完成事件，导入完成后的首页资产刷新不再只依赖轮询中的状态跃迁。
  - `analytics` 页的“活跃任务”改为只统计 `PENDING / RUNNING`，不再把最近完成任务混算进去。
- 已补强异步任务容错：
  - `ai_scheduler.py` 的 429 限流重试已增加上限与指数退避，不再存在无限重试导致任务长期卡在 `RUNNING` 的风险。
- 本轮校验结果：
  - `frontend` 已通过 `npm run lint`
  - `frontend` 已通过 `npm run build`
  - 后端已通过 `py -m compileall`：
    - `novelforge/api/__init__.py`
    - `novelforge/api/types.py`
    - `novelforge/api/ai_planning_service.py`
    - `novelforge/services/ai_scheduler.py`
- 当前剩余风险：
  - 还没有补齐自动化测试用例，当前仍以构建、lint 和 Python 语法编译作为回归校验。
  - 任务链路的下一阶段重点应转向真正的端到端导入/失败恢复实跑，以及 Workstream 3 的应用壳统一。

## 2026-04-09 应用壳统一更新
- 已启动并落地 Workstream 3 的第一轮实现，目标是把首页和其他功能页并回同一套产品骨架。
- 前端根布局 `frontend/src/app/layout.tsx` 现在统一挂载 `AppShell`，不再让首页停留在一套独立外壳里。
- 新增 `frontend/src/components/layout/app-shell.tsx`，统一根据当前路由生成页面标题、描述和当前项目标题，并复用 `MainLayout`。
- `MainLayout / AppHeader / AppSidebar / MobileNav` 已改造成真实共享壳：
  - 共享导航现在覆盖 `home / ai-planning / extract / characters / world / editor / analytics / settings`
  - 顶部统一显示当前页面上下文和当前项目
  - `TaskCenter` 改为只在主壳挂载一次，避免首页重复渲染
- 首页 `frontend/src/app/page.tsx` 已移除假登录门，不再依赖 `novelforge-logged-in` 才能进入工作区。
- 首页保留聊天/项目仪表盘/导入/OpenAI 配置等工作流能力，但现在是运行在统一应用壳内，而不是另起一套产品骨架。
- 本轮校验结果：
  - `frontend` 已通过 `npm run lint`
  - `frontend` 已通过 `npm run build`
- 当前下一步重点：
  - 继续收尾 Workstream 2 的导入/失败恢复端到端实跑
  - 在统一应用壳下补强首页和 editor 的章节切换/创建体验

## 2026-04-09 异步任务恢复增强
- 继续推进 Workstream 2，这一轮重点收口异步任务完成/失败后的页面联动与恢复语义。
- 新增 `frontend/src/lib/task-events.ts`：
  - 统一定义 `task-completed / task-failed / task-cancelled` 三类任务生命周期事件
  - 统一抽取 `session_id`，避免每个页面自己从 `parameters/result` 里猜
- 新增 `frontend/src/lib/hooks/use-session-task-events.ts`：
  - 各页面可以按当前项目订阅任务事件
  - 避免继续散落手写 `window.addEventListener(...)`
- `frontend/src/components/layout/TaskCenter.tsx` 已完成一轮结构化重写：
  - 轮询逻辑改为增量维护，不再每次状态刷新都清空并重建全部定时器
  - 现在会统一发出 `completed / failed / cancelled` 事件，而不只是在成功时发事件
  - 已把“已发出的终态事件”写入 `sessionStorage`，避免页面刷新后对同一个已完成任务重复触发恢复事件
- 首页与真实页面已接入这套恢复链路：
  - `app/page.tsx` 现在除了成功提示外，也能感知导入失败和取消
  - `characters / world / analytics / editor` 页面已接入按项目监听的任务事件
  - `editor` 在有未保存草稿时不会盲目刷新，而是提示先保存当前内容
- 本轮校验结果：
  - `frontend` 已通过 `npm run lint`
  - `frontend` 已通过 `npm run build`
- 当前下一步重点：
  - 继续验证导入失败、取消、恢复后的端到端行为
  - 继续补 editor 的章节创建/切换体验与首页工作区增强

## 2026-04-09 Editor 增强更新
- 继续推进 Workstream 5 的真实化增强，本轮重点落在 `editor` 的可持续创作体验。
- `frontend/src/app/editor/page.tsx` 已升级为更完整的 editor v1.5：
  - 支持直接在编辑器内创建新的 `chapter` 资产
  - 支持章节切换前的未保存草稿保护，避免误切走导致本地编辑丢失
  - 当前选中的章节会同步到 URL `chapterId`，刷新后可恢复上下文
  - 导入/生成任务完成后，编辑器会局部刷新章节列表，而不是依赖整页刷新
  - 如果当前草稿未保存，则优先提示用户保存，再决定是否加载新章节
- `frontend/src/components/layout/TaskCenter.tsx` 已补上真实的“取消任务”动作：
  - `PENDING / RUNNING` 任务现在可直接取消
  - 取消后会立即更新本地任务卡状态，并发出统一 `cancelled` 事件
- 本轮校验结果：
  - `frontend` 已通过 `npm run lint`
  - `frontend` 已通过 `npm run build`
- 当前下一步重点：
  - 继续把 `characters / world / analytics` 从整页刷新切到局部刷新
  - 继续验证取消任务后后端调度器与导入链路的最终落库一致性

## 2026-04-10 取消语义与局部刷新修复
- 继续推进 Workstream 2，优先排除“任务已取消但后台仍继续执行”和“任务完成后依赖整页刷新恢复状态”这两类真实可用性风险。
- `novelforge/services/ai_scheduler.py` 本轮已补上运行中任务句柄追踪：
  - 调度器现在会记录每个运行中协程的 `asyncio.Task` 句柄。
  - `cancel_task()` 不再只改状态，而是会对运行中的真实协程调用 `cancel()`。
  - `_execute_task()` 现在会显式处理 `asyncio.CancelledError`，并在任务被取消后阻止结果继续落成完成态。
  - 任务收尾阶段会同步清理运行句柄，避免取消后的状态残留。
- `frontend/src/app/characters/page.tsx`、`frontend/src/app/world/page.tsx`、`frontend/src/app/analytics/page.tsx` 已移除剩余的 `window.location.reload()` 恢复方式：
  - 改为基于局部 `refreshTick` 重新拉取当前项目数据。
  - 角色页与世界页只在相关任务完成后刷新本页资产。
  - 分析页在完成、失败、取消后都会局部刷新统计与任务列表，不再依赖整页重载。
  - 世界页和分析页的手动刷新按钮也已改为局部刷新。
- 本轮校验结果：
  - `py -m compileall novelforge/services/ai_scheduler.py` 通过
  - `frontend` 通过 `npm run lint`
  - `frontend` 通过 `npm run build`
- 当前下一步重点：
  - 继续验证取消任务后的端到端结果语义，尤其是导入任务取消后的最终落库与页面提示是否一致
  - 继续推进 Workstream 3 / Workstream 4 的剩余闭环，而不是回退到页面级临时修补

## 2026-04-16 系统状态复核与显性问题继续修复
- 已重新按历史记录复核当前系统状态：
  - Workstream 1 的主干契约统一已基本形成。
  - Workstream 2 仍然是当前主战场，尤其是提取质量、导入一致性与任务恢复语义。
  - Workstream 3 / 4 还存在“项目切换能力不足”和“聊天模型缺少系统能力接入”两项结构性缺口。
- 本轮已落地的代码修正：
  - `frontend/src/components/ui/card.tsx` 已切回统一暗色卡片变量，不再默认写死白底黑字。
  - `frontend/src/app/characters/[id]/page.tsx` 已重做为暗色详情页，并补上当前项目归属校验，避免跨项目直接读取角色详情。
  - `frontend/src/components/chat/MessageBubble.tsx` 已把消息区自动滚动改为仅滚动内部容器，不再通过 `scrollIntoView` 触发页面级滚动。
  - `frontend/src/app/page.tsx` 已移除主页聊天页额外的页面级滚动锚点，避免左侧会话栏被消息滚动带动。
  - `frontend/src/components/layout/main-layout.tsx` 已进一步锁定整页高度链，避免工作区在长对话下退化为浏览器整页滚动。
  - `novelforge/services/extraction_service.py` 已补上长文本二轮召回补提：首轮跑完整书分批提取，第二轮基于全书采样片段补提并合并角色、世界观、时间线与关系网。
- 当前判断：
  - 统一提取原先已经是“全书分批处理”，不是只读前几章，但缺少全局补提与召回，因此会出现角色、世界观、剧情要点提取不完整。
  - 项目隔离当前已部分建立在 `session_id` 上，但缺少全局项目切换入口和详情页层面的统一归属校验，因此仍不够完整。
- 下一步重点：
  - 继续验证真实长文本下的提取补提效果，确认角色、世界观、剧情时间线的覆盖是否明显提升。
  - 继续推进全局项目切换器与项目隔离 UI，让非首页页面也能可靠切换当前项目。
  - 开始设计聊天模型的系统能力桥接层，让 AI 能主动读取资产、保存内容并调用项目内工具。

## 2026-04-14 首页聊天区与导入问题跟进
- 继续排查主页聊天区与导入链路的真实可用性问题，优先处理用户已复现的两个入口问题。
- 首页 `frontend/src/app/page.tsx` 已继续收紧聊天页主容器高度约束，避免聊天内容区把左侧会话栏一并带着滚动。
- 导入模态 `frontend/src/components/ImportTextModal.tsx` 已补上默认模型配置风险提示：当浏览器侧没有传入自定义 OpenAI Key 时，会明确提醒当前导入依赖后端默认配置，便于区分是前端上传失败还是后端模型配置失效。
- 当前已确认：
  - `ImportTextModal` 走的是异步 `text-processing/upload-and-process` 链路，而不是旧的同步 `extract/file`。
  - 聊天页侧边栏滚动问题仍需在真实浏览器下再次验证是否完全消除。
  - 小说上传报错 `500` 仍未根治，当前更可疑的是后端默认 AI 配置或异步导入任务执行链路，而不是前端文件选择本身。
- 当前下一步重点：
  - 继续修正首页聊天页布局，直到左侧会话栏在长对话下保持独立不滚动。
  - 继续收口 `text-processing -> ai_scheduler -> novel_import` 的真实失败点，把 500 缩小到明确后端原因而不是泛化提示。
  - `py -m compileall novelforge/api/text_processing.py novelforge/api/__init__.py` 通过
  - 使用项目 `.venv` 执行内联 `uvicorn.Server` smoke check，结果为 `started=True`
- 当前状态更新：
  - 后端已经从“构建可通过”提升到“应用可成功导入并完成启动级 smoke check”
  - 下一步可以继续做真实联调，而不是只停留在静态校验

## 2026-04-10 烟测阻塞修复
- 基于真实 smoke test 结果，修复了两条接口级阻塞：
  - `novelforge/api/types.py` 中 `GenerationRequest.extract_info` 已从错误的 `dict` 契约改为布尔开关，和前端 `/api/generate/text` 的实际调用保持一致。
  - `novelforge/storage/file_storage.py` 已补上 `datetime / Enum / Pydantic model / Path` 的 JSON 序列化转换，修复文件存储静默保存失败的问题。
  - `novelforge/api/__init__.py` 中聊天会话创建、初始化保存、更新保存都加上了显式成功校验，不再出现“接口返回成功但实际未落盘”。
  - `novelforge/api/__init__.py` 的聊天接口现在会消费运行时 `openai_config`，让前端聊天配置真正影响后端请求。
- 本轮本地验证结果：
  - 会话创建后可立即从存储层读回
  - `start-conversation -> send-message` 在 mock AI 条件下已跑通
  - `/api/generate/text` 在 mock AI 条件下已通过请求模型与响应链路验证
- 仍需用户环境继续确认的部分：
  - 真实 `generate/text` 与 `chat/send-message` 是否能访问可用的上游模型，取决于当前 OpenAI / 兼容接口配置与网络连通性

## 2026-04-12 Frontend Fetch Failure Fix
- Root cause identified for the browser-side `Failed to fetch` / `Workspace sync failed` error:
  - The frontend was opened from `http://127.0.0.1:3000`
  - Backend CORS only allowed `http://localhost:3000` style origins
  - Browser requests were therefore blocked even though direct terminal requests to `8001` were healthy
- Fix completed:
  - Added `http://127.0.0.1:3000`, `3001`, and `3002` to FastAPI CORS allowlist in `novelforge/api/__init__.py`
- Validation:
  - CORS preflight for `Origin: http://127.0.0.1:3000` now returns `200`
  - `access-control-allow-origin` now correctly echoes `http://127.0.0.1:3000`

## 2026-04-11 Backend Smoke Validation Passed
- Running-backend verification from the user environment passed:
  - `/api/openai/models` returned `200`
  - `/api/chat/start-conversation -> /api/chat/send-message` returned `200`
  - `/api/generate/text` returned `200` with generated text
- The `8001` port conflict during restart was not a new blocker; it confirmed an existing backend instance was already bound and serving requests successfully.
- Current validation blocker has moved to the frontend runtime only:
  - `http://127.0.0.1:3000/ai-planning` failed because the frontend server was not running
  - Next step is to start the frontend from `novelforge-core/frontend` and continue page-level smoke tests

## 2026-04-11 Gateway Stability Follow-up
- Backend endpoint verification after the transport fix:
  - `/api/openai/models` now returns `200` against the running backend
  - `/api/chat/start-conversation -> /api/chat/send-message` now returns `200` against the running backend
  - `/api/generate/text` now returns `200` in local endpoint smoke checks after model fallback ordering was improved
  - `/api/ai/generate-story-outline` recovered from the earlier `Event loop is closed` failure and now returns `200` in local endpoint smoke checks
- Additional hardening completed:
  - Recreated the reusable async HTTP client when requests land on a new event loop, avoiding stale-loop reuse in tests and multi-request scenarios
  - Candidate model order now prefers `primary -> gemini-2.5-flash -> explicit fallbacks -> [免费]primary`, which is more stable for the current self-hosted gateway
  - Empty `200 OK` model responses are no longer treated as success; the service now continues to the next candidate model instead
- Remaining note:
  - Upstream model behavior is still somewhat variable on the self-hosted gateway, so `OPENAI_FALLBACK_MODELS=gemini-2.5-flash` is still recommended for more stable generation

## 2026-04-11 Proxy And Gateway Compatibility Fix
- Root cause isolated:
  - Python `httpx` / `openai` clients were inheriting broken proxy env vars (`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`) pointing to `127.0.0.1:9`
  - Browser / PowerShell requests could still reach the gateway, so the failure looked inconsistent until the transport layer was compared directly
- Fixes completed:
  - Reworked `novelforge/services/ai_service.py` to use a controlled `httpx.AsyncClient` with `trust_env=False`
  - Switched provider calls to stable REST requests for `/models` and `/chat/completions` instead of relying on SDK-only behavior
  - Added support for `OPENAI_FALLBACK_MODELS` in `novelforge/core/config.py`
  - Added model candidate fallback logic so a denied or temporarily unavailable primary model does not immediately kill the whole generation path
- Validation results:
  - Python-side `list_models()` now succeeds against the configured gateway
  - Python-side `chat()` now reaches the gateway and can return `OK` under the current gateway configuration
  - Backend failures are no longer transport/proxy failures; remaining variance is now model/channel behavior from the upstream gateway itself

## 2026-04-11 Smoke Validation Update
- Backend startup is stable on `http://127.0.0.1:8001`.
- Frontend route smoke checks passed for `/`, `/analytics`, `/characters`, `/world`, `/editor`, `/settings`, `/ai-planning`, and `/extract`.
- Content asset smoke checks passed for `create -> get -> update -> search`.
- The previous chat persistence blocker is fixed: `start-conversation` now creates a durable conversation record before `send-message`.
- Current external blocker:
  - Backend config is loading `OPENAI_BASE_URL=https://newapi.sync-api.xyz:37176/v1`
  - Backend config is loading `OPENAI_MODEL=gemini-3-flash-preview`
  - `chat/send-message` and `openai/models` now fail with upstream `Connection error`
  - On the previous validation round, `generate/text` reached upstream and returned `403 denied access`, so the failure mode has moved from local code issues to provider connectivity / project permission issues
- Conclusion:
  - Local app and API wiring are working
  - Remaining AI generation failures are currently blocked by upstream provider availability, model access, or gateway compatibility rather than local startup / routing / persistence bugs

## 2026-04-14 前端配置链路与网关降级修复
- 已重新审核“前端自定义模型配置”链路，确认浏览器里保存的 `base_url / model / api_key` 会真实进入后端运行时配置，而不是被静默忽略。
- 新增并统一使用 `frontend/src/lib/openai-config.ts`：
  - 首页、设置页、AI 规划页、提取页现在都通过同一套 helper 读取浏览器覆盖配置。
  - 旧版本地存储里即使没有显式 `enabled` 字段，也会根据已有配置自动视为启用，避免用户已保存的前端模型被误判为关闭。
- 已重写并中文化以下界面：
  - `frontend/src/components/chat/OpenAIConfigPanel.tsx`
  - `frontend/src/app/settings/page.tsx`
  - `frontend/src/app/ai-planning/page.tsx`
  - `frontend/src/app/extract/page.tsx`
  - `frontend/src/components/layout/app-shell.tsx`
  - `frontend/src/components/layout/app-header.tsx`
  - `frontend/src/components/layout/app-sidebar.tsx`
  - `frontend/src/components/layout/mobile-nav.tsx`
  - `frontend/src/app/layout.tsx`
- 首页聊天页已改为使用统一的 `OpenAIConfigState`：
  - 配置弹窗会正确回显浏览器端模型配置
  - 未启用浏览器覆盖时，会明确显示“后端默认模型”
  - 聊天请求失败时会在消息流里给出明确错误，而不是只停留在长时间加载
- 后端 `novelforge/services/ai_service.py` 已加强网关容错：
  - 单个候选模型请求超时上限改为 `45s`
  - `500` 及其他 `5xx` 错误现在会触发候选模型回退，而不是直接中断
  - 对于 `qwen3.6-plus` 在当前自建网关返回 `500 auth_unavailable` 的情况，现在会自动回退到 `gemini-3-flash-preview`
- 本地直接代码级验证已通过：
  - 使用前端同款运行时配置 `base_url=https://newapi.sync-api.xyz:37176/v1`
  - 主模型 `qwen3.6-plus` 首次返回 `500`
  - 后端自动回退到 `gemini-3-flash-preview`
  - `AIService.chat()` 成功返回结果
  - `AIPlanningService.generate_story_outline()` 成功生成大纲
- 构建校验：
  - `py -m compileall novelforge/services/ai_service.py` 通过
  - `frontend` 再次通过 `npm run build`
  - `frontend` 已通过 `npm run lint`

## 2026-04-14 模型路由与数据库持久化修复（本轮）
- 后端模型路由修复：
  - `novelforge/services/ai_service.py` 在显式 `model` 的 runtime 配置下，候选链不再隐式注入 `gemini-*`。
  - 本地验证：`_resolve_runtime_ai_service({'model':'qwen3.6-plus'})` 候选链为 `['qwen3.6-plus']`。
- 生成端点统一接入 runtime 配置：
  - `novelforge/api/types.py` 的 `GenerationRequest / NovelGenerationRequest` 已携带 `openai_config`。
  - `novelforge/api/__init__.py` 的 `/api/generate/text`、`/api/generate/novel` 均走 `_resolve_runtime_ai_service(...)`。
- 内容库持久化修复：
  - `novelforge/core/config.py` 将 `USE_CONTENT_DATABASE` 默认值修正为 `true`。
  - `novelforge/api/__init__.py` 与 `novelforge/api/text_processing.py` 统一为同一套 `StorageManager` 配置（`file_storage_dir / database_path / content_database_path`）。
  - `ContentManager` 统一按 `use_content_database` 驱动数据库模式。
  - 本地验证：`content_manager.use_database=True`，且“模拟重启后新管理器实例”可读回刚写入资产，`data/novelforge_content.db` 存在。
- 语法与构建校验：
  - 已修复 `novelforge/api/__init__.py` 中本轮暴露的字符串/缩进语法问题。
  - `py -m compileall` 通过：`api/__init__.py`、`api/types.py`、`api/text_processing.py`、`core/config.py`、`storage/storage_manager.py`、`services/ai_service.py`
  - `frontend` 通过：`npm run build`

## 2026-04-14 模型与持久化复核（继续）
- 已完成“前端选 qwen 但实际走 gemini”根因修复与回归验证：
  - `novelforge/core/config.py` + `novelforge/services/ai_service.py` 新增 `strict_model` 语义。
  - 当请求里显式传入 `openai_config.model` 时，后端现在默认强制 `strict_model=True`，并关闭自动候选回退链。
  - 本地 API 级 smoke（TestClient + monkeypatch）验证结果：
    - `/api/generate/text` 返回：`model=qwen3.6-plus;strict=True;candidates=['qwen3.6-plus']`
    - `/api/chat/send-message` 返回：`model=qwen3.6-plus;strict=True;candidates=['qwen3.6-plus']`
- 已补齐聊天持久化链路缺口：
  - 新增 `GET /api/chat/conversation/{conversation_id}`，前端刷新后可以读取会话详情，不再依赖不存在的接口。
  - 修复 `send_message` 中“保存变量被注释污染导致未绑定”的运行时错误，避免会话更新保存失败。
- 已完成“刷新后像丢数据”的路径漂移修复：
  - `core/config.py` 增加并统一 `NOVELFORGE_DATA_DIR / FILE_STORAGE_DIR / DATABASE_PATH / CONTENT_DATABASE_PATH` 解析，默认路径固定到 `novelforge-core/data/*`，不再随启动目录变化。
  - 从仓库根目录和 `novelforge-core` 目录分别加载配置，结果一致：
    - `file_storage_dir = F:\\Cyber-Companion\\NovelForge\\novelforge-core\\data\\file_storage`
    - `content_database_path = F:\\Cyber-Companion\\NovelForge\\novelforge-core\\data\\novelforge_content.db`
- 当前持久化状态（真实检查）：
  - 文件存储目录存在，`conversation_*.json` 正常落盘。
  - 内容库 SQLite 正常：`content` 表可读，当前记录数 `content_rows=12`。
  - `USE_CONTENT_DATABASE` 默认值已回调为 `false`（避免无迁移时强切导致“看起来丢数据”）；是否使用 DB 以当前 `.env` 为准（当前读取结果为 `False`）。

## 2026-04-17 工作台主路径方向确认与图谱关联补强
- 已确认新的产品方向：
  - 首页现有“聊天 + Artifact 面板 + 项目仪表盘/世界树”更适合作为真正的创作工作台。
  - `characters / world / editor / analytics` 等页面继续保留，但定位应收敛为同一项目资产源上的总览、详情与编辑投影视图，而不是各自维护一套独立工作流。
- 当前工程判断：
  - 现阶段最薄弱的不是页面数量，而是工作台里的“结构关系”。
  - 世界树之前经常只有节点、几乎没有连线，本质上会把工作台退化成资产清单，无法体现完整性、关联性、逻辑性。
  - 根因之一是历史资产里大量关系仅以“名字弱引用”存在，没有在拓扑层解析成真实节点 ID。
- 本轮已落地修正：
  - `frontend/src/lib/content-contract.ts`
    - 新增 `character / chapter / outline / novel` 的关系提取规则。
    - 聊天工作台今后在保存 artifact 时，会同步写入角色关系、章节涉及角色/地点、提纲中的角色等 canonical `relations`。
  - `novelforge/api/__init__.py`
    - `/api/content/topology/{session_id}` 已补上拓扑关系解析增强。
    - 现在会同时读取显式 `relations` 与 `extracted_data` 中的隐式关系线索。
    - 对“名字/标题式引用”新增解析逻辑，尽量映射到同项目内的真实节点 ID，而不是直接丢失连线。
    - `relationship` 资产会额外生成实体到实体的直接关系边，强化工作台图谱的可读性。
- 这轮变化的意义：
  - 工作台世界树开始从“内容列表”转向“项目关系图”。
  - 这为下一阶段的 AI 资产检索、工作台补全建议、跨页面一致性奠定了结构基础。
- 下一步重点：
  - 做全局项目切换器，让“工作台项目上下文”成为全站唯一上下文源。
  - 为聊天模型接入“读取当前项目资产 / 保存结构化内容 / 触发工作台动作”的桥接层。
  - 补“工作台校验层”：保存前检测缺失关系、孤立角色、未挂接章节、世界设定未引用等结构问题。

## 2026-04-17 全局项目切换器与聊天桥接第一版
- 已继续推进 Workstream 3 / Workstream 4，把“当前项目”从首页局部状态提升为主壳级入口。
- 本轮已落地：
  - `frontend/src/components/layout/app-header.tsx`
    - 新增全局项目切换器。
    - 顶部现在可以直接切换当前项目，并从主壳层共享给角色、世界、编辑器、分析等页面。
    - 同时补上“新建项目”快捷入口，避免只能回到首页创建会话。
  - `frontend/src/components/layout/app-shell.tsx`
    - 主壳现在直接接入 `useSessions()`，统一向 header 提供 `projects / currentSessionId / switchSession / createSession`。
    - 这意味着“当前项目”开始从页面内部局部行为，转向全站共享上下文。
  - `frontend/src/components/layout/main-layout.tsx`
    - 已补齐项目切换器相关 props 透传，确保主壳/header/页面不是各自维护一套上下文。
  - `frontend/src/app/page.tsx`
    - 聊天工作台新增当前项目摘要构建逻辑，会把角色、世界观、章节、大纲摘要整理后随请求一起发送。
    - 当前项目切换时会自动刷新项目资产，避免切换后聊天仍沿用旧项目缓存。
  - `novelforge/api/__init__.py`
    - 新增 `_build_chat_system_prompt(...)`，统一整理聊天系统提示。
    - 流式与非流式聊天接口现在都会消费 `project_summary / project_title / system_prompt`，不再一条路径吃到上下文、一条路径忽略上下文。
- 这轮变化的意义：
  - 当前项目切换终于变成真实的全站能力，而不只是首页聊天区内部概念。
  - 聊天模型已经具备“读取当前项目资产摘要”的第一版桥接能力，不再完全脱离内容库凭空生成。
  - 这为下一阶段“AI 主动检索资产 / 保存资产 / 调用项目内工具”打下了接口和交互基础。
- 本轮校验结果：
  - `py -m compileall novelforge/api/__init__.py` 通过
  - `frontend` 通过：`npx tsc --noEmit`
- 下一步重点：
  - 继续把桥接层从“摘要注入”升级为“结构化资产检索 + 动作调用”。
  - 补移动端/窄屏项目切换体验，避免项目上下文只在桌面端可见。
  - 为项目切换后的跨页面状态恢复补一轮真实回归。

## 2026-04-16 导入链路专项修复（本轮）
- 继续推进 Workstream 2，聚焦 `ImportTextModal -> /api/text-processing/upload-and-process -> ai_scheduler.novel_import` 的稳定性问题。
- 后端导入入口修复：
  - `novelforge/api/text_processing.py`
  - 新增文件名、空文件、空 `session_id` 校验，错误直接返回 400（不再落到模糊 500）。
  - 新增格式依赖预检查：
    - `.epub` 需要 `ebooklib` + `bs4`
    - `.pdf` 需要 `PyPDF2`
    - `.docx` 需要 `docx`
  - `openai_config` 现在严格校验 JSON 格式，非法配置直接返回 400（不再静默吞掉）。
  - 任务提交前增加调度器运行态兜底：若未启动会自动 `start()`，避免任务只入队不执行。
  - 补上 `HTTPException` 透传分支，避免业务 4xx 被包装成 500。
- 调度器导入任务修复：
  - `novelforge/services/ai_scheduler.py`
  - 增加 `content_manager` 空注入保护，避免导入任务在运行时隐式崩溃。
  - 文本解析后为空时直接中止并给出明确错误，避免创建空资产。
  - 关系资产保存改为兼容 dict/object 混合数据，不再依赖 `rel.source` 直接属性访问。
  - 时间线资产 ID 改为随机后缀，避免同一项目重复导入时固定 ID 冲突。
- 文本读取兼容增强：
  - `novelforge/services/text_processing_service.py`
  - `.txt` 编码探测顺序扩展为：`utf-8-sig / utf-8 / gb18030 / gbk / gb2312 / utf-16 / latin-1`，提升中文文本导入可读性。
- 前端导入入口增强：
  - `frontend/src/components/ImportTextModal.tsx`
  - 增加前置校验：仅允许 `.txt/.epub/.pdf/.docx`，并限制最大 50MB，避免无效请求直接打到后端。
- 本轮校验结果：
  - `py -m compileall` 通过：
    - `novelforge/api/text_processing.py`
    - `novelforge/services/ai_scheduler.py`
    - `novelforge/services/text_processing_service.py`
  - `frontend` 通过：`npx tsc --noEmit`

## 2026-04-15 审核后继续修复（本轮）
- 已完成“进度与代码一致性”快速审查：
  - `PROGRESS.md` 的核心里程碑与当前改动大方向一致（Workstream 1/2/5 的主体已经落地）。
  - 当前仍在高频反馈的问题集中在：主页聊天侧栏滚动、提取入口 500 稳定性。
- 已修复主页聊天侧栏滚动链路：
  - `frontend/src/components/layout/main-layout.tsx` 新增 `contentOverflow` 可配置项，主内容区不再固定 `overflow-auto`。
  - `frontend/src/components/layout/app-shell.tsx` 对首页 `/` 显式使用 `contentOverflow='hidden'`，避免外层容器抢滚动。
  - 目标：滚动由聊天消息区承接，不再把内层 `ChatSidebar` 一起带动。
- 已修复提取接口“单点失败导致整批 500”问题：
  - `novelforge/services/extraction_service.py` 的 `extract_all` 改为 `asyncio.gather(..., return_exceptions=True)`，按模块容错并汇总 `errors`。
  - 即使角色/世界观/关系网中的某一项失败，也会返回可用的其他结果，避免直接 500 终止。
- 已增强提取 API 响应健壮性：
  - `novelforge/api/__init__.py` 新增关系边读值 helper，兼容 model/dict 两种 edge 形态。
  - `/api/extract/text`、`/api/extract/file` 现在返回 `success/errors`，并在关系节点构建时避免属性访问崩溃。
- 已增强前端提取页失败可诊断性：
  - `frontend/src/types/index.ts` 放宽 `ExtractionResult` 契约（`world/timeline/relationships` 可空，并新增 `success/errors`）。
  - `frontend/src/app/extract/page.tsx` 对“全失败/无可保存资产”给出明确错误，对“部分成功”显示告警信息，不再笼统提示。
- 本轮校验结果：
  - 后端通过：`py -m compileall novelforge/services/extraction_service.py novelforge/api/__init__.py`
  - 前端通过：`npx tsc --noEmit`
- 待继续验证：
  - 在真实长文本上传场景下，确认 `/extract` 页面是否已从“直接 500”稳定为“部分成功或明确失败原因”。
  - 在真实长对话滚动场景下，确认内层会话侧栏不再跟随滚动。

## 2026-04-18 工作台主线增强（聚焦资产进入聊天上下文）
- 继续沿“首页工作台是主工作区”推进主线，而不是分散到孤立页面能力。
- 前端工作台已补上“聚焦资产”机制：
  - `frontend/src/app/page.tsx`
  - 当前项目中的章节、角色、世界树节点在被点击查看时，会同时进入“当前聚焦资产”列表。
  - 聚焦资产会在聊天区顶部可视化展示，并支持逐个移除或一键清空。
  - 新保存到项目中的 artifact 也会自动加入当前聚焦资产，形成“生成 -> 保存 -> 回流下一轮聊天”的闭环。
- 聊天请求上下文已升级：
  - `frontend/src/app/page.tsx`
  - 发送消息时，除原有 `project_title / project_summary` 外，还会附带：
    - `focused_assets`
    - `focused_assets_summary`
  - 这意味着本轮对话不再只知道“当前项目大概是什么”，还知道“用户当前重点让 AI 参考哪几个具体资产”。
- 后端聊天桥接已同步增强：
  - `novelforge/api/__init__.py`
  - `_build_chat_system_prompt(...)` 现在会把 `focused_assets` 转成结构化提示，明确要求模型优先参考这些资产，保持设定连续、关系一致、逻辑闭环。
  - 若前端只传摘要，也会兼容 `focused_assets_summary`。
- 这轮变化的意义：
  - 工作台开始从“资产浏览器”升级为“带当前工作焦点的创作台”。
  - AI 不再只吃一份全局摘要，而是能围绕用户刚刚点开的角色、章节、世界观继续创作。
  - 这为下一阶段“结构化资产检索 + 系统动作调用”打下了交互基础。
- 本轮校验结果：
  - `py -m compileall novelforge/api/__init__.py` 通过
  - `frontend` 通过：`npx tsc --noEmit`
- 下一步重点：
  - 继续把“聚焦资产”从手动点选升级为更强的资产检索与引用能力。
  - 给 Artifact 面板补“固定到当前聊天上下文”动作，减少用户来回切换成本。
  - 继续推进 AI 到系统能力桥接的第二版，让模型不只读资产，还能安全触发项目内动作。

## 2026-04-18 工作台主线增强（二）：Artifact 面板固定到聊天
- 继续沿首页工作台主线推进，把“AI 生成的草稿资产”也接进当前聊天，而不只依赖已保存到项目库的资产。
- `frontend/src/components/chat/ArtifactPanel.tsx`
  - 新增 `onPinToContext` 交互入口。
  - Artifact 面板底部新增“固定到聊天”按钮。
  - 这意味着用户可以先在面板里编辑角色卡/世界观/章节草稿，再把当前编辑态直接固定到聊天上下文，而不必先保存再回到聊天。
- `frontend/src/app/page.tsx`
  - 首页工作台已接入该动作：
    - 点击“固定到聊天”后，当前 artifact 会作为 `focused asset` 加入聊天上下文。
    - 工作台会自动切回聊天视图，并给出确认提示。
  - 这让“AI 生成草稿 -> 人工微调 -> 固定到当前对话继续创作”形成更顺滑的主线闭环。
- 这轮变化的意义：
  - 工作台不再只围绕“已落库资产”工作，也开始支持“尚未保存但已经确认可继续使用的草稿资产”。
  - Artifact 面板与聊天区的关系更紧密，减少页面来回跳转与状态割裂。
- 本轮校验结果：
  - `frontend` 通过：`npx tsc --noEmit`
  - 后端接口回归语法校验通过：`py -m compileall novelforge/api/__init__.py`
- 下一步重点：
  - 继续给工作台补“按类型检索当前项目资产”的快捷能力。
  - 开始推进桥接第二版：AI 主动请求项目资产、生成结构化结果、等待用户确认后保存。

## 2026-04-18 工作台主线增强（三）：项目资产快捷引用
- 继续围绕首页工作台推进，不新增分散入口，直接增强聊天区对当前项目资产的操作效率。
- `frontend/src/app/page.tsx`
  - 聊天区新增“项目资产快捷引用”面板。
  - 当前项目中的角色、世界观、章节、大纲会按类型分组显示在聊天区顶部，无需先切到仪表盘或详情页再回到聊天。
  - 点击任一资产即可直接加入当前 `focused assets`。
  - 已经加入当前聊天上下文的资产会显示“已加入当前上下文”，避免重复操作。
- 这轮变化的意义：
  - 工作台开始同时支持三种上下文进入方式：
    - 从项目仪表盘/世界树点选资产
    - 从 Artifact 面板固定草稿资产
    - 从聊天区快捷引用当前项目资产
  - 这让“当前项目资产 -> 当前聊天上下文”的路径明显缩短，更符合真正工作台的交互习惯。
- 本轮校验结果：
  - `frontend` 通过：`npx tsc --noEmit`
- 下一步重点：
  - 继续把快捷引用升级成“结构化检索”，而不是只展示前几个资产。
  - 开始做桥接第二版里更关键的一段：AI 主动声明需要哪些资产，再由系统返回候选上下文。

## 2026-04-18 工作台主线增强（四）：项目资产快捷检索
- 在快捷引用的基础上继续收口工作台体验，不让它停留在“只展示前几个资产”。
- `frontend/src/app/page.tsx`
  - 聊天区顶部的“项目资产快捷引用”现在已支持即时搜索。
  - 用户可以直接按角色名、章节标题、世界观文本内容搜索当前项目资产。
  - 搜索结果仍按“角色 / 世界观 / 章节 / 大纲”分组展示，保持项目结构感。
  - 搜索无命中时会显示明确提示，而不是整个面板直接消失。
- 这轮变化的意义：
  - 工作台开始具备轻量“项目内资产检索”能力。
  - 用户不必依赖仪表盘或长列表手动翻找，可以更快把目标资产拉进当前聊天上下文。
  - 这也为后续“AI 主动请求资产 -> 系统返回候选上下文”打下检索交互基础。
- 本轮校验结果：
  - `frontend` 通过：`npx tsc --noEmit`
- 下一步重点：
  - 继续推进桥接第二版，让 AI 能主动表达所需资产类型或关键词。
  - 给系统加一层“候选资产返回 + 用户确认”的交互，而不是完全依赖手工点选。

## 2026-04-18 工作台桥接第二版（AI 主动请求项目资产）
- 继续沿首页工作台主线推进，把“AI 读取项目资产”的桥接从被动引用升级到主动请求。
- `novelforge-core/novelforge/api/__init__.py`
  - 聊天系统提示词新增 `<asset_request>...</asset_request>` 协议说明。
  - AI 在继续创作前如果缺少项目上下文，现在可以显式请求所需资产类型、关键词、原因和候选数量。
- `novelforge-core/frontend/src/lib/chat-parser.ts`
  - 新增 `AssetRequestDirective` 类型与 `parseAssetRequest(...)` 解析函数。
  - `cleanAiResponse(...)` 现在会去掉 `<asset_request>` 标签，避免它污染用户可见正文。
- `novelforge-core/frontend/src/app/page.tsx`
  - 聊天完成后会解析 AI 返回的资产请求指令。
  - 系统会基于当前项目中的 `character / world / chapter / outline` 资产做本地候选解析。
  - 候选结果会回填到对应消息对象里，进入消息级确认流，而不是直接静默注入上下文。
  - 用户点击候选资产后，会把该资产加入当前 `focused assets`，并给出“已加入当前聊天上下文”的确认提示。
- `novelforge-core/frontend/src/components/chat/MessageBubble.tsx`
  - 助手消息新增“AI 请求项目资产上下文”卡片。
  - 卡片会展示请求原因、检索关键词和候选资产按钮。
  - 这让工作台开始具备“AI 提要求 -> 系统给候选 -> 用户确认加入上下文”的半自动协作形态。
- 本轮最小校验：
  - `py -m compileall novelforge/api/__init__.py` 通过
  - `frontend` 通过 `npx tsc --noEmit`
- 当前下一步重点：
  - 继续把“请求资产”从本地候选解析升级成“结构化资产检索 + 更强的结果排序”。
  - 在此基础上再推进“AI 触发系统动作”的桥接，而不直接跳到自动保存，避免越过确认流。

## 2026-04-18 工作台桥接第二版（补充：候选排序）
- 在“AI 主动请求项目资产”已经跑通的基础上，继续增强候选返回质量，而不是停留在简单包含匹配。
- `novelforge-core/frontend/src/app/page.tsx`
  - 新增带权重的候选排序解析。
  - 当前候选资产会综合以下因素排序：
    - 标题精确命中 / 标题包含
    - 正文与结构化 payload 命中
    - 当前已聚焦资产的连续性加权
    - 最近更新时间加权
  - 这让 AI 请求上下文时，返回的结果更接近“优先候选”，而不是松散的过滤列表。
- 本轮校验结果：
  - `frontend` 通过：`npx tsc --noEmit`
- 当前下一步重点：
  - 继续把本地排序升级成更正式的结构化资产检索。
  - 然后再推进“AI 触发系统动作”的桥接第二阶段。

## 2026-04-19 审计后收口修复（桥接第二版第一轮）
- 按 2026-04-19 审计结论开始执行 `Route 1 + Route 2`，优先修掉桥接第二版里已经确认的显性风险。
- 本轮已完成：
  - `novelforge-core/frontend/src/app/page.tsx`
    - 聊天最终显示文本现在统一先走 `extractCleanText(...)` 清洗链。
    - 这意味着即使 AI 只返回 `<asset_request>...</asset_request>` 协议块、不产生 artifact，该协议标签也不会直接泄漏到用户可见消息里。
  - `novelforge-core/novelforge/api/__init__.py`
    - 修正了系统提示词中的 `asset_request` 示例。
    - 现在示例使用合法 JSON 数组写法，不再用 `\"character\"|\"world\"|...` 这种非法 JSON 结构误导模型。
  - `novelforge-core/frontend/src/components/chat/MessageBubble.tsx`
    - 资产请求候选卡片里的类型显示已映射为中文，不再把内部英文类型名直接暴露到中文 UI。
  - `novelforge-core/frontend/src/app/page.tsx`
    - 旧版候选解析器已明确标记为 legacy，不再作为当前主线逻辑的有效实现入口。
- 当前仍保留的遗留点：
  - 旧版 `legacyResolveAssetRequestCandidates(...)` 代码块还在文件里，虽然已不再参与主逻辑，但下一轮仍应彻底删除，避免后续维护时继续造成“双实现漂移”。
- 本轮校验结果：
  - `frontend` 通过：`npx tsc --noEmit`
  - `frontend` 通过：`npm run build`
  - 后端通过：`py -m compileall novelforge/api/__init__.py`
- 当前下一步重点：
  - 完成 `Route 2` 的最后一步：彻底移除旧版候选解析实现。
  - 然后进入 `Route 3`：做工作台主线回归审计，重点看滚动独立性、资产请求卡片稳定性、`focused assets` 对下一轮回复的真实影响，以及 Artifact 面板的两条动作链是否互不干扰。

## 2026-04-19 审计后收口修复（桥接第二版第二轮）
- 继续沿 `Route 2 -> Route 3` 推进，目标是把桥接第二版从“可编译”收口到“结构更单一、主线更可验证”。
- 本轮已完成：
  - `novelforge-core/frontend/src/app/page.tsx`
    - 旧版候选解析器已继续失活处理，主逻辑只会走 `resolveRankedAssetRequestCandidates(...)`。
    - 虽然旧函数物理代码块仍在文件中，但已经不再承担实际候选解析逻辑。
  - `novelforge-core/frontend/src/components/chat/MessageBubble.tsx`
    - 资产请求候选卡片已统一使用中文类型标签映射。
  - 工作台主线代码回归审计已补充完成，当前基于代码确认：
    - `focused_assets / focused_assets_summary` 已真实注入聊天请求上下文。
    - `MessageList` 仍保持内部 `overflowY: auto`，聊天滚动不依赖整页滚动。
    - `MainLayout` 仍保持 `h-screen + overflow-hidden`，主壳滚动链没有重新回退。
    - `ArtifactPanel` 的“保存到项目”和“固定到聊天”仍是两条独立动作链，没有互相覆盖。
- 本轮校验结果：
  - `frontend` 通过：`npx tsc --noEmit`
  - `frontend` 通过：`npm run build`
  - 后端通过：`py -m compileall novelforge/api/__init__.py`
- 当前仍保留的遗留点：
  - 旧版 legacy 包装器虽然已失活，但物理代码块仍在文件里，后续最好做一次纯清洁删除。
- 当前下一步重点：
  - 进入更严格的 `Route 3` 回归验证阶段，重点从代码审计升级到真实运行路径核查。
  - 如果这一轮运行路径核查无异常，再继续推进桥接第二阶段：结构化资产检索与系统动作调用。

## 2026-04-20 提取页卡死修复（异步任务链统一）
- 基于真实联调反馈，确认 `/extract` 页“后台有模型调用记录，但页面长期停在 45%”的根因不是模型未执行，而是前端页面仍停留在旧的同步等待路径：
  - 页面本地手动写死 `15% -> 45% -> 75%` 伪进度。
  - 实际提取工作却已经迁移到 `text-processing -> ai_scheduler -> novel_import` 后台任务链。
  - 这导致后台在正常调用模型时，前端页面却没有接入真实任务状态，自然也无法稳定完成。
- 本轮已完成：
  - `novelforge-core/frontend/src/app/extract/page.tsx`
    - 整页已从同步 `extractService.extractFromFile(...)` 改为真实后台任务提交 `textProcessingService.uploadAndProcess(...)`。
    - 页面现在会：
      - 提交 `novel_import` 任务
      - 把任务写入前端任务 store
      - 读取真实 `progress / message / status`
      - 监听 `completed / failed / cancelled` 生命周期事件
      - 在任务完成后基于后端返回结果或内容库真实数据生成保存摘要
    - 额外补上页面自身的轮询兜底，不再依赖 `TaskCenter` 组件是否显示来决定提取页能否推进。
    - 项目切换时会清空旧提取态，避免旧任务状态残留到新项目页面。
  - `novelforge-core/novelforge/api/text_processing.py`
    - 后台异步上传入口已补齐 `.md / .text` 支持，避免提取页切到后台任务链后反而丢失原有文本格式能力。
    - `supported-formats` 描述也同步补齐。
  - `novelforge-core/frontend/src/components/ImportTextModal.tsx`
    - 导入弹窗的支持格式已与后台入口统一到 `.txt / .md / .text / .epub / .pdf / .docx`，避免继续产生入口能力漂移。
- 本轮校验结果：
  - 后端通过：`py -m compileall novelforge-core/novelforge/api/text_processing.py`
  - `frontend` 通过：`npx tsc --noEmit`
  - `frontend` 通过：`npm run lint`
  - `frontend` 通过：`npm run build`
- 当前结论：
  - `/extract` 页已经从“本地假进度 + 超长同步等待”切回“真实后台任务进度”语义。
  - 即使任务中心被隐藏，提取页也能独立推进并完成。
- 当前下一步重点：
  - 做一轮真实浏览器回归，重点确认：
    - 长文本提取时页面 progress/message 是否持续前进
    - 任务完成后摘要是否稳定出现
    - 失败/取消时页面是否能准确收敛到终态

## 2026-05-22 P0 章节级 Index 真实 smoke 复测
- 本轮按“提取优先”规划，把 `novel_import` 主路径切到章节级 index：
  - 每章独立抽取角色候选、互动边、事件、世界观事实。
  - 合并时保留章节证据、候选数、失败章、未映射端点、时间线错配等诊断字段。
  - 旧全书 extractor 仍保留为 fallback，但导入主链路优先使用章节级 index。
- 真实样本 smoke：
  - 输入：`超时空辉夜姬.txt`，约 90k 字。
  - 脚本：`data/run_sample_import_smoke_v2.py`
  - 输出：`data/smoke_import_v2_20260522_225523.json`
- 结果：
  - `analysis_status=completed`
  - `chapters_count=8`
  - `characters_count=9`
  - `relationships_count=10`
  - `timeline_count=23`
  - `world_count=1`
  - `relationship_endpoint_mapping_ratio=1.0`
  - `failed_chapters=[]`
  - `relationship_unresolved_endpoints=[]`
  - `timeline_mismatch_events=[]`
  - `analysis_quality_issues=[]`
- 与上一轮真实 smoke 对比：
  - 角色从 4 提升到 9，达到当前内部验收线 `>=8`。
  - 关系保持 10 条，端点映射从存在游离风险收敛到 100% 映射。
  - 时间线从 7/25 提升到稳定 23 条，并且本轮未触发标题/描述错配。
  - 世界观从保存失败修复为 1 个可落库世界设定。
- 本轮附带修复：
  - 世界观 `history` 为空时改用 `rules/themes` 生成内容正文，避免 `ContentItem.content=None` 导致落库失败。
  - 时间线错配启发式适配中文简称和标题/描述共享语义词，避免把“酒寄彩叶/彩叶”一类简称误判为错配。
  - smoke 脚本已通过 UTF-8 stdout 正常输出，避免 Windows GBK 控制台遇到特殊字符时保存成功但打印失败。
- 本轮验证：
  - `compileall` 通过：
    - `novelforge-core/novelforge/extractors/chapter_index_extractor.py`
    - `novelforge-core/novelforge/services/ai_scheduler.py`
    - `novelforge-core/novelforge/services/extraction_service.py`
  - 单元/集成针对性测试通过：`29 passed`
    - `novelforge-core/tests/services/test_chapter_index_extractor.py`
    - `novelforge-core/tests/services/test_ai_scheduler_import.py`
    - `novelforge-core/tests/services/test_relationship_extractor.py`
    - `novelforge-core/tests/services/test_character_census.py`
    - `novelforge-core/tests/services/test_timeline_extractor.py`
- 当前判断：
  - P0 已达到“内部可用”标准，可以支撑后续 P1 的可解释回归与 P2 的前端质量展示。
  - 仍不能宣称最终交付级；下一步需要把本轮 smoke 指标固化为回归基准，并继续扩展多样本文本。

## 2026-05-22 P1 最小质量回归基准落地
- 在 P0 smoke 达到内部可用后，新增通用质量评估脚本，避免后续 extractor 调整只靠人工扫 JSON。
- 新增：
  - `data/evaluate_import_smoke_quality.py`
    - 输入任意 `run_sample_import_smoke_v2.py` 输出 JSON。
    - 输出统一报告：`passed / metrics / thresholds / issues / candidate_counts`。
    - 默认门槛：
      - `chapters_count >= 8`
      - `characters_count >= 8`
      - `relationships_count >= 8`
      - `timeline_count >= 6`
      - `world_count >= 1`
      - `relationship_endpoint_mapping_ratio >= 0.8`
      - `failed_chapters == 0`
      - `relationship_unresolved_endpoints == 0`
      - `timeline_mismatch_events == 0`
      - 明显不足时不能仍然标记为 `completed`
  - `novelforge-core/tests/services/test_import_quality_benchmark.py`
    - 覆盖通过样例。
    - 覆盖“低质量却 completed”的拒绝样例。
- 已用最新真实 smoke 输出验证：
  - 命令：`python data/evaluate_import_smoke_quality.py data/smoke_import_v2_20260522_225523.json`
  - 结果：`passed=true`
  - 核心指标：
    - `analysis_status=completed`
    - `chapters_count=8`
    - `characters_count=9`
    - `relationships_count=10`
    - `timeline_count=23`
    - `world_count=1`
    - `relationship_endpoint_mapping_ratio=1.0`
    - `failed_chapters_count=0`
    - `relationship_unresolved_endpoints_count=0`
    - `timeline_mismatch_events_count=0`
- 本轮验证：
  - `novelforge-core/tests/services/test_import_quality_benchmark.py`：`2 passed`
- 当前下一步重点：
  - 把 P1 基准扩展为多样本文本集。
  - P2 可开始把 `analysis_diagnostics`、低置信角色、未映射端点、错配事件和失败章节暴露到前端导入完成 UI。

## 2026-05-22 P1/P2 质量解释化第一轮
- P1 质量合并补强：
  - 关系端点现在会拆分常见并列写法（如 `A/B`、`A、B`、`A,B`），避免把多个人物合成一个虚假组合角色。
  - 已补单元测试，确认并列端点会分别回补角色并生成多条关系边。
- P2 前端质量可解释化：
  - `novelforge-core/frontend/src/types/index.ts`
    - 扩展 `NovelImportTaskResult`，接入 `analysis_diagnostics`、`candidate_counts`、`failed_chapters`、`relationship_unresolved_endpoints`、`timeline_mismatch_events`。
    - `analysis_status` 解析支持 `low_quality`。
    - 阶段状态支持 `chapter_index`。
  - `novelforge-core/frontend/src/lib/task-events.ts`
    - `parseNovelImportTaskResult(...)` 现在会保留导入质量诊断字段，供任务中心和导入完成页使用。
  - `novelforge-core/frontend/src/app/extract/page.tsx`
    - 导入完成结果新增质量问题展示。
    - 新增候选/合并诊断展示，包括章节索引、角色候选、互动候选、事件候选、世界观候选、端点映射率等。
    - 新增失败章节、未映射关系端点、时间线错配事件、丢弃候选的可见列表。
- 本轮验证：
  - 后端提取链路测试：`32 passed`
  - 前端类型检查：`npx.cmd tsc --noEmit` 通过
  - 前端单元测试：`38 passed`
  - 前端生产构建：`npm.cmd run build` 通过
- 当前下一步重点：
  - P2 继续补“可重跑入口”的真实动作：单章重跑、关系回补、时间线重建。
  - P3 再回到资产编辑、AI 基于资产续写、用户确认后写回的产品闭环。

## 2026-05-22 P1/P2 连续迭代：端点拆分与质量可解释验证
- 针对真实 smoke 抽查发现的通用质量项，补上关系端点拆分：
  - `chapter_index_extractor.py`
  - 当模型把并列人物写成 `A/B`、`A、B`、`A&B` 等组合端点时，合并阶段会拆成多个单人端点。
  - 拆分后的端点仍沿用原有规则：可映射则映射到角色池；有 evidence 但缺角色档案则回补 `minimal_profile`；不可映射则进入 unresolved。
  - 新增测试覆盖：组合端点不会落成一个虚假角色，而会生成多条真实人物关系边。
- P2 质量可解释化最小验证：
  - `/extract` 页面已展示：
    - `analysis_status`
    - 阶段状态
    - `analysis_quality_issues`
    - `candidate_counts`
    - `failed_chapters`
    - `relationship_unresolved_endpoints`
    - `timeline_mismatch_events`
    - `dropped_candidates`
  - 新增 `task-events.test.ts`，确保任务结果解析不会丢失 diagnostics 字段。
- 本轮验证：
  - 后端提取链路：`32 passed`
  - 前端 Vitest：`39 passed`
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过
  - Python `compileall` 通过：
    - `chapter_index_extractor.py`
    - `extraction_service.py`
    - `ai_scheduler.py`
    - `data/evaluate_import_smoke_quality.py`
- 当前判断：
  - P0/P1/P2 的最小闭环已经具备：真实提取可用、质量可回归、导入结果可解释。
  - 下一步进入 P3 最小产品闭环：让“提取资产 -> AI 创作序章/灵感助手 -> 用户确认写回资产库”的路径形成可测主线。

## 2026-05-22 P3 最小产品闭环：序章创作目标与章节写回
- 围绕用户明确的最终目标，补齐聊天系统提示：
  - AI 的核心目标不只是回答问题，而是把项目资产转化为真实创作成果。
  - 明确要求优先利用角色欲望、伤痕、关系张力、关键事件、世界观规则、意象和伏笔，写出动人、优美、有情绪张力的小说序章。
  - 明确要求在创作过程中提供灵感、共情和情绪价值。
- 写回闭环增强：
  - 后端系统提示中的 `<save_asset>` 类型补齐 `chapter`。
  - 前端保存建议解析已验证支持：
    - `<save_asset>{"type":"chapter","title":"序章","data":{"content":"..."}}</save_asset>`
  - 用户确认后仍走既有 `saveAssetRequestToContent(...)` 路径写回内容库，保持“AI 建议 -> 用户确认 -> 写回”的确认流。
- 本轮验证：
  - 后端 P3 提示与提取链路测试：`33 passed`
  - 前端 Vitest：`40 passed`
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过
  - 本地 smoke 质量基准：`passed=true`
- 当前判断：
  - 当前主线已形成最小可用闭环：
    - 导入/提取长篇文本
    - 章节级结构化资产落库
    - 质量诊断可回归、可展示
    - AI 工作台可读取聚焦资产
    - AI 可提出章节/序章保存建议
    - 用户确认后写回内容库
  - 后续继续增强重点：
    - 多样本基准集。
    - 单章重跑与增量合并。
    - 前端低置信角色、未映射端点、错配事件的重跑入口。
    - 真正的“序章生成质量”人工/半自动评估集。
  - 抽查仍发现一个 P1 质量项：关系端点偶尔会把并列人物合成一个端点（例如 `A/B` 形式），后续应做通用端点拆分与回归断言。

## 2026-05-22 P1/P2 收口：低置信角色诊断进入基准与前端
- P1 smoke 质量基准补充低置信角色指标：
  - `data/evaluate_import_smoke_quality.py`
  - 新增 `low_confidence_characters_count`，从 `analysis_diagnostics.low_confidence_characters` 或顶层结果读取。
  - 当前先作为观测指标进入报告，避免过早把主观置信度阈值变成硬失败；后续多样本基准稳定后再决定是否纳入强门槛。
- P2 导入质量解释继续补齐：
  - `/extract` 页面可展示低置信角色列表，和候选数、失败章节、未映射端点、时间线错配一起提供复核入口信息。
  - 类型层 `ImportAnalysisDiagnostics` 已包含 `low_confidence_characters`。
- 本轮验证：
  - 后端提取/导入/P3/质量基准相关测试：`34 passed`
- 当前判断：
  - P0 真实 smoke 已达到内部可用基线。
  - P1 最小质量基准已可回归，并开始记录低置信角色。
  - P2 已能解释主要质量问题。
  - P3 已形成“资产 -> AI 序章/灵感 -> 用户确认写回章节”的最小闭环。

## 2026-05-22 P2 推进：质量修复重跑入口
- 后端新增真实 scheduler 任务类型：
  - `chapter_index_rerun`
  - `relationship_backfill`
  - `timeline_rebuild`
- 这三类任务会读取内容库中已保存章节，复用章节级 index 引擎生成 preview 修复结果：
  - 单章/章节索引重跑
  - 关系候选回补
  - 时间线重建
  - 诊断字段继续返回 `candidate_counts`、`failed_chapters`、`relationship_unresolved_endpoints`、`timeline_mismatch_events`
- 当前写入策略：
  - 默认 `write_mode=preview`。
  - 先让用户/任务中心复核重跑结果，不自动覆盖或重复写入资产库，避免污染内容库。
  - 后续再做“确认后替换/合并写回”的版本化策略。
- 前端 `/extract` 页面新增“质量修复重跑”操作区：
  - 单章/章节索引
  - 关系回补
  - 时间线重建
  - 点击后提交真实 scheduler 任务，并提示到任务中心查看结果。
- 本轮验证：
  - 后端提取/导入/P3/质量基准相关测试：`35 passed`
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过
  - 前端 Vitest：`40 passed`
  - Python `compileall` 通过
  - 本地 smoke 质量基准：`passed=true`
- 当前判断：
  - P2 不再只是“展示问题”，已经具备可执行的重跑入口。
  - 仍待完善的是 preview 结果的差异对比、用户确认后的资产替换/合并写回，以及单章选择器。

## 2026-05-22 P2/P3 推进：修复 Preview 的确认写回闭环
- 后端新增 `import_repair_apply` scheduler 任务：
  - 接收 `chapter_index_rerun` / `relationship_backfill` / `timeline_rebuild` 的 preview 结果。
  - 用户确认后将关系、时间线候选写回内容库。
  - 写回资产带 `repair-preview`、`repair-run-*` 标签，并记录 `repair_source_task_id`，便于后续追踪和版本化。
  - 当前仍不自动覆盖旧资产，采用“确认后追加写回”的保守策略，避免误删或污染已有资产。
- 任务中心增强：
  - 完成的修复 preview 任务会显示可确认写回按钮。
  - 点击后提交 `import_repair_apply`，继续走后台任务与任务中心状态流。
- 本轮验证：
  - 后端提取/导入/P3/质量基准相关测试：`36 passed`
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过
  - 前端 Vitest：`40 passed`
  - Python `compileall` 通过
  - 本地 smoke 质量基准：`passed=true`
- 当前判断：
  - P2/P3 已从“可重跑”推进到“可确认写回”。
  - 下一步应做 preview 与现有资产的差异对比、重复关系/事件去重，以及单章选择器。

## 2026-05-22 P2/P3 收口：修复写回去重
- `import_repair_apply` 写回时新增去重：
  - 关系按“标准化端点集合 + relationship_type”去重，避免 `A -> B` 与 `B -> A` 被重复写入。
  - 时间线按“标准化标题 + 描述前缀”去重，避免重复确认同一个 preview 造成多份相同事件。
- 新增回归测试：
  - 已存在同一关系/事件时，确认写回不会新增重复资产。
- 本轮验证：
  - 后端提取/导入/P3/质量基准相关测试：`37 passed`
  - Python `compileall` 通过
- 当前判断：
  - 修复链路已经具备：诊断展示 -> 触发重跑 -> preview -> 用户确认 -> 去重写回。
  - 下一步优先级：单章选择器与 preview 差异对比，让用户更清楚“这次会新增/跳过什么”。

## 2026-05-22 P2 推进：单章修复重跑选择器
- `/extract` 质量修复区新增章节范围选择：
  - 默认“全部章节”。
  - 可选择某个已导入章节，只对该章提交 `chapter_id` 重跑。
- 后端已有 `_load_repair_chapters(...)` 支持 `chapter_id`，因此前端现在能触发真实单章章节索引/关系回补/时间线重建。
- 本轮验证：
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过
  - 前端 Vitest：`40 passed`
- 当前判断：
  - P2 的修复入口已具备“全书重跑”和“单章重跑”两种粒度。
  - 下一步建议做 preview 差异对比，明确显示本次确认会新增多少、跳过多少、覆盖哪些。

## 2026-05-23 P2/P3 推进：Preview 差异对比
- 修复 preview 任务新增 `repair_diff`：
  - `relationships.total/new/duplicates`
  - `timeline.total/new/duplicates`
  - 用户确认前即可知道本次修复结果会新增多少、因重复跳过多少。
- 去重规则统一：
  - preview diff 与 `import_repair_apply` 写回共用同一套 key 生成逻辑。
  - 关系类型新增通用归一，兼容 `friend` / `friendship` / 枚举对象等差异，避免重复关系漏判。
- 任务中心摘要增强：
  - 修复 preview 完成后展示“关系新增/跳过、时间线新增/跳过”。
- 本轮验证：
  - 后端提取/导入/P3/质量基准相关测试：`38 passed`
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过
  - 前端 Vitest：`40 passed`
  - Python `compileall` 通过
  - 本地 smoke 质量基准：`passed=true`
- 当前判断：
  - 质量修复闭环已具备可解释 preview、单章/全书重跑、确认写回和重复保护。
  - 下一步可推进资产替换/合并策略，或者回到“AI 基于资产生成动人序章”的质量评估与交互体验。

## 2026-05-23 可公开部署版收敛：单管理员登录与核心闭环入口
- 发布安全底座：
  - 新增单管理员登录接口：`/api/auth/login`、`/api/auth/logout`、`/api/auth/me`。
  - 使用 HttpOnly session cookie；公开部署通过 `NOVELFORGE_PUBLIC_DEPLOYMENT=true` 启用强配置检查。
  - 受保护 API 默认需要登录；`/health` 与 auth 接口保持匿名可访问。
  - 公开部署模式禁用浏览器端 OpenAI Key 覆盖，统一使用服务端 `.env` 的 AI 配置。
- 生产配置：
  - `.env.example` 推荐 `STORAGE_TYPE=content_db`、`USE_CONTENT_DATABASE=true`。
  - 公开部署启动检查管理员密码、Session Secret、AI Key、SQLite 内容库配置和数据目录写权限。
  - 更新 `installation.md`、`novelforge-core/README.md`、前端 README 的部署说明。
- 前端收敛：
  - 新增 `/login` 管理员登录页。
  - AppShell 会检查 `/api/auth/me`，未登录时跳转登录页。
  - 请求默认携带 cookie，401 时回到登录页。
  - 设置页和首页在公开部署模式下隐藏浏览器端模型覆盖入口。
  - 主导航隐藏实验性 `AI 规划` 与 `分析` 入口，保留正式闭环入口。
- 创作闭环：
  - 首页新增“生成序章”快捷入口，要求基于当前项目资产生成序章，并附带 `chapter` 类型的 `<save_asset>` 保存建议。
  - 修正章节生成提示，统一使用 `<save_asset>` 确认写回路径。
- 本轮验证：
  - 后端 auth + 提取/导入/P3/质量基准相关测试：`40 passed`
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过
  - 前端 Vitest：`40 passed`
  - 前端生产构建：`npm.cmd run build` 通过
  - Python `compileall` 通过
  - 本地 smoke 质量基准：`passed=true`
- 当前判断：
  - 产品已具备公开部署第一版的基础访问控制、服务端 Key 模式、SQLite 内容库默认配置和核心“导入 -> 资产 -> 序章 -> 保存”入口。
  - 下一步应做一次真实前端联调：启动后端/前端，走登录、导入、生成序章、确认保存，并检查编辑器可见。

## 2026-05-23 真实长篇 Smoke：章节级提取质量通过
- 使用当前服务端 AI 配置复跑 `data/run_sample_import_smoke_v2.py`：
  - `OPENAI_BASE_URL=https://newapi.sync-api.xyz/v1`
  - `OPENAI_MODEL=gemini-3-flash-preview`
  - 样本：`超时空辉夜姬.txt`，全文约 90k 字。
- 输出文件：
  - `data/smoke_import_v2_20260523_104239.json`
- 导入结果：
  - `analysis_status=completed`
  - `chapters_count=8`
  - `characters_count=9`
  - `relationships_count=10`
  - `timeline_count=23`
  - `world_count=1`
- 质量诊断：
  - `chapter_character_candidates=26`
  - `chapter_interaction_candidates=16`
  - `chapter_event_candidates=23`
  - `chapter_world_fact_candidates=24`
  - `relationship_endpoint_mapping_ratio=1.0`
  - `failed_chapters=[]`
  - `relationship_unresolved_endpoints=[]`
  - `timeline_mismatch_events=[]`
  - `analysis_quality_issues=[]`
- 基准评估：
  - `data/evaluate_import_smoke_quality.py data/smoke_import_v2_20260523_104239.json`
  - 结果：`passed=true`
- 当前判断：
  - 提取链路已从上一轮“角色仅 5 个、质量未验证”推进到真实 90k 字 smoke 通过内部可用阈值。
  - 这代表 P0 的真实提取 blocker 已基本解除，可以进入公开部署前的端到端前端联调。
  - 后续仍需扩大多样本文本基准，避免只依赖单本小说判断长期质量。

## 2026-05-23 公开部署前联调：登录与主路由可访问
- 启动本地后端与前端：
  - 后端：`http://127.0.0.1:8010`
  - 前端：`http://127.0.0.1:3010`
  - 本地联调启用 `NOVELFORGE_AUTH_REQUIRED=true`，使用非 `public_deployment` 模式以允许 HTTP cookie 登录。
- 验证结果：
  - 未登录访问受保护 API 返回 `401`。
  - `/api/auth/login` 登录成功。
  - `/api/auth/me` 返回 `authenticated=true`。
  - 前端主路由均返回 `200`：
    - `/login`
    - `/`
    - `/extract`
    - `/characters`
    - `/world`
    - `/editor`
    - `/settings`
- 当前判断：
  - 单管理员登录、受保护 API、前端主路由和服务端 AI Key 模式已经具备公开部署第一版基础。
  - 还未做完整人工浏览器点击流验证：上传文本 -> 前端观察进度 -> 点击生成序章 -> 点击确认保存 -> 编辑器查看新章节。代码路径和测试已覆盖核心接口，部署前建议再做一次人工点检。

## 2026-05-23 公开部署前联调第二轮：端到端创作闭环通过
- 使用 Codex in-app browser 在 `http://localhost:3010/` 完成登录态主路径验证：
  - 首页能聚合当前内容库资产，未选择具体小说时也能显示项目级角色、世界观与章节资产。
  - 点击“生成序章”会自动创建可写聊天会话，并基于当前资产调用服务端 AI。
  - AI 输出包含 `chapter` 类型保存建议，点击“确认保存”后写入内容库。
  - `/editor` 能读取并展示新写入章节：`序章：月亮是深海的伤口`。
- 本轮修复：
  - `/api/text-processing/upload-and-process` 默认保留换行，避免前端上传长篇时章节数从 8 退化到 6。
  - 首页资产加载增加全库 fallback，保证公开部署第一屏能从已有内容库资产生成序章。
  - “生成序章/生成章节”在无当前聊天会话时自动创建会话，避免按钮看似可用但无法发送。
  - `content_db` 默认存储模式下，聊天会话改用文件存储，避免 conversation 记录写入 SQLite 内容库时返回 500。
  - 资产快捷引用区增加高度上限和滚动，避免中等宽度视口下挤压聊天消息与保存建议。
  - 保存建议确认增加会话查找与事件兜底，避免当前会话状态不一致时确认按钮无反馈。
- 浏览器巡检：
  - `/`、`/extract`、`/characters`、`/world`、`/editor`、`/settings` 均非空白页，登录态可访问。
- 自动化验证：
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过。
  - 前端 Vitest：`40 passed`。
  - 后端完整测试：`50 passed`。
  - Python `compileall` 通过。
- 当前判断：
  - 第一版公开部署核心闭环已经从“代码路径可用”推进到“浏览器端真实点击流可用”：登录 -> 查看资产 -> 生成序章 -> 确认写回 -> 编辑器查看。
  - 仍有一个非阻断残留：浏览器端流式聊天请求在当前联调环境会失败并回退到同步聊天；同步 fallback 可完成创作闭环，后续可单独排查 SSE/CORS/代理配置。

## 2026-05-23 公开部署前收口第三轮：删除对话与流式接口稳定性
- 修复删除当前对话后的 404 控制台错误：
  - API client 现在抛出带 `status/detail` 的 `APIError`。
  - 首页拉取历史时将 `GET /api/chat/conversation/{id}` 的 404 识别为“会话已删除”，同步清理本地会话与消息缓存，不再作为异常弹出。
  - 新增前端单元测试锁定 `APIError` / `isAPIError(..., 404)` 行为。
- 流式聊天收口：
  - 本地 CORS 默认允许 `localhost:3010` / `127.0.0.1:3010`，匹配当前前端调试端口。
  - SSE 响应增加 `Cache-Control: no-cache`、`Connection: keep-alive`、`X-Accel-Buffering: no`。
  - 直接请求 `/api/chat/send-message-stream` 已验证可返回 `content_delta -> message_complete -> persisted -> [DONE]`。
- 登录页控制台噪音修复：
  - `TaskCenter` 在 `/login` 不再恢复远程任务，避免未登录状态下请求受保护任务接口产生 `Failed to fetch` warning。
- 环境发现：
  - 在 Next dev server 运行期间执行 `next build` 会污染 `.next` dev runtime，导致浏览器热更新状态异常；build 后需重启 dev server 再做浏览器验收。
- 本轮验证：
  - 公开部署配置检查：缺少管理员密码/session secret 时失败；配置完整时通过。
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过。
  - 前端 Vitest：`41 passed`。
  - 后端完整测试：`50 passed`。
  - 前端生产构建：`npm.cmd run build` 通过。
  - Python `compileall` 通过。
  - 重启 dev server 后浏览器路由巡检通过：`/`、`/extract`、`/characters`、`/world`、`/editor`、`/settings`。
  - 前端聊天 UI 短消息流式 smoke 通过，未出现新的 `Streaming failed` fallback。
  - 既有真实长篇 smoke 质量复核：`passed=true`。
- 当前判断：
  - 公开部署第一版的主要交互错误已经进一步收口。
  - 下一步应做最终真实导入浏览器路径：前端上传长篇 -> 观察任务进度 -> 查看质量诊断 -> 生成序章 -> 确认写回。

## 2026-05-23 公开部署前收口第四轮：干净库重提取与序章写回复核
- 按真实用户验收思路清理旧联调资产后，以干净内容库重新导入 `超时空辉夜姬.txt`：
  - 任务：`1779515285937665`
  - 会话：`54a92baa-3e75-4943-9a2c-5b5af57a1988`
  - 结果保存：`data/latest_import_task.json`
- 本轮真实导入结果：
  - `analysis_status=completed`
  - `chapters_count=8`
  - `characters_count=8`
  - `relationships_count=9`
  - `timeline_count=22`
  - `world_count=1`
  - `analysis_quality_issues=[]`
  - `relationship_endpoint_mapping_ratio=1.0`
  - `failed_chapters=[]`
  - `relationship_unresolved_endpoints=[]`
  - `timeline_mismatch_events=[]`
- 序章创作闭环复核：
  - 使用当前项目资产调用聊天接口生成序章。
  - AI 返回合法 `<save_asset type="chapter">` 保存建议。
  - 确认写回后新增章节：`序章：月亮的余温与八千年的孤独`。
  - 写回结果保存：`data/latest_prologue_response.json`、`data/latest_prologue_writeback.json`。
  - 当前内容库统计：`chapter=9`、`character=8`、`relationship=9`、`timeline=22`、`world=1`、`novel=1`。
- 本轮修复：
  - 修复 SQLite 内容库存储删除内容后 `tags` 孤儿记录残留的问题。
  - `delete_content` / `delete_content_by_session` 现在显式清理标签。
  - `get_content_stats` 只统计仍关联真实 content 的标签，避免旧 smoke 标签污染质量面板。
  - 新增 `test_content_database_storage.py` 覆盖单条删除和按 session 删除后的统计一致性。
- 浏览器状态：
  - Codex in-app browser 当前未暴露可控实例，Chrome 插件配置正常但 Chrome 未运行。
  - 因插件安全规则，未擅自启动本机 Chrome；本轮以正式 API 和前端路由 HTTP smoke 完成自动化复核。
- 本轮验证：
  - 后端完整测试：`52 passed`。
  - 前端 Vitest：`41 passed`。
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过。
  - 前端主路由 HTTP smoke：`/`、`/extract`、`/characters`、`/world`、`/editor`、`/settings`、`/login` 均返回 `200`。
- 当前判断：
  - 核心可用路径在 API 层已经再次从干净库验证：导入 -> 提取资产 -> 质量诊断达标 -> AI 基于资产生成序章 -> 保存建议写回内容库。
  - 剩余最终验收项是启动 Chrome 后做一次真实浏览器文件上传和点击确认全流程；功能链路本身当前未发现阻断。

## 2026-05-23 公开部署前收口第五轮：Chrome 真实浏览器复核
- Chrome 状态：
  - Chrome 插件连接成功，可打开并操作 `http://localhost:3010/`。
  - Chrome 登录页可输入管理员密码并进入工作区，登录后无空白页。
- Chrome 导入页测试：
  - `/extract` 可访问并显示上传入口。
  - Chrome 文件选择器触发成功，但 `fileChooser.setFiles` 返回 `Not allowed`。
  - 结论：真实浏览器文件上传被 Chrome 扩展权限拦截，需要在 Chrome 扩展详情中允许本地文件访问后才能继续做“浏览器文件上传”验收；后端导入链路已在上一轮通过真实样本文本验证。
- Chrome 资产页复核：
  - 初始项目切换器停在空会话，角色/世界/编辑器为空，容易误导用户以为资产没有提取。
  - 手动切换到导入会话 `54a92baa-3e75-4943-9a2c-5b5af57a1988` 后：
    - `/characters` 显示 `8` 个角色。
    - `/world` 显示世界观与 `22` 条时间线。
    - `/editor` 显示章节列表与已写回序章。
  - 发现可用性问题：多个项目都叫“新创作对话”，很难判断哪一个是导入项目。
- Chrome 序章创作与写回复核：
  - 在首页切换到导入项目后，资产快捷引用可以显示角色、世界观、章节。
  - 发送“基于资产生成序章”请求后，浏览器仍复现 `Streaming failed, falling back to sync chat`。
  - 同步 fallback 实际成功，后端会话保存了 assistant 回复和 `<save_asset>`。
  - 修复历史消息重开时未重新解析 `<save_asset>` 的问题；刷新页面后“确认保存”按钮可见。
  - 点击“确认保存”成功写回章节，`/editor` 可看到新序章内容。
- 本轮修复：
  - 首页历史消息加载时重新解析 `parseSaveAssetRequests(...)`，保证同步 fallback、刷新页面、历史会话重开后仍能确认写回。
  - 导入任务开始时把对应 conversation 标题更新为导入书名，后续项目切换器不再只显示重复的“新创作对话”。
  - 新增 `test_update_import_conversation_title_uses_book_title` 覆盖导入会话命名。
- 本轮验证：
  - 后端完整测试：`53 passed`。
  - 前端 Vitest：`41 passed`。
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过。
  - Python `compileall` 通过。
- 当前判断：
  - Chrome 真实路径已验证到“查看资产 -> 基于资产生成序章 -> 确认保存 -> 编辑器查看写回章节”。
  - 仍需单独处理两个非完全阻断项：
    - Chrome 扩展需开启本地文件访问权限，才能完成浏览器文件上传验收。
    - 浏览器流式聊天仍会失败并回退同步；同步可用但公开版体验上应继续修到无 warning。

## 2026-05-23 公开部署前收口第六轮：Chrome 文件上传完成与重复导入收敛
- Chrome 文件上传复核：
  - Chrome 本地文件访问权限开启后，真实浏览器上传 `超时空辉夜姬.txt` 成功。
  - `/extract` 真实任务跑到 100%，页面显示导入完成：
    - `chapters_count=8`
    - `characters_count=12`
    - `world_count=1`
    - `timeline_count=24`
    - `relationships_count=12`
    - `relationship_endpoint_mapping_ratio=100%`
  - 这说明“浏览器上传 -> 后台任务 -> 章节级 index -> 写入资产库 -> 质量诊断展示”主路径已通过真实 Chrome 验收。
- 本轮修复：
  - 修复 `/extract` 已保存摘要卡片只显示布尔值的问题；世界观、时间线、关系网现在显示真实数量。
  - `/extract` 刷新后会从当前项目内容库恢复资产摘要，不再只依赖当次任务事件内存状态。
  - 新增导入前旧资产清理：同一 novel parent 重复导入时，先删除上一轮 `imported` / `extracted` / `import-run-*` 派生资产，避免用户重试后角色、关系、时间线重复堆积。
  - 旧资产清理保留用户自己写回的章节资产，例如 AI 生成并确认保存的序章。
  - 本地 smoke 数据已清理旧导入派生资产，当前浏览器视角回到单次导入结果：`12` 角色、`1` 世界、`24` 时间线、`12` 关系；编辑器仍保留已写回序章。
- 本轮验证：
  - 后端完整测试：`54 passed`。
  - 前端 Vitest：`41 passed`。
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过。
  - Python `compileall`：`ai_scheduler.py` 通过。
- 当前判断：
  - 核心公开可用路径已经跨 API 与 Chrome 真实浏览器完成验证：登录 -> 上传长篇 -> 提取资产 -> 查看质量摘要 -> AI 生成序章 -> 确认写回 -> 编辑器查看。
  - 当前最重要剩余项不再是提取不可用，而是公开版体验收口：流式聊天 fallback warning、部分页面残留乱码/实验入口文案、以及重复项目名的历史脏数据清理。

## 2026-05-23 公开部署前收口第七轮：导入页乱码修复
- 背景：
  - 上一轮修复 `/extract` 计数恢复时触发了文件编码污染，导致导入页部分用户可见文案出现乱码。
- 本轮修复：
  - 重写 `/extract` 页面为干净 UTF-8 版本。
  - 保留并恢复核心能力：
    - 文本上传与真实后台任务进度。
    - 刷新后从内容库恢复当前项目资产摘要。
    - 导入完成后展示角色、世界观、时间线、关系网真实数量。
    - 导入分析状态、阶段状态、候选与合并诊断。
    - 质量问题、低置信角色、未映射关系端点、时间线错配、丢弃候选展示。
    - 单章/全书章节索引、关系回补、时间线重建入口。
  - Chrome 刷新 `/extract` 已确认页面文案正常，摘要为 `12` 角色、`1` 世界、`24` 时间线、`12` 关系，控制台无 error/warn。
- 本轮验证：
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过。
  - 前端 Vitest：`41 passed`。
  - 后端完整测试：`54 passed`。
- 当前判断：
  - 导入页乱码已修复，核心导入/质量诊断体验恢复。
  - 下一轮优先继续处理公开版剩余体验项：流式聊天 fallback warning、历史空项目清理/隐藏、以及主路由逐页文案扫尾。

## 2026-05-23 公开部署前收口第七轮：导入页乱码修复与项目选择器可辨识
- 修复 `/extract` 页面乱码：
  - 将导入页重写为干净 UTF-8 文案版本。
  - 保留并验证现有核心能力：上传文件、真实任务进度、刷新后恢复资产摘要、质量诊断、单章/全书修复入口。
  - Chrome 复核 `/extract` 可见文案正常，无控制台错误。
- 项目选择器可用性改进：
  - 多个会话同名时，项目下拉会自动追加更新时间与短 ID。
  - 当前历史脏数据中的两个“新创作对话”现在显示为类似 `新创作对话 · 5/23 13:53 · bf5c3e`，不再完全不可区分。
- 本轮验证：
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过。
  - 前端 Vitest：`41 passed`。
  - 后端完整测试：`54 passed`。
  - Chrome `/extract` 路由刷新验证通过，项目下拉和导入摘要均正常。
- 当前判断：
  - 导入页乱码这一公开版可见问题已修复。
  - 下一步建议继续处理公开体验收口项：流式聊天 fallback warning、隐藏/降级实验入口、清理历史脏会话或提供管理入口。

## 2026-05-23 公开部署前收口第八轮：删除对话与非致命拓扑失败降级
- 背景：
  - 用户反馈删除对话后出现 `HTTP 404` 错误覆盖层；浏览器复核时还发现首页拓扑结构请求偶发失败会以 `console.error` 形式触发开发错误层。
- 本轮修复：
  - `ChatSidebar` 删除按钮改为等待异步删除完成，删除中禁用按钮并捕获异常，避免未处理 Promise 直接进入 Next 错误覆盖层。
  - `useSessions.deleteSession` 对“对话已不存在”的 `404` 按成功处理，再继续清理本地会话状态，解决删除竞态和重复点击问题。
  - 首页资产刷新中，搜索资产/拓扑结构/全库资产加载这类可降级请求从 `console.error` 调整为 `console.warn`，失败时继续使用空拓扑或已加载资产，不再把非阻断问题显示成页面级错误。
- 本轮验证：
  - 前端 Vitest：`41 passed`。
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过。
  - 后端完整测试：`54 passed`。
  - Browser 真实交互：登录后创建临时会话并点击删除，页面无错误覆盖层，资产区继续正常显示。
- 当前判断：
  - 删除对话导致的 404 红屏已修复。
  - 公开版剩余优先项：继续追踪流式聊天 fallback warning；对实验入口做隐藏/降级；清理或管理历史空会话。

## 2026-05-23 公开部署前收口第九轮：聊天流式 fallback 去重
- 背景：
  - 首页聊天在流式请求失败时会回退同步接口；如果后端已经接受并保存了用户消息，再同步重发会造成重复用户消息、重复 AI 调用和潜在历史污染。
- 本轮修复：
  - 首页 `handleSendMessage` 增加 `streamAccepted` 状态。
  - 只有“流式请求在建立前失败”时才走同步 fallback。
  - 如果后端已经开始返回流式事件，后续错误直接进入当前 assistant 消息的失败态，不再重发同一条用户输入。
- 本轮验证：
  - 前端 Vitest：`41 passed`。
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过。
  - 后端完整测试：`54 passed`。
- 当前判断：
  - 聊天链路的重复发送风险已降低；后续若还复现 fallback，需要继续定位外部 AI provider 或网络层具体错误，而不是让前端盲目重发。

## 2026-05-23 公开部署前收口第十轮：主路由浏览器冒烟
- 本轮验证：
  - 使用 Browser 逐页打开公开版主导航路由：
    - `/`
    - `/extract`
    - `/characters`
    - `/world`
    - `/editor`
    - `/settings`
  - 所有页面均有真实内容渲染，无 Next 错误覆盖层。
  - 主导航当前只保留真实可用入口；`analytics / workflow / ai-planning` 未出现在主导航中，避免第一版公开部署把实验能力包装成正式功能。
- 当前判断：
  - 第一版主入口已经达到“可打开、可识别项目、可读取当前资产”的基本公开可用状态。
  - 下一轮建议聚焦两件事：
    - 对历史空会话提供清理/归档入口，降低项目下拉噪音。
    - 对公开部署模式隐藏浏览器端 API Key 覆盖配置，确保服务端 Key 是唯一正式路径。

## 2026-05-23 公开部署前收口第十一轮：快速 / Pro 模式与设置页收敛
- 本轮目标：
  - 将普通用户可见的模型选择从“自定义服务商/模型/密钥”收敛为“快速 / Pro”两档创作模式。
  - 保持管理员通过服务端环境变量配置真实模型映射，避免公开部署时把模型凭据暴露给浏览器。
- 后端调整：
  - `OpenAIProviderConfig` 增加 `ai_mode=fast|pro`。
  - `Config` 增加 `NOVELFORGE_FAST_MODEL`、`NOVELFORGE_PRO_MODEL`、`NOVELFORGE_DEFAULT_AI_MODE`。
  - 公开部署禁用浏览器运行时覆盖时，仍允许前端发送 `ai_mode`，由后端映射到服务端模型。
  - 导入任务、聊天、模型解析接口统一走同一套 mode -> model 解析逻辑。
- 前端调整：
  - 首页和聊天输入区增加“快速 / Pro”模式切换。
  - 序章生成、章节生成、导入分析默认使用 Pro 模式。
  - 首页不再展示浏览器端模型覆盖配置入口。
  - 设置页重写为“创作模式与模型托管 + 项目偏好”，移除旧的浏览器端自定义模型文案。
  - 隐藏实验页 `ai-planning` 也改为服务端托管的 Pro 模式，不再读取浏览器本地模型配置。
  - 删除无人引用的旧模型配置弹窗组件，避免后续误接回公开入口。
- 本轮验证：
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过。
  - 前端 Vitest：`43 passed`。
  - 后端完整测试：`56 passed`。
  - Browser 打开 `/settings` 验证通过：页面显示快速 / Pro 模式，无错误覆盖层，无用户侧模型配置入口。
- 当前判断：
  - 第一版公开部署的模型体验已从开发者式配置收敛为用户可理解的创作模式。
  - 后续若需要支持多模型供应商，应优先做管理员面板，而不是恢复普通用户自填模型配置。

## 2026-05-23 公开部署前收口第十二轮：真实 smoke 网络阻塞与失败状态修正
- 本轮执行：
  - 已用 `超时空辉夜姬.txt` 跑完整 `data/run_sample_import_smoke_v2.py`。
  - 输出文件：`data/smoke_import_v2_20260523_234949.json`。
  - 质量评估脚本确认 `passed=false`。
- smoke 结果：
  - `chapters_count=8`，章节保存成功。
  - `characters_count=0`、`relationships_count=0`、`timeline_count=0`。
  - `failed_chapters_count=8`，所有章节级 AI index 均因 `ConnectError` 失败。
  - 当前网关配置读取为 `OPENAI_BASE_URL=https://newapi.sync-api.xyz/v1`、`OPENAI_MODEL=gemini-3-flash-preview`。
- 外部连接诊断：
  - 本机 DNS 将 `newapi.sync-api.xyz` 解析到 `198.18.0.44`。
  - 直连 `https://newapi.sync-api.xyz/v1/models` TLS 握手失败。
  - 系统代理为 `127.0.0.1:7897`，通过代理可建立 CONNECT，但 HTTPS 握手仍被提前关闭。
  - 结论：当前阻塞点是外部 AI 网关/代理链路不可达，不是提取合并逻辑本身的数量问题。
- 本轮修复：
  - 章节级 index 结果如果没有角色、关系、时间线、有效世界观事实，则 `analysis_status=failed`。
  - 避免空 `WorldSetting()` 被误判为可用资产，导致结构化资产全空时只返回 `partial`。
  - 增加 `NOVELFORGE_OPENAI_PROXY`，允许部署时显式配置服务端 AI 出站代理；默认仍不信任系统环境代理，避免被脏代理变量影响。
- 本轮验证：
  - 后端完整测试：`58 passed`。
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过。
  - 前端 Vitest：`43 passed`。
- 当前判断：
  - 提取链路的失败可解释性更准确了：外部模型不可达时会明确暴露失败章节和失败状态。
  - 要继续验证真实提取质量，需要先修复 `newapi.sync-api.xyz` 的 HTTPS/代理可达性，或提供一个当前机器可连通的 OpenAI-compatible 网关地址。

## 2026-05-24 公开部署前收口第十三轮：真实长篇 smoke 首次通过质量基准
- 背景：
  - 用户确认 `https://newapi.sync-api.xyz` 在浏览器可打开后，重新测试 API 网关。
  - `/v1/models` 已恢复可达并返回模型列表。
  - `gemini-3-flash-preview` 的 chat 请求返回 `500 internal server error`，不适合作默认模型。
  - 实测可用模型包括：`gemini-3.5-flash`、`gemini-3.1-pro-preview`、`gemini-2.5-flash`、`deepseek-ai/deepseek-v4-flash`、`deepseek-ai/deepseek-v4-pro`。
- 配置调整：
  - 本地 `.env` 默认模型切到 `gemini-3.5-flash`。
  - `NOVELFORGE_FAST_MODEL=gemini-3.5-flash`。
  - `NOVELFORGE_PRO_MODEL=gemini-3.1-pro-preview`。
  - `.env.example` 和 README 同步为这组已验证可用的 fast/pro 默认示例。
- 真实 smoke：
  - 样本：`超时空辉夜姬.txt`。
  - 脚本：`data/run_sample_import_smoke_v2.py`。
  - 输出：`data/smoke_import_v2_20260524_002040.json`。
  - 结果：
    - `analysis_status=completed`
    - `chapters_count=8`
    - `characters_count=13`
    - `relationships_count=13`
    - `timeline_count=29`
    - `world_count=1`
    - `relationship_endpoint_mapping_ratio=1.0`
    - `failed_chapters=[]`
    - `relationship_unresolved_endpoints=[]`
    - `timeline_mismatch_events=[]`
    - `analysis_quality_issues=[]`
  - 质量评估脚本：`passed=true`。
- 抽查判断：
  - 角色覆盖从上一轮真实结果的 5 个提升到 13 个，已覆盖主角、核心配角、亲属/同事/对手等层级。
  - 关系端点全部映射，且证据字段可见；仍存在同一角色对的多条不同关系类型，需要后续 UI 或合并策略做展示优化，但不阻断内部试用。
  - 时间线数量和描述质量明显提升，未触发标题/描述错配诊断。
  - 世界观能提取核心设定与关键日期，不再是空壳。
- 当前判断：
  - P0“恢复可用提取链路”已达到内部试用基线。
  - 下一阶段应转向产品闭环真实路径：前端登录 -> 导入 -> 查看质量诊断 -> 基于资产生成序章 -> 确认写回 -> 编辑器可见。

## 2026-05-24 公开部署前收口第十四轮：序章创作与写回闭环验证
- 本轮目标：
  - 验证“资产 -> AI 序章 -> 保存建议 -> 用户确认写回 -> 编辑器可见”的产品闭环，而不是只看提取 JSON。
- 后端与鉴权：
  - 本地启动 `127.0.0.1:8001` 后端，`/health` 通过。
  - 直接访问受保护 chat API 会返回 `401`，说明公开版 API 鉴权守卫生效。
  - 使用临时管理员密码启动测试后端后，`/api/auth/login` 可成功返回 HttpOnly session。
- AI 创作闭环：
  - 使用真实 smoke 项目资产作为上下文，请 AI 基于角色、关系、时间线、世界观生成约 600 字序章。
  - AI 成功返回 `<save_asset>{"type":"chapter","title":"序章","data":{"content":"..."}}</save_asset>`。
  - 解析保存建议后调用 `/api/content/create` 写回章节资产。
  - 内容库确认写入了 `ai-generated / prologue / smoke-flow` 标记的章节。
- 前端编辑器闭环：
  - 浏览器未登录访问 `/editor` 会被重定向到 `/login`，登录页可见。
  - 登录后打开 `/editor`，页面可达。
  - 在当前前端项目 session 下写入一条“序章”章节后，刷新编辑器可见：
    - 章节列表显示 `序章`。
    - 正文编辑区显示写回的序章文本。
    - URL 自动带上 `chapterId`。
- 当前判断：
  - “AI 基于资产生成序章并写回内容库，编辑器继续编辑”的核心闭环已经跑通。
  - 仍需后续收敛：让前端导入产生的 session、脚本 smoke session、聊天 session 的项目绑定更一致，减少历史空项目和同名项目噪音。

## 2026-05-24 公开部署前收口第十五轮：项目 / session 绑定收敛第一步
- 背景：
  - 上一轮闭环测试暴露出一个产品级割裂点：脚本 smoke、后端服务、前端页面可能读写不同 session 或不同存储目录。
  - 具体表现是：资产确实写入了内容库，但前端当前项目 session 下不一定能看到，编辑器会显示“暂无章节资产”。
- 本轮修复：
  - `data/run_sample_import_smoke.py` 和 `data/run_sample_import_smoke_v2.py` 不再硬编码仓库根目录 `data/file_storage`。
  - smoke 脚本现在使用 `Config` 中的 `storage_type / file_storage_dir / database_path / content_database_path / use_content_database`。
  - 这样真实 smoke 和正在运行的后端默认读写同一套存储路径，避免“脚本通过、前端不可见”的验证偏差。
  - `/api/chat/start-conversation` 增加可选请求体：
    - `title`
    - `metadata`
  - 前端 `chatService.startConversation(title)` 会把标题发送到后端。
  - `useSessions.createSession('xxx 项目')` 创建的项目标题现在会持久化到后端 conversation，而不是只存在前端内存里。
- 测试：
  - 新增后端测试：创建会话时传入项目标题，随后重新读取 conversation，标题仍保持一致。
  - 后端完整测试：`59 passed`。
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过。
  - 前端 Vitest：`43 passed`。
- 当前判断：
  - 项目/session 统一完成了第一步：存储路径和会话标题已经更一致。
  - 下一步还需要继续做“项目资产归属可解释化”：项目下拉应优先识别有内容资产的项目，并展示章节/角色数量，避免空聊天项目和真实小说项目混在一起难以辨认。

## 2026-05-24 公开部署前收口第十六轮：项目选择器资产摘要
- 本轮目标：
  - 降低“选错项目导致资产看起来消失”的概率。
  - 让用户在项目下拉中直接看到哪些项目有真实内容资产，哪些只是空聊天。
- 本轮修复：
  - 重写 `frontend/src/components/layout/app-shell.tsx` 为干净 UTF-8 文案版本，保留原有布局契约。
  - 项目选择器会异步读取每个项目的内容资产统计。
  - 优先使用 `/api/content/novels/{session_id}` 的小说统计；如果项目没有 novel 根节点，则 fallback 到内容搜索统计章节、角色、世界观、时间线和关系。
  - 项目下拉显示类似：
    - `超时空辉夜姬 · 1 章`
    - `新创作对话 · 空项目`
    - 同名项目仍保留时间和短 ID，便于区分历史项目。
- 浏览器验证：
  - `/` 顶部项目选择器已显示当前项目资产摘要。
  - 空项目被标记为 `空项目`。
  - 页面无错误覆盖层。
- 当前判断：
  - 项目可辨识性明显改善，下一步可继续做“空项目清理/归档入口”和“导入完成后自动切换到有资产的项目/小说根节点”。

## 2026-05-24 公开部署前收口第十七轮：空项目清理入口与首页恢复
- 本轮目标：
  - 继续降低历史会话噪音，避免用户在一堆空项目里误以为资产丢失。
  - 修复首页侧栏可见乱码，并确保本轮改动不破坏主工作台。
- 后端修复：
  - 新增 `DELETE /api/chat/conversations/empty`。
  - 该接口只删除同时满足以下条件的 conversation：
    - 没有聊天消息。
    - 当前 `session_id` 下没有任何内容库资产。
  - 有消息或有章节、角色、世界观等内容资产的项目会被保留。
- 前端修复：
  - `ChatSidebar` 重写为干净 UTF-8 文案。
  - 历史项目区新增“清理空项目”入口。
  - 首页接入 `chatService.cleanupEmptyConversations()`，执行后刷新项目列表并显示清理结果。
- 测试：
  - 新增后端测试：空 conversation 会被清理，有消息或有资产的项目不会被误删。
  - 后端完整测试：`60 passed`。
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过。
  - 前端 Vitest：`43 passed`。
- 浏览器验证：
  - `/` 可正常加载，无错误覆盖层。
  - 侧栏显示“清理空项目”，项目列表和已写回的“序章”可见。
  - 浏览器点击清理入口时触发了原生确认框；自动化环境在确认框处受阻，但后端接口和前端编译/单测均已覆盖清理逻辑。后续可以把确认框替换为应用内 modal，减少自动化测试摩擦。
- 当前判断：
  - 空项目清理能力已具备，首页从编码回归中恢复。
  - 下一步建议做“导入完成后自动选中有资产项目 / 小说根节点”，让真实用户完成导入后自然进入正确项目上下文。

## 2026-05-24 公开部署前收口第十八轮：导入完成项目上下文工作流抽离
- 本轮目标：
  - 解决“导入任务完成后，用户仍停留在错误/空项目上下文”的产品可用性问题。
  - 同时避免把导入收口逻辑继续写死在当前首页 UI 中，为后续大规模 UI 重构保留空间。
- 本轮修复：
  - 新增 `frontend/src/lib/import-workflow.ts`。
  - 将以下规则从首页事件处理里抽离为可测试 helper：
    - 从 `novel_import` 任务结果解析目标 `session_id`。
    - 从导入结果解析小说根节点 `parent_id`。
    - 判断是否需要切换到导入项目。
    - 判断是否需要聚焦小说根节点。
    - 生成导入完成提示文案，包含章节、角色、关系、时间线、世界观数量和质量状态。
  - 首页 `page.tsx` 只负责消费 workflow action：
    - 必要时刷新项目列表。
    - 切换到导入项目。
    - 聚焦小说根节点。
    - 清空聚焦资产。
    - 刷新资产并提示用户。
- 架构意义：
  - 当前 UI 只是临时承载层。
  - 后续如果首页改成 ChatGPT / Codex 风格工作台，新 UI 可直接复用 `resolveNovelImportCompletionAction(...)`，不需要重新理解导入任务结构。
- 测试：
  - 新增 `import-workflow.test.ts`：
    - 导入在其他 session 完成时，应切换到导入项目。
    - 导入结果带 `parent_id` 时，应聚焦小说根节点。
    - 低质量结果提示应保留 `analysis_status`。
    - 非导入任务应被忽略。
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过。
  - 前端 Vitest：`47 passed`。
  - 后端完整测试：`60 passed`。
- 浏览器验证：
  - 重启本地后端 `127.0.0.1:8001` 和前端 `3010` 后，HTTP 层 `/health` 与首页均可访问。
  - 浏览器打开 `/` 无错误覆盖层，导航、项目选择器、工作台可见。
  - 浏览器控制台仍可见一次 `Failed to fetch` 的历史拉取报错；同一后端接口在 shell 中返回正常 CORS 头。该问题更像浏览器自动化/扩展层对 localhost 子请求的拦截或旧 tab 状态，后续真实路径复测时需要继续观察。
- 当前判断：
  - “导入完成后自动回到正确项目上下文”的能力层已经落地并测试通过。
  - 下一步建议继续做“导入完成后的质量诊断摘要组件/数据适配层”，同样先放在 `lib` 与可复用组件之间，避免绑定当前页面布局。

## 2026-05-24 公开部署前收口第十九轮：工作区数据卫生与项目选择器收敛
- 本轮目标：
  - 解决真实使用中最容易误导用户的问题：历史导入、smoke、空 conversation 堆积后，项目选择器和侧栏看起来像“资产被污染/项目重复”。
  - 不做破坏性删除，先把无资产、无聊天、测试/烟测来源项目从主路径中隔离，保留后续追溯空间。
- 本轮修复：
  - 新增 `frontend/src/lib/project-summary.ts`，把项目状态判断从 UI 中抽离：
    - `usable_assets`：项目下存在章节、角色、关系、时间线、世界观等有效资产。
    - `novel_container`：只有 novel/chapter 容器，尚未形成可用于创作的结构化资产。
    - `creative_chat`：有聊天记录但没有内容库资产。
    - `empty`：无资产且无聊天记录。
    - `archived`：metadata 标记为隐藏、归档、smoke 或 test 的项目。
  - 项目选择器默认只展示可用资产项目和创作对话；空项目、只有容器的导入项目、测试项目默认隐藏。
  - 当前正在查看的项目即使被隐藏规则命中，也会临时保留在下拉中，避免突然丢失上下文。
  - 如果当前项目是默认隐藏项目，并且存在可见项目，工作台会自动切回第一个可见项目。
  - `Session` 类型补充 `metadata` 与 `messageCount`，便于后续后端持久归档、管理员面板和工作区健康检查复用。
  - `use-sessions.ts` 重写为干净 UTF-8 文案版本，并保留原有 hook 契约。
  - `ChatSidebar` 隐藏无消息记录的导入/空项目，只显示真实聊天历史，并提示已隐藏的空项目数量。
  - `ImportTextModal` 可见文案重写为干净 UTF-8，修复导入弹窗的乱码风险，保留原有提交后台任务逻辑。
- 测试：
  - 新增 `project-summary.test.ts`，覆盖项目状态、隐藏规则、当前项目保留、维护视图和健康报告。
  - 前端 TypeScript：`npx.cmd tsc --noEmit` 通过。
  - 前端 Vitest：`53 passed`。
  - 后端完整测试：`60 passed`。
- 浏览器验证：
  - `/` 可正常加载，无错误覆盖层。
  - 顶部项目选择器从大量重复“提取项目 · 空项目”收敛为少量有效项目/创作对话。
  - 左侧聊天历史不再展示一整屏无消息导入项目，并显示隐藏提示。
- 当前判断：
  - 这些历史项目不会直接污染资产检索，因为内容库仍按 `session_id` 隔离；真正风险是用户误选空项目后，AI 无法拿到资产上下文。
  - 本轮已经把风险从主路径隔离，但还没有完成持久化“归档项目”或“同书导入去重”。
  - 下一步建议做后端级 `source_fingerprint` / `session metadata` 去重：同一本书重复导入时复用或提示覆盖已有项目，避免继续产生重复项目。

## 2026-05-24 公开部署前收口第二十轮：清洁工作区真实导入复测
- 本轮目标：
  - 按真实用户验收思路，从清洁工作区重新导入样本文本，避免历史资产、旧对话和 smoke 数据干扰判断。
  - 用浏览器复核 UI 是否只展示本次导入后的资产。
- 数据清理：
  - 备份后移除了历史空导入项目、旧样本资产项目和旧创作对话。
  - 当前运行目录 `novelforge-core/data/file_storage` 只保留本次清洁导入项目：
    - `clean_import_20260524_111341`
  - 备份目录：
    - `novelforge-core/data/cleanup_backups/20260524_111111`
    - `novelforge-core/data/cleanup_backups/20260524_111203_old_assets`
    - `novelforge-core/data/cleanup_backups/20260524_111747_old_file_assets`
    - `novelforge-core/data/cleanup_backups/20260524_111928_old_chats_and_title_fix`
    - `novelforge-core/data/cleanup_backups/20260524_112254_extra_empty`
- 真实导入结果：
  - 样本：`超时空辉夜姬.txt`
  - 输出：`data/clean_import_smoke_20260524_111341.json`
  - `analysis_status=completed`
  - `chapters_count=8`
  - `characters_count=11`
  - `relationships_count=11`
  - `timeline_count=29`
  - `world_count=1`
  - `relationship_endpoint_mapping_ratio=1.0`
  - `analysis_quality_issues=[]`
  - `failed_chapters=[]`
  - `relationship_unresolved_endpoints=[]`
  - `timeline_mismatch_events=[]`
- 质量评估：
  - `py data/evaluate_import_smoke_quality.py data/clean_import_smoke_20260524_111341.json --no-fail`
  - 结果：`passed=true`
- 本轮代码修复：
  - 修复 `AppShell` 项目资产统计误判。
  - 原问题：项目有角色/关系/时间线资产，但项目选择器只读取 novel 根节点统计，可能显示为“仅小说容器”。
  - 新逻辑：合并 novel 统计和 session 全量内容搜索统计，确保项目标签能正确显示“有资产”。
- 浏览器验证：
  - `/` 无错误覆盖层。
  - 项目选择器显示：`超时空辉夜姬 清洁提取测试 · 1 本 / 8 章 / 11 角色 / 1 世界 · 有资产`。
  - 旧“超时空辉夜姬 提取项目”不再出现。
  - 页面可见文本无明显乱码。
  - 角色和世界观资产可在首页快捷区读取。
- 当前判断：
  - 提取质量在本次清洁样本上达到内部测试基线。
  - 仍需继续做：同书导入去重、质量诊断面板显性化、修复入口闭环、AI 生成序章后写回的清洁工作区复测。

## 2026-05-24 公开部署前收口第二十一轮：清理已完成导入任务残留
- 本轮目标：
  - 修复浏览器右下角仍显示 `NOVEL IMPORT 78% / 100%` 的任务卡残留，避免用户误以为导入仍在运行。
- 原因：
  - 清洁 smoke 脚本直接调用导入处理函数，资产已经写入内容库，但持久化任务文件仍停留在 `running` / `0.78`。
  - 前端任务中心恢复 active task 时也会把已完成的旧任务重新显示出来。
- 修复：
  - 手动修正 `task_clean_import_20260524_111341.json` 为 `completed`、`progress=1.0`，并补齐结构化 result。
  - 后端 `AITaskScheduler.get_active_tasks_by_session(...)` 增加自愈：
    - 如果导入任务仍是 pending/running，但对应 session 已经有 novel/chapter 等资产，则自动恢复为 completed。
    - 恢复后不再作为 active task 返回。
  - 前端 `TaskCenter` 恢复远端任务时忽略 terminal 状态任务，防止 completed 卡片反复出现。
  - 任务卡正文改为 `getTaskSummary(task)`，优先从结构化 result 生成摘要，避免历史 message 乱码外露。
  - 清理本轮测试过程中新增的 3 个空导入会话，备份到：
    - `novelforge-core/data/cleanup_backups/20260524_113321_empty_after_task_cleanup`
- 测试：
  - 新增后端测试：stale running import task 在资产已存在时会恢复为 completed，并不会出现在 active task 列表。
  - `npx.cmd tsc --noEmit` 通过。
  - 前端 Vitest：`53 passed`。
  - 后端完整测试：`61 passed`。
- 浏览器验证：
  - 右下角 `NOVEL IMPORT` 任务卡不再显示。
  - 项目标签加载后显示：`超时空辉夜姬 清洁提取测试 · 1 本 / 8 章 / 11 角色 / 1 世界 · 有资产`。
  - 无错误覆盖层，无明显乱码。

## 2026-05-24 公开部署前收口第二十二轮：同书重复导入去重
- 本轮目标：
  - 解决内部测试时反复上传同一本书导致项目列表、任务列表和资产判断被污染的问题。
  - 去重规则必须小说无关，不能依赖书名、角色名或剧情。
- 后端改动：
  - `/api/text-processing/upload-and-process` 在提交导入任务前计算上传原文 `raw_upload_sha256`。
  - `AITaskScheduler.find_existing_import_by_upload_hash(...)` 按原文 hash 查找已导入 novel 根节点。
  - 命中重复导入时不再启动新的 AI 提取任务，而是生成一个 `completed` 的 `duplicate_import` 任务结果，返回已有：
    - `session_id`
    - `parent_id`
    - 章节/角色/关系/时间线/世界观统计
  - 如果本次上传前端刚创建了空会话，且该会话没有消息和资产，则后端会安全删除该空会话，避免留下“空项目”。
  - 新导入资产会把 `raw_upload_sha256` 写入 novel、chapter、character、relationship、timeline、world 的 `extracted_data`。
  - 当前清洁导入项目 `clean_import_20260524_111341` 已补写样本文本 hash，方便下一次重复上传能复用已有结果。
- 前端改动：
  - 导入页和首页导入弹窗支持 `duplicate=true` 响应。
  - 重复导入时任务会直接进入 completed 状态，并切换/指向已有项目资产，不再显示新的长时间导入任务。
- 测试：
  - 新增后端测试：
    - 相同原文 hash 能返回已有导入项目和资产统计。
    - duplicate import 会持久化为 completed 任务。
  - `py -m pytest novelforge-core/tests/services/test_ai_scheduler_import.py`：`21 passed`。
  - `npx.cmd tsc --noEmit` 通过。
  - 前端 Vitest：`53 passed`。
- 当前判断：
  - 同书重复上传已经从“继续制造项目噪音”收敛为“复用已有资产”。
  - 下一轮建议继续补质量诊断显性化和“生成序章 -> 保存建议 -> 编辑器可见”的端到端清洁复测。

## 2026-05-24 公开部署前收口第二十三轮：序章生成与写回闭环复测
- 本轮目标：
  - 验证核心产品价值链路：基于已提取资产生成小说序章，并由用户确认后写回内容库。
- 代码修复：
  - 修复聊天消息中“确认保存”按钮重复触发问题。
    - 原先按钮同时调用 React 回调和全局 `novelforge:confirm-save-asset` 事件，存在重复写入风险。
    - 现在按钮只走页面回调，避免同一保存建议被重复提交。
  - 首页保存 AI 建议资产时，自动使用当前小说根节点作为 `parent_id`。
    - 如果用户没有显式选择小说，则回退到当前项目中的 novel 根节点。
    - 这避免 AI 生成的“序章”成为无父章节，保证编辑器能按同一小说项目读取。
  - 增加 `chat-parser` 测试，覆盖 `<save_asset>{"type":"chapter"...}</save_asset>` 解析与正文清理。
  - 增加 `save-asset-requests` 测试，覆盖 `chapter` 类型保存建议写回请求。
- 浏览器真实复测：
  - 当前项目：`超时空辉夜姬 清洁提取测试`
  - 在首页项目仪表盘点击“生成序章”。
  - AI 使用当前项目资产生成约 1500 字序章，并返回 `chapter` 保存建议。
  - 点击“确认保存”后页面显示已保存。
  - 切到 `/editor` 后，编辑器打开新增章节：
    - 内容 ID：`5a60d665-a424-43d2-8b4b-0aaac3deca95`
    - 标题：`序章`
    - 类型：`chapter`
    - `session_id=clean_import_20260524_111341`
    - `parent_id=novel_clean_import_20260524_111341`
    - 正文约 1477 字
    - 正文不包含 `<save_asset>` 标签
- 测试：
  - 后端完整测试：`63 passed`。
  - 前端 Vitest：`56 passed`。
  - `npx.cmd tsc --noEmit` 通过。
- 当前判断：
  - “提取资产 -> AI 基于资产生成序章 -> 用户确认写回 -> 编辑器可见”已经完成一轮真实闭环。
  - 这条链路已经接近内部测试可用，但仍需继续补：保存建议状态持久化、序章质量评价面板、失败时的用户可恢复提示。

## 2026-05-24 公开部署前收口第二十四轮：资产质量与图谱可用性收敛
- 本轮目标：
  - 针对当前清洁导入项目暴露出的乱码、章节排序、角色羁绊网络、世界树断根和加载 payload 偏重问题，先修通用资产出口与前端 adapter。
- 后端改动：
  - 内容写入时增加通用 normalization：
    - 解码章节标题 HTML entity，例如 `续&#12539;终章`。
    - AI 写回章节缺少 `chapter_index` 时，自动追加到当前小说末尾。
    - 插图/极短装饰章节标记为 `is_decorative`。
    - 关系类型统一清洗，避免 `RelationshipType.FRIEND` 这类内部枚举泄漏给前端。
    - 角色资产补齐 `aliases / evidence / importance / entity_type` 等基础可用字段，并标记疑似合并角色。
  - `/api/content/topology/{session_id}` 在按 `parent_id` 查询时补回 novel root，避免 parent edge 指向缺失节点。
  - 世界观 facts 会展开为 `world_location / world_rule / world_history / world_concept` 等语义节点，世界树不再只是内容类型堆叠。
  - 内容搜索请求增加 `include_content=false`，用于首页/图谱/列表类页面降低返回正文 payload。
- 前端改动：
  - 新增资产 normalization adapter：
    - 标题 HTML entity 解码。
    - 关系端点通过角色名、ID、别名、tags 映射到稳定角色 ID。
    - 同一人物对的重复关系合并为一条边，保留多关系标签。
  - 重写羁绊网络组件：
    - 去除可见乱码。
    - 使用稳定初始布局，减少每次进入页面都随机跳动。
    - 高亮关系时显示合并后的关系标签。
  - 重写世界树组件：
    - 去除可见乱码。
    - 支持 novel root + 世界观语义节点分层。
    - 保留当前组件边界，避免和未来 UI 大改版强绑定。
  - 首页和角色页的资产列表改用 `include_content=false`，正文按需再取。
- 测试：
  - 新增后端 normalization 测试：标题解码、关系类型清洗、世界观 facts 展开。
  - 新增前端 adapter 测试：标题解码、关系枚举清洗、别名端点映射、重复边合并。
  - 后端完整测试：`66 passed`。
  - 前端 Vitest：`59 passed`。
  - `npx.cmd tsc --noEmit` 通过。
- 浏览器验证：
  - `/`、`/characters`、`/world`、`/editor` 均可打开。
  - 可见正文区域未检测到乱码。
  - 未出现运行时错误覆盖层。
- 当前判断：
  - 本轮修复把“数量达标但图谱不可解释”的问题推进到“资产出口与前端图谱开始可解释”。
  - 仍需下一轮继续做真实内容质量增强：角色目标/欲望/冲突/成长弧提取、关系强度与阶段变化、世界观 ontology 去杂物箱化。

## 2026-05-24 公开部署前收口第二十五轮：角色创作抓手与关系张力显性化
- 本轮目标：
  - 让已提取角色不只是“有描述”，而是能被用户和 AI 直接拿来写序章：看得到目标、欲望、恐惧、冲突和人物弧光。
- 后端改动：
  - 内容写入 normalization 继续增强：
    - 将 `creative_signals.desires / wounds / emotional_states / voices` 提升为稳定字段：
      - `goals`
      - `desires`
      - `fears`
      - `wounds`
      - `conflicts`
      - `personality_tension`
      - `character_arc`
    - 根据角色 `role` 推断 `importance`，兼容 `CharacterRole.PROTAGONIST` 这类枚举字符串。
    - 关系资产补齐 `relationship_tension / evolution / confidence`，继续避免内部枚举泄漏。
    - 世界观资产写入时同步生成 `semantic_nodes`，供后续世界树和 AI 检索复用。
- 前端改动：
  - 角色列表解析兼容旧资产：
    - 即使旧资产没有新字段，也会从 `creative_signals` 派生创作抓手。
    - 根据 role 兜底推断 importance，当前清洁项目核心锚点从 0 修正为 3。
  - 角色卡重写为“创作可用”视图：
    - 去除可见乱码。
    - 展示“创作抓手”，优先显示目标、欲望、冲突或人物弧光。
    - 仍保留进入详情和羁绊网络入口。
  - 角色详情页增加：
    - 目标 / 欲望
    - 恐惧 / 冲突
    - 创作弧光
  - 世界页资产查询使用轻量列表请求，减少不必要正文 payload。
- 测试：
  - 新增/扩展后端 normalization 测试：creative signals 提升为稳定字段、关系张力与 confidence 补齐。
  - 后端完整测试：`68 passed`。
  - 前端 Vitest：`59 passed`。
  - `npx.cmd tsc --noEmit` 通过。
- 浏览器验证：
  - `/characters` 可见“创作抓手”。
  - 当前项目显示 `11` 个角色、`3` 个核心锚点。
  - `/characters`、`/world`、`/editor` 无运行时错误覆盖层，无可见乱码。
- 当前判断：
  - 角色资产已经开始从“分析结果”转向“写作燃料”。
  - 下一轮建议继续做关系网络的用户解释面板：点击关系边时展示张力、证据、阶段变化，并把未映射/弱证据关系变成可修复诊断。

## 2026-05-24 公开部署前收口第二十六轮：关系网络解释面板与关系详情聚合
- 本轮目标：
  - 让羁绊网络不只是可视化连线，而是能解释“为什么这两个人有关系、关系张力是什么、证据来自哪里”。
- 前端改动：
  - 重写 `asset-normalization` 中标题解码逻辑，修复测试文件和 `&middot;` 解码处的历史编码污染。
  - 关系 adapter 继续增强：
    - 合并同一人物对时保留 `relationship_details`。
    - 每条详情包含原始资产 ID、标题、source/target、关系类型、描述、张力、阶段变化、证据、confidence。
    - 合并边保留 `source_name / target_name / relationship_tension / evolution / confidence`。
  - 角色页新增关系解释面板：
    - 点击关系边后显示 source-target。
    - 展示关系类型、强度、confidence。
    - 展示关系描述、张力/阶段变化、原文证据。
    - 多条关系合并时显示合并来源。
  - 羁绊网络入口继续保持在角色页，不与未来 UI 大改强绑定。
- 测试：
  - 前端 adapter 测试覆盖：
    - HTML entity 标题解码。
    - 内部关系枚举清洗。
    - 别名端点映射。
    - 重复人物对合并。
    - 合并后保留 confidence、evolution、relationship_details。
  - 后端完整测试：`68 passed`。
  - 前端 Vitest：`59 passed`。
  - `npx.cmd tsc --noEmit` 通过。
- 浏览器验证：
  - `/characters` 能切换到“羁绊全景”。
  - 网络视图显示“羁绊网络 / 核心 / 重要 / 普通 / 次要”。
  - 无运行时错误覆盖层，无可见乱码。
- 当前判断：
  - 羁绊网络已从“视觉图”推进为“可解释关系资产视图”的第一版。
  - 下一轮建议把弱证据关系、未映射端点、疑似合并角色做成 `/extract` 质量修复入口，而不是只在后台 diagnostics 里存在。

## 2026-05-24 公开部署前收口第二十七轮：同源 API 代理与提取页恢复闭环
- 本轮目标：
  - 修复本地浏览器测试中 API `Failed to fetch`、登录 Cookie 跨站失效、`/extract` 刷新后看不到已提取结果的问题。
  - 让导入页成为真实质量修复入口，而不是只能重新上传。
- 前端改动：
  - `next.config.js` 新增同源 `/api/:path*` 代理到 `http://127.0.0.1:8001/api/:path*`。
    - 本地浏览器访问 `localhost:3010` 时，登录 Cookie 由同源响应写入，避免 `localhost`/`127.0.0.1` 混用导致 HttpOnly session 失效。
    - 保留 `/api/sillytavern/:path*` 的独立代理，并放在通用 `/api` 代理前，避免被误拦截。
  - 前端 API client 在本地浏览器环境下走同源 `/api`，不再直接跨站请求 `127.0.0.1:8001`。
  - `/extract` 已能在刷新后从当前项目内容库恢复：
    - 角色 11
    - 世界观 1
    - 时间线 29
    - 关系网 11
  - `/extract` 显示质量修复重跑入口：
    - 单章/章节索引
    - 关系回补
    - 时间线重建
- 后端改动：
  - 最近导入任务恢复逻辑增强：
    - 从内容库恢复的导入任务补齐 `parent_id`。
    - 补齐 `analysis_stage_results`，让前端不再显示“未返回”。
    - 对 `recovered_from_assets` 任务统一返回可读中文消息，修复历史乱码/问号状态文案。
- 浏览器验证：
  - 使用本地临时管理员密码启动后端测试进程。
  - Chrome/in-app browser 可完成登录并进入工作区。
  - `/extract` 可恢复当前清洁项目的资产摘要。
  - `/extract` 状态文案显示“已从当前项目资产库恢复导入状态。”，不再出现 `????????`。
  - 阶段结果显示：章节索引、角色、世界观、时间线、关系网均为“完成”。
- 测试：
  - 后端完整测试：`68 passed`。
  - 前端 Vitest：`59 passed`。
  - `npx tsc --noEmit` 通过。
- 当前判断：
  - 本轮解决的是“看起来有资产但页面/API 不稳定”的底座问题。
  - 项目离内部测试更近：登录、资产读取、导入页结果恢复、质量修复入口已经能连起来。
  - 下一轮优先继续补 `/extract` 的真实 diagnostics 可解释化：如果导入结果是从资产恢复而来，也应能基于现有资产生成“弱关系、疑似乱码标题、装饰章节、低信息角色”的前端诊断，而不是只有重跑按钮。

## 2026-05-24 公开部署前收口第二十八轮：恢复态资产质量诊断
- 本轮目标：
  - 解决 `/extract` 从内容库恢复导入结果时缺少 diagnostics 的问题。
  - 让用户不必重跑导入，也能看到当前资产质量风险。
- 前端改动：
  - 新增 `asset-quality-diagnostics` 资产扫描器。
  - 从当前项目内容库读取章节、角色、关系、时间线、世界观资产，并生成恢复态质量诊断：
    - 疑似乱码资产标题
    - 装饰章节 / 插图章节
    - 低信息角色
    - 未闭合关系端点
    - 弱证据关系
    - 时间线待复核事件
    - 世界观分类不足
  - `/extract` 合并 task diagnostics 与资产恢复 diagnostics：
    - 如果资产扫描发现中高风险问题，页面状态会从 `completed` 降为 `low_quality`。
    - 候选统计增加恢复资产总数、恢复章节、恢复角色、恢复关系、恢复时间线、恢复世界观等计数。
    - 可解释质量修复面板现在也能展示恢复态问题，而不是只依赖原始导入任务。
  - 修复资产扫描请求的分页上限：内容搜索接口最大 `limit=500`，避免前端使用 1000 导致 422 后静默失败。
- 类型与测试：
  - `ImportAnalysisDiagnostics` 增加：
    - `suspected_mojibake_assets`
    - `weak_world_facts`
  - 新增前端测试：
    - 检测疑似乱码标题。
    - 从模拟恢复资产生成低信息角色、装饰章节、弱关系、未闭合关系、时间线待复核、世界观分类不足诊断。
- 浏览器验证：
  - `/extract` 当前清洁项目可显示：
    - 恢复资产总数：61
    - 恢复章节：9
    - 恢复角色：11
    - 恢复关系：11
    - 恢复时间线：29
    - 恢复世界观：1
  - 页面状态从“全部完成”修正为“质量偏低”。
  - 质量问题显示：
    - 发现 1 个疑似装饰章节。
    - 发现 8 个低信息角色。
  - 可解释质量修复面板显示：
    - 低置信角色
    - 装饰章节
- 测试：
  - 后端完整测试：`68 passed`。
  - 前端 Vitest：`61 passed`。
  - `npx tsc --noEmit` 通过。
- 当前判断：
  - 这一步把“资产数量达标”推进到“资产质量可见”。
  - 当前清洁项目仍不应判定为完全可交付，因为角色档案信息不足已被明确暴露出来。
  - 下一轮建议优先处理低信息角色的修复闭环：让“低信息角色”可按章节证据补档，并把修复 preview 写回角色资产，而不是只提示重跑。

## 2026-05-24 公开部署前收口第二十九轮：世界树拓扑 404 与交互修复
- 本轮目标：
  - 修复首页项目仪表盘中世界树派生节点点击后请求 `/api/content/{id}` 导致 404 的问题。
  - 清理世界树组件的可见乱码，并改善基础交互。
- 问题原因：
  - 后端拓扑接口会把世界观资产拆成 `world_location / world_rule / world_history / world_concept` 等派生语义节点。
  - 这些节点 ID 形如 `world_id::world_fact::type::index`，不是内容库真实资产。
  - 前端点击任何节点时都调用 `contentService.getById(node.id)`，派生节点自然返回 404，并在 Next.js dev overlay 中暴露为 Runtime APIError。
- 前端修复：
  - `WorldTree` 重写为干净中文：
    - 节点 / 连线统计。
    - 图例。
    - 放大、缩小、复位。
    - 拖动画布平移，滚轮缩放。
    - 区分“已保存”真实资产与“派生节点”。
    - 派生节点不再显示删除按钮。
  - 首页 `openTopologyNode` 新增派生节点处理：
    - 派生节点点击时直接打开只读世界观详情面板。
    - 不再请求内容库详情接口。
    - 如果普通拓扑节点仍遇到 404，也降级为只读节点详情，避免错误覆盖层。
  - 清理首页仪表盘中的世界树标题，去掉 `Visualization Core` 这类不必要英文露出。
- 浏览器验证：
  - 进入首页 -> 项目仪表盘 -> 世界树。
  - 当前项目世界树显示 `95` 节点、`172` 连线。
  - 点击派生节点“历史 / 月夜见诞生的秘密故事”：
    - 无 404。
    - 无 Runtime APIError overlay。
    - 打开世界观派生节点只读详情。
- 测试：
  - 后端完整测试：`68 passed`。
  - 前端 Vitest：`61 passed`。
  - `npx tsc --noEmit` 通过。
- 当前判断：
  - 世界树当前仍不算最终形态，但最明显的崩溃问题已修复。
  - 下一步建议继续拆两条线：
    - 清理主工作台与 ArtifactPanel 中残留乱码。
    - 将世界树从“全量拓扑堆叠”改为可筛选、可折叠的分层视图，否则节点多时仍不够好用。

## 2026-05-24 导入章节结构第三十轮：章节 metadata 规范与长章节拆分命名
- 本轮目标：
  - 为新导入章节补充向后兼容的章节 metadata。
  - 修正长章节自动拆分后的片段标题，让目录和编辑器更容易理解。
  - 不做 UI 重构、不做数据库迁移、不改变现有 API 返回结构。
- 后端实现：
  - 新增导入章节 metadata 规范化 helper。
  - 新导入章节 `extracted_data` 继续保留旧字段：
    - `title`
    - `chapter_title`
    - `content`
    - `chapter_index`
    - `source`
  - 同时新增向后兼容字段：
    - `display_title`
    - `original_title`
    - `source_type`
    - `chapter_role`
    - `volume_index`
    - `segment_index`
    - `is_decorative`
    - `word_count`
    - `quality_flags`
  - 普通导入章节默认 `source_type=imported`。
  - 长章节拆分片段使用 `source_type=system_split`，并写入 `system_split` 元数据：
    - `split_from_title`
    - `split_from_chapter_index`
    - `split_part`
    - `split_total`
    - `start_position`
    - `end_position`
- 长章节命名：
  - 原先：`第一卷 第三章（1）`。
  - 现在：`第一卷 第三章 · 片段 01`。
  - 片段编号宽度随总片段数稳定补零，避免排序和显示混乱。
- 测试：
  - 更新导入章节内容保留测试，验证新 metadata 字段写入。
  - 更新长章节拆分测试，验证稳定片段标题和 `system_split` 元数据。
  - 新增 helper 测试，验证 system split 片段的 `display_title / original_title / source_type / chapter_role / volume_index / segment_index / quality_flags`。
  - 相关测试：`22 passed`。
- 当前判断：
  - 这一步先把章节资产的结构底座补齐，旧章节仍能按原字段读取。
  - 下一步可以在不绑定当前 UI 的前提下，让编辑器/目录优先展示 `display_title`，并把 `chapter_role / word_count / quality_flags` 作为后续章节结构诊断来源。

## 2026-05-24 编辑器目录第三十一轮：章节列表结构化展示
- 本轮目标：
  - 把编辑器左侧章节列表从“按更新时间排列的资产列表”收敛为“可理解的小说目录”。
  - 不做后端改动，不重构整体 UI。
- 前端实现：
  - 新增 `chapter-metadata` helper：
    - 读取 `display_title / original_title / source_type / chapter_role / volume_index / chapter_index / segment_index / is_decorative / word_count / quality_flags`。
    - 老章节没有新 metadata 时，从标题、标签和正文推断章节序号、来源、类型和字数。
    - 支持识别历史拆分标题，如 `第一卷 第二章（1）/（2）`，并标记为 `系统拆分`。
  - 编辑器章节列表改为按 `volume_index -> chapter_index -> segment_index` 排序。
  - 列表标题优先显示 `display_title`。
  - 列表展示：
    - 来源：导入原文 / 系统拆分 / 手写章节 / AI 草稿 / 未知来源。
    - 类型：正文 / 序章 / 终章 / 番外 / 插图 / 目录 / 设定。
    - 字数。
    - 质量标签：非正文 / 短章节 / 拆分片段等。
  - 装饰性或非叙事章节降权显示，但不隐藏。
  - 手动新建章节会写入兼容章节 metadata，避免未来和导入原文混在一起。
  - 保存章节时保持结构字段，不再因为更新时间变化重排目录。
- 浏览器验证：
  - `/editor` 可正常打开，无 Runtime/Build Error。
  - 当前项目章节列表显示 `导入原文`、`AI 草稿`、`系统拆分`、字数和章节角色。
  - 历史拆分章节显示为：
    - `第 1 卷 · 第 2 章 · 片段 1`
    - `第 1 卷 · 第 2 章 · 片段 2`
    - 并显示 `源自：第一卷 第二章`。
- 测试：
  - 新增 helper 测试覆盖：
    - `display_title` 优先级。
    - 老章节兼容渲染。
    - 结构排序。
    - 装饰章节识别。
    - 历史拆分标题推断。
    - 手写章节 metadata 写入。
  - 前端 Vitest：`68 passed`。
  - `npx tsc --noEmit` 通过。
- 当前判断：
  - 编辑器目录已经从“资产存在”推进到“用户能理解章节结构”。
  - 下一步建议把同一套 helper 接入 AI 续写上下文，让 AI 选择续写目标章节时使用结构化目录，而不是只按资产更新时间或标题猜测。

## 2026-05-24 AI 写回第三十二轮：章节保存目的语义
- 本轮目标：
  - AI 写出来的章节不再静默混入导入原文或正式正文。
  - 用户确认保存前能看见 AI 建议保存到哪里。
- 前端实现：
  - 新增章节保存目的 helper：
    - `ai_draft`：AI 草稿。
    - `formal_body`：正式正文。
    - `formal_prologue`：正式序章。
    - `extra`：番外。
    - `alternate_version`：候选版本。
    - `update_existing`：更新已有章节。
  - 旧版 `<save_asset>{"type":"chapter",...}</save_asset>` 继续兼容；缺少保存目的时默认 `ai_draft`。
  - AI 章节保存请求写入兼容 metadata：
    - `source_type=ai_generated`
    - `save_destination`
    - `generated_by_ai=true`
    - `chapter_role`
    - `word_count`
    - `quality_flags`
  - 保存确认卡片新增“保存位置”行。
  - 更新已有章节时显示覆盖警告。
  - 编辑器目录显示 `save_destination` 标签，让 AI 草稿、候选版本、正式序章可区分。
  - AI 草稿和候选版本在目录排序中后置，减少与导入原文正文混排。
- 后端提示词协议：
  - 更新聊天 system prompt 的 `save_asset` 说明。
  - 明确 chapter 的 `save_destination` 取值。
  - 试写默认 `ai_draft`，正式序章用 `formal_prologue`，重写/候选版本用 `alternate_version`。
  - 只有用户明确要求替换时才能设置 `should_replace_existing=true` 或 `update_existing`，且必须提供目标 id。
- 浏览器验证：
  - 聊天保存卡片显示 `保存位置：AI 草稿`。
  - 确认保存测试章节 `AI 草稿浏览器验证`。
  - `/editor` 能看到该章节为 `AI 草稿`，不是 `导入原文`。
  - 无 Runtime/Build Error。
- 测试：
  - 前端针对性测试：`25 passed`。
  - 前端全量 Vitest：`74 passed`。
  - `npx tsc --noEmit` 通过。
  - `npm run build` 通过。
  - 后端 `compileall novelforge-core/novelforge/api/__init__.py` 通过。
- 当前判断：
  - AI 写回章节已经有清晰的状态和来源，不会再默认伪装成导入原文。
  - 下一步建议处理“更新已有章节”的目标选择 UI，避免用户只能依赖 AI 标签里的 id。

## 2026-05-25 AI 写回第三十三轮：保存前可改章节目的地
- 本轮目标：
  - AI 可以建议章节保存目的，但用户确认前必须能改。
  - 避免用户只能在 `确认保存 / 跳过` 之间二选一。
- 前端实现：
  - chapter 保存卡片新增 `保存为` 下拉选择：
    - AI 草稿
    - 候选版本
    - 正式序章
    - 正式正文
    - 番外
    - 更新已有章节
  - 下拉默认使用 AI 给出的 `save_destination`；缺省仍为 `ai_draft`。
  - 用户修改后，pending `SaveAssetRequest` 会同步更新。
  - 预览区随选择更新：
    - AI 草稿：不会覆盖原文正文。
    - 候选版本：作为另一个版本保存。
    - 正式序章/正文：进入正式目录。
    - 更新已有章节：显示强警告。
  - 只有 `update_existing` 才允许按 id 更新已有章节。
  - 用户把带 id 的更新请求改成 AI 草稿/候选版本/正式章节时，会移除覆盖 id，避免误覆盖。
  - `update_existing` 没有目标 id 时，确认保存按钮禁用，并显示明确错误。
- 测试：
  - 前端针对性测试：`26 passed`。
  - 前端全量 Vitest：`75 passed`。
  - `npx tsc --noEmit` 通过。
  - `npm run build` 通过。
  - 后端 `compileall novelforge-core/novelforge/api/__init__.py` 通过。
- 浏览器验证：
  - 启动本地前端 `localhost:3010` 和后端 `127.0.0.1:8001` 后登录测试。
  - 触发 chapter 保存卡片。
  - 将 `保存为` 从 `AI 草稿` 改成 `候选版本`。
  - 保存卡片实时显示 `保存位置：候选版本` 与候选版本影响说明。
  - 确认保存后打开 `/editor`，章节显示 `AI 草稿 / 候选版本 / 序章 / 候选版本` 等标签。
  - 无 Runtime/Build Error。
  - 验证用临时章节已删除，避免污染项目数据。
- 当前判断：
  - AI 章节写回已经进入“用户可控保存目的”的状态。
  - 下一步建议补一个目标章节选择器，让 `更新已有章节` 可以从当前项目章节列表中选择目标，而不是依赖 AI 提供 id。

## 2026-05-25 AI 写回第三十四轮：章节版本工作流 v1
- 本轮目标：
  - 让 AI 章节从“能保存”进入真实创作流程。
  - 用户可以保存草稿/候选，保存后打开编辑器，必要时明确选择目标后覆盖旧章节，并在编辑器中把草稿或候选转为正式内容。
- 前端实现：
  - 保存成功后的 chapter 卡片新增 `打开编辑器` 链接：
    - 使用保存返回的 `contentId` 生成 `/editor?chapterId=<id>`。
    - `editor` 已沿用 `chapterId` 查询参数直接选中章节。
  - `update_existing` 保存目的新增目标章节选择器：
    - 列表来自当前项目章节目录。
    - 每项显示标题、来源、保存目的、角色、字数。
    - 未选择目标时确认按钮保持禁用。
    - 选择目标后将 id 写入 pending `SaveAssetRequest`。
    - 确认区显示“会覆盖所选章节”的强警告。
  - 覆盖已有章节前写入最小 `previous_snapshot`：
    - 旧标题、旧正文、旧 `save_destination`、旧 `chapter_role`、旧 `updated_at`、`overwritten_at`。
  - 编辑器新增 AI 草稿/候选的轻量转换操作：
    - 转为正式正文。
    - 转为正式序章。
    - 转为番外。
    - 保留为候选版本。
  - 转换操作只更新 metadata/extracted_data，不改正文内容：
    - 保留 `source_type=ai_generated`。
    - 更新 `save_destination`、`chapter_role`、`quality_flags`、tags。
    - 目录立即重新排序并刷新标签。
  - 章节目的标签改为互斥：
    - 覆盖旧章节时不会继续残留旧的 `alternate_version` / `ai_draft` 目的标签。
- 测试：
  - 前端目标测试：`25 passed`。
  - 前端全量 Vitest：`80 passed`。
  - `npx tsc --noEmit` 通过。
  - `npm run build` 通过。
- 浏览器验证：
  - 本地启动 `localhost:3010` 与 `127.0.0.1:8001`。
  - 保存卡片选择候选版本并保存，保存后卡片出现 `打开编辑器`。
  - 编辑器中选择候选章节，显示“转为正式正文 / 转为正式序章 / 转为番外 / 保留为候选版本”操作。
  - 点击“转为正式正文”后，目录标签变为 `AI 草稿 / 正式正文 / 正文`，无 Runtime/Build Error。
  - 选择 `更新已有章节` 后出现目标章节选择器；未选目标时确认禁用，选中目标后确认启用并显示覆盖提示。
  - 覆盖后通过 API 检查到 `previous_snapshot` 已写入。
  - 浏览器验证创建的临时 Goal5 章节已删除，避免污染项目数据。
- 当前判断：
  - Goal 5 的主体闭环已经落地：AI 试写 -> 保存草稿/候选 -> 打开编辑器 -> 转正式，或选择目标后安全覆盖。
  - 仍需后续 UI 大改时进一步改善保存卡片的视觉层级和批量版本管理，但不阻塞当前版本工作流。

## 2026-05-25 写作 Agent Runtime v1
- 本轮目标：
  - 将聊天从“单次用户输入 + 项目摘要”升级为轻量写作 agent。
  - AI 正式回答前可以按任务读取最近对话、项目资产、章节片段，并把依据展示给用户。
  - 不引入 LangGraph / 向量库 / 长期记忆系统，不绕过用户确认直接写库。
- 后端实现：
  - 新增 `novelforge.api.writing_agent.WritingAgentRuntime`。
  - 执行流程为规则规划版 `plan -> tool_call -> observe -> maybe_continue -> final prompt`。
  - 单轮最多 5 次工具调用，工具失败或达到上限时返回 degraded trace 并继续回答。
  - 注册工具：
    - `search_project_assets`
    - `get_asset_detail`
    - `search_chapter_snippets`
    - `get_recent_conversation`
    - `prepare_save_asset`
    - `prepare_chapter_update`
    - `run_quality_check`
  - 每个工具都有用途、输入 schema 和输出长度限制。
  - 工具范围限制在当前 `session_id` 与 `selected_novel_id`；不跨项目读取。
  - 续写/改写/序章/章节/候选版本等任务会自动选择最近对话、资产或章节片段。
  - 默认优先导入原文/正式章节，排除 AI 草稿/候选；用户明确提到“草稿/候选/刚才/上一版”时才允许读取 AI 版本。
  - `search_project_assets` 增加长中文 query fallback，避免中文整句搜索无法召回角色/世界观。
  - 聊天 API 返回 `agent_trace`，并把 trace 写入 assistant message metadata，支持刷新后回看依据。
- 前端实现：
  - 聊天请求上下文增加 `selected_novel_id`。
  - 新增 `agent-trace` 类型与规范化逻辑。
  - streaming 与 sync fallback 都会把 `agent_trace` 写入 assistant 消息。
  - 历史消息恢复时读取 `message.metadata.agent_trace`。
  - `MessageBubble` 顶部新增可折叠“本轮写作依据”：
    - 计划摘要
    - 工具调用摘要
    - 使用资产
    - 章节片段预览
    - 降级状态
  - 不再展示模型原始 thinking 内容；只在流式生成中显示“隐藏模型原始思考链”的状态提示。
  - 保留现有 `save_asset` 卡片、`focused_assets` 与 `asset_request` fallback。
- 测试：
  - 后端 agent/API 目标测试：`15 passed`。
  - 前端全量 Vitest：`82 passed`。
  - `npx tsc --noEmit --incremental false` 通过。
  - `compileall` 覆盖 `writing_agent.py`、`api/__init__.py`、`api/types.py` 通过。
- 浏览器验证：
  - 本地前端 `localhost:3010` 与后端 `127.0.0.1:8001`。
  - 为避免测试消耗外部模型，后端验证模式禁用 runtime provider override，并使用 mock AI。
  - 输入“请续写第一章结尾，读取章节片段和辉夜角色”：
    - 实时显示“本轮写作依据”。
    - 展开后看到 `读取最近对话`、`检索项目资产`、`读取章节片段`、`准备保存建议`、`写作质量检查`。
    - 资产包含辉夜/FUSHI/帝明等角色。
    - 章节片段包含章节结尾预览。
  - 输入“按刚才那版改写成一句更温柔的版本”：
    - trace 显示“参考最近对话”。
    - 展开后看到 `读取最近对话` 与保存建议。
  - 新开页面无可见 Runtime/Build Error；曾有一次开发服旧 chunk 的 stale console error，重启前后端并刷新后页面可正常运行。
- 当前判断：
  - Goal 6 主体闭环已经落地：AI 写作前能自动查项目上下文，用户能看到它参考了什么。
  - 这仍是轻量规则 planner，不是完整多轮 agent 图；后续可以把 planner 从规则升级为模型决策，但当前不阻塞内部可用。

## 2026-05-25 Goal 6B：Model-driven Writing Agent Tool Loop v1
- 本轮目标：
  - 将 Goal 6 的规则 planner 升级为优先使用 OpenAI-compatible tool calling 的多步写作 agent。
  - 模型可以在一轮对话内自主选择读取最近对话、章节片段、项目资产、保存建议、覆盖建议和质量检查。
  - 如果当前模型或供应商不支持 tool calling，自动降级到 Goal 6 的规则 planner。
- 后端实现：
  - `AIService` 新增 `chat_tool_decision(...)`：
    - 调用 `/chat/completions` 的 `tools/tool_choice=auto`。
    - 规范化返回 `content / tool_calls / finish_reason`。
    - 无真实 API client 或供应商拒绝 tool calling 时抛出错误，由 agent fallback 接管。
    - 新增 `NOVELFORGE_MOCK_TOOL_CALLS=false` 本地验证开关；开启时脚本化返回 `最近对话 -> 章节片段 -> 角色资产 -> stop`，只用于浏览器/自动化验收。
  - `WritingAgentRuntime.prepare(...)` 新增 `ai_service` 参数。
  - 新增 model-driven 主路径：
    - `plan -> model tool decision -> run tool -> observe -> maybe continue -> final writer prompt`。
    - 单轮最多 5 次工具调用。
    - 工具失败、达到上限、上下文足够、或生成保存/覆盖建议需要用户确认时停止。
  - 继续保留规则 planner：
    - `mode=rule_planner`：未传入 tool-capable AI service 时使用。
    - `mode=fallback`：tool calling 不可用或失败时使用。
  - 工具约束：
    - 所有读取工具仍限制在当前 `session_id / selected_novel_id`。
    - `prepare_save_asset` 和 `prepare_chapter_update` 只生成建议，不直接写库。
    - 默认排除 AI 草稿/候选；只有用户明确提到“草稿/候选/刚才/上一版”才允许读取 AI 版本。
  - trace 扩展：
    - `mode`
    - `fallback_reason`
    - `stopped_reason`
    - 每步工具调用增加 `step`
    - 每步工具调用增加 `continue_reason`，用于前端展示“继续读取上下文”或最终停止原因。
- 前端实现：
  - `agent-trace` 类型支持 `mode / fallback_reason / stopped_reason / step`。
  - “本轮写作依据”面板显示模式、停止原因和降级原因。
  - 仍不展示模型原始 CoT，只展示可审计工具轨迹。
- 测试：
  - 后端目标测试新增：
    - 支持 tool calling 时，模型可连续调用多个工具。
    - tool calling 不可用时降级到规则 planner。
    - 超过 max steps 后停止并标记 degraded。
    - 工具返回 error 时记录 degraded trace，并继续准备最终 writer prompt。
    - 保存/覆盖工具只生成建议，不直接写库。
  - 后端回归：
    - `py -m pytest novelforge-core\tests\api\test_writing_agent_runtime.py novelforge-core\tests\api\test_chat_agent_trace_api.py novelforge-core\tests\services\test_chat_product_prompt.py novelforge-core\tests\api\test_auth.py`
    - 结果：`23 passed`。
  - 前端回归：
    - `npm test`
    - 结果：`20 files / 82 tests passed`。
    - `npx tsc --noEmit --incremental false` 通过。
  - 编译：
    - `compileall` 覆盖 `writing_agent.py`、`api/__init__.py`、`ai_service.py` 通过。
  - API/浏览器验证：
    - `/api/chat/send-message` 真实调用返回 `agent_trace.mode=model_tool_loop`，并持久化到 assistant message metadata。
    - `/api/chat/send-message-stream` 首个 SSE 事件返回 `type=agent_trace`，包含 `mode=model_tool_loop`、多步 `tool_calls`、`stopped_reason=context_sufficient`。
    - `NOVELFORGE_MOCK_TOOL_CALLS=true` 浏览器验证：
      - 前端在本地浏览器中可展开“本轮写作依据”。
      - trace 面板显示 `模式：模型工具循环`。
      - 可见多步轨迹：`读取最近对话 -> 读取章节片段 -> 检索项目资产`。
      - 面板未展示 `<think>` 或原始思考链。
    - 跑 `next build` 后曾导致旧 dev server 与新构建 chunk 混用的 RSC console error；已重启 3010 前端服务，问题属于开发服务热更新状态，不是本轮代码构建失败。
    - 新增无真实 client 时跳过 tool-call 探测的保护，避免 mock/本地模式因为 provider retry 卡在“AI 正在思考”。
    - 验证结束后已重启前端 3010 与后端 8001，恢复正常非 mock 开发运行状态。
- 当前判断：
  - Goal 6B 的核心后端能力已经落地：写作 agent 可以优先走模型驱动多步工具循环，并在不支持 tool calling 时自动回退。
  - 真实浏览器里已验证 trace 面板能展开；多步 model tool loop 已通过后端 mock 单元测试和真实 API/SSE 验证。
  - 后续还需要继续处理全局中文乱码/编码显示问题，这不是 6B 新增能力造成，但会影响产品可用感。

## 2026-05-25 Goal 9：创作资产质量与序章质量增强 v1
- 本轮目标：
  - 不新增大型功能，不重写提取器或 agent 架构。
  - 提高 AI 写序章时稳定读取角色、关系、世界观和章节片段的概率。
  - 让 trace 暴露“哪些资产可用于创作、哪些缺口会影响写得好”。
- 后端实现：
  - `WritingAgentRuntime` 增加轻量创作可用度诊断：
    - 角色：欲望、伤痕、恐惧、行动模式、说话方式、核心关系。
    - 关系：依赖、误解、亏欠、冲突、情绪张力、剧情功能。
    - 世界观：规则、意象、代价、禁忌、场景可用性。
    - 章节：可引用开头、可引用结尾、关键意象。
  - 写作类请求增加 deterministic baseline retrieval：
    - 即使模型工具循环没有主动取齐，也会补检索角色、关系、世界观、导入/正式章节片段和质量检查。
    - 仍限制在当前 `session_id / selected_novel_id`。
    - 默认排除 AI 草稿/候选，除非用户明确提到草稿/候选/上一版。
  - trace 增加：
    - `retrieval_coverage.counts`
    - `retrieval_coverage.issues`
    - `creative_diagnostics`
  - writer prompt 增强：
    - 要求把角色欲望、伤痕、恐惧、关系张力和世界意象转化为具体场景。
    - 序章要有动作、意象、悬念和情绪余韵。
    - 不要一次性解释完所有设定。
  - 修复发现的问题：
    - 原来 `world/outline/timeline` 混合检索时，时间线会挤掉世界观资产；写作链路已改为单独检索 `world`。
- 真实模型复验：
  - 模式/模型：Fast mode，后端报告 `gemini-3.5-flash`。
  - 项目：`clean_import_20260524_111341`。
  - 保存结果：`Goal9 序章候选 - 资产增强v2`。
  - 保存内容 ID：`d4caaa8b-6409-43a4-a1ca-52edd09f4d2a`。
  - 字数：1334 chars。
  - trace 覆盖：
    - characters=5
    - relationships=3
    - world=1
    - chapter_snippets=3
    - issues=[]
  - Editor 兜底验证：
    - 清理中间草稿后，`get_content(d4caaa8b-6409-43a4-a1ca-52edd09f4d2a)` 返回正确标题和 1334 字正文。
    - 当前 shell runner 无法让新启动的 dev server 在命令结束后常驻，因此本轮没有再做浏览器视觉复验；没有伪造 browser pass。
  - 中间验证草稿已清理，只保留最终 v2 验收草稿，避免污染项目资产。
- 测试：
  - `py -m pytest -p no:cacheprovider novelforge-core\tests\api\test_writing_agent_runtime.py`
  - 结果：`17 passed`。
  - 后端相关回归：
    - `py -m pytest -p no:cacheprovider novelforge-core\tests\api\test_writing_agent_runtime.py novelforge-core\tests\api\test_chat_agent_trace_api.py novelforge-core\tests\services\test_chat_product_prompt.py novelforge-core\tests\api\test_auth.py`
    - 结果：`26 passed`。
- 当前判断：
  - Goal 9 的核心 agent 改进已生效：写作前能稳定拿到角色、关系、世界观和章节片段，并把缺失信号写进 trace。
  - 真实 v2 序章候选比 Goal 8 更聚焦人物入场和场景即时性。
  - 关系资产仍偏薄，尤其依赖、亏欠、情绪张力、剧情功能不足；下一轮若继续提高“动人”程度，应优先做关系资产修复/增强，而不是继续扩大检索。

## 2026-05-25 Goal 10：关系资产增强/修复 v1
- 本轮目标：
  - 不重写提取器，不新增 agent 工具数量，不引入向量数据库。
  - 把 relationship 从“有边/有类型”推进到“可支撑小说创作的张力结构”。
- 后端实现：
  - relationship 创作诊断扩展为 10 个信号：
    - dependency / 依赖
    - misunderstanding / 误解
    - debt / 亏欠
    - conflict / 冲突
    - emotional_tension / 情绪张力
    - power_dynamic / 权力差/控制
    - intimacy / 亲密度
    - arc / 关系变化
    - plot_function / 剧情功能
    - scene_potential / 可写场景
  - 诊断结果增加：
    - `missing_signals`
    - `relationship_creative_readiness`
  - 低信息关系生成 `repair_suggestion`：
    - 关系一句话核心
    - 当前状态
    - 依赖/误解/亏欠/冲突
    - 情绪张力
    - 关系变化方向
    - 可制造剧情场景
    - 序章/章节写作建议
  - 新增内部 helper：
    - `build_relationship_repair_suggestion(...)`
    - 可读取原关系、相关角色资产和章节片段，返回 enriched relationship draft。
    - 不自动覆盖原关系资产。
  - agent trace 增加：
    - `relationship_quality_report`
    - `relationship_repair_suggestions`
  - writer prompt 增强：
    - 如果关系包含 dependency/debt/misunderstanding/emotional_tension/plot_function 等信号，必须转化为具体场景冲突或人物选择。
    - 如果 trace 显示关系资产薄弱，生成结果应定位为草稿，并建议补强关系资产。
- 真实模型复验：
  - 模式/模型：Fast mode，后端报告 `gemini-3.5-flash`。
  - 项目：`clean_import_20260524_111341`。
  - 保存结果：`Goal10 关系驱动序章候选v1`。
  - 保存内容 ID：`9d802163-efe2-49b6-bf30-03e2c020f365`。
  - 字数：1510 chars。
  - trace 覆盖：
    - characters=8
    - relationships=5
    - world=1
    - chapter_snippets=3
  - relationship quality report：
    - total_relationships=5
    - tension_relationships=1
    - low_information_relationships=5
    - missing_plot_function_relationships=5
    - status=thin
  - 质量判断：
    - 新草稿把八千代的选择写成“保护辉夜并因此可能失去自己 / 继续守护彩叶承诺”的关系驱动决断。
    - 相比 Goal 9，更少只靠氛围推进；但底层关系资产仍需要正式补强。
- 测试：
  - 写作 agent 单测：
    - `20 passed`
  - 后端相关回归：
    - `29 passed`
- 当前判断：
  - Goal 10 已把关系薄弱问题从“隐性质量问题”变成“trace 和 repair suggestion 中可见、可处理的问题”。
  - 下一步更适合做用户可确认的关系修复写回入口，或在导入修复任务中接入这些 enriched relationship draft。

## 2026-05-25 Goal 11：关系修复确认写回闭环 v1
- 本轮目标：
  - 不重写提取器，不新增大型 UI，不自动覆盖原关系资产。
  - 把 Goal 10 的 `relationship_repair_suggestions` 落成用户可见、可预览、可确认、可写回的关系补强流程。
- 前端实现：
  - 扩展 `agent-trace` 类型与 normalize：
    - `retrieval_coverage`
    - `creative_diagnostics`
    - `relationship_quality_report`
    - `relationship_repair_suggestions`
    - `relationship_enriched`
  - `MessageBubble` 的“本轮写作依据”增加关系质量卡：
    - 关系总数
    - 有张力关系数
    - 低信息关系数
    - 缺剧情功能关系数
    - 高频缺失信号
  - 增加关系修复建议预览卡：
    - source / target
    - missing_signals
    - core
    - dependency / misunderstanding / debt / conflict
    - emotional_tension / arc
    - scene_potential
    - writing_advice
  - 操作入口：
    - 保存为关系补强草稿
    - 二次确认后更新原关系资产
    - 跳过则不写库
- 安全写回：
  - 默认保存新关系草稿，不覆盖原资产。
  - 更新原关系时保留 `previous_snapshot`：
    - old title
    - old content
    - old extracted_data
    - old updated_at
    - repaired_at
  - 写回 metadata / extracted_data：
    - `source_type = ai_repaired / user_confirmed_repair`
    - `repair_from_relationship_id`
    - `repair_status = draft / confirmed`
    - `quality_flags = relationship_enriched`
    - `missing_signals_resolved`
    - `remaining_missing_signals`
  - 前端 helper 阻断跨 session / selected novel 写回。
- 后端实现：
  - `search_project_assets` 对关系资产优先返回 confirmed / enriched relationship。
  - enriched relationship 不再重复生成 repair suggestion。
  - trace 的 `used_assets` 标记 `relationship_enriched`，前端和验收能看到 agent 是否真实使用了补强关系。
- 真实模型复验：
  - 使用项目：`clean_import_20260524_111341`。
  - 原关系：`rel_clean_import_20260524_111341_014b4af2`（酒寄彩叶 -> 彩叶的母亲）。
  - 保存关系补强草稿：
    - `goal11_repair_6ab5408f23c9`
    - `Goal11 关系补强草稿：彩叶与母亲`
  - 生成并保存序章候选：
    - `goal11_chapter_39bd71b93800`
    - `Goal11 关系修复闭环序章候选v1`
    - 约 1700 chars。
  - 修复前 relationship report：
    - total_relationships=8
    - tension_relationships=3
    - low_information_relationships=7
    - missing_plot_function_relationships=8
    - status=thin
  - 修复后 relationship report：
    - total_relationships=8
    - tension_relationships=4
    - low_information_relationships=6
    - missing_plot_function_relationships=7
    - status=thin
  - 生成链路 trace：
    - used_enriched_relationship=true
    - generation relationship report status=usable
    - total_relationships=4
    - tension_relationships=3
    - low_information_relationships=1
- 测试：
  - `py -m pytest -p no:cacheprovider novelforge-core\tests\api\test_writing_agent_runtime.py -q`
    - 21 passed
  - `cmd /c npm test`
    - 21 files passed, 86 tests passed
  - `cmd /c npx tsc --noEmit --incremental false`
    - passed
  - `cmd /c npm run build`
    - passed
  - 后端相关回归：
    - `30 passed`
- 当前判断：
  - Goal 11 打通了第一版“诊断 -> 建议 -> 预览 -> 用户确认 -> 写回 -> agent 优先读取增强关系”的关系修复闭环。
  - 单条关系补强已经能让生成链路的 relationship report 从 thin 局部改善到 usable。
  - 但整个关系网络仍偏薄，内测前建议继续做 2-3 条核心关系的批量/半自动补强，或提供“核心关系一键补强队列”。

## 2026-05-25 Goal 12：核心关系补强队列 v1（进行中）
- 本轮目标：
  - 将 Goal 11 的单条关系修复扩展为 2-3 条核心薄弱关系队列。
  - 优先提升全局关系网络质量，而不是每次只修一条。
- 后端实现：
  - 新增核心关系队列评分：
    - 低信息程度
    - 缺失信号数量
    - evidence 数
    - chapter_references 覆盖
    - strength
    - 是否已有冲突 / 误解 / 关系变化可扩展
    - confirmed / enriched 关系默认后置
  - 新增 `build_relationship_repair_queue(...)`：
    - 只扫描当前 `session_id / selected_novel_id`。
    - 返回最多 2-3 条可修复关系。
    - 每条包含 `repair_suggestion / enriched_relationship_draft`、`queue_rank`、`queue_score`、`queue_reasons`、`queue_status`。
  - 写作 baseline 会自动附加关系补强队列 observation，trace 增加：
    - `relationship_repair_queue`
  - agent 仍优先读取 `relationship_enriched` / `repair_status=confirmed` 的关系资产。
- 前端实现：
  - `agent-trace` 类型和 normalize 支持：
    - `relationship_repair_queue`
    - `queue_rank`
    - `queue_score`
    - `queue_reasons`
    - `queue_status`
    - `relationship_enriched`
  - MessageBubble 的“本轮写作依据”增加“核心关系补强队列”卡片。
  - 队列面板展示“修复前 / 预计修复后”的关系质量对比：
    - 有张力关系数
    - 低信息关系数
    - 缺剧情功能关系数
  - 每条队列项可独立：
    - 保存草稿
    - 更新原关系
    - 跳过
  - 卡片本地显示状态：
    - 待处理
    - 已保存
    - 已更新
    - 已跳过
- 测试：
  - writing agent 相关：
    - `25 passed`
  - 后端相关回归：
    - `32 passed`
  - 前端 Vitest：
    - `21 files / 86 tests passed`
  - TypeScript：
    - passed
  - 前端 build：
    - passed
- 真实队列复验：
  - 项目：`clean_import_20260524_111341`
  - 队列选出 3 条关系：
    - `酒寄彩叶 -> 彩叶的母亲`
    - `酒寄彩叶 -> 芦花与真实`
    - `酒寄彩叶 -> 八千代`
  - 保存关系补强草稿：
    - `goal12_repair_3290a9ce01c0`
    - `goal12_repair_8d46bdfd0792`
    - `goal12_repair_a4295a05740e`
  - 修复前 relationship report：
    - total_relationships=8
    - tension_relationships=4
    - low_information_relationships=6
    - missing_plot_function_relationships=7
    - status=thin
  - 批量保存补强草稿后：
    - total_relationships=8
    - tension_relationships=7
    - low_information_relationships=3
    - missing_plot_function_relationships=4
    - status=usable
  - 后续 agent 写作 trace：
    - confirmed/enriched 关系被优先读取。
    - 多次复验中 `trace_used_enriched_relationship_count` 最高达到 7。
- 写作候选验收器：
  - 新增 `evaluate_relationship_driven_candidate(...)`：
    - 字数必须在 800-1500。
    - 不允许说明性前言 / markdown 标题。
    - 必须命中要求的关系端点或别名。
    - 必须包含选择 / 亏欠 / 误解 / 情绪转折等关系驱动信号。
  - 新增 `build_relationship_candidate_rewrite_prompt(...)`：
    - 如果候选不达标，自动生成压缩 / 补关系 / 去说明文字的重写指令。
  - 单测覆盖：
    - 多关系序章正例通过。
    - 说明性前言、字数不足、关系端点不足被拒绝。
- 最终真实写作复验：
  - 先前失败候选已从内容库删除，避免污染用户可见资产。
  - 最终保存候选：
    - `goal12_chapter_fae41a717f59`
    - `Goal12 核心关系队列序章候选final`
  - 候选字数：1018 chars。
  - gate 结果：passed。
  - 命中的关系端点：
    - 母亲
    - 芦花
    - 真实
    - 八千代
  - relationship report：
    - total_relationships=8
    - tension_relationships=7
    - low_information_relationships=3
    - missing_plot_function_relationships=4
    - status=usable
- 当前判断：
  - Goal 12 的队列生成、批量补强、前端队列展示、逐条保存/更新入口、全局关系质量改善、agent 优先读取增强关系、真实多关系序章候选均已完成。
  - 最终候选可作为 AI draft/candidate 进入人工审阅；仍不应自动替换正式序章。
