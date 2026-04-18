"""
文本处理服务层
"""
from typing import Optional, Dict, Any
from pathlib import Path
import tempfile
import os

from novelforge.types.text_processing import (
    TextProcessingConfig, ProcessedText, TextFormat, TextMetadata
)
from novelforge.content.text_preprocessor import create_text_preprocessor, TextPreprocessor
from novelforge.content.chapter_detector import create_chapter_detector, ChapterDetector
from novelforge.content.text_analyzer import create_text_analyzer, TextAnalyzer
from novelforge.core.exceptions import ProcessingError, ConfigurationError


class TextProcessingService:
    """文本处理服务主类"""
    
    def __init__(self):
        self.preprocessor: TextPreprocessor = create_text_preprocessor('advanced')
        self.chapter_detector: ChapterDetector = create_chapter_detector('enhanced')
        self.analyzer: TextAnalyzer = create_text_analyzer('novel')
        self.supported_formats = {TextFormat.TXT, TextFormat.EPUB, TextFormat.PDF, TextFormat.DOCX}
    
    def process_file(
        self, 
        file_path: str, 
        config: Optional[TextProcessingConfig] = None
    ) -> ProcessedText:
        """
        处理文本文件
        
        Args:
            file_path: 文件路径
            config: 处理配置
            
        Returns:
            处理后的文本结果
        """
        if config is None:
            config = TextProcessingConfig()
        
        # 确定文件格式
        file_ext = Path(file_path).suffix.lower().lstrip('.')
        text_format = TextFormat(file_ext) if file_ext in {f.value for f in TextFormat} else TextFormat.TXT
        
        # 读取文件内容
        text_content = self._read_file_content(file_path, text_format)
        
        # 执行文本预处理
        processed_text = self.preprocessor.preprocess(text_content, config)
        
        # 检测章节
        chapters = []
        if config.detect_chapters:
            chapters = self.chapter_detector.detect_chapters(processed_text)
        
        # 分析文本
        analysis_result = self.analyzer.analyze(processed_text)
        
        # 创建元数据
        metadata = TextMetadata(
            title=Path(file_path).stem,
            word_count=analysis_result.total_words,
            char_count=analysis_result.total_chars,
            paragraph_count=analysis_result.total_paragraphs,
            chapter_count=analysis_result.total_chapters or len(chapters),
            reading_time_minutes=analysis_result.reading_time_minutes,
            format=text_format,
            language=analysis_result.language
        )
        
        # 收集警告信息
        warnings = []
        if analysis_result.total_words == 0:
            warnings.append("文件似乎为空或不包含可识别的文本内容")
        
        return ProcessedText(
            content=processed_text,
            metadata=metadata,
            chapters=chapters,
            warnings=warnings
        )
    
    def _read_file_content(self, file_path: str, text_format: TextFormat) -> str:
        """
        根据文件格式读取文件内容
        
        Args:
            file_path: 文件路径
            text_format: 文件格式
            
        Returns:
            文件内容文本
        """
        if text_format == TextFormat.TXT:
            return self._read_txt_file(file_path)
        elif text_format == TextFormat.EPUB:
            return self._read_epub_file(file_path)
        elif text_format == TextFormat.PDF:
            return self._read_pdf_file(file_path)
        elif text_format == TextFormat.DOCX:
            return self._read_docx_file(file_path)
        else:
            # 默认按文本文件处理
            return self._read_txt_file(file_path)
    
    def _read_txt_file(self, file_path: str) -> str:
        """读取TXT文件"""
        try:
            # 尝试不同的编码格式
            encodings = ['utf-8-sig', 'utf-8', 'gb18030', 'gbk', 'gb2312', 'utf-16', 'latin-1']
            
            for encoding in encodings:
                try:
                    with open(file_path, 'r', encoding=encoding) as f:
                        content = f.read()
                    return content
                except UnicodeDecodeError:
                    continue
            
            # 如果所有编码都失败，使用错误处理
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                return f.read()
        except Exception as e:
            raise ProcessingError(
                message=f"无法读取TXT文件 {file_path}: {str(e)}",
                details={"file_path": file_path, "format": "txt"},
                context="text_file_reading"
            )
    
    def _read_epub_file(self, file_path: str) -> str:
        """读取EPUB文件"""
        try:
            import ebooklib
            from ebooklib import epub
            from bs4 import BeautifulSoup
            
            book = epub.read_epub(file_path)
            chapters = []
            
            for item in book.get_items():
                if item.get_type() == ebooklib.ITEM_DOCUMENT:
                    soup = BeautifulSoup(item.get_content(), 'html.parser')
                    text = soup.get_text()
                    if text.strip():
                        chapters.append(text.strip())
            
            return '\n\n'.join(chapters)
        except ImportError:
            raise ConfigurationError(
                message="处理EPUB文件需要安装ebooklib和beautifulsoup4库: pip install ebooklib beautifulsoup4",
                details={"required_packages": ["ebooklib", "beautifulsoup4"]},
                context="epub_dependency"
            )
        except Exception as e:
            raise ProcessingError(
                message=f"无法读取EPUB文件 {file_path}: {str(e)}",
                details={"file_path": file_path, "format": "epub"},
                context="epub_file_reading"
            )
    
    def _read_pdf_file(self, file_path: str) -> str:
        """读取PDF文件"""
        try:
            import PyPDF2
            
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                text_pages = []
                
                for page in pdf_reader.pages:
                    text_pages.append(page.extract_text())
                
                return '\n\n'.join(text_pages)
        except ImportError:
            raise ConfigurationError(
                message="处理PDF文件需要安装pypdf2库: pip install PyPDF2",
                details={"required_packages": ["PyPDF2"]},
                context="pdf_dependency"
            )
        except Exception as e:
            raise ProcessingError(
                message=f"无法读取PDF文件 {file_path}: {str(e)}",
                details={"file_path": file_path, "format": "pdf"},
                context="pdf_file_reading"
            )
    
    def _read_docx_file(self, file_path: str) -> str:
        """读取DOCX文件"""
        try:
            from docx import Document
            
            doc = Document(file_path)
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            
            return '\n\n'.join(paragraphs)
        except ImportError:
            raise ConfigurationError(
                message="处理DOCX文件需要安装python-docx库: pip install python-docx",
                details={"required_packages": ["python-docx"]},
                context="docx_dependency"
            )
        except Exception as e:
            raise ProcessingError(
                message=f"无法读取DOCX文件 {file_path}: {str(e)}",
                details={"file_path": file_path, "format": "docx"},
                context="docx_file_reading"
            )
    
    def process_text(
        self, 
        text: str, 
        config: Optional[TextProcessingConfig] = None
    ) -> ProcessedText:
        """
        直接处理文本内容
        
        Args:
            text: 待处理的文本
            config: 处理配置
            
        Returns:
            处理后的文本结果
        """
        if config is None:
            config = TextProcessingConfig()
        
        # 执行文本预处理
        processed_text = self.preprocessor.preprocess(text, config)
        
        # 检测章节
        chapters = []
        if config.detect_chapters:
            chapters = self.chapter_detector.detect_chapters(processed_text)
        
        # 分析文本
        analysis_result = self.analyzer.analyze(processed_text)
        
        # 创建元数据
        metadata = TextMetadata(
            word_count=analysis_result.total_words,
            char_count=analysis_result.total_chars,
            paragraph_count=analysis_result.total_paragraphs,
            chapter_count=analysis_result.total_chapters or len(chapters),
            reading_time_minutes=analysis_result.reading_time_minutes,
            language=analysis_result.language
        )
        
        # 收集警告信息
        warnings = []
        if not text.strip():
            warnings.append("输入文本为空")
        elif analysis_result.total_words == 0:
            warnings.append("未检测到有效的文本内容")
        
        return ProcessedText(
            content=processed_text,
            metadata=metadata,
            chapters=chapters,
            warnings=warnings
        )
    
    def validate_file(self, file_path: str, max_size: int = 50 * 1024 * 1024) -> Dict[str, Any]:
        """
        验证文件是否符合要求
        
        Args:
            file_path: 文件路径
            max_size: 最大文件大小（字节）
            
        Returns:
            验证结果字典
        """
        result = {
            'valid': True,
            'errors': [],
            'warnings': [],
            'info': {}
        }
        
        try:
            # 检查文件是否存在
            if not os.path.exists(file_path):
                result['valid'] = False
                result['errors'].append(f"文件不存在: {file_path}")
                return result
            
            # 检查文件大小
            file_size = os.path.getsize(file_path)
            result['info']['size'] = file_size
            if file_size > max_size:
                result['valid'] = False
                result['errors'].append(f"文件大小超过限制: {file_size} > {max_size}")
            
            # 检查文件格式
            file_ext = Path(file_path).suffix.lower().lstrip('.')
            text_format = TextFormat(file_ext) if file_ext in {f.value for f in TextFormat} else None
            result['info']['format'] = file_ext
            
            if not text_format or text_format not in self.supported_formats:
                result['valid'] = False
                result['errors'].append(f"不支持的文件格式: {file_ext}")
            
            # 检查是否为可读文件
            if not os.access(file_path, os.R_OK):
                result['valid'] = False
                result['errors'].append(f"无权读取文件: {file_path}")
            
        except Exception as e:
            result['valid'] = False
            result['errors'].append(f"验证文件时发生错误: {str(e)}")
        
        return result


# 创建单例服务实例
text_processing_service = TextProcessingService()
