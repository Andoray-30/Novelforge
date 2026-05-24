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
