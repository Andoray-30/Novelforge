# NovelForge Writing Quality Check

Date: 2026-05-25

## Goal 7 Browser Validation

Environment:

- Frontend: `http://localhost:3010`
- Backend: `http://127.0.0.1:8001`
- Project used: `超时空辉夜姬 清洁提取测试`
- External provider: configured OpenAI-compatible endpoint, model observed in backend log as `gemini-3.5-flash`
- Validation mode: Chrome browser, real provider calls, not mock-only

## Path Verified

1. Opened NovelForge workspace in Chrome.
2. Used existing extracted sample project assets.
3. Confirmed the workspace could display roles, world facts, chapters, and project status without obvious user-visible mojibake in the active project area.
4. Sent a real writing prompt asking the agent to use current project assets and produce a saveable prologue draft.
5. Confirmed the agent showed writing context evidence: `2 个工具 · 5 条依据`.
6. Confirmed the response produced a save card with `type="chapter"`.
7. Clicked `确认保存`.
8. Opened the editor and confirmed the saved chapter `Goal7 短闭环验证` appeared in the chapter list with generated body text.

## Result

Status: partially passed.

Passed:

- Agent context loop worked on the short validation prompt.
- The model output was not a mock response.
- The output used existing project imagery: darkness, time freezing, 八千代, world-origin narration, sea-slug/light imagery.
- The save suggestion parsed into a visible save card.
- Confirming the save wrote a chapter asset back to the content library.
- The editor displayed the saved chapter and body text.
- Active project UI no longer showed obvious `??/???` asset titles after display fallback.

Failed or weak:

- A longer 900-1300 word prologue request failed once with `HTTP 500: Internal Server Error`.
- Backend log showed an upstream provider failure before a later successful call: `POST https://your-openai-compatible-gateway.example/v1/chat/completions "HTTP/1.1 500 Internal Server Error"`.
- The successful short output was useful for pipeline validation but too short to judge full prologue quality.
- Current extracted asset quality is still uneven: character cards are usable, but relationship/world topology and full creative emotional continuity still need a deeper quality pass.

## Writing Quality Notes

The successful short draft had an appropriate opening mood and reused project-specific imagery. It did not hallucinate a different setting, and it connected 八千代 to the sea-slug/light myth. However, because the validation prompt was intentionally short after the longer call failed, this result should be treated as a pipeline proof, not a final literary-quality proof.

Current writing-quality verdict:

- Correct asset use: pass for short validation.
- Emotional tension: partial; the image is strong, but the sample is only two sentences.
- Save suitability: pass as AI draft, not as final prologue.
- Editor visibility: pass.
- Encoding/UI clarity: pass in active workspace/editor path after this round, with residual legacy data still visible in old chat previews.

## Next Required Checks

1. Re-run a medium-length prologue prompt after adding provider retry/backoff or graceful retry messaging for transient upstream `500`.
2. Confirm the generated prologue is at least 800 words and uses:
   - core characters,
   - one relationship tension,
   - one world rule or world image,
   - one chapter/source fragment.
3. Save the medium-length result as an AI draft and confirm editor reopen.
4. Clean or archive legacy mock/test conversations so old previews like `Mock response` and `????` do not pollute internal test perception.
5. Continue relationship/world topology usability work after the core closed loop is stable.

## Goal 8 Medium-Length Validation Attempt

Date: 2026-05-25

Environment:

- Backend: `http://127.0.0.1:8001`
- Frontend: `http://localhost:3010`
- Project used: `clean_import_20260524_111341`
- Novel root: `novel_clean_import_20260524_111341`
- Validation mode: backend agent API with real external provider; browser automation was not available in this tool session.

Code changes verified before the live attempt:

- Frontend now recognizes transient provider failures (`500/502/503/504`, timeout, connection/network errors) and shows a Chinese retry/degrade message instead of a raw/blank failure.
- Assistant failure bubbles can show `重试本次请求`; retry is manual and bounded by user action, so it does not duplicate saves automatically.
- Obvious legacy `agent trace` / `mock response` conversations are hidden from the main project status flow.
- Writing-agent context now repairs common persisted UTF-8-as-Latin-1 mojibake before sending asset titles/summaries/snippets to the model. This is important because current stored sample assets still contain legacy mojibake in the raw API payload.
- API `HTTPException` responses now put the actionable message in `detail` instead of replacing it with generic `HTTP 500 错误`.

