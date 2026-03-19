"""
文本预处理器实现
"""
import re
from typing import List, Pattern
from novelforge.types.text_processing import TextPreprocessor, TextProcessingConfig


class DefaultTextPreprocessor(TextPreprocessor):
    """默认文本预处理器实现"""
    
    def __init__(self):
        # 编译常用的正则表达式以提高性能
        self.patterns = {
            'extra_whitespace': re.compile(r'\s+'),
            'multiple_newlines': re.compile(r'\n\s*\n\s*\n+'),
            'chapter_headers': re.compile(
                r'(第[一二三四五六七八九十\d]+[章节卷集部篇])|'
                r'(Chapter\s+\d+)|'
                r'(Chapter\s+[A-Z])|'
                r'(Prologue|Epilogue)|'
                r'((?:序|引|前言|后记|尾声|终章|楔子))',
                re.IGNORECASE
            ),
            'section_headers': re.compile(
                r'(Part\s+\d+)|'
                r'(Section\s+\d+)|'
                r'(Volume\s+\d+)',
                re.IGNORECASE
            )
        }
    
    def preprocess(self, text: str, config: TextProcessingConfig) -> str:
        """
        执行文本预处理
        
        Args:
            text: 待处理的原始文本
            config: 预处理配置
            
        Returns:
            处理后的文本
        """
        result = text
        
        # 1. 去除多余空白字符
        if config.remove_extra_whitespace:
            result = self._remove_extra_whitespace(result)
        
        # 2. 标准化段落格式
        if config.normalize_paragraphs:
            result = self._normalize_paragraphs(result)
        
        # 3. 移除页眉页脚等非内容部分
        if config.remove_headers_footers:
            result = self._remove_headers_footers(result)
        
        # 4. 确保段落之间有适当的间距
        result = self._format_paragraphs(result, config.preserve_line_breaks)
        
        return result
    
    def _remove_extra_whitespace(self, text: str) -> str:
        """
        去除多余的空白字符
        
        Args:
            text: 原始文本
            
        Returns:
            处理后的文本
        """
        # 将连续的空白字符（空格、制表符、换页符等）替换为单个空格
        text = self.patterns['extra_whitespace'].sub(' ', text)
        
        # 处理换行符逻辑，保留段落之间的换行
        lines = text.split('\n')
        processed_lines = []
        
        for line in lines:
            line = line.strip()
            if line:  # 如果行不为空
                processed_lines.append(line)
        
        return '\n'.join(processed_lines)
    
    def _normalize_paragraphs(self, text: str) -> str:
        """
        标准化段落格式
        
        Args:
            text: 原始文本
            
        Returns:
            处理后的文本
        """
        # 将多个连续的换行符（2个以上）替换为标准的段落间距（2个换行符）
        text = self.patterns['multiple_newlines'].sub('\n\n', text)
        
        # 确保段落首行没有不必要的缩进
        lines = text.split('\n')
        processed_lines = []
        
        for i, line in enumerate(lines):
            # 如果是段落的开始（前一行是空行或第一行），则去除缩进
            if i == 0 or lines[i-1].strip() == '':
                line = line.lstrip()
            processed_lines.append(line)
        
        return '\n'.join(processed_lines)
    
    def _remove_headers_footers(self, text: str) -> str:
        """
        移除页眉页脚等非内容部分
        
        Args:
            text: 原始文本
            
        Returns:
            处理后的文本
        """
        lines = text.split('\n')
        processed_lines = []
        
        # 简单的启发式规则：移除文本开头和结尾的短行（可能是页码或标题）
        # 保留中间的长行作为主要内容
        
        # 移除开头的短行
        start_idx = 0
        for i, line in enumerate(lines):
            if len(line.strip()) > 20:  # 如果行长度超过20个字符，则认为是内容
                start_idx = i
                break
        
        # 移除结尾的短行
        end_idx = len(lines)
        for i in range(len(lines) - 1, -1, -1):
            if len(lines[i].strip()) > 20:
                end_idx = i + 1
                break
        
        # 重新构建文本
        content_lines = lines[start_idx:end_idx]
        
        # 进一步移除可能的页眉页脚标记
        filtered_lines = []
        for line in content_lines:
            stripped_line = line.strip()
            
            # 跳过可能的页码（纯数字行或包含特定页码标记的行）
            if self._is_page_header_footer(stripped_line):
                continue
            
            filtered_lines.append(line)
        
        return '\n'.join(filtered_lines)
    
    def _is_page_header_footer(self, line: str) -> bool:
        """
        判断行是否为页眉或页脚
        
        Args:
            line: 待检查的行
            
        Returns:
            如果是页眉或页脚则返回True
        """
        # 检查是否为纯数字（可能是页码）
        if line.isdigit():
            return True
        
        # 检查是否包含常见页码模式
        page_patterns = [
            r'^\s*\d+\s*$',  # 纯数字
            r'^\s*第\s*\d+\s*页\s*$',  # "第X页"
            r'^\s*-\s*\d+\s*-\s*$',  # "-X-"格式
        ]
        
        for pattern in page_patterns:
            if re.match(pattern, line):
                return True
        
        return False
    
    def _format_paragraphs(self, text: str, preserve_line_breaks: bool) -> str:
        """
        格式化段落
        
        Args:
            text: 原始文本
            preserve_line_breaks: 是否保留原始换行符
            
        Returns:
            格式化后的文本
        """
        if preserve_line_breaks:
            return text
        
        # 将文本分割成段落
        paragraphs = text.split('\n\n')
        formatted_paragraphs = []
        
        for paragraph in paragraphs:
            # 将段落中的单个换行符替换为空格（合并物理行）
            # 但保留段落之间的换行
            lines = paragraph.split('\n')
            joined_line = ' '.join(line.strip() for line in lines if line.strip())
            
            if joined_line.strip():  # 如果段落不为空
                formatted_paragraphs.append(joined_line)
        
        return '\n\n'.join(formatted_paragraphs)


class AdvancedTextPreprocessor(DefaultTextPreprocessor):
    """高级文本预处理器，包含更多预处理功能"""
    
    def preprocess(self, text: str, config: TextProcessingConfig) -> str:
        """
        执行高级文本预处理
        
        Args:
            text: 待处理的原始文本
            config: 预处理配置
            
        Returns:
            处理后的文本
        """
        result = super().preprocess(text, config)
        
        # 可以在这里添加额外的预处理步骤
        # 例如：去除HTML标签、转义字符处理等
        
        # 去除常见的HTML标签（如果文本中包含）
        result = self._remove_html_tags(result)
        
        # 处理常见的转义字符
        result = self._handle_escape_characters(result)
        
        return result
    
    def _remove_html_tags(self, text: str) -> str:
        """
        移除HTML标签
        
        Args:
            text: 包含HTML标签的文本
            
        Returns:
            移除标签后的文本
        """
        # 移除HTML标签的正则表达式
        html_tag_pattern = re.compile(r'<[^>]+>')
        return html_tag_pattern.sub('', text)
    
    def _handle_escape_characters(self, text: str) -> str:
        """
        处理转义字符
        
        Args:
            text: 包含转义字符的文本
            
        Returns:
            处理后的文本
        """
        # 将常见的转义字符替换为正常字符
        replacements = {
            '&nbsp;': ' ',
            '<': '<',
            '>': '>',
            '&': '&',
            '"': '"',
            ''': "'",
        }
        
        for old, new in replacements.items():
            text = text.replace(old, new)
        
        return text


def create_text_preprocessor(preprocessor_type: str = 'default') -> TextPreprocessor:
    """
    工厂函数，创建文本预处理器实例
    
    Args:
        preprocessor_type: 预处理器类型
        
    Returns:
        文本预处理器实例
    """
    if preprocessor_type == 'advanced':
        return AdvancedTextPreprocessor()
    else:
        return DefaultTextPreprocessor()