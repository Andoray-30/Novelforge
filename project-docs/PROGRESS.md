# NovelForge 项目进度跟踪

## 阅读导航
- 本文档分为四层：
  - 顶部“阶段审计结论”：用于快速判断系统当前状态、主要短板与未来规划。
  - 中部“当前阶段 / 已完成 / 正在处理 / 待处理”：用于跟踪当前工作流状态。
  - 下部“历史详细记录”：保留过去每一轮修复动作，不删历史，便于回溯排查。
  - 文末新增记录继续按日期追加，但不再依赖对话记忆维护全局判断。
- 阅读建议：
  - 想知道系统现在到了哪一步，先看“2026-04-18 阶段审计结论”。
  - 想知道当前正在做什么，看“正在处理 / 待处理”。
  - 想追溯某一轮具体修复，看“历史详细记录”中的日期条目。

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

### 当前主要不足与问题
- 领域模型边界仍不够清晰：
  - `project / session / conversation / asset container` 之间仍有重叠语义，后续容易继续出现“看似隔离、实际串库”的问题。
- 工作台闭环还不够硬：
  - 聊天可以生成内容，但 AI 还不能稳定地结构化检索当前项目资产、触发系统动作、保存结果回内容库。
- 提取质量缺少工程化度量：
  - 目前能运行，不代表覆盖率、完整性、逻辑性已经可靠；缺少覆盖率与召回质量回归标准。
- 资产图谱仍偏“展示”，还没有完全进化成“可操作关系图”：
  - 关系、章节、角色、世界观之间的因果和引用关系仍需继续结构化增强。
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
- Phase C：升级 AI 与系统能力桥接层
  - 目标：让 AI 不只是“读摘要”，而是“读当前项目资产、调用项目内动作、生成并保存结构化结果”。
  - 重点：资产检索、工具调用、保存确认、结果回流。
- Phase D：建立提取与图谱质量基线
  - 目标：给角色覆盖率、世界观覆盖率、剧情时间线完整度、关系网连线率建立回归标准。
  - 重点：从“能用”升级到“可证明地稳定”。
- Phase E：硬化发布前工程质量
  - 目标：补自动化测试、端到端回归、文档编码清理和失败恢复验证。
  - 重点：让系统从“持续修”进入“可交付”。

## 当前阶段
进行中：Workstream 2 — 后端工作流正确性（同时收尾 Workstream 1 的剩余契约统一）

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

## 正在处理
### Workstream 2 — 后端工作流正确性
- 继续核实 `text-processing -> ai_scheduler -> content_manager` 的完整落库链路，尤其是导入任务完成后的最终资产写入语义。
- 继续检查 scheduler、extractors、content storage 三者之间的契约一致性，避免同一资产被多套逻辑写成不同形态。
- 继续收敛任务结果、错误恢复、页面刷新后的任务恢复联动，为后续 Workstream 6 的异步体验硬化打基础。
- 继续核实导入任务完成后，除首页外的其他页面是否还存在资产刷新时序漂移。
- 继续核实失败任务、取消任务、调度器未接管成功等剩余边界场景下的结果语义是否仍然稳定。
- 继续核实统一提取是否真正覆盖全书文本，并补强长文本的“二轮召回补提 + 合并”策略，降低角色、世界观、剧情要点漏提。
- 继续统一 `extract/text` 与 `text-processing/upload-and-process` 两条入口的提取质量语义，避免一个入口偏完整、一个入口偏局部。

### Workstream 1 — 数据契约收尾
- 继续统一 `chapter / world / relationship / outline` 在剩余组件和后续入口中的结构化 payload 读写规则。
- 继续核实内容接口与前后端持久化路径在导入、规划、聊天、提取四条链路上的一致性，避免局部页面已统一、后台链路仍漂移。
- 继续补齐角色详情页等资产详情页对 `session_id / project` 归属的校验，避免跨项目误读与误展示。

### Workstream 5 — 页面真实化增量
- `editor / analytics / settings` 的 v1 真实页已完成，当前只保留增强项：补充 `editor` 的章节创建/切换体验，以及补充更完整的项目分析维度。
- 修复角色详情页在统一暗色主题下的可读性问题，避免白底白字和旧乱码文案残留。
- 修复首页聊天区左侧会话栏与导航栏随消息区一起滚动的问题，保证滚动只发生在消息列表内部。

## 待处理
### Workstream 3 — 应用壳统一
- 统一首页和主 layout
- 稳定项目/session 恢复能力
- 增加全局项目切换入口，让角色、世界、编辑器、分析等页面都能直接切换当前项目。
- 进一步厘清“会话 / 项目 / 资产容器”的边界，确保不同对话产出的角色卡、世界观、章节严格按项目隔离保存。
- 明确首页聊天/仪表盘区域是“主工作台”，其他页面是同一项目资产源上的总览/详情投影视图。

### Workstream 4 — 创作闭环
- planning -> save
- import/extract -> assets
- chat artifact -> save/load
- chapter generation -> editor
- 设计并接入聊天模型到系统能力的桥接层（工具调用 / 资产检索 / 内容保存），让 AI 不再与项目内容库完全隔离。
- 将“聊天工作台 -> Artifact 面板 -> 结构化资产 -> 世界树/总览 -> 再回流聊天”收口为主路径，并优先保证完整性、关联性、逻辑性。

### Workstream 5 — 页面真实化
- editor 增强版
- analytics 增强版
- settings 增强版
- project switcher 与项目上下文可视化
- 角色 / 世界详情页与资产详情页的统一暗色风格收口

### Workstream 6 — 硬化与测试
- 异步任务体验
- 错误恢复
- 前后端测试
- 提取质量回归清单（角色覆盖率、世界观覆盖率、剧情时间线覆盖率、关系网完整度）
- 工作台闭环回归清单（资产连线率、跨页面一致性、AI 读取当前项目资产能力、项目切换隔离正确性）

## 当前阻塞/注意事项
- 本机已确认可通过 `py` 使用 Python 3.12.10 执行后端校验。
- 前端导入入口的项目上下文与任务语义已统一，但 `text-processing` 后端任务完成后的最终资产写入仍需继续核实和补齐。
- 前端主入口和核心页面已经比之前连贯很多，接下来最值得优先攻坚的是后端异步导入/调度任务完成后的最终资产一致性与错误恢复。

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

