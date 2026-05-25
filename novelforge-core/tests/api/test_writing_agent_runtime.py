import asyncio

from novelforge.api.types import Conversation, Message
from novelforge.api.writing_agent import AgentScope, WRITING_AGENT_TOOL_SCHEMAS, WritingAgentRuntime
from novelforge.content.manager import ContentManager
from novelforge.content.models import ContentItem, ContentMetadata, ContentType
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
            content="辉夜渴望证明自己不是被命运制造出来的影子。",
        ),
        build_item(
            "world-moon",
            title="月轮协议",
            content_type=ContentType.WORLD,
            content="月轮协议规定时空跳跃会剥离记忆，因此角色关系带有失而复得的痛感。",
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