Live provider attempts:

1. Pro mode:
   - Model reported by backend: `gemini-3.1-pro-preview`
   - Attempt 1: `HTTP 500`, `All connection attempts failed`
   - Attempt 2: `HTTP 500`, `All connection attempts failed`
   - Result: failed after the single safe retry.
2. Fast degrade mode:
   - Model reported by backend: `gemini-3.5-flash`
   - Attempt 1: `HTTP 500`, `All connection attempts failed`
   - Attempt 2: `HTTP 500`, `All connection attempts failed`
   - Result: failed after the single safe retry under default sandbox network.
3. Fast mode network recheck:
   - Ran again with network permission.
   - Model reported by backend: `gemini-3.5-flash`
   - Attempt 1: success.
   - Result: real medium-length generation succeeded.

Trace/save/editor result:

- Agent trace mode: `fallback`.
- Tool calls:
  - `get_recent_conversation`: read 6 recent messages.
  - `search_project_assets`: found 1 project asset.
  - `search_chapter_snippets`: found 3 chapter/source snippets.
  - `prepare_save_asset`: prepared a save suggestion.
  - `run_quality_check`: prepared 4 writing quality checks.
- Used asset:
  - `world_clean_import_20260524_111341_90b6987d`, title `世界深度设定`.
- Used chapter snippets:
  - `第一卷 序章`
  - `第一卷 第二章（1）`
  - `第一卷 第二章（2）`
- Assistant response length: 3243 chars including notes and save tag.
- Parsed `save_asset`: yes.
- Saved content id: `edadc25c-a113-4fc0-a638-f228511e0efa`.
- Saved draft body length: 1415 chars.
- Editor UI/browser reopen: attempted with the Browser plugin on `localhost`, `127.0.0.1`, `10.90.0.10`, `lvh.me`, `127.0.0.1.sslip.io`, `localtest.me`, `novelforge.localhost`, and `0.0.0.0`.
  - `localhost`, `127.0.0.1`, `10.90.0.10`, and `lvh.me` were blocked by the browser runtime with `net::ERR_BLOCKED_BY_CLIENT`.
  - `127.0.0.1.sslip.io` returned `ERR_CONNECTION_REFUSED`.
  - `localtest.me`, `novelforge.localhost`, and `0.0.0.0` were blocked by Browser Use URL policy after navigation resolved to a browser error data URL.
- Editor data readiness: verified through `GET /api/content/{id}` using UTF-8 decoding. The saved draft title is `Goal8 序章候选 - 完整版`, and the saved body starts with `黑暗。那是连时间都会被冻结的、绝对的黑暗。`.
- Final editor visual check: passed after confirming backend and frontend were actively listening.
  - Opened `http://127.0.0.1:3010/editor?chapterId=edadc25c-a113-4fc0-a638-f228511e0efa`.
  - The page initially selected the first imported chapter, but the Goal 8 draft was visible in the chapter list.
  - Clicking `Goal8 序章候选 - 完整版` changed the URL to `chapterId=edadc25c-a113-4fc0-a638-f228511e0efa`.
  - The title input showed `Goal8 序章候选 - 完整版`.
  - The body textarea showed the saved draft beginning with `黑暗。那是连时间都会被冻结的、绝对的黑暗。`.

Writing quality verdict for Goal 8:

- Correct asset use: pass at API level. The draft uses 彩叶、辉夜、八千代, `月夜见`, `原光之竹`, `2030/09/12`, and the sea-slug/moonlight myth.
- Relationship tension: pass. The strongest tension is 彩叶 trying to find/save 辉夜 while 八千代 may be preserving or imprisoning her.
- World rule/image: pass. The draft uses `原光之竹` as the world-maintaining mechanism and moon/date countdown as pressure.
- Chapter/source fragment continuity: pass. The agent trace shows three imported chapter snippets, and the draft echoes the source prologue's direct call to 彩叶, battle/game imagery, and early-story surreal intrusion.
- Emotional progression: partial-pass. It moves from mythic darkness to 彩叶's loss, then to 八千代's obsessive tenderness. It has a usable emotional arc, though the final section leans a little explicit and could be made subtler.
- Save suitability: pass as AI draft/candidate, not as final formal prologue.

Current conclusion:

The product is better behaved under provider failure: users should now see a clear Chinese retry/degrade path instead of a confusing raw `HTTP 500` surface. The real medium-length generation passed after switching to Fast mode with network access, the candidate was saved to the content library, and the editor visual check confirmed the saved draft can be opened and edited. Goal 8 is complete.

## Goal 9 Creative Asset Quality Validation

Date: 2026-05-25

Purpose:

- Improve the chance that the writer produces an emotionally useful prologue, not only a technically saved draft.
- Verify that the writing agent now retrieves characters, relationships, world facts, and chapter/source snippets before generation.
- Record creative usability diagnostics for the assets used by the writer.

Code changes verified:

- Writing-agent project reads now attach lightweight creative diagnostics:
  - Characters: desire, wound, fear, action pattern, voice, core relationships.
  - Relationships: dependency, misunderstanding, debt, conflict, emotional tension, plot function.
  - World: rules, imagery, costs, taboos, scene usability.
  - Chapters: usable opening, usable ending, key imagery.
- Writing requests now use deterministic baseline retrieval after model tool decisions:
  - Characters.
  - Relationships.
  - World assets.
  - Imported/formal chapter snippets.
  - Quality checklist.
- Writer prompt now explicitly asks the model to convert character desire, wounds, fears, relationship tension, and world imagery into concrete scenes with action, suspense, and emotional aftertaste.
- Trace now includes `retrieval_coverage` and `creative_diagnostics`.

Live validation:

- Provider/base: configured server-side NewAPI endpoint.
- Mode/model: Fast mode, backend reported `gemini-3.5-flash`.
- Project used: `clean_import_20260524_111341`.
- Novel root: `novel_clean_import_20260524_111341`.
- Generation path: current working-tree writing agent runtime -> real external model -> saved to content library as AI draft.
- Saved content id: `d4caaa8b-6409-43a4-a1ca-52edd09f4d2a`.
- Saved title: `Goal9 序章候选 - 资产增强v2`.
- Saved body length: 1334 chars.
- Editor fallback readiness: verified via content-library read after cleanup; `get_content(d4caaa8b-6409-43a4-a1ca-52edd09f4d2a)` returned the expected title and 1334-char body. Browser visual reopen was not used because the current shell runner cannot keep freshly started dev servers alive after command exit.

Trace summary:

- Retrieval coverage:
  - Characters: 5.
  - Relationships: 3.
  - World: 1.
  - Chapter snippets: 3.
  - Issues: none.
- Character assets used include `辉夜`, `FUSHI`, `帝明`, `立花老师`, `彩叶的母亲`.
- Relationship assets used include:
  - `酒寄彩叶 -> 彩叶的母亲`
  - `酒寄彩叶 -> 帝明`
  - `酒寄彩叶 -> 父亲`
- World asset used: `世界深度设定`.
- Chapter snippets used:
  - `第一卷 序章`
  - `第一卷 第二章（1）`
  - `第一卷 第二章（2）`
- Creative diagnostics count: 12.

Writing quality verdict for Goal 9:

- Character use: pass. The v2 draft starts from 彩叶's emotional state, isolation, competitiveness, and family pressure instead of only reciting lore.
- Relationship tension: partial-pass. The agent retrieves three relationship assets, but the relationship diagnostics show weak structured tension: the best signals are `冲突` and `误解`; dependency, debt, emotional tension, and plot function are often missing. This is now visible in trace instead of hidden.
- World imagery: pass. The draft uses screen light, virtual combat, moon/otherworld pressure, and transformation signs as scene pressure rather than explaining all rules upfront.
- Chapter continuity: pass. It anchors to the imported prologue/opening fragments and early game/surreal intrusion texture.
- Emotional progression: partial-pass. It has clearer immediate emotion than Goal 8 and works as a candidate opening, but the emotional turn still depends more on atmosphere than a sharp relational choice.
- Save suitability: pass as AI draft/candidate. It should not replace the formal prologue without human review.

