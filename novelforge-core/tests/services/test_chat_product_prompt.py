from novelforge.api import _build_chat_system_prompt


def test_chat_prompt_centers_prologue_and_asset_writeback_goal():
    prompt = _build_chat_system_prompt({"project_title": "雾港"})

    assert "小说序章" in prompt
    assert "情绪价值" in prompt
    assert "角色欲望" in prompt
    assert "chapter" in prompt
    assert "<save_asset>" in prompt
