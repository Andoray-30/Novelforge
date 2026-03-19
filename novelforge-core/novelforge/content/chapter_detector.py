"""
章节智能识别模块
"""
import re
from typing import List, Pattern, Tuple, Optional
from novelforge.types.text_processing import Chapter, ChapterDetector


class RegexBasedChapterDetector(ChapterDetector):
    """基于正则表达式的章节检测器"""
    
    def __init__(self):
        # 预编译章节标题的正则表达式模式
        self.chapter_patterns = [
            # 中文数字章节（第X章、第X节等）
            re.compile(r'(第[一二三四五六七八九十百千万零\d]+(?:章|节|卷|集|部|篇))\s*(.+?)(?=\n|$)', re.IGNORECASE),
            
            # 阿拉伯数字章节
            re.compile(r'(Chapter|Ch\.)\s+(\d+|\w+)\s*(.+?)(?=\n|$)', re.IGNORECASE),
            
            # 序章、终章等特殊章节
            re.compile(r'(Prologue|Epilogue|序章|引子|前言|后记|尾声|终章|楔子|序|跋)\s*(.+?)(?=\n|$)', re.IGNORECASE),
            
            # 部分、卷等
            re.compile(r'(Part|Section|Volume|部|卷|篇|Partie)\s*(\d+|\w+)\s*(.+?)(?=\n|$)', re.IGNORECASE),
            
            # 直接的数字标题（如 1. 章节标题）
            re.compile(r'^(\d+\.?\d*)\s+(.+?)(?=\n|$)', re.MULTILINE),
            
            # 大写字母标题（如 A. 章节标题）
            re.compile(r'^([A-Z])\s+(.+?)(?=\n|$)', re.MULTILINE),
        ]
        
        # 用于检测可能是章节标题的模式（但需要进一步验证）
        self.potential_chapter_patterns = [
            re.compile(r'^(.{2,50})$', re.MULTILINE),  # 单行标题（2-50个字符）
        ]
        
        # 章节标题的特征词（用于辅助判断）
        self.chapter_keywords = {
            'chapter', 'ch.', 'part', 'section', 'volume', 'prologue', 'epilogue',
            '序章', '引子', '前言', '后记', '尾声', '终章', '楔子', '序', '跋',
            '第', '章', '节', '卷', '集', '部', '篇', '部'
        }
    
    def detect_chapters(self, text: str) -> List[Chapter]:
        """
        检测文本中的章节
        
        Args:
            text: 输入文本
            
        Returns:
            章节列表
        """
        if not text:
            return []
        
        # 首先使用明确的章节模式检测
        chapters = self._detect_explicit_chapters(text)
        
        # 如果没有检测到明显章节，尝试使用启发式方法
        if not chapters:
            chapters = self._detect_implicit_chapters(text)
        
        # 按位置排序章节
        chapters.sort(key=lambda x: x.start_position)
        
        # 为每个章节分配索引
        for i, chapter in enumerate(chapters):
            chapter.index = i
        
        return chapters
    
    def _detect_explicit_chapters(self, text: str) -> List[Chapter]:
        """
        使用明确的章节模式检测章节
        
        Args:
            text: 输入文本
            
        Returns:
            章节列表
        """
        chapters = []
        
        # 用于跟踪已处理的文本位置，避免重复
        processed_positions = set()
        
        for pattern in self.chapter_patterns:
            for match in pattern.finditer(text):
                start_pos = match.start()
                end_pos = match.end()
                
                # 避免重复处理相同位置
                if any(abs(start_pos - pos) < 100 for pos in processed_positions):
                    continue
                
                # 获取章节标题
                groups = match.groups()
                
                # 根据不同模式提取标题信息
                if len(groups) >= 2 and groups[0] and groups[1]:
                    title_part1 = groups[0].strip()
                    title_part2 = groups[1].strip()
                    title = f"{title_part1} {title_part2}".strip()
                elif groups and groups[0]:
                    title = groups[0].strip()
                else:
                    continue
                
                # 验证章节标题的合理性
                if not self._is_valid_chapter_title(title):
                    continue
                
                # 确定章节内容的起始位置
                content_start = end_pos
                
                # 确定章节内容的结束位置（到下一个章节标题或文本末尾）
                next_chapter_pos = self._find_next_chapter_position(text, end_pos)
                content_end = next_chapter_pos if next_chapter_pos != -1 else len(text)
                
                # 提取章节内容
                content = text[content_start:content_end].strip()
                
                # 创建章节对象
                chapter = Chapter(
                    title=title,
                    content=content,
                    start_position=start_pos,
                    end_position=content_end
                )
                
                chapters.append(chapter)
                processed_positions.add(start_pos)
        
        return chapters
    
    def _detect_implicit_chapters(self, text: str) -> List[Chapter]:
        """
        使用启发式方法检测可能的章节
        
        Args:
            text: 输入文本
            
        Returns:
            章节列表
        """
        chapters = []
        
        # 按段落分割文本
        paragraphs = text.split('\n\n')
        
        current_pos = 0
        potential_titles = []
        
        for paragraph in paragraphs:
            paragraph_start = current_pos
            current_pos += len(paragraph) + 2  # +2 for '\n\n'
            
            # 检查段落是否可能是章节标题
            if self._is_potential_chapter_title(paragraph):
                potential_titles.append((paragraph_start, paragraph, current_pos))
        
        # 如果找到潜在标题，尝试将文本分段
        if potential_titles:
            for i, (title_pos, title, content_start) in enumerate(potential_titles):
                # 确定章节内容的结束位置
                content_end = (
                    potential_titles[i + 1][0] 
                    if i + 1 < len(potential_titles) 
                    else len(text)
                )
                
                # 提取章节内容
                content = text[content_start:content_end].strip()
                
                # 创建章节对象
                chapter = Chapter(
                    title=title.strip(),
                    content=content,
                    start_position=title_pos,
                    end_position=content_end
                )
                
                chapters.append(chapter)
        
        return chapters
    
    def _is_valid_chapter_title(self, title: str) -> bool:
        """
        验证章节标题是否有效
        
        Args:
            title: 章节标题
            
        Returns:
            如果标题有效则返回True
        """
        if not title:
            return False
        
        # 检查长度
        if len(title) < 2 or len(title) > 100:
            return False
        
        # 检查是否包含章节关键词
        title_lower = title.lower()
        if any(keyword in title_lower for keyword in self.chapter_keywords):
            return True
        
        # 检查是否匹配章节模式
        for pattern in self.chapter_patterns:
            if pattern.search(title):
                return True
        
        # 一些额外的启发式规则
        # 如果标题包含数字且看起来像是章节标题
        if re.search(r'第\d+|Chapter\s+\d+|Part\s+\d+', title, re.IGNORECASE):
            return True
        
        return False
    
    def _is_potential_chapter_title(self, text: str) -> bool:
        """
        检查文本是否可能是章节标题
        
        Args:
            text: 待检查的文本
            
        Returns:
            如果可能是章节标题则返回True
        """
        if not text:
            return False
        
        # 长度检查
        text = text.strip()
        if len(text) < 2 or len(text) > 50:
            return False
        
        # 检查是否包含章节关键词
        if any(keyword in text.lower() for keyword in self.chapter_keywords):
            return True
        
        # 检查是否包含数字和常见章节标识
        if re.search(r'第\d+|Chapter\s+\d+|Part\s+\d+|Vol\.?\s+\d+', text, re.IGNORECASE):
            return True
        
        # 检查是否是单行且看起来像标题（首字母大写等）
        lines = text.split('\n')
        if len(lines) == 1:
            # 如果是单行且格式类似于标题
            if text[0].isupper() or re.match(r'^[\u4e00-\u9fff]+', text):  # 中文字符开头
                return True
        
        return False
    
    def _find_next_chapter_position(self, text: str, start_pos: int) -> int:
        """
        查找下一个章节的位置
        
        Args:
            text: 输入文本
            start_pos: 开始查找的位置
            
        Returns:
            下一个章节的位置，如果未找到则返回-1
        """
        for pattern in self.chapter_patterns:
            match = pattern.search(text, start_pos)
            if match:
                return match.start()
        
        return -1


