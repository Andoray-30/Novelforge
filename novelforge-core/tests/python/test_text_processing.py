"""
文本处理功能测试脚本
"""
import tempfile
import os
from pathlib import Path

from novelforge.types.text_processing import TextProcessingConfig
from novelforge.content.text_preprocessor import DefaultTextPreprocessor
from novelforge.content.chapter_detector import RegexBasedChapterDetector
from novelforge.content.text_analyzer import DefaultTextAnalyzer
from novelforge.services.text_processing_service import TextProcessingService


def test_text_preprocessor():
    """测试文本预处理器"""
    print("测试文本预处理器...")
    
    preprocessor = DefaultTextPreprocessor()
    config = TextProcessingConfig()
    
    # 测试文本
    test_text = """这是第一段文本。包含一些多余的空白字符。


    这是第二段文本，有一些缩进。
    
    第三段文本。
    """
    
    result = preprocessor.preprocess(test_text, config)
    print(f"原始文本:\n{repr(test_text)}")
    print(f"处理后文本:\n{repr(result)}")
    print("文本预处理器测试完成\n")


def test_chapter_detector():
    """测试章节检测器"""
    print("测试章节检测器...")
    
    detector = RegexBasedChapterDetector()
    
    # 测试文本，包含章节标题
    test_text = """
    序章 引言
    这是序章的内容。
    
    第一章 新的开始
    这是第一章的内容。
    
    第二章 发展
    这是第二章的内容。
    
    终章 结局
    这是终章的内容。
    """
    
    chapters = detector.detect_chapters(test_text)
    print(f"检测到 {len(chapters)} 个章节:")
    for i, chapter in enumerate(chapters):
        print(f"  {i+1}. {chapter.title} (位置: {chapter.start_position}-{chapter.end_position})")
        print(f"     内容预览: {chapter.content[:50]}...")
    print("章节检测器测试完成\n")


def test_text_analyzer():
    """测试文本分析器"""
    print("测试文本分析器...")
    
    analyzer = DefaultTextAnalyzer()
    
    test_text = """
    这是一个测试文本。它包含多个句子。
    这是第二段。我们来测试分析功能。
    文本分析器应该能够计算各种指标。
    """
    
    result = analyzer.analyze(test_text)
    print(f"总字符数: {result.total_chars}")
    print(f"总词数: {result.total_words}")
    print(f"段落数: {result.total_paragraphs}")
    print(f"平均段落长度: {result.avg_paragraph_length:.2f}")
    print(f"平均句子长度: {result.avg_sentence_length:.2f}")
    print(f"阅读时间: {result.reading_time_minutes} 分钟")
    print(f"语言: {result.language}")
    print(f"唯一词数: {result.unique_words}")
    print("文本分析器测试完成\n")


def test_advanced_text_analyzer():
    """测试高级文本分析器"""
    print("测试高级文本分析器...")
    
    from novelforge.content.text_analyzer import AdvancedTextAnalyzer
    
    analyzer = AdvancedTextAnalyzer()
    
    test_text = """
    这是一个测试文本。它包含多个句子。
    这是第二段。我们来测试分析功能。
    文本分析器应该能够计算各种指标。
    """
    
    result = analyzer.analyze(test_text)
    print(f"总字符数: {result.total_chars}")
    print(f"总词数: {result.total_words}")
    print(f"段落数: {result.total_paragraphs}")
    print(f"平均段落长度: {result.avg_paragraph_length:.2f}")
    print(f"平均句子长度: {result.avg_sentence_length:.2f}")
    print(f"阅读时间: {result.reading_time_minutes} 分钟")
    print(f"语言: {result.language}")
    print(f"唯一词数: {result.unique_words}")
    
    # 验证高级分析指标
    print(f"字符重复率: {result.char_repetition_rate:.4f}" if result.char_repetition_rate is not None else "字符重复率: None")
    print(f"段落长度方差: {result.paragraph_length_variance:.4f}" if result.paragraph_length_variance is not None else "段落长度方差: None")
    print(f"复杂词汇比例: {result.complex_word_ratio:.4f}" if result.complex_word_ratio is not None else "复杂词汇比例: None")
    
    if result.sentence_length_distribution:
        print(f"句子长度分布: min={result.sentence_length_distribution.get('min', 0):.1f}, "
              f"max={result.sentence_length_distribution.get('max', 0):.1f}, "
              f"avg={result.sentence_length_distribution.get('avg', 0):.1f}")
    
    print("高级文本分析器测试完成\n")


def test_novel_text_analyzer():
    """测试小说文本分析器"""
    print("测试小说文本分析器...")
    
    from novelforge.content.text_analyzer import NovelTextAnalyzer
    
    analyzer = NovelTextAnalyzer()
    
    # 包含对话的小说样本文本
    test_text = """
    「你好啊！」小明说道。
    小红微笑着回答：「我也很高兴见到你。」
    
    他看见远处的山峰，想到童年的回忆。
    她听到风声，跑向树林深处。
    
    这是一段描述性的文字，用来测试分析器的功能。
    """
    
    result = analyzer.analyze(test_text)
    print(f"总字符数: {result.total_chars}")
    print(f"总词数: {result.total_words}")
    print(f"段落数: {result.total_paragraphs}")
    print(f"平均段落长度: {result.avg_paragraph_length:.2f}")
    print(f"平均句子长度: {result.avg_sentence_length:.2f}")
    print(f"阅读时间: {result.reading_time_minutes} 分钟")
    print(f"语言: {result.language}")
    print(f"唯一词数: {result.unique_words}")
    
    # 验证小说特有分析指标
    print(f"对话比例: {result.dialogue_ratio:.4f}" if result.dialogue_ratio is not None else "对话比例: None")
    print(f"描述性语言比例: {result.descriptive_ratio:.4f}" if result.descriptive_ratio is not None else "描述性语言比例: None")
    print(f"动作描述比例: {result.action_ratio:.4f}" if result.action_ratio is not None else "动作描述比例: None")
    print(f"平均每段句子数: {result.avg_sentences_per_paragraph:.2f}" if result.avg_sentences_per_paragraph is not None else "平均每段句子数: None")
    print(f"节奏方差: {result.rhythm_variance:.4f}" if result.rhythm_variance is not None else "节奏方差: None")
    
    print("小说文本分析器测试完成\n")


def test_text_processing_service():
    """测试文本处理服务"""
    print("测试文本处理服务...")
    
    service = TextProcessingService()
    
    # 创建测试文本文件
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        test_content = """
        序章 开始
        故事开始了。
        
        第一章 第一个事件
        这是第一章的内容。
        
        第二章 第二个事件
        这是第二章的内容。
        """
        f.write(test_content)
        temp_file_path = f.name
    
    try:
        # 测试处理文件
        config = TextProcessingConfig(
            remove_extra_whitespace=True,
            normalize_paragraphs=True,
            detect_chapters=True
        )
        
        result = service.process_file(temp_file_path, config)
        
        print(f"处理结果:")
        print(f"  内容长度: {len(result.content)} 字符")
        print(f"  词数: {result.metadata.word_count}")
        print(f"  章节数: {len(result.chapters)}")
        print(f"  警告: {len(result.warnings)} 个")
        
        for i, chapter in enumerate(result.chapters):
            print(f"  章节 {i+1}: {chapter.title} ({len(chapter.content)} 字符)")
        
        print("文本处理服务测试完成\n")
        
    finally:
        # 清理临时文件
        os.unlink(temp_file_path)


def test_file_validation():
    """测试文件验证功能"""
    print("测试文件验证功能...")
    
    service = TextProcessingService()
    
    # 测试有效文件
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write("测试内容")
        temp_file_path = f.name
    
    try:
        result = service.validate_file(temp_file_path)
        print(f"有效文件验证结果: {result['valid']}")
        print(f"错误: {result['errors']}")
        print(f"警告: {result['warnings']}")
        print(f"信息: {result['info']}")
        
        # 测试无效文件路径
        invalid_result = service.validate_file("不存在的文件.txt")
        print(f"无效文件验证结果: {invalid_result['valid']}")
        print(f"无效文件错误: {invalid_result['errors']}")
        
        print("文件验证功能测试完成\n")
        
    finally:
        # 清理临时文件
        os.unlink(temp_file_path)


def run_all_tests():
    """运行所有测试"""
    print("开始运行文本处理功能测试...\n")
    
    test_text_preprocessor()
    test_chapter_detector()
    test_text_analyzer()
    test_advanced_text_analyzer()
    test_novel_text_analyzer()
    test_text_processing_service()
    test_file_validation()
    
    print("所有测试完成!")


if __name__ == "__main__":
    run_all_tests()