# NovelForge Agent Instructions

NovelForge 是一个小说分析与 AI 内容生成工作台。本文件适用于所有在本仓库工作的 AI coding agent。

## 1. 默认语言

* 默认使用中文与用户沟通。
* 默认使用中文编写任务总结、审计结论、进度记录、风险说明和验收报告。
* 除非用户明确要求英文，否则不要用英文输出整段总结。
* 代码标识符、函数名、类名、API 字段、错误枚举、第三方库名称可以保留英文。
* 技术名词可以中英混用，但结论、解释和下一步建议必须中文优先。

## 2. 仓库结构

* `novelforge-core/`：主项目。

  * Backend：Python 3.10+ FastAPI。

    * Entrypoint：`novelforge.api.main:app`
    * 主要 API routes 集中在 `novelforge-core/novelforge/api/__init__.py`。
    * 主要逻辑分层：API -> Services -> Extractors -> Storage。
  * Frontend：Next.js 15 App Router + TypeScript + Tailwind CSS。

    * 默认前端端口：`3000`
    * 通过 `next.config.js` 代理 API 请求到后端。
* `SillyTavern/`：第三方上游依赖，默认不要修改。
* `project-docs/`：项目规划、进度、审计、内测和架构文档。

## 3. 关键注意事项

### 后端端口

* README 可能提到 `8000`。
* 当前实际后端端口是 `8001`。
* `next.config.js` 和启动脚本均按 `127.0.0.1:8001` 使用。
* 本地开发和 smoke 默认使用 `8001`。

### 存储策略

* 默认可能使用 file/JSON 存储。
* 内测或高性能场景建议使用 `content_db` SQLite。
* 调试数据持久化时优先检查：

  * `STORAGE_TYPE`
  * `USE_CONTENT_DATABASE`
  * `CONTENT_DATABASE_PATH`
  * `NOVELFORGE_DATA_DIR`

### API 文件位置

* 不要假设后端 routes 分散在多个文件。
* 大多数 endpoint 在：

  * `novelforge-core/novelforge/api/__init__.py`
* 新增 endpoint 前必须先搜索现有实现，避免重复。

## 4. 常用命令

### Backend

```powershell
cd novelforge-core
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
uvicorn novelforge.api.main:app --reload --port 8001
```

### Frontend

```powershell
cd novelforge-core/frontend
npm install
npm run dev
```

### Tests

```powershell
cd novelforge-core
pytest -v
```

```powershell
cd novelforge-core/frontend
npm test -- --run
npx tsc --noEmit --incremental false
npm run build
```

## 5. 安全与仓库卫生

禁止提交：

* `.env`
* 真实 API key
* `sk-...`
* provider key
* session secret
* 用户样本文本或长篇小说原文
* 临时 Chrome profile
* 临时日志
* smoke JSON
* 缓存目录
* 本地临时脚本

禁止使用危险清理命令，例如：

```powershell
git clean -fdx
```

除非用户明确授权。

不要删除：

* `.venv`
* `node_modules`
* SQLite 数据库
* 用户样本文本
* 已提交截图
* 已提交项目文档

如果遇到 Windows ACL 拒绝访问的临时目录，记录目录名即可，不要反复强删，不要使用管理员权限命令。

## 6. 分支规则

* `main`：稳定版本，不直接开发。
* `codex/novelforge-next` 或 `opencode/novelforge-next`：阶段集成分支。
* 每个阶段单独开分支。
* 半成品实验分支不得直接合入 `main`。
* 合并前必须说明：

  * 当前分支
  * 改动文件
  * 测试结果
  * 未完成项
  * 风险
  * 是否提交
  * 是否推送

## 7. 工程边界

除非用户明确要求，不要重写底层基础设施：

* `novelforge-core/novelforge/base/rate_limiter.py`
* `novelforge-core/novelforge/base/concurrency.py`

不要为了完成任务而把大型调度逻辑、实验逻辑或临时方案塞进 `AIService`。

如果需要新增复杂能力，应优先新增独立模块，并保持边界清楚。

## 8. 外部模型调用规则

* 不要为了完成 smoke 反复盲目调用外部 provider。
* 不要未经用户确认发送用户真实小说原文到外部模型。
* 如果必须跑真实外部模型测试，应明确说明：

  * 使用什么输入
  * 是否包含用户原文
  * 使用什么 provider/model
  * timeout/失败如何处理
* 外部模型/API 调用失败时，不允许伪造通过。

## 9. 文档规则

以下文档新增内容默认使用中文：

* `project-docs/PROGRESS.md`
* `project-docs/INTERNAL_TEST_RESULTS.md`
* `project-docs/INTERNAL_TEST_READINESS.md`
* `project-docs/EXTRACTION_PROVIDER_STRATEGY.md`
* `project-docs/OPENCODE_EXTRACTION_AUDIT.md`
* `project-docs/HANDOFF_*.md`
* `project-docs/UI_*.md`

如果已有标题为英文，可以保留标题，但正文应优先使用中文。

## 10. 任务完成汇报格式

每次任务完成后，默认使用中文汇报：

```text
完成情况：
- ...

改动文件：
- ...

测试结果：
- ...

未完成项：
- ...

风险：
- ...

下一步建议：
- ...

提交状态：
- ...
```

