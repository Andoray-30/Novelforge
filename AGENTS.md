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

* 不要为了“看起来有进展”扩大修改范围。
* 不要为了写总结继续补无关代码。
* 不要为了 smoke 通过降低质量门槛。
* 不要把半成品实验代码直接并入稳定分支。
* 遇到不确定的架构问题，先写审计和方案，再实现。
* 保持改动小、边界清楚、可测试、可回滚。
