"""
文本处理相关类型定义
"""
from typing import List, Dict, Optional, NamedTuple, Any
from dataclasses import dataclass
from enum import Enum


class TextFormat(Enum):
    """文本格式枚举"""
    TXT = "txt"
    EPUB = "epub"
    PDF = "pdf"
    DOCX = "docx"


@dataclass
class FileUploadConfig:
    """文件上传配置"""
    max_file_size: int = 50 * 1024 * 1024  # 50MB
    allowed_formats: List[TextFormat] = None
    chunk_size: int = 8192
    
    def __post_init__(self):
        if self.allowed_formats is None:
            self.allowed_formats = [TextFormat.TXT, TextFormat.EPUB, TextFormat.PDF]


@dataclass
class TextProcessingConfig:
    """文本处理配置"""
    remove_extra_whitespace: bool = True
    normalize_paragraphs: bool = True
    detect_chapters: bool = True
    extract_metadata: bool = True
    remove_headers_footers: bool = True
    preserve_line_breaks: bool = False


@dataclass
class Chapter:
    """章节信息"""
    title: str
    content: str
    start_position: int
    end_position: int
    index: int = 0
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


@dataclass
class TextMetadata:
    """文本元数据"""
    title: Optional[str] = None
    author: Optional[str] = None
    language: Optional[str] = None
    word_count: int = 0
    char_count: int = 0
    paragraph_count: int = 0
    chapter_count: int = 0
    reading_time_minutes: int = 0
    format: Optional[TextFormat] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    tags: List[str] = None
    
    def __post_init__(self):
        if self.tags is None:
            self.tags = []


@dataclass
class ProcessedText:
    """处理后的文本结果"""
    content: str
    metadata: TextMetadata
    chapters: List[Chapter]
    warnings: List[str] = None
    
    def __post_init__(self):
        if self.warnings is None:
            self.warnings = []


@dataclass
class TextAnalysisResult:
    """文本分析结果"""
    total_chars: int
    total_words: int
    total_paragraphs: int
    total_chapters: int
    avg_paragraph_length: float
    avg_sentence_length: float
    reading_time_minutes: int
    readability_score: Optional[float] = None
    language: Optional[str] = None
    unique_words: int = 0
    density: Dict[str, float] = None  # 词频分布
    
    def __post_init__(self):
        if self.density is None:
            self.density = {}


class TextPreprocessor:
    """文本预处理器抽象基类"""
    
    def preprocess(self, text: str, config: TextProcessingConfig) -> str:
        """预处理文本"""
        raise NotImplementedError


class ChapterDetector:
    """章节检测器抽象基类"""
    
    def detect_chapters(self, text: str) -> List[Chapter]:
        """检测章节"""
        raise NotImplementedError


class TextAnalyzer:
    """文本分析器抽象基类"""
    
    def analyze(self, text: str) -> TextAnalysisResult:
        """分析文本"""
        raise NotImplementedError