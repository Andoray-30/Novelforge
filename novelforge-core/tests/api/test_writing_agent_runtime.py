import asyncio

from novelforge.api.types import Conversation, Message
from novelforge.api.writing_agent import (
    AgentScope,
    WRITING_AGENT_TOOL_SCHEMAS,
    WritingAgentRuntime,
    build_relationship_candidate_rewrite_prompt,
    evaluate_relationship_driven_candidate,
)
from novelforge.content.manager import ContentManager
from novelforge.content.models import ContentItem, ContentMetadata, ContentType
from novelforge.core.config import Config
from novelforge.services.ai_service import AIService
from novelforge.storage.storage_manager import StorageManager


def run(coro):
    return asyncio.run(coro)


def build_manager() -> tuple[ContentManager, StorageManager]:
    storage = StorageManager(default_storage="memory")
    return ContentManager(storage, use_database=False), storage


def build_item(
    item_id: str,
    *,
    title: str,
    content_type: ContentType,
    content: str,
    session_id: str = "session-a",
    parent_id: str = "novel-a",
    extracted_data: dict | None = None,
    tags: list[str] | None = None,
) -> ContentItem:
    return ContentItem(
        metadata=ContentMetadata(
            id=item_id,
            title=title,
            type=content_type,
            session_id=session_id,
            parent_id=parent_id,
            tags=tags or [],
        ),
        content=content,
        extracted_data=extracted_data,
    )


def seed_basic_project(manager: ContentManager) -> None:
    items = [
        build_item(
            "char-hero",
            title="辉夜",
            content_type=ContentType.CHARACTER,
            content="辉夜渴望证明自己不是被命运制造出来的影子。她害怕再度失去记忆，行动模式是在沉默中先保护他人，说话语气克制。",
        ),
        build_item(
            "rel-hero-shadow",
            title="辉夜与影子自己的关系",
            content_type=ContentType.RELATIONSHIP,
            content="辉夜依赖影子自己确认真实身份，却误解对方是敌人。两人有记忆亏欠和身份冲突，情绪张力推动序章悬念。",
        ),
        build_item(
            "world-moon",
            title="月轮协议",
            content_type=ContentType.WORLD,
            content="月轮协议规定时空跳跃会剥离记忆。月光、钟声和雨夜是核心意象，违规跳跃的代价是遗忘最想守住的人。",
        ),
        build_item(
            "chapter-1",
            title="第一章",
            content_type=ContentType.CHAPTER,
            content="第一章开头。辉夜在雨夜醒来，听见远处钟声。" + "命运的回声。" * 80 + "她在章末看见门后站着另一个自己。",
            extracted_data={"source_type": "imported", "order": 1},
            tags=["imported"],
        ),
        build_item(
            "draft-1",
            title="候选序章",
            content_type=ContentType.CHAPTER,
            content="这是 AI 候选草稿，不应默认进入续写上下文。",
            extracted_data={"save_destination": "ai_draft"},
            tags=["ai_draft"],
        ),
        build_item(
            "char-other-session",
            title="外部角色",
            content_type=ContentType.CHARACTER,
            content="不属于当前项目。",
            session_id="session-b",
            parent_id="novel-z",
        ),
        build_item(
            "char-other-novel",
            title="隔壁小说角色",
            content_type=ContentType.CHARACTER,
            content="同 session 但属于另一部小说。",
            session_id="session-a",
            parent_id="novel-b",
        ),
    ]
    for item in items:
        run(manager.create_content(item))


def build_runtime() -> WritingAgentRuntime:
    manager, storage = build_manager()
    seed_basic_project(manager)
    return WritingAgentRuntime(manager, storage)


def test_tool_schemas_are_explicit_and_bounded() -> None:
    names = {schema["name"] for schema in WRITING_AGENT_TOOL_SCHEMAS}

    assert names == {
        "search_project_assets",
        "get_asset_detail",
        "search_chapter_snippets",
        "get_recent_conversation",
        "prepare_save_asset",
        "prepare_chapter_update",
        "run_quality_check",
    }
    for schema in WRITING_AGENT_TOOL_SCHEMAS:
        assert schema["purpose"]
        assert schema["schema"]
        assert schema["output_limit"]


def test_planner_recognizes_writing_rewrite_candidate_and_plain_question() -> None:
    runtime = build_runtime()

    continue_plan = runtime._plan("请续写第一章结尾", {"focused_assets": []})
    continue_tools = [call["name"] for call in continue_plan["calls"]]
    assert "get_recent_conversation" in continue_tools
    assert "search_chapter_snippets" in continue_tools
    assert "prepare_save_asset" in continue_tools

    rewrite_plan = runtime._plan("按刚才那版改写得更动人", {"focused_assets": []})
    assert "get_recent_conversation" in [call["name"] for call in rewrite_plan["calls"]]

    candidate_plan = runtime._plan("融合候选版本再写一个序章", {"focused_assets": []})
    candidate_calls = {call["name"]: call["args"] for call in candidate_plan["calls"]}
    assert candidate_calls["search_chapter_snippets"]["include_ai_versions"] is True

    plain_plan = runtime._plan("你好，最近怎么样？", {"focused_assets": []})
    assert [call["name"] for call in plain_plan["calls"]] == ["get_recent_conversation"]


def test_search_project_assets_does_not_cross_session_or_selected_novel() -> None:
    runtime = build_runtime()
    scope = AgentScope(session_id="session-a", selected_novel_id="novel-a")

    observation = run(runtime.search_project_assets(scope, {"query": "", "types": ["character"], "limit": 8}))
    ids = {item["id"] for item in observation.items}

    assert "char-hero" in ids
    assert "char-other-session" not in ids
    assert "char-other-novel" not in ids


def test_search_project_assets_falls_back_when_chinese_long_query_has_no_direct_hit() -> None:
    runtime = build_runtime()
    scope = AgentScope(session_id="session-a", selected_novel_id="novel-a")

    observation = run(
        runtime.search_project_assets(
            scope,
            {
                "query": "请续写第一章结尾，让角色的情绪更动人",
                "types": ["character", "world"],
                "limit": 8,
            },
        )
    )
    ids = {item["id"] for item in observation.items}

    assert "char-hero" in ids
    assert "world-moon" in ids


def test_search_project_assets_returns_creative_diagnostics() -> None:
    runtime = build_runtime()
    scope = AgentScope(session_id="session-a", selected_novel_id="novel-a")

    observation = run(runtime.search_project_assets(scope, {"query": "", "types": ["character"], "limit": 1}))
    diagnostics = observation.items[0]["creative_diagnostics"]

    assert "欲望" in diagnostics["usable"]
    assert "恐惧" in diagnostics["usable"]
    assert observation.items[0]["diagnostic_summary"].startswith("可用：")


def test_relationship_diagnostics_report_missing_signals_and_repair_suggestion() -> None:
    runtime = build_runtime()
    scope = AgentScope(session_id="session-a", selected_novel_id="novel-a")

    observation = run(runtime.search_project_assets(scope, {"query": "", "types": ["relationship"], "limit": 1}))
    item = observation.items[0]
    diagnostics = item["creative_diagnostics"]

    assert diagnostics["relationship_creative_readiness"] == "strong"
    assert "依赖" in diagnostics["usable"]
    assert "情绪张力" in diagnostics["usable"]
    assert "剧情功能" not in diagnostics["missing_signals"]
    assert "repair_suggestion" not in item


def test_thin_relationship_gets_repair_suggestion() -> None:
    manager, storage = build_manager()
    run(
        manager.create_content(
            build_item(
                "rel-thin",
                title="林墨 -> 周岚",
                content_type=ContentType.RELATIONSHIP,
                content="旧友。",
                extracted_data={"source": "林墨", "target": "周岚", "relationship_type": "friendship"},
            )
        )
    )
    runtime = WritingAgentRuntime(manager, storage)
    scope = AgentScope(session_id="session-a", selected_novel_id="novel-a")

    observation = run(runtime.search_project_assets(scope, {"query": "", "types": ["relationship"], "limit": 1}))
    item = observation.items[0]

    assert item["creative_diagnostics"]["relationship_creative_readiness"] == "thin"
    assert "剧情功能" in item["creative_diagnostics"]["missing_signals"]
    assert item["repair_suggestion"]["source"] == "林墨"
    assert item["repair_suggestion"]["target"] == "周岚"
    assert "scene_potential" in item["repair_suggestion"]


def test_enriched_relationships_are_prioritized_and_marked_in_trace() -> None:
    manager, storage = build_manager()
    run(
        manager.create_content(
            build_item(
                "rel-thin",
                title="A -> B",
                content_type=ContentType.RELATIONSHIP,
                content="old friends",
                extracted_data={"source": "A", "target": "B", "relationship_type": "friendship"},
            )
        )
    )
    run(
        manager.create_content(
            build_item(
                "rel-enriched",
                title="A -> B enriched",
                content_type=ContentType.RELATIONSHIP,
                content=(
                    "dependency: A needs B for safety. misunderstanding: B thinks A betrayed them. "
                    "debt: A owes B a rescue. conflict: truth versus safety. "
                    "emotional_tension: staying hurts and leaving hurts. plot_function: forces the prologue choice."
                ),
                extracted_data={
                    "source": "A",
                    "target": "B",
                    "repair_status": "confirmed",
                    "quality_flags": ["relationship_enriched"],
                    "dependency": "A needs B for safety.",
                    "misunderstanding": "B thinks A betrayed them.",
                    "debt": "A owes B a rescue.",
                    "conflict": "truth versus safety.",
                    "emotional_tension": "staying hurts and leaving hurts.",
                    "scene_potential": ["B forces A to choose."],
                },
            )
        )
    )
    runtime = WritingAgentRuntime(manager, storage)
    scope = AgentScope(session_id="session-a", selected_novel_id="novel-a")

    observation = run(runtime.search_project_assets(scope, {"query": "", "types": ["relationship"], "limit": 2}))

    assert observation.items[0]["id"] == "rel-enriched"
    assert observation.items[0]["relationship_enriched"] is True
    assert "repair_suggestion" not in observation.items[0]
    assert observation.items[1]["id"] == "rel-thin"
    assert "repair_suggestion" in observation.items[1]

    trace = runtime._build_trace(
        {"plan_summary": "test"},
        [observation],
        degraded=False,
    )
    assert trace["used_assets"][0]["relationship_enriched"] is True
    assert trace["relationship_quality_report"]["tension_relationships"] >= 1
    assert trace["relationship_repair_suggestions"][0]["relationship_id"] == "rel-thin"


def test_relationship_repair_queue_ranks_core_thin_relationships() -> None:
    manager, storage = build_manager()
    relationships = [
        build_item(
            "rel-core",
            title="主角 -> 宿敌",
            content_type=ContentType.RELATIONSHIP,
            content="主角和宿敌互相隐瞒真相，冲突不断。",
            extracted_data={
                "source": "主角",
                "target": "宿敌",
                "strength": 10,
                "evidence": ["冲突证据"] * 5,
                "chapter_references": ["第一章", "第二章", "第三章"],
            },
        ),
        build_item(
            "rel-side",
            title="路人甲 -> 路人乙",
            content_type=ContentType.RELATIONSHIP,
            content="旧识。",
            extracted_data={"source": "路人甲", "target": "路人乙", "strength": 2},
        ),
        build_item(
            "rel-enriched",
            title="已补强关系",
            content_type=ContentType.RELATIONSHIP,
            content="dependency conflict emotional_tension plot_function scene_potential",
            extracted_data={
                "source": "A",
                "target": "B",
                "quality_flags": ["relationship_enriched"],
                "repair_status": "confirmed",
            },
        ),
    ]
    for item in relationships:
        run(manager.create_content(item))
    runtime = WritingAgentRuntime(manager, storage)
    scope = AgentScope(session_id="session-a", selected_novel_id="novel-a")

    observation = run(runtime.build_relationship_repair_queue(scope, {"limit": 2}))

    ids = [item["id"] for item in observation.items]
    assert ids[0] == "rel-core"
    assert "rel-enriched" not in ids
    assert observation.items[0]["repair_suggestion"]["queue_rank"] == 1
    assert observation.items[0]["repair_suggestion"]["queue_score"] > observation.items[1]["repair_suggestion"]["queue_score"]
    assert observation.items[0]["repair_suggestion"]["queue_reasons"]
    assert observation.items[0]["repair_suggestion"]["queue_status"] == "pending"


def test_relationship_repair_queue_is_exposed_in_trace_without_duplicate_suggestion_list() -> None:
    manager, storage = build_manager()
    run(
        manager.create_content(
            build_item(
                "rel-thin",
                title="A -> B",
                content_type=ContentType.RELATIONSHIP,
                content="old friends",
                extracted_data={"source": "A", "target": "B", "strength": 8, "evidence": ["one", "two"]},
            )
        )
    )
    runtime = WritingAgentRuntime(manager, storage)
    scope = AgentScope(session_id="session-a", selected_novel_id="novel-a")
    observation = run(runtime.build_relationship_repair_queue(scope, {"limit": 3}))

    trace = runtime._build_trace({"plan_summary": "test"}, [observation], degraded=False)

    assert trace["relationship_repair_queue"]
    assert trace["relationship_repair_queue"][0]["relationship_id"] == "rel-thin"
    assert trace["relationship_repair_queue"][0]["queue_rank"] == 1
    assert trace["relationship_repair_queue_report"]["before"]["low_information_relationships"] >= 1
    assert trace["relationship_repair_queue_report"]["projected_after"]["low_information_relationships"] == 0
    assert trace["relationship_repair_suggestions"] == []


def test_relationship_candidate_gate_accepts_multi_relationship_prologue() -> None:
    text = (
        "母亲的脚步停在门外时，彩叶把车票攥进掌心。她知道离开会让母亲更恨她，"
        "可留下只会继续把两个人都困在误解里。芦花和真实的未读消息一条接一条跳出来，"
        "她们没有责备，只说会在车站等她。那种温柔让彩叶胸口发疼，像欠下了一笔终于不能再逃的债。"
        "八千代发来的短句只有一句：如果想看见月亮，就先走出这间屋子。彩叶关掉屏幕，"
        "把钥匙放在桌上，第一次没有回头。"
    ) * 6

    result = evaluate_relationship_driven_candidate(text, ["母亲", "芦花", "真实", "八千代"])

    assert result["passed"] is True
    assert set(result["matched_terms"]) == {"母亲", "芦花", "真实", "八千代"}


def test_relationship_candidate_gate_rejects_preface_and_missing_relationships() -> None:
    text = "以下是为您创作的序章。\n\n彩叶看见流星坠落，空气里满是神秘的光。"

    result = evaluate_relationship_driven_candidate(text, ["母亲", "芦花", "真实", "八千代"])
    rewrite = build_relationship_candidate_rewrite_prompt(text, result, ["母亲", "芦花", "真实", "八千代"])

    assert result["passed"] is False
    assert "字数不足" in "；".join(result["issues"])
    assert "关系端点/别名命中不足" in result["issues"]
    assert "包含说明性前言或标题" in result["issues"]
    assert "母亲、芦花、真实、八千代" in rewrite


def test_relationship_repair_helper_uses_related_characters_and_chapter_snippets() -> None:
    manager, storage = build_manager()
    run(
        manager.create_content(
            build_item(
                "char-lin",
                title="林墨",
                content_type=ContentType.CHARACTER,
                content="林墨渴望保护周岚，却害怕旧事重演。",
            )
        )
    )
    run(
        manager.create_content(
            build_item(
                "char-zhou",
                title="周岚",
                content_type=ContentType.CHARACTER,
                content="周岚想要知道真相，说话方式直接。",
            )
        )
    )
    run(
        manager.create_content(
            build_item(
                "rel-thin",
                title="林墨 -> 周岚",
                content_type=ContentType.RELATIONSHIP,
                content="旧友。",
                extracted_data={"source": "林墨", "target": "周岚", "relationship_type": "friendship"},
            )
        )
    )
    run(
        manager.create_content(
            build_item(
                "chapter-rel",
                title="关系场景",
                content_type=ContentType.CHAPTER,
                content="林墨在雨夜拦住周岚，周岚质问他为什么隐瞒旧案。",
                extracted_data={"source_type": "imported", "order": 2},
                tags=["imported"],
            )
        )
    )
    runtime = WritingAgentRuntime(manager, storage)
    scope = AgentScope(session_id="session-a", selected_novel_id="novel-a")

    result = run(runtime.build_relationship_repair_suggestion(scope, "rel-thin", user_message="补强林墨和周岚"))
    suggestion = result["suggestion"]

    assert result["status"] == "ok"
    assert suggestion["enriched_relationship_draft"]["source"] == "林墨"
    assert suggestion["enriched_relationship_draft"]["target"] == "周岚"
    assert suggestion["related_characters"]
    assert any(snippet["id"] == "chapter-rel" for snippet in suggestion["supporting_chapter_snippets"])


def test_agent_context_repairs_persisted_mojibake_before_model_prompt() -> None:
    manager, storage = build_manager()
    run(
        manager.create_content(
            build_item(
                "char-mojibake",
                title="辉夜".encode("utf-8").decode("latin1"),
                content_type=ContentType.CHARACTER,
                content="辉夜渴望守住月光。".encode("utf-8").decode("latin1"),
            )
        )
    )
    runtime = WritingAgentRuntime(manager, storage)
    scope = AgentScope(session_id="session-a", selected_novel_id="novel-a")

    observation = run(runtime.search_project_assets(scope, {"query": "", "types": ["character"], "limit": 1}))

    assert observation.items[0]["title"] == "辉夜"
    assert "守住月光" in observation.items[0]["summary"]


def test_search_chapter_snippets_returns_text_and_excludes_ai_drafts_by_default() -> None:
    runtime = build_runtime()
    scope = AgentScope(session_id="session-a", selected_novel_id="novel-a")

    observation = run(runtime.search_chapter_snippets(scope, {"query": "", "mode": "end", "limit": 5}, "请续写第一章"))

    assert observation.items
    assert any("另一个自己" in item["summary"] for item in observation.items)
    assert all(item["id"] != "draft-1" for item in observation.items)

    start_observation = run(runtime.search_chapter_snippets(scope, {"query": "", "mode": "start", "limit": 1}, "查看章节开头"))
    assert "第一章开头" in start_observation.items[0]["summary"]

    keyword_observation = run(runtime.search_chapter_snippets(scope, {"query": "另一个自己", "mode": "keyword", "limit": 1}, "找另一个自己"))
    assert "另一个自己" in keyword_observation.items[0]["summary"]

    with_draft = run(
        runtime.search_chapter_snippets(
            scope,
            {"query": "", "mode": "keyword", "limit": 5, "include_ai_versions": True},
            "融合候选草稿",
        )
    )
    assert any(item["id"] == "draft-1" for item in with_draft.items)


def test_get_recent_conversation_returns_recent_messages_without_current_user_turn() -> None:
    runtime = build_runtime()
    conversation = Conversation(
        id="conv-a",
        messages=[
            Message(role="user", content="写一版序章"),
            Message(role="assistant", content="序章候选：雨夜里她醒来。"),
            Message(role="user", content="按刚才那版改写"),
        ],
    )

    observation = runtime.get_recent_conversation(conversation, {"limit": 4}, "按刚才那版改写")

    assert [item["role"] for item in observation.items] == ["user", "assistant"]
    assert "序章候选" in observation.items[-1]["summary"]


class FailingContentManager:
    async def search_content(self, request):  # noqa: ANN001
        raise RuntimeError("storage offline")

    async def get_content(self, content_id):  # noqa: ANN001
        raise RuntimeError("storage offline")


def test_agent_prepare_degrades_gracefully_when_tool_fails() -> None:
    storage = StorageManager(default_storage="memory")
    runtime = WritingAgentRuntime(FailingContentManager(), storage)  # type: ignore[arg-type]

    preparation = run(
        runtime.prepare(
            user_message="请根据角色写一个序章",
            context={"session_id": "session-a", "selected_novel_id": "novel-a"},
            conversation=Conversation(messages=[Message(role="assistant", content="上一版内容")]),
            base_system_prompt="base prompt",
        )
    )

    assert "base prompt" in preparation.system_prompt
    assert preparation.trace["degraded"] is True
    assert any(call["status"] == "error" for call in preparation.trace["tool_calls"])


class FakeToolCallingAI:
    def __init__(self, decisions: list[dict]):
        self.decisions = list(decisions)
        self.calls: list[dict] = []

    async def chat_tool_decision(self, **kwargs):  # noqa: ANN003
        self.calls.append(kwargs)
        if self.decisions:
            return self.decisions.pop(0)
        return {"content": "enough", "tool_calls": [], "finish_reason": "stop"}


def tool_call(name: str, arguments: dict, call_id: str) -> dict:
    return {"id": call_id, "name": name, "arguments": arguments}


def test_model_tool_loop_can_call_multiple_tools_and_build_trace() -> None:
    runtime = build_runtime()
    fake_ai = FakeToolCallingAI(
        [
            {"tool_calls": [tool_call("get_recent_conversation", {"limit": 3}, "call-1")]},
            {"tool_calls": [tool_call("search_chapter_snippets", {"query": "", "mode": "end", "limit": 1}, "call-2")]},
            {"tool_calls": [tool_call("search_project_assets", {"query": "", "types": ["character"], "limit": 2}, "call-3")]},
            {"tool_calls": []},
        ]
    )

    preparation = run(
        runtime.prepare(
            user_message="请续写第一章结尾，读取辉夜角色",
            context={"session_id": "session-a", "selected_novel_id": "novel-a"},
            conversation=Conversation(messages=[Message(role="assistant", content="上一版结尾")]),
            base_system_prompt="base prompt",
            ai_service=fake_ai,
        )
    )

    assert preparation.trace["mode"] == "model_tool_loop"
    assert preparation.trace["stopped_reason"] == "context_sufficient"
    tool_names = [call["name"] for call in preparation.trace["tool_calls"]]
    assert tool_names[:3] == ["get_recent_conversation", "search_chapter_snippets", "search_project_assets"]
    assert tool_names.count("search_project_assets") >= 3
    assert "run_quality_check" in tool_names
    assert preparation.trace["tool_calls"][0]["continue_reason"] == "继续读取上下文"
    assert preparation.trace["tool_calls"][-1]["continue_reason"] == "停止：context_sufficient"
    assert preparation.trace["chapter_snippets"]
    assert any(asset["id"] == "char-hero" for asset in preparation.trace["used_assets"])
    assert preparation.trace["retrieval_coverage"]["counts"]["characters"] >= 1
    assert preparation.trace["retrieval_coverage"]["counts"]["relationships"] >= 1
    assert preparation.trace["retrieval_coverage"]["counts"]["world"] >= 1
    assert not preparation.trace["retrieval_coverage"]["issues"]
    assert preparation.trace["creative_diagnostics"]
    assert preparation.trace["relationship_quality_report"]["total_relationships"] >= 1
    assert preparation.trace["relationship_quality_report"]["tension_relationships"] >= 1
    assert "base prompt" in preparation.system_prompt
    assert "序章要有动作、意象、悬念和情绪余韵" in preparation.system_prompt
    assert "关系资产薄弱" in preparation.system_prompt


def test_model_tool_loop_falls_back_when_tool_calling_is_unavailable() -> None:
    class NoToolAI:
        async def chat_tool_decision(self, **kwargs):  # noqa: ANN003
            raise RuntimeError("tools unsupported")

    runtime = build_runtime()
    preparation = run(
        runtime.prepare(
            user_message="请根据角色写一个序章",
            context={"session_id": "session-a", "selected_novel_id": "novel-a"},
            conversation=Conversation(messages=[]),
            base_system_prompt="base prompt",
            ai_service=NoToolAI(),
        )
    )

    assert preparation.trace["mode"] == "fallback"
    assert preparation.trace["degraded"] is True
    assert "tools unsupported" in preparation.trace["fallback_reason"]
    assert preparation.trace["tool_calls"]


def test_prepare_skips_model_loop_when_ai_service_has_no_real_client() -> None:
    class MockOnlyAI:
        def has_real_client(self) -> bool:
            return False

        async def chat_tool_decision(self, **kwargs):  # noqa: ANN003
            raise AssertionError("tool loop should not be called without a real client")

    runtime = build_runtime()
    preparation = run(
        runtime.prepare(
            user_message="continue chapter one",
            context={"session_id": "session-a", "selected_novel_id": "novel-a"},
            conversation=Conversation(messages=[]),
            base_system_prompt="base prompt",
            ai_service=MockOnlyAI(),
        )
    )

    assert preparation.trace["mode"] == "fallback"
    assert preparation.trace["fallback_reason"] == "tool_calling_not_supported_or_no_real_client"


def test_prepare_uses_tool_loop_when_service_explicitly_supports_mock_tool_calling() -> None:
    class MockToolCallingAI(FakeToolCallingAI):
        def has_real_client(self) -> bool:
            return False

        def supports_tool_calling_for_agent(self) -> bool:
            return True

    runtime = build_runtime()
    fake_ai = MockToolCallingAI(
        [
            {"tool_calls": [tool_call("get_recent_conversation", {"limit": 2}, "mock-1")]},
            {"tool_calls": [tool_call("search_chapter_snippets", {"query": "", "mode": "end", "limit": 1}, "mock-2")]},
            {"tool_calls": []},
        ]
    )

    preparation = run(
        runtime.prepare(
            user_message="mock browser verification",
            context={"session_id": "session-a", "selected_novel_id": "novel-a"},
            conversation=Conversation(messages=[Message(role="assistant", content="history")]),
            base_system_prompt="base prompt",
            ai_service=fake_ai,
        )
    )

    assert preparation.trace["mode"] == "model_tool_loop"
    assert [call["name"] for call in preparation.trace["tool_calls"]] == [
        "get_recent_conversation",
        "search_chapter_snippets",
    ]


def test_ai_service_mock_tool_calling_script(monkeypatch) -> None:
    monkeypatch.setenv("NOVELFORGE_MOCK_TOOL_CALLS", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    service = AIService(Config())

    assert service.supports_tool_calling_for_agent() is True

    first = run(service.chat_tool_decision(messages=[{"role": "user", "content": "x"}], tools=[{"type": "function"}]))
    second = run(
        service.chat_tool_decision(
            messages=[
                {"role": "user", "content": "x"},
                {"role": "tool", "tool_call_id": "mock-call-1", "content": "{}"},
            ],
            tools=[{"type": "function"}],
        )
    )

    assert first["tool_calls"][0]["name"] == "get_recent_conversation"
    assert second["tool_calls"][0]["name"] == "search_chapter_snippets"


def test_model_tool_loop_records_tool_error_and_still_prepares_final_prompt() -> None:
    runtime = build_runtime()
    fake_ai = FakeToolCallingAI(
        [
            {"tool_calls": [tool_call("get_asset_detail", {"asset_id": "missing-asset"}, "call-1")]},
            {"tool_calls": []},
        ]
    )

    preparation = run(
        runtime.prepare(
            user_message="read a missing asset then answer",
            context={"session_id": "session-a", "selected_novel_id": "novel-a"},
            conversation=Conversation(messages=[]),
            base_system_prompt="base prompt",
            ai_service=fake_ai,
        )
    )

    assert preparation.trace["mode"] == "model_tool_loop"
    assert preparation.trace["degraded"] is True
    assert preparation.trace["tool_calls"][0]["name"] == "get_asset_detail"
    assert preparation.trace["tool_calls"][0]["status"] == "error"
    assert "base prompt" in preparation.system_prompt


def test_model_tool_loop_stops_at_max_steps() -> None:
    runtime = build_runtime()
    fake_ai = FakeToolCallingAI(
        [
            {"tool_calls": [tool_call("get_recent_conversation", {"limit": (index % 8) + 1}, f"call-{index}")]}
            for index in range(10)
        ]
    )

    preparation = run(
        runtime.prepare(
            user_message="请继续写",
            context={"session_id": "session-a", "selected_novel_id": "novel-a"},
            conversation=Conversation(messages=[Message(role="assistant", content="历史")]),
            base_system_prompt="base prompt",
            ai_service=fake_ai,
        )
    )

    assert preparation.trace["mode"] == "model_tool_loop"
    assert preparation.trace["degraded"] is True
    assert preparation.trace["stopped_reason"] == "max_tool_calls"
    assert len(preparation.trace["tool_calls"]) >= 11


def test_prepare_tools_only_create_suggestions_without_writing() -> None:
    runtime = build_runtime()

    save_observation = runtime.prepare_save_asset({"asset_type": "chapter", "title": "候选序章"})
    update_observation = runtime.prepare_chapter_update({"target_hint": "第一章"})

    assert save_observation.status == "ok"
    assert update_observation.status == "ok"
    assert "候选序章" in save_observation.items[0]["title"]
    assert "第一章" in update_observation.items[0]["title"]
