import React, { useState, useCallback } from 'react';
import FileUpload from './FileUpload';
import { TextFormat, ProcessedText, TextAnalysisResult } from '../../types/text-processing';

interface TextProcessorProps {
  onTextProcessed: (result: ProcessedText) => void;
  onTextAnalyzed: (analysis: TextAnalysisResult) => void;
}

const TextProcessor: React.FC<TextProcessorProps> = ({ onTextProcessed, onTextAnalyzed }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number; type: string } | null>(null);
  
  const processTextFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setError(null);
    setProgress(10);

    try {
      // 模拟文件读取
      const textContent = await readFileAsText(file);
      setProgress(30);

      // 模拟文本预处理
      const processedText = await simulateTextProcessing(textContent);
      setProgress(70);

      // 模拟文本分析
      const analysisResult = await simulateTextAnalysis(textContent);
      setProgress(90);

      // 更新进度
      onTextProcessed(processedText);
      onTextAnalyzed(analysisResult);
      
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : '处理文件时发生错误');
    } finally {
      setIsProcessing(false);
    }
  }, [onTextAnalyzed, onTextProcessed]);

  const handleFileUpload = useCallback((file: File) => {
    setFileInfo({
      name: file.name,
      size: file.size,
      type: file.type
    });
    processTextFile(file);
  }, [processTextFile]);

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        resolve(content);
      };
      reader.onerror = () => {
        reject(new Error('无法读取文件'));
      };
      reader.readAsText(file);
    });
  };

  const simulateTextProcessing = (text: string): Promise<ProcessedText> => {
    // 模拟文本预处理
    return new Promise((resolve) => {
      setTimeout(() => {
        // 这里应该是实际的文本处理逻辑
        // 模拟处理结果
        const processed: ProcessedText = {
          content: text, // 实际应用中这里会是处理后的文本
          metadata: {
            title: '处理后的文本',
            author: '未知',
            language: 'zh',
            word_count: text.split(/\s+/).length,
            char_count: text.length,
            paragraph_count: text.split('\n\n').length,
            chapter_count: 0,
            reading_time_minutes: Math.ceil(text.split(/\s+/).length / 200),
            format: TextFormat.TXT,
            tags: ['processed'],
          },
          chapters: [], // 实际应用中这里会有章节信息
          warnings: []
        };
        resolve(processed);
      }, 1000);
    });
  };

  const simulateTextAnalysis = (text: string): Promise<TextAnalysisResult> => {
    // 模拟文本分析
    return new Promise((resolve) => {
      setTimeout(() => {
        // 计算文本分析结果
        const words = text.split(/\s+/).filter(w => w.length > 0);
        const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0);
        const sentences = text.split(/[.!?。！？]/).filter(s => s.length > 0);
        
        const analysis: TextAnalysisResult = {
          total_chars: text.length,
          total_words: words.length,
          total_paragraphs: paragraphs.length,
          total_chapters: 0,
          avg_paragraph_length: paragraphs.length > 0 ? 
            paragraphs.reduce((acc, p) => acc + p.length, 0) / paragraphs.length : 0,
          avg_sentence_length: sentences.length > 0 ? 
            words.length / sentences.length : 0,
          reading_time_minutes: Math.ceil(words.length / 200),
          readability_score: 60, // 模拟值
          language: 'zh',
          unique_words: new Set(words.map(w => w.toLowerCase())).size,
          density: {} // 词频分布，实际应用中会计算
        };
        
        resolve(analysis);
      }, 500);
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">文本处理与导入</h2>
        <p className="text-gray-600">
          支持多种格式的文件上传，自动进行文本预处理、章节识别和文本分析
        </p>
      </div>

      <div className="mb-6">
        <FileUpload 
          onFileUpload={handleFileUpload}
          supportedFormats={[TextFormat.TXT, TextFormat.EPUB, TextFormat.PDF, TextFormat.DOCX]}
          maxFileSize={50 * 1024 * 1024} // 50MB
        />
      </div>

      {fileInfo && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium text-gray-800 mb-2">文件信息</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-600">文件名:</span>
              <p className="font-medium">{fileInfo.name}</p>
            </div>
            <div>
              <span className="text-gray-600">大小:</span>
              <p className="font-medium">{(fileInfo.size / 1024).toFixed(2)} KB</p>
            </div>
            <div>
              <span className="text-gray-600">类型:</span>
              <p className="font-medium">{fileInfo.type || '未知'}</p>
            </div>
          </div>
        </div>
      )}

      {(isProcessing || isAnalyzing) && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700">
              {isProcessing ? '正在处理文件...' : '正在分析文本...'}
            </span>
            <span className="text-sm font-medium text-blue-700">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg">
          <h3 className="font-medium mb-1">处理错误</h3>
          <p>{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">处理选项</h3>
          <div className="space-y-4">
            <div className="flex items-center">
              <input 
                type="checkbox" 
                id="removeWhitespace" 
                defaultChecked 
                className="h-4 w-4 text-blue-600 rounded"
              />
              <label htmlFor="removeWhitespace" className="ml-2 text-gray-700">
                清理多余空白字符
              </label>
            </div>
            <div className="flex items-center">
              <input 
                type="checkbox" 
                id="normalizeParagraphs" 
                defaultChecked 
                className="h-4 w-4 text-blue-600 rounded"
              />
              <label htmlFor="normalizeParagraphs" className="ml-2 text-gray-700">
                标准化段落格式
              </label>
            </div>
            <div className="flex items-center">
              <input 
                type="checkbox" 
                id="detectChapters" 
                defaultChecked 
                className="h-4 w-4 text-blue-600 rounded"
              />
              <label htmlFor="detectChapters" className="ml-2 text-gray-700">
                自动识别章节
              </label>
            </div>
            <div className="flex items-center">
              <input 
                type="checkbox" 
                id="extractMetadata" 
                defaultChecked 
                className="h-4 w-4 text-blue-600 rounded"
              />
              <label htmlFor="extractMetadata" className="ml-2 text-gray-700">
                提取文本元数据
              </label>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">文本分析</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">字数:</span>
              <span className="font-medium">-</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">段落数:</span>
              <span className="font-medium">-</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">章节:</span>
              <span className="font-medium">-</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">预估阅读时间:</span>
              <span className="font-medium">-</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">语言:</span>
              <span className="font-medium">-</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TextProcessor;