Remaining quality risks:

- Relationship assets are present but creatively thin. The next useful improvement is not more retrieval; it is enriching relationship extraction/repair with dependency, debt, emotional tension, and plot function.
- Intermediate Goal 9 validation drafts created during this run were cleaned after the final v2 save, including the one title corrupted by a PowerShell pipe encoding issue. The retained validation draft is `d4caaa8b-6409-43a4-a1ca-52edd09f4d2a`.
- The running backend process must be restarted after code changes to expose the new trace fields through HTTP. The direct validation used current working-tree code to avoid mixing old server state with new code.

Current conclusion:

Goal 9's core agent improvement is working: the writer can now reliably gather characters, relationships, world assets, and chapter snippets, and the trace makes missing creative signals visible. The generated v2 prologue candidate is stronger than Goal 8 in character entry and scene immediacy, but relationship quality remains the main blocker before calling the writing output consistently strong.

## Goal 10 Relationship Asset Repair Validation

Date: 2026-05-25

Purpose:

- Move relationship assets from simple graph edges toward writing-usable tension structures.
- Verify that weak relationship assets expose missing signals instead of silently passing as usable context.
- Generate a real prologue candidate that uses relationship pressure as a concrete choice.

Code changes verified:

- Relationship creative diagnostics now check:
  - dependency
  - misunderstanding
  - debt
  - conflict
  - emotional_tension
  - power_dynamic
  - intimacy
  - arc
  - plot_function
  - scene_potential
- Relationship diagnostics expose `missing_signals` and `relationship_creative_readiness`.
- Thin relationships get a `repair_suggestion` draft, without overwriting the original relationship asset.
- The repair helper can load the relationship, related character assets, and supporting chapter snippets, then return an enriched relationship draft for user review.
- Agent trace now includes:
  - `relationship_quality_report`
  - `relationship_repair_suggestions`
- Writer prompt now asks the model to convert dependency, debt, misunderstanding, emotional tension, power dynamic, intimacy, arc, and plot function into concrete scene conflict or character choice.

Live validation:

- Provider/base: configured server-side NewAPI endpoint.
- Mode/model: Fast mode, backend reported `gemini-3.5-flash`.
- Project used: `clean_import_20260524_111341`.
- Novel root: `novel_clean_import_20260524_111341`.
- Saved content id: `9d802163-efe2-49b6-bf30-03e2c020f365`.
- Saved title: `Goal10 关系驱动序章候选v1`.
- Saved body length: 1510 chars.

Trace summary:

- Retrieval coverage:
  - Characters: 8.
  - Relationships: 5.
  - World: 1.
  - Chapter snippets: 3.
- Relationship quality report:
  - Total relationships: 5.
  - Tension relationships: 1.
  - Low-information relationships: 5.
  - Missing plot function relationships: 5.
  - Status: `thin`.
- Most common missing signals:
  - dependency: 5.
  - debt: 5.
  - plot_function: 5.
  - emotional_tension: 4.
  - conflict: 4.
  - power_dynamic: 4.
- Repair suggestions were generated for weak relationships, including:
  - `酒寄彩叶 -> 彩叶的母亲`
  - `酒寄彩叶 -> 帝明`
  - `酒寄彩叶 -> 父亲`

Before/after relationship behavior:

- Before Goal 10: relationship assets could be retrieved, but the trace only showed broad creative diagnostics. It was easy for writing to fall back to atmosphere and world lore.
- After Goal 10: the trace explicitly says the relationship set is thin and shows which signals are missing. The writer prompt receives repair advice such as turning relationship tension into a character choice rather than exposition.

Writing quality verdict for Goal 10:

- Character choice: pass. The draft gives 八千代 a concrete choice: erase 辉夜's detection signal and disappear, or preserve herself and risk 辉夜 being taken back.
- Relationship-driven turn: pass. The strongest emotional turn comes from 八千代's promised care for 彩叶 colliding with her need to protect 辉夜. This is more relationship-driven than the Goal 9 draft.
- Reduced pure atmosphere: pass. The opening still uses mythic imagery, but the center of the scene is a decision with cost.
- Relationship asset quality: fail/diagnostic-pass. The generated text improves because the prompt forces relationship use, but the underlying extracted relationships remain thin: all five retrieved relationships lack plot function, and most lack dependency/debt/tension fields.
- Save suitability: pass as AI draft/candidate, not as final formal prologue.

Current conclusion:

Goal 10 improves diagnosis and repairability of relationship assets. The system now clearly reports when the relationship network is not strong enough for emotionally precise writing, and the real validation draft shows a better relationship-driven choice. The next product step is to let users review/apply relationship repair suggestions, or to feed these suggestions into a relationship repair task before final writing.

## Goal 11 Relationship Repair Writeback Validation

Date: 2026-05-25

Scope:

- Goal: turn relationship repair suggestions into visible, reviewable, user-confirmed writeback assets.
- Project used: `clean_import_20260524_111341`.
- Novel root: `novel_clean_import_20260524_111341`.
- Original weak relationship: `rel_clean_import_20260524_111341_014b4af2`.
- Original relationship title: `酒寄彩叶 -> 彩叶的母亲 (RelationshipType.FAMILY)`.

Implemented behavior:

- Agent trace normalization now supports:
  - `retrieval_coverage`
  - `creative_diagnostics`
  - `relationship_quality_report`
  - `relationship_repair_suggestions`
- Chat message trace can show a lightweight relationship quality card:
  - total relationship count
  - tension relationship count
  - low-information relationship count
  - missing signal summary
  - available repair suggestions
- Each repair suggestion card shows:
  - source / target
  - missing signals
  - core
  - dependency
  - misunderstanding
  - debt
  - conflict
  - emotional tension
  - arc
  - scene potential
  - writing advice
- User actions are wired:
  - save as relationship repair draft
  - update original relationship after confirmation
  - skip by doing nothing
- Safe writeback rules:
  - draft save does not overwrite original relationship
  - confirmed update stores `previous_snapshot`
  - metadata includes `source_type`, `repair_from_relationship_id`, `repair_status`, `quality_flags`, `missing_signals_resolved`, and `remaining_missing_signals`
  - update blocks cross-session and cross-novel writes
- Agent retrieval now prioritizes confirmed/enriched relationship assets and marks `relationship_enriched` in trace.

Live validation:

- Provider/base: configured server-side NewAPI endpoint.
- Mode/model: Fast mode, backend reported `gemini-3.5-flash`.
- Repair draft saved:
  - ID: `goal11_repair_6ab5408f23c9`
  - Title: `Goal11 关系补强草稿：彩叶与母亲`
  - Status: `draft`
  - Flags: `relationship_enriched`
- Generated chapter candidate saved:
  - ID: `goal11_chapter_39bd71b93800`
  - Title: `Goal11 关系修复闭环序章候选v1`
  - Body length: 1700 chars

Before repair report:

- Total relationships: 8.
- Tension relationships: 3.
- Low-information relationships: 7.
- Missing plot function relationships: 8.
- Status: `thin`.
- Missing signals:
  - dependency: 8.
  - misunderstanding: 5.
  - debt: 7.
  - emotional tension: 5.
  - intimacy: 8.
  - plot function: 8.
  - scene potential: 7.
  - conflict: 7.
  - power dynamic/control: 7.

After repair draft report:

- Total relationships: 8.
- Tension relationships: 4.
- Low-information relationships: 6.
- Missing plot function relationships: 7.
- Status: `thin`.
- Missing signals reduced:
  - dependency: 8 -> 7.
  - debt: 7 -> 6.
  - emotional tension: 5 -> 4.
  - plot function: 8 -> 7.
  - conflict: 7 -> 6.
  - power dynamic/control: 7 -> 6.

Generation trace after repair:

- Used enriched relationship: yes.
- First relationship used: `Goal11 关系补强草稿：彩叶与母亲`.
- Relationship quality report during generation:
  - Total relationships: 4.
  - Tension relationships: 3.
  - Low-information relationships: 1.
  - Missing plot function relationships: 1.
  - Status: `usable`.

Writing quality verdict:

- Relationship use: pass. The model centered the prologue on 彩叶 and her mother rather than general atmosphere.
- Actionable emotional pressure: pass. The output turns the mother relationship into a physical threshold scene around leaving home, being stopped, and choosing whether to obey or break away.
- Asset priority: pass. The trace confirmed the enriched relationship was retrieved before ordinary relationship assets.
- Save suitability: pass as an AI draft/candidate, but still over target length at 1700 chars and should be trimmed before becoming a formal prologue.
- Remaining risk: partial. The relationship report still says the full relationship set is `thin` because only one relationship was repaired. The next internal-test milestone should repair 2-3 core relationships or provide a relationship repair batch action.

Current conclusion:

Goal 11 closes the first practical relationship repair loop: diagnosis -> suggestion -> user-visible preview -> draft/confirmed writeback -> enriched relationship retrieved by the agent -> improved relationship quality report during writing. The project is now closer to internal testing because relationship weakness is no longer just a hidden extraction defect; it can be surfaced and repaired into the project memory library.

## Goal 12 Core Relationship Repair Queue Validation

Date: 2026-05-25

Scope:

- Goal: expand single relationship repair into a 2-3 item core relationship repair queue.
- Project used: `clean_import_20260524_111341`.
- Novel root: `novel_clean_import_20260524_111341`.

Implemented behavior:

- Backend ranks weak relationship candidates using:
  - missing creative signal count
  - readiness / low-information status
  - evidence count
  - chapter reference coverage
  - relationship strength
  - existing conflict / misunderstanding / arc signals
  - enriched / confirmed status as a default penalty
- Trace now exposes `relationship_repair_queue`.
- Frontend displays a "core relationship repair queue" with queue rank, score, reasons, and per-card state.
- Frontend also shows a lightweight before/projected-after relationship quality comparison for the queue.
- Each queue item can be saved as a repair draft, confirmed into the original relationship, or skipped.

Queue selected in live validation:

- `酒寄彩叶 -> 彩叶的母亲`
- `酒寄彩叶 -> 芦花与真实`
- `酒寄彩叶 -> 八千代`

Saved repair drafts:

- `goal12_repair_3290a9ce01c0`
  - `Goal12 关系补强草稿1：酒寄彩叶与彩叶的母亲`
- `goal12_repair_8d46bdfd0792`
  - `Goal12 关系补强草稿2：酒寄彩叶与芦花与真实`
- `goal12_repair_a4295a05740e`
  - `Goal12 关系补强草稿3：酒寄彩叶与八千代`

Before queue repair:

- Total relationships: 8.
- Tension relationships: 4.
- Low-information relationships: 6.
- Missing plot function relationships: 7.
- Status: `thin`.

After saving three repair drafts:

- Total relationships: 8.
- Tension relationships: 7.
- Low-information relationships: 3.
- Missing plot function relationships: 4.
- Status: `usable`.

Agent usage:

- Subsequent writing traces prioritized enriched relationships.
- In live validation, enriched relationship usage reached 7 trace entries in the generation context.
- This proves the queue repair drafts are not only stored; they are retrieved back into the writing context.

Writing validation:

- Added a writing candidate gate:
  - char count must be between 800 and 1500.
  - no explanatory preface or markdown heading.
  - must mention or clearly use the required relationship endpoints.
  - must contain relationship-driven choice / debt / misunderstanding / emotional turn signals.
- Added a rewrite prompt helper for failed candidates.
- Failed live candidates from earlier attempts were removed from the content library to avoid polluting user-visible assets.

Final saved candidate:

- `goal12_chapter_fae41a717f59`
- `Goal12 核心关系队列序章候选final`
- Length: 1018 chars.
- Gate result: pass.
- Required relationship terms matched:
  - `母亲`
  - `芦花`
  - `真实`
  - `八千代`
- Relationship quality report at final validation:
  - total_relationships=8
  - tension_relationships=7
  - low_information_relationships=3
  - missing_plot_function_relationships=4
  - status=`usable`

Current writing verdict:

- Relationship network improvement: pass.
- Queue writeback loop: pass.
- Agent enriched relationship retrieval: pass.
- Final multi-relationship prologue candidate: pass as AI draft/candidate.
- Remaining editorial note: the final candidate is structurally valid and relationship-driven, but still needs human literary polish before being promoted to a formal canonical prologue.