class MLBasedChapterDetector(ChapterDetector):
    """
    基于机器学习的章节检测器（未来扩展用）
    目前作为占位符实现
    """
    
    def detect_chapters(self, text: str) -> List[Chapter]:
        """
        使用机器学习模型检测章节
        """
        # TODO: 实现基于ML的章节检测
        # 这里暂时使用基于规则的检测器作为备用
        detector = RegexBasedChapterDetector()
        return detector.detect_chapters(text)


class EnhancedChapterDetector(RegexBasedChapterDetector):
    """
    增强版章节检测器
    结合多种方法提高检测准确性
    """
    
    def detect_chapters(self, text: str) -> List[Chapter]:
        """
        检测文本中的章节，使用多种策略
        """
        if not text:
            return []
        
        # 首先使用基于正则的方法
        chapters = super().detect_chapters(text)
        
        # 如果正则方法没有找到章节，尝试其他启发式方法
        if not chapters:
            chapters = self._detect_by_content_structure(text)
        
        # 后处理：合并相邻的短章节或分离长章节
        chapters = self._post_process_chapters(chapters, text)
        
        # 按位置排序章节
        chapters.sort(key=lambda x: x.start_position)
        
        # 为每个章节分配索引
        for i, chapter in enumerate(chapters):
            chapter.index = i
        
        return chapters
    
    def _detect_by_content_structure(self, text: str) -> List[Chapter]:
        """
        基于内容结构检测章节
        """
        chapters = []
        
        # 使用段落分隔符和内容特征来识别潜在章节
        paragraphs = text.split('\n\n')
        
        if not paragraphs:
            return chapters
        
        current_chapter_start = 0
        current_chapter_title = "序章"  # 默认标题
        
        # 扫描段落以识别章节边界
        for i, paragraph in enumerate(paragraphs):
            paragraph = paragraph.strip()
            
            # 检查当前段落是否可能是新的章节开始
            if self._is_new_chapter_start(paragraph, i, paragraphs):
                # 完成上一个章节
                if current_chapter_start < i:
                    chapter_content = '\n\n'.join(
                        paragraphs[current_chapter_start:i]
                    ).strip()
                    
                    if chapter_content:
                        chapter = Chapter(
                            title=current_chapter_title,
                            content=chapter_content,
                            start_position=text.find(paragraphs[current_chapter_start]),
                            end_position=text.find(paragraphs[i-1]) + len(paragraphs[i-1])
                        )
                        chapters.append(chapter)
                
                # 开始新章节
                current_chapter_start = i
                current_chapter_title = paragraph if len(paragraph) < 50 else f"章节 {len(chapters) + 1}"
        
        # 添加最后一个章节
        if current_chapter_start < len(paragraphs):
            chapter_content = '\n\n'.join(
                paragraphs[current_chapter_start:]
            ).strip()
            
            if chapter_content:
                # 找到内容在原文中的位置
                content_start_pos = text.find(paragraphs[current_chapter_start])
                content_end_pos = text.rfind(paragraphs[-1]) + len(paragraphs[-1])
                
                chapter = Chapter(
                    title=current_chapter_title,
                    content=chapter_content,
                    start_position=content_start_pos,
                    end_position=content_end_pos
                )
                chapters.append(chapter)
        
        return chapters
    
    def _is_new_chapter_start(self, paragraph: str, index: int, paragraphs: List[str]) -> bool:
        """
        判断段落是否是新的章节开始
        """
        if not paragraph:
            return False
        
        # 检查是否匹配章节模式
        if self._is_potential_chapter_title(paragraph):
            return True
        
        # 检查段落的相对位置和长度特征
        # 如果是第一个段落，可能是序章
        if index == 0:
            return len(paragraph) < 50  # 短标题可能是章节名
        
        # 检查段落长度：短段落更可能是章节标题
        if 10 < len(paragraph) < 50:
            # 检查段落内容是否包含标题特征
            first_words = paragraph.split()[:3]
            if any(word.istitle() or re.match(r'第\d+', word) for word in first_words):
                return True
        
        return False
    
    def _post_process_chapters(self, chapters: List[Chapter], text: str) -> List[Chapter]:
        """
        对检测到的章节进行后处理，提升质量
        """
        if len(chapters) <= 1:
            return chapters
        
        processed_chapters = []
        i = 0
        
        while i < len(chapters):
            current_chapter = chapters[i]
            
            # 检查当前章节是否过短（可能是标题段落）
            if len(current_chapter.content.strip()) < 10 and i + 1 < len(chapters):
                # 合并到下一章节
                next_chapter = chapters[i + 1]
                merged_content = (current_chapter.content + '\n\n' + next_chapter.content).strip()
                merged_chapter = Chapter(
                    title=current_chapter.title,
                    content=merged_content,
                    start_position=current_chapter.start_position,
                    end_position=next_chapter.end_position,
                    index=current_chapter.index
                )
                processed_chapters.append(merged_chapter)
                i += 2
            else:
                processed_chapters.append(current_chapter)
                i += 1
        
        return processed_chapters


def create_chapter_detector(detector_type: str = 'regex') -> ChapterDetector:
    """
    工厂函数，创建章节检测器实例
    
    Args:
        detector_type: 检测器类型
        
    Returns:
        章节检测器实例
    """
    if detector_type == 'ml':
        return MLBasedChapterDetector()
    elif detector_type == 'enhanced':
        return EnhancedChapterDetector()
    else:
        return RegexBasedChapterDetector()