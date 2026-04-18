import React, { useRef, useState } from 'react';
import { FileText, Loader2, UploadCloud, X } from 'lucide-react';
import { textProcessingService } from '../lib/api/novelforge-api';
import { useAppStore } from '../lib/hooks/use-app-store';
import { useSessions } from '../lib/hooks/use-sessions';
import type { OpenAIConfig } from '../types';

interface ImportTextModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitted?: (payload: { taskId: string; sessionId: string; fileName: string }) => void;
  currentSessionId?: string | null;
  openAIConfig?: OpenAIConfig;
}

const SUPPORTED_EXTENSIONS = ['.txt', '.epub', '.pdf', '.docx'];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

function getFileBaseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || '未命名文本';
}

function validateImportFile(selectedFile: File): string | null {
  const lowerName = selectedFile.name.toLowerCase();
  const isSupported = SUPPORTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (!isSupported) {
    return `不支持的文件格式。仅支持 ${SUPPORTED_EXTENSIONS.join(', ')}`;
  }
  if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
    return `文件过大（>${(MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0)}MB），请先分卷后导入`;
  }
  return null;
}

export default function ImportTextModal({
  isOpen,
  onClose,
  onSubmitted,
  currentSessionId,
  openAIConfig,
}: ImportTextModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [options, setOptions] = useState({
    remove_extra_whitespace: true,
    normalize_paragraphs: true,
    detect_chapters: true,
    extract_metadata: true,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currentSessionId: activeSessionId, createSession } = useSessions();

  if (!isOpen) {
    return null;
  }

  const ensureSessionId = async (): Promise<string> => {
    const existingSessionId = currentSessionId || activeSessionId;
    if (existingSessionId) {
      return existingSessionId;
    }

    const created = await createSession(`${getFileBaseName(file?.name || '导入文本')} 导入项目`);
    return created.id;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.[0]) {
      const nextFile = event.target.files[0];
      const validationError = validateImportFile(nextFile);
      if (validationError) {
        setError(validationError);
        setFile(null);
        return;
      }
      setFile(nextFile);
      setError(null);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer.files?.[0]) {
      const nextFile = event.dataTransfer.files[0];
      const validationError = validateImportFile(nextFile);
      if (validationError) {
        setError(validationError);
        setFile(null);
        return;
      }
      setFile(nextFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      return;
    }

    setIsUploading(true);
    setError(null);
    setStatusMessage('正在提交后台导入任务...');

    try {
      const sessionId = await ensureSessionId();
      const response = await textProcessingService.uploadAndProcess(
        file,
        {
          ...options,
          session_id: sessionId,
        },
        openAIConfig
      );

      if (!response.success || !response.task_id) {
        throw new Error(response.message || '导入任务提交失败');
      }

      useAppStore.getState().addTask({
        id: response.task_id,
        type: 'novel_import',
        status: 'PENDING',
        progress: 0,
        message: '导入任务已提交，正在后台处理文件与资产写入',
        result: {
          session_id: sessionId,
          file_name: file.name,
        },
      });

      onSubmitted?.({
        taskId: response.task_id,
        sessionId,
        fileName: file.name,
      });

      setFile(null);
      setStatusMessage('');
      onClose();
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : '导入任务提交过程中出现错误';
      setError(message);
      setStatusMessage('');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          padding: 32,
          borderRadius: 24,
          width: 500,
          maxWidth: '90%',
          boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 8,
            borderRadius: '50%',
          }}
        >
          <X size={20} />
        </button>

        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>导入现有小说文本</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24 }}>
          支持 `.txt / .epub / .pdf / .docx`，文件会进入统一后台处理管道，并在任务中心持续跟踪状态。
        </p>
        {openAIConfig?.api_key ? null : (
          <div
            style={{
              marginBottom: 16,
              borderRadius: 14,
              border: '1px solid rgba(245, 158, 11, 0.35)',
              background: 'rgba(245, 158, 11, 0.08)',
              color: '#fbbf24',
              padding: '12px 14px',
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            当前未配置自定义 OpenAI Key，导入会走后端默认模型配置；若后端默认配置失效，导入任务会直接失败。
          </div>
        )}

        <div
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${file ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
            borderRadius: 16,
            padding: '40px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
            backgroundColor: file ? 'rgba(99, 102, 241, 0.05)' : 'var(--bg-base)',
            marginBottom: 24,
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".txt,.epub,.pdf,.docx"
            style={{ display: 'none' }}
          />

          {file ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(99, 102, 241, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-primary)',
                }}
              >
                <FileText size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{file.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  backgroundColor: 'var(--bg-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                <UploadCloud size={24} />
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>点击或拖拽文件到这里上传</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={options.detect_chapters}
              onChange={(event) => setOptions({ ...options, detect_chapters: event.target.checked })}
              style={{ width: 16, height: 16 }}
            />
            自动检测并拆分章节
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={options.extract_metadata}
              onChange={(event) => setOptions({ ...options, extract_metadata: event.target.checked })}
              style={{ width: 16, height: 16 }}
            />
            提取书籍元数据
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={options.normalize_paragraphs}
              onChange={(event) => setOptions({ ...options, normalize_paragraphs: event.target.checked })}
              style={{ width: 16, height: 16 }}
            />
            规范段落与排版
          </label>
        </div>

        {statusMessage && (
          <div
            style={{
              color: 'var(--text-secondary)',
              fontSize: 13,
              marginBottom: 16,
              padding: '10px 12px',
              backgroundColor: 'var(--bg-base)',
              borderRadius: 8,
            }}
          >
            {statusMessage}
          </div>
        )}

        {error && (
          <div
            style={{
              color: '#ef4444',
              fontSize: 13,
              marginBottom: 16,
              padding: '8px 12px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              borderRadius: 8,
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || isUploading}
          style={{
            width: '100%',
            padding: '14px 0',
            borderRadius: 12,
            border: 'none',
            background: file && !isUploading ? 'var(--accent-primary)' : 'var(--bg-base)',
            color: file && !isUploading ? '#fff' : 'var(--text-muted)',
            fontWeight: 600,
            fontSize: 15,
            cursor: file && !isUploading ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'all 0.2s',
          }}
        >
          {isUploading ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
          {isUploading ? '正在提交任务...' : '提交导入任务'}
        </button>
      </div>
    </div>
  );
}
