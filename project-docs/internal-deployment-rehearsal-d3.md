# D.3 Internal MVP Release Rehearsal

## Decision

**PASS_WITH_PROXY_E2E_PENDING**

Mandatory Tier A 的生产式本地/内部演练通过：认证、前后端生产式启动、全新 synthetic UI 导入、重启持久化和停机文件复制备份恢复均取得一致证据。当前机器没有可用的代理运行环境，因此 Tier B 只记录为 `PROXY_TLS_E2E_NOT_AVAILABLE`，不声称代理或 TLS E2E 通过。

## Scope

- internal/native rehearsal
- synthetic input only
- deterministic mock provider
- external provider called: no

本轮不是公开互联网部署，不运行 Sample A/B，不调用真实 provider，也不读取受保护样本。

## Environment

- backend mode: `uvicorn novelforge.api.main:app`，无 reload，监听 `127.0.0.1:8001`
- frontend mode: `npm run build` 后执行 `npm run start`，监听 `127.0.0.1:3000`
- auth: required；仅使用本轮临时生成的管理员密码与 session secret，未写入报告或截图
- data directory: 仓库外的本轮隔离 `content_db` 数据树
- provider: deterministic mock；runtime provider overrides 关闭；无外部 provider key
- public deployment: Tier A 为 `false`
- proxy path: none；Docker CLI 存在但 engine 单次探测超时，Caddy/Nginx 不可用

## Startup

| Component | Result |
|---|---|
| backend production process | PASS；无 reload，`127.0.0.1:8001` |
| frontend production process | PASS；production build 后由 `npm run start` 启动于 `127.0.0.1:3000` |
| health | PASS；`/health` HTTP 200 |
| openapi | PASS；认证后 `/openapi.json` HTTP 200；未认证受保护 API HTTP 401 |
| login | PASS；错误密码 HTTP 401 且安全失败、无 secret 回显；正确登录 HTTP 200 |
| frontend | PASS；`/` 与 `/extract` HTTP 200；浏览器 console error/warning/sensitive match 均为 0 |

认证成功的 session cookie 仅核对属性：`HttpOnly`、`SameSite=Lax`、`Path=/`；Tier A 为 loopback HTTP，`Secure=false`。本报告不记录 cookie 值。

清理前又以 production-style backend/frontend 做了一轮最终探针：`/health`、认证后 `/openapi.json`、正确登录、frontend `/` 与 `/extract` 均为 HTTP 200；未认证受保护 API 与错误登录均为 HTTP 401，结果与主验收一致。

## Synthetic Import

本轮在仓库外新建 3,193 字符、3 章的完全虚构 synthetic 输入，SHA-256 为 `457b5fbcc2ed37baadbaa50ca681f856053522f29c5b214ba67381f01995a626`。通过 `/extract` 页面原生“粘贴文本导入”入口完成，不写入 synthetic 全文。

| Metric | Result |
|---|---|
| status | `completed_with_quality_warnings` |
| chapters | 3 |
| failed chapters | 0 |
| characters | 3 |
| relationships | 2 |
| timeline | 3 |
| world | 1 |

另外验证 novel 1、总内容 13；`provider_unavailable=0`，raw exception/secret match 为 0。质量警告来自面向更长内容的建议阈值，不表示导入失败。History/Deep Synthesis 页面仍可打开，本轮 History 为可读空状态 0；D.3 不重复执行 M.0 的完整 preview/apply 流程。

## Restart Persistence

- restart: PASS；正常停止前后端并确认 3000/8001 释放后，使用同一隔离 data dir 和相同 production-style 命令重启
- project recovered: yes
- project/session marker (SHA-256 prefix): `be8fc38d`；import → restart → restore 三阶段一致
- asset counts preserved: yes；chapters 3、characters 3、relationships 2、timeline 3、world 1、novel 1、total 13
- history preserved: yes；可读空状态保持 `0 -> 0`
- duplicates: 0

## Backup and Restore

- backup type: `OFFLINE_FILE_COPY_BACKUP`
- files: 3 files / 115,000 bytes，仅包含本轮隔离 data tree
- hash verification: PASS；逐文件 SHA-256 聚合结果一致
- restored: yes；从 backup 恢复到新的隔离 restore directory 后，认证和项目读取成功
- asset counts preserved: yes；chapters 3、characters 3、relationships 2、timeline 3、world 1、novel 1、total 13，History 0，duplicates 0

该流程在服务正常停止后执行，不代表在线热备份能力。

## Proxy/TLS

- selected proxy: none
- syntax: not run
- redirect: not run
- HTTPS: not run
- cookie: proxy/TLS E2E not run
- status: `PROXY_TLS_E2E_NOT_AVAILABLE`

环境探测仅执行一次：Docker CLI 存在，但 engine 探测超时；Caddy 与 Nginx 不可用。未安装工具、未拉取镜像，也未把静态模板审查误报为 E2E PASS。

## Log Safety

- files: 4
- bytes: 697
- errors: 0
- warnings: 0
- sensitive matches: 0

最终补测使用另一份 3,150 字符、3 章的临时 synthetic 文本，只用于验证 production-style 启动、认证探针和落盘日志敏感扫描；未执行导入（`import_executed=false`），不替代上述 3,193 字符 UI 导入验收。此前一轮完整复现的日志扫描同样为 0 命中。

最终稳定网络快照中，backend Python、frontend Node、其他本轮子进程、provider-associated 与 unclassified 的已建立外部连接计数均为 0；因此外部 provider 调用结论仍为 false。

## Tests

- auth：`tests/api/test_auth.py`，52 passed（1.46 s）
- scheduler/import + extraction：`tests/services/test_ai_scheduler_import.py tests/services/test_extraction_service.py`，47 passed（1.28 s）
- TypeScript：`npx tsc --noEmit --incremental false` 通过（约 9 s）
- frontend production build：通过（24.9 s），13/13 静态页面生成
- Git：`git diff --check` 通过，仅有 LF→CRLF warning

首次 auth 测试在受限 sandbox 的临时目录 ACL 上失败；同一命令在允许环境中通过 52 项，因此不记为产品失败。pytest 仍有既有 cache warning。frontend build 识别到既有 `.env.local`，但本轮未读取、修改或提交该文件。

## Cleanup

- services stopped: yes；本轮 backend/frontend 均已正常停止
- ports released: yes；3000/8001 均无残留监听
- temporary data removed: yes；isolated data、restore data、日志、运行时配置、临时脚本与本轮 secrets 均已移除
- backup removed: yes
- synthetic input removed: yes；主 UI 验收与最终日志补测的临时输入均已移除
- protected samples: 2 个预期受保护样本仍为 untracked；未读取、未 stage、未提交

## Remaining Risks

- 尚未执行 target-server proxy/TLS E2E；Tier B 状态为 `PROXY_TLS_E2E_NOT_AVAILABLE`。
- Tier A 的 `Secure=false` 仅符合本地 loopback HTTP 演练，不适用于公开互联网部署。
- deterministic mock 证明流程确定性，不代表真实 provider 的可用性、延迟或输出质量。
- `OFFLINE_FILE_COPY_BACKUP` 是停机一致性复制，不是在线热备份。
- rehearsal 各阶段未单独计时；报告只记录独立实测的测试耗时。
- 网络采样过程中曾瞬时观察到 1 条未分类已建立连接；该连接未关联 provider，且在最终稳定复现窗口未再次出现。最终权威快照各分类均为 0，但目标服务器演练仍应继续核对代理后的出站连接策略。
- M.0 最终 Decision 仍为 `PARTIAL`，保留原生文件选择器未自动化及一次 filename metadata 披露限制。

## Final MVP Assessment

- local/internal MVP ready: **yes；Mandatory Tier A 通过**
- public internet deployment ready: **no；需完成 Target Server Proxy/TLS Rehearsal**

## Evidence

- `project-docs/screenshots/d3/01-login-success.png`（true PNG，1280×720）
- `project-docs/screenshots/d3/02-import-complete.png`（true PNG，1280×720）
- `project-docs/screenshots/d3/03-restart-persistence.png`（true PNG，1280×720）
- `project-docs/screenshots/d3/04-backup-restore.png`（true PNG，1280×720）

## Next Goal

**Target Server Proxy/TLS Rehearsal**