如果没有运行测试，必须说明原因。
如果只改文档，不要声称产品功能已验证。
如果任务被阻塞，必须明确说明阻塞原因。

## 11. 工作方式

* 不要为了"看起来有进展"扩大修改范围。
* 不要为了写总结继续补无关代码。
* 不要为了 smoke 通过降低质量门槛。
* 不要把半成品实验代码直接并入稳定分支。
* 遇到不确定的架构问题，先写审计和方案，再实现。
* 保持改动小、边界清楚、可测试、可回滚。

## 12. 代理调度边界（Agent Delegation Policy）

### 核心原则

Sisyphus 是 orchestration agent，不是 implementation worker。

Sisyphus 的职责是：

* 理解用户目标
* 分解任务
* 制定执行计划
* 分派子任务给 worker agent
* 审查 worker 输出
* 要求 worker 修复问题
* 汇总结果
* 维护长期路线图
* 控制上下文预算

Sisyphus 不应：

* 长时间亲自实现代码
* 独自读大量文件
* 独自跑完整测试循环
* 独自排查多轮失败
* 在大上下文中继续做实现
* 同时扮演 planner、implementer、reviewer
* 把所有实现细节塞进自己的上下文

### 强制委派条件

只要满足以下任一条件，Sisyphus 必须调用子智能体或生成明确 worker prompt，不得继续亲自实现：

* 任务会修改超过 1 个源码文件
* 任务需要新增或修改测试
* 任务需要运行测试套件
* 任务需要读取超过 3 个项目文件
* 任务预计超过 10 分钟
* 任务包含业务逻辑实现
* 任务包含调试循环
* 当前上下文已经很大
* 任务属于 NovelForge 多阶段路线图
* 任务涉及前后端联动
* 任务涉及 API、数据模型、存储、调度、路由、提取链路
* 任务需要代码审查

### 上下文预算规则

Sisyphus 必须遵守以下上下文预算：

* 超过 80k tokens：所有实现任务必须委派
* 超过 150k tokens：只允许规划、审查、总结
* 超过 250k tokens：禁止代码实现，只允许生成 handoff 和 worker prompt
* 超过 300k tokens：必须停止当前长上下文任务，生成压缩交接摘要，启动新 worker 任务

如果当前上下文很大，Sisyphus 必须主动说：
"当前上下文已不适合继续实现，我将改为分派 worker 并只做审查。"

### 推荐角色分工

**Sisyphus**：
* 总控
* 路线图规划
* 任务拆分
* 风险判断
* 架构边界审查
* 最终验收总结

**Worker agent（deep / quick / unspecified-high）**：
* 代码实现
* 机械重构
* 测试新增
* bug 修复
* 本地验证
* 提交代码

**Oracle**：
* 架构审查
* correctness 审查
* regression 审查
* 安全边界审查
* 是否偏离项目初心判断

**小型 worker（quick category）**：
* 单文件修改
* 类型定义补全
* 测试修复
* 文档整理
* lint / formatting 修复

### 标准委派流程

所有非平凡任务必须使用以下流程：

1. Sisyphus 读取用户请求
2. Sisyphus 只读取最少必要上下文
3. Sisyphus 输出短计划
4. Sisyphus 将实现任务委派给 worker agent
5. Worker 负责读文件、改代码、跑测试
6. Worker 返回完成摘要、改动文件、测试命令、测试结果、风险、未完成事项、commit hash
7. Sisyphus 审查结果
8. 若发现问题，Sisyphus 不亲自大改，而是给 worker 一个聚焦修复任务
9. Sisyphus 最后向用户汇总

### Worker Prompt 模板

Sisyphus 委派任务时必须使用紧凑模板：

```text
Task:
<一个清晰目标>

Read first:
* AGENTS.md
* <相关项目文档>
* <相关源码文件，最多列必要文件>

Scope:
* Allowed files:
  * <允许修改的文件>
* Forbidden files:
  * <禁止修改的文件>
* Non-goals:
  * <明确不做什么>

Implementation requirements:
* <具体行为要求>
* <边界要求>
* <安全要求>

Tests:
* <必须新增/更新的测试>
* <必须运行的命令>

Return:
* Summary
* Changed files
* Tests run
* Test results
* Risks
* Commit hash if committed
```

### Worker 返回格式

Worker 必须按以下格式返回：

```text
Summary:
* ...

Changed files:
* ...

Tests run:
* ...

Test results:
* ...

Risks:
* ...

Unfinished:
* ...

Commit:
* ...
```

### Sisyphus 禁止事项

Sisyphus 禁止：

* 亲自完成大型实现
* 亲自进行多轮代码排错
* 一次性读取大量文件
* 把完整日志粘进上下文
* 在上下文过大时继续实现
* 跳过 worker 审查
* 跳过测试要求
* 无计划地连续修改
* 把临时实验代码提交
* 提交 .env、API key、用户原文、日志、缓存
* 修改 base/rate_limiter.py，除非用户明确要求
* 修改 base/concurrency.py，除非用户明确要求
* 把用户小说正文写入诊断存储、profile、retry job 或日志
