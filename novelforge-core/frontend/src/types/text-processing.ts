/**
 * 前端文本处理相关的类型定义
 */

export enum TextFormat {
  TXT = 'txt',
  EPUB = 'epub',
  PDF = 'pdf',
  DOCX = 'docx'
}

export interface FileUploadConfig {
  max_file_size: number; // 字节数
  allowed_formats: TextFormat[];
  chunk_size: number;
}

export interface TextProcessingConfig {
  remove_extra_whitespace: boolean;
  normalize_paragraphs: boolean;
  detect_chapters: boolean;
  extract_metadata: boolean;
  remove_headers_footers: boolean;
  preserve_line_breaks: boolean;
}

export interface Chapter {
  title: string;
  content: string;
  start_position: number;
  end_position: number;
  index: number;
  metadata: Record<string, any>;
}

export interface TextMetadata {
  title?: string;
  author?: string;
  language?: string;
  word_count: number;
  char_count: number;
  paragraph_count: number;
  chapter_count: number;
  reading_time_minutes: number;
  format?: TextFormat;
  created_at?: string;
  updated_at?: string;
  tags: string[];
}

export interface ProcessedText {
  content: string;
  metadata: TextMetadata;
  chapters: Chapter[];
  warnings: string[];
}

export interface TextAnalysisResult {
  total_chars: number;
  total_words: number;
  total_paragraphs: number;
  total_chapters: number;
  avg_paragraph_length: number;
  avg_sentence_length: number;
  reading_time_minutes: number;
  readability_score?: number;
  language?: string;
  unique_words: number;
  density: Record<string, number>; // 词频分布
}