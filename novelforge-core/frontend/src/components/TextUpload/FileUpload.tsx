import React, { useState, useRef, ChangeEvent, DragEvent } from 'react';
import { TextFormat } from '../../types/text-processing';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  supportedFormats?: TextFormat[];
  maxFileSize?: number;
  className?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({
  onFileUpload,
  supportedFormats = [TextFormat.TXT, TextFormat.EPUB, TextFormat.PDF],
  maxFileSize = 50 * 1024 * 1024, // 50MB
  className = ''
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatExtensions: Record<TextFormat, string[]> = {
    [TextFormat.TXT]: ['.txt'],
    [TextFormat.EPUB]: ['.epub'],
    [TextFormat.PDF]: ['.pdf'],
    [TextFormat.DOCX]: ['.docx']
  };

  const supportedExtensions = supportedFormats.flatMap(format => formatExtensions[format]);
  const supportedFormatsString = supportedFormats.map(f => f.toUpperCase()).join(', ');
  const supportedExtensionsString = supportedExtensions.join(',');

  const validateFile = (file: File): boolean => {
    // 检查文件大小
    if (file.size > maxFileSize) {
      setError(`文件大小超过限制: ${(maxFileSize / (1024 * 1024)).toFixed(2)}MB`);
      return false;
    }

    // 检查文件格式
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!supportedExtensions.includes(fileExtension)) {
      setError(`不支持的文件格式: ${file.type || fileExtension}. 支持的格式: ${supportedExtensionsString}`);
      return false;
    }

    setError(null);
    return true;
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (validateFile(file)) {
      setIsUploading(true);
      setError(null);
      
      // 模拟上传处理，实际应用中这里会调用API
      setTimeout(() => {
        onFileUpload(file);
        setIsUploading(false);
      }, 500); // 模拟API调用
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const triggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors
        ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
        ${className}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept={supportedExtensionsString}
        className="hidden"
      />
      
      <div className="flex flex-col items-center justify-center">
        <div className="mb-4">
          <svg
            className="w-12 h-12 mx-auto text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>
        
        <p className="text-lg font-medium text-gray-700 mb-1">
          {isDragging ? '释放以上传' : '拖拽文件到此处或点击上传'}
        </p>
        
        <p className="text-sm text-gray-500 mb-4">
          支持格式: {supportedFormatsString} (最大 {(maxFileSize / (1024 * 1024)).toFixed(0)}MB)
        </p>
        
        <button
          type="button"
          onClick={triggerFileSelect}
          disabled={isUploading}
          className={`px-4 py-2 rounded-md font-medium transition-colors
            ${isUploading
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
        >
          {isUploading ? '上传中...' : '选择文件'}
        </button>
        
        {error && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload;