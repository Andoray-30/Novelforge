from pathlib import Path

from novelforge.content.chapter_detector import EnhancedChapterDetector
from novelforge.content.text_preprocessor import create_text_preprocessor
from novelforge.services.text_processing_service import TextProcessingService
from novelforge.types.text_processing import TextProcessingConfig


def test_txt_reader_prefers_decodable_chinese_encoding_over_latin1(tmp_path):
    source = tmp_path / "novel.txt"
    source.write_bytes("<超时空辉夜姬>\n\n第一卷 序章\n\n正文内容".encode("gbk"))

    text = TextProcessingService()._read_txt_file(str(source))

    assert "超时空辉夜姬" in text
    assert "第一卷 序章" in text


def test_preprocessor_preserves_line_breaks_for_chapter_detection():
    preprocessor = create_text_preprocessor("advanced")
    text = "第一卷 序章\n\n正文第一段。\n\n第一章 开始\n\n正文第二段。"

    processed = preprocessor.preprocess(text, TextProcessingConfig(preserve_line_breaks=True))

    assert "第一章 开始\n" in processed


def test_preprocessor_preserves_chapter_heading_at_start_of_file():
    preprocessor = create_text_preprocessor("advanced")
    text = "\n\n<书名>\n\n第一卷 序章\n\n正文第一段很长很长超过二十个字符，用于模拟导入小说正文。"

    processed = preprocessor.preprocess(text, TextProcessingConfig(preserve_line_breaks=True))

    assert processed.startswith("第一卷 序章")


def test_enhanced_detector_handles_volume_headings_with_optional_title():
    chapters = EnhancedChapterDetector().detect_chapters(
        "第一卷 序章\n\n正文第一段。\n\n第一章 开始\n\n正文第二段。"
    )

    assert len(chapters) == 2
    assert chapters[0].title == "第一卷 序章"
    assert chapters[0].content == "正文第一段。"
    assert chapters[1].title == "第一章 开始"
    assert chapters[1].content == "正文第二段。"


def test_enhanced_detector_keeps_headings_after_sentence_lines():
    text = (
        "第一章 雨夜档案馆\n"
        "上一章正文第一段，以句号结束。\n"
        "第二章 守夜人的债\n"
        "第二章正文。\n"
        "第三章 月桥钟声\n"
        "第三章正文。"
    )

    chapters = EnhancedChapterDetector().detect_chapters(text)

    assert [chapter.title for chapter in chapters] == [
        "第一章 雨夜档案馆",
        "第二章 守夜人的债",
        "第三章 月桥钟声",
    ]


def test_process_text_detects_chapters_with_default_config_single_newlines():
    text = (
        "第一章 雨夜\n"
        "正文第一段内容比较充足足够用来做章节检测测试。\n"
        "第二章 守夜\n"
        "正文第二段内容也十分充足用于验证多章节识别能力。"
    )
    result = TextProcessingService().process_text(text)
    assert len(result.chapters) >= 2, (
        f"Expected >= 2 chapters with default config, got {len(result.chapters)}: "
        f"{[c.title for c in result.chapters]}"
    )


def test_process_text_detects_arabic_digit_chapter():
    text = (
        "第1章 启程\n"
        "正文内容足够长足够超过十个汉字用来测试章节检测功能。\n"
        "第2章 远行\n"
        "第二段正文内容也十分充足用于验证检测效果。"
    )
    result = TextProcessingService().process_text(text)
    assert len(result.chapters) >= 2, (
        f"Expected >= 2 chapters for Arabic-digit headings, got {len(result.chapters)}"
    )


def test_process_text_detects_fullwidth_variant():
    text = (
        "第０１章 序幕\n"
        "正文内容足够长足够超过十个汉字用来测试章节检测功能。\n"
        "第０２章 开幕\n"
        "第二段正文也足够长足够用来做测试验证。"
    )
    result = TextProcessingService().process_text(text)
    assert len(result.chapters) >= 2, (
        f"Expected >= 2 chapters for fullwidth-digit headings, got {len(result.chapters)}"
    )


def test_detect_chapters_handles_mixed_decorated_and_plain_headings():
    text = (
        "【第一章】雨夜\n\n"
        "正文内容十分充足足够超过十个汉字用来做章节检测测试。\n\n"
        "第二章 守夜\n\n"
        "第二章正文内容也十分充足用于验证多章节检测。"
    )
    chapters = EnhancedChapterDetector().detect_chapters(text)
    assert len(chapters) == 2, (
        f"Expected 2 chapters (decorated + plain), got {len(chapters)}: "
        f"{[c.title for c in chapters]}"
    )


def test_detect_chapters_with_star_decorated_headings():
    text = (
        "★第一章★ 雨夜\n\n"
        "正文内容十分充足足够超过十个汉字用来测试。\n\n"
        "★第二章★ 守夜\n\n"
        "第二章正文内容也十分充足用于验证。"
    )
    chapters = EnhancedChapterDetector().detect_chapters(text)
    assert len(chapters) == 2, (
        f"Expected 2 chapters (star-decorated), got {len(chapters)}: "
        f"{[c.title for c in chapters]}"
    )


def test_detect_chapters_rejects_ordinary_sentence():
    chapters = EnhancedChapterDetector().detect_chapters(
        "今天天气不错适合出门散步。\n\n明天可能下雨需要带伞。"
    )
    assert len(chapters) == 0, (
        f"Ordinary sentence must not be a chapter, got {len(chapters)}"
    )


def test_detect_chapters_rejects_dialogue_line():
    chapters = EnhancedChapterDetector().detect_chapters(
        "她说：\"我知道了，谢谢你告诉我这些事情。\"\n\n正文内容足够长用来做测试。"
    )
    assert len(chapters) == 0, (
        f"Dialogue line must not be a chapter, got {len(chapters)}"
    )


def test_detect_chapters_rejects_long_body_line():
    chapters = EnhancedChapterDetector().detect_chapters(
        "这是一个非常长的正文段落内容，包含大量描述性文字和叙述性语言，"
        "长度远远超过普通章节标题应有的范围，因此不应该被错误识别为章节标题。\n\n"
        "继续正文内容。"
    )
    assert len(chapters) == 0, (
        f"Long body line must not be a chapter, got {len(chapters)}"
    )


def test_detect_chapters_rejects_line_containing_diyi_but_not_heading():
    chapters = EnhancedChapterDetector().detect_chapters(
        "这是第一个需要处理的测试用例。\n\n正文内容足够长足够超过十个汉字用于测试。"
    )
    assert len(chapters) == 0, (
        f"Line with '第一' but not a heading must not be a chapter, got {len(chapters)}"
    )


def test_detect_chapters_rejects_copyright_style_line():
    chapters = EnhancedChapterDetector().detect_chapters(
        "版权所有 © 2024 某某出版社 保留一切权利\n\n正文内容足够长用于测试。"
    )
    assert len(chapters) == 0, (
        f"Copyright line must not be a chapter, got {len(chapters)}"
    )


def test_detect_chapters_rejects_overlong_candidate():
    chapters = EnhancedChapterDetector().detect_chapters(
        "这是一个超过五十个字符的长字符串用于测试章节检测器是否"
        "会错误地将过长的字符串识别为章节标题这不应该发生。\n\n正文内容。"
    )
    assert len(chapters) == 0, (
        f"Overlong candidate must not be a chapter, got {len(chapters)}"
    )


def test_detect_chapters_fallback_for_long_text_without_headings():
    text = "正文内容足够长，用来测试当没有明显章节标题时，检测器是否会将整个文本作为一个回退章节处理。" * 30
    chapters = EnhancedChapterDetector().detect_chapters(text)
    assert len(chapters) == 1, (
        f"Expected 1 fallback chapter for long text without headings, got {len(chapters)}"
    )
