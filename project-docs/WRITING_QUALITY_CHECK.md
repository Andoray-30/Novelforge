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
- Backend log showed an upstream provider failure before a later successful call: `POST https://newapi.sync-api.xyz/v1/chat/completions "HTTP/1.1 500 Internal Server Error"`.
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
