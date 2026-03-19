"""
文本分析工具模块
"""
import re
import math
from typing import List, Dict, Optional
from collections import Counter
from novelforge.types.text_processing import TextAnalyzer, TextAnalysisResult


class DefaultTextAnalyzer(TextAnalyzer):
    """默认文本分析器实现"""
    
    def __init__(self):
        # 预编译常用的正则表达式
        self.sentence_endings = re.compile(r'[.!?。！？\n]+')
        self.word_pattern = re.compile(r'\b\w+\b')
        self.paragraph_pattern = re.compile(r'\n\s*\n\s*')
    
    def analyze(self, text: str) -> TextAnalysisResult:
        """
        分析文本
        
        Args:
            text: 待分析的文本
            
        Returns:
            文本分析结果
        """
        if not text:
            return TextAnalysisResult(
                total_chars=0,
                total_words=0,
                total_paragraphs=0,
                total_chapters=0,
                avg_paragraph_length=0,
                avg_sentence_length=0,
                reading_time_minutes=0
            )
        
        # 计算基本统计信息
        total_chars = len(text)
        total_words = len(self.word_pattern.findall(text))
        total_paragraphs = len([p for p in self.paragraph_pattern.split(text) if p.strip()]) or 1
        
        # 计算句子数量
        sentences = [s for s in self.sentence_endings.split(text) if s.strip()]
        total_sentences = len(sentences)
        
        # 计算段落平均长度（以字数计算）
        paragraphs = [p for p in self.paragraph_pattern.split(text) if p.strip()]
        avg_paragraph_length = sum(len(p) for p in paragraphs) / len(paragraphs) if paragraphs else 0
        
        # 计算句子平均长度（以词数计算）
        avg_sentence_length = total_words / total_sentences if total_sentences > 0 else 0
        
        # 计算阅读时间（假设每分钟阅读200词）
        reading_time_minutes = max(1, math.ceil(total_words / 200))
        
        # 计算词频
        words = self.word_pattern.findall(text.lower())
        word_counts = Counter(words)
        unique_words = len(word_counts)
        
        # 计算词密度（前10个最常见的词）
        common_words = word_counts.most_common(10)
        density = {word: count/total_words for word, count in common_words} if total_words > 0 else {}
        
        # 估算可读性分数（Flesch Reading Ease简化版）
        readability_score = self._calculate_readability_score(total_words, total_sentences, len([c for c in text if c.isalpha()]))
        
        # 检测语言（简单实现）
        language = self._detect_language(text)
        
        return TextAnalysisResult(
            total_chars=total_chars,
            total_words=total_words,
            total_paragraphs=total_paragraphs,
            total_chapters=0,  # 章节数量需要从章节检测器获取
            avg_paragraph_length=avg_paragraph_length,
            avg_sentence_length=avg_sentence_length,
            reading_time_minutes=reading_time_minutes,
            readability_score=readability_score,
            language=language,
            unique_words=unique_words,
            density=density
        )
    
    def _calculate_readability_score(self, total_words: int, total_sentences: int, total_letters: int) -> Optional[float]:
        """
        计算可读性分数（简化版Flesch Reading Ease）
        
        Args:
            total_words: 总词数
            total_sentences: 总句子数
            total_letters: 总字母数
            
        Returns:
            可读性分数，范围0-100，分数越高越容易阅读
        """
        if total_sentences == 0 or total_words == 0:
            return None
        
        # 简化版计算（不适用于中文文本，但提供基本框架）
        try:
            avg_words_per_sentence = total_words / total_sentences
            # 对于中文，我们不计算平均音节数，所以简化计算
            score = 206.835 - (1.015 * avg_words_per_sentence)
            return max(0, min(100, score))  # 限制在0-100范围内
        except:
            return None
    
    def _detect_language(self, text: str) -> Optional[str]:
        """
        检测文本语言（简单实现）
        
        Args:
            text: 待检测的文本
            
        Returns:
            检测到的语言代码，如'zh', 'en'等
        """
        if not text:
            return None
        
        # 统计中文字符数量
        chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
        total_chars = len(text)
        
        # 如果中文字符占比超过50%，则认为是中文
        if chinese_chars / total_chars > 0.5:
            return 'zh'
        else:
            # 简单检测英文字符
            english_chars = len(re.findall(r'[a-zA-Z]', text))
            if english_chars / total_chars > 0.5:
                return 'en'
        
        return 'unknown'


class AdvancedTextAnalyzer(DefaultTextAnalyzer):
    """高级文本分析器，提供更多分析功能"""
    
    def analyze(self, text: str) -> TextAnalysisResult:
        """
        执行高级文本分析
        
        Args:
            text: 待分析的文本
            
        Returns:
            文本分析结果
        """
        # 首先获取基础分析结果
        result = super().analyze(text)
        
        # 添加更高级的分析指标
        result = self._add_advanced_metrics(text, result)
        
        return result
    
    def _add_advanced_metrics(self, text: str, result: TextAnalysisResult) -> TextAnalysisResult:
        """
        添加高级分析指标
        
        Args:
            text: 待分析的文本
            result: 基础分析结果
            
        Returns:
            更新后的分析结果
        """
        # 计算字符重复率
        char_counts = Counter(text)
        total_chars = len(text)
        unique_chars = len(char_counts)
        result.char_repetition_rate = (total_chars - unique_chars) / total_chars if total_chars > 0 else 0
        
        # 计算段落长度方差
        paragraphs = [p for p in self.paragraph_pattern.split(text) if p.strip()]
        if paragraphs:
            lengths = [len(p) for p in paragraphs]
            avg_length = sum(lengths) / len(lengths)
            variance = sum((length - avg_length) ** 2 for length in lengths) / len(lengths)
            result.paragraph_length_variance = variance
        
        # 计算句子长度分布
        sentences = [s for s in self.sentence_endings.split(text) if s.strip()]
        if sentences:
            sentence_lengths = [len(self.word_pattern.findall(s)) for s in sentences]
            result.sentence_length_distribution = {
                'min': min(sentence_lengths) if sentence_lengths else 0,
                'max': max(sentence_lengths) if sentence_lengths else 0,
                'avg': sum(sentence_lengths) / len(sentence_lengths) if sentence_lengths else 0
            }
        
        # 计算复杂词汇比例（长词比例）
        words = self.word_pattern.findall(text)
        if words:
            long_words = [w for w in words if len(w) > 10]  # 对于英文，长词通常>10字符
            result.complex_word_ratio = len(long_words) / len(words)
        
        return result


class NovelTextAnalyzer(DefaultTextAnalyzer):
    """专为小说设计的文本分析器"""
    
    def analyze(self, text: str) -> TextAnalysisResult:
        """
        分析小说文本
        
        Args:
            text: 待分析的小说文本
            
        Returns:
            文本分析结果
        """
        # 获取基础分析结果
        result = super().analyze(text)
        
        # 添加小说特有的分析指标
        result = self._add_novel_specific_metrics(text, result)
        
        return result
    
    def _add_novel_specific_metrics(self, text: str, result: TextAnalysisResult) -> TextAnalysisResult:
        """
        添加小说特有的分析指标
        
        Args:
            text: 小说文本
            result: 基础分析结果
            
        Returns:
            更新后的分析结果
        """
        # 检测对话比例
        dialogue_pattern = re.compile(r'[""「」』]')
        dialogue_matches = dialogue_pattern.findall(text)
        result.dialogue_ratio = len(dialogue_matches) / max(1, result.total_words)
        
        # 检测描述性语言比例（通过形容词和副词模式简单估算）
        # 这里使用简单模式，实际应用中可能需要NLP库进行词性标注
        descriptive_patterns = [
            re.compile(r'的\s+\w{2,4}(?=\s)'),  # "的"字结构可能表示修饰
            re.compile(r'地\s+\w{1,2}(?=\s)'),  # "地"字结构修饰动词
        ]
        
        descriptive_count = 0
        for pattern in descriptive_patterns:
            descriptive_count += len(pattern.findall(text))
        
        result.descriptive_ratio = descriptive_count / max(1, result.total_words)
        
        # 检测动作描述模式
        action_indicators = ['说道', '想到', '看见', '听到', '走', '跑', '看', '说']
        action_count = 0
        for indicator in action_indicators:
            action_count += len(re.findall(indicator, text))
        
        result.action_ratio = action_count / max(1, result.total_words)
        
        # 计算叙述节奏
        # 通过段落内的句子数量变化来估算
        paragraphs = [p for p in self.paragraph_pattern.split(text) if p.strip()]
        sentence_counts_per_paragraph = []
        
        for paragraph in paragraphs:
            sentences_in_para = len([s for s in self.sentence_endings.split(paragraph) if s.strip()])
            sentence_counts_per_paragraph.append(sentences_in_para)
        
        if sentence_counts_per_paragraph:
            avg_sentences_per_paragraph = sum(sentence_counts_per_paragraph) / len(sentence_counts_per_paragraph)
            result.avg_sentences_per_paragraph = avg_sentences_per_paragraph
            
            # 计算节奏变化方差
            variance = sum((count - avg_sentences_per_paragraph) ** 2 for count in sentence_counts_per_paragraph) / len(sentence_counts_per_paragraph)
            result.rhythm_variance = variance
        
        return result


class TextAnalyzerService:
    """文本分析服务，提供统一的分析接口"""
    
    def __init__(self):
        self.analyzers = {
            'default': DefaultTextAnalyzer(),
            'advanced': AdvancedTextAnalyzer(),
            'novel': NovelTextAnalyzer()
        }
    
    def analyze_text(self, text: str, analyzer_type: str = 'default') -> TextAnalysisResult:
        """
        分析文本
        
        Args:
            text: 待分析的文本
            analyzer_type: 分析器类型
            
        Returns:
            文本分析结果
        """
        analyzer = self.get_analyzer(analyzer_type)
        return analyzer.analyze(text)
    
    def get_analyzer(self, analyzer_type: str) -> TextAnalyzer:
        """
        获取指定类型的分析器
        
        Args:
            analyzer_type: 分析器类型
            
        Returns:
            文本分析器实例
        """
        if analyzer_type not in self.analyzers:
            analyzer_type = 'default'
        
        return self.analyzers[analyzer_type]
    
    def compare_texts(self, text1: str, text2: str, analyzer_type: str = 'default') -> Dict[str, float]:
        """
        比较两段文本的分析结果
        
        Args:
            text1: 第一段文本
            text2: 第二段文本
            analyzer_type: 分析器类型
            
        Returns:
            比较结果，包含各项指标的差异
        """
        result1 = self.analyze_text(text1, analyzer_type)
        result2 = self.analyze_text(text2, analyzer_type)
        
        comparison = {}
        
        # 比较基本指标
        comparison['word_count_diff'] = result2.total_words - result1.total_words
        comparison['paragraph_count_diff'] = result2.total_paragraphs - result1.total_paragraphs
        comparison['avg_sentence_length_diff'] = result2.avg_sentence_length - result1.avg_sentence_length
        comparison['reading_time_diff'] = result2.reading_time_minutes - result1.reading_time_minutes
        
        return comparison


def create_text_analyzer(analyzer_type: str = 'default') -> TextAnalyzer:
    """
    工厂函数，创建文本分析器实例
    
    Args:
        analyzer_type: 分析器类型
        
    Returns:
        文本分析器实例
    """
    service = TextAnalyzerService()
    return service.get_analyzer(analyzer_type)