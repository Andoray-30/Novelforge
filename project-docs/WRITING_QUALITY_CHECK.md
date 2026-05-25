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
