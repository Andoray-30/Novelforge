import React, { useState, useRef } from 'react';
import { X, UploadCloud, FileText, Loader2, Check } from 'lucide-react';
import { textProcessingService, contentService } from '../lib/api/novelforge-api';
import { useAppStore } from '../lib/hooks/use-app-store';

interface ImportTextModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
  currentSessionId: string;
  openAIConfig?: any; // 新增 prop
}

export default function ImportTextModal({ isOpen, onClose, onSuccess, currentSessionId, openAIConfig }: ImportTextModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const [options, setOptions] = useState({
    remove_extra_whitespace: true,
    normalize_paragraphs: true,
    detect_chapters: true,
    extract_metadata: true,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [statusMessage, setStatusMessage] = useState('');

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setError(null);
    setStatusMessage('准备开始上传...');

    try {
      // 1. 提交异步任务，传入从父组件直接获取的准确模型配置
      const res = await textProcessingService.uploadAndProcess(file, {
        ...options,
        session_id: currentSessionId
      }, openAIConfig);

      if (!res.success || !res.task_id) {
        throw new Error(res.message || '任务提交失败');
      }

      // 2. 将任务添加到全局 Store，TaskCenter 会自动开始轮询
      useAppStore.getState().addTask({
        id: res.task_id,
        type: 'novel_import',
        status: 'PENDING',
        progress: 0,
        message: '分析任务已提交，正在后台处理中...'
      });

      // 3. 提交成功后即可关闭模态框，用户在右下角查看进度
      setIsUploading(false);
      setFile(null);
      onClose();
      
    } catch (err: any) {
      console.error('导入提交失败:', err);
      setError(err.message || '导入任务提交过程出现错误');
      setIsUploading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
      backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div style={{
        background: 'var(--bg-surface)', padding: 32, borderRadius: 24,
        width: 500, maxWidth: '90%', boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
        position: 'relative'
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 20, right: 20, background: 'none', border: 'none',
          color: 'var(--text-muted)', cursor: 'pointer', padding: 8, borderRadius: '50%'
        }}>
          <X size={20} />
        </button>

        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>导入现有小说文本</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24 }}>
          支持 .txt, .epub, .pdf, .docx 格式，AI 将自动切分章节并归入当前项目档案。
        </p>

        {/* 拖拽上传区 */}
        <div 
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${file ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
            borderRadius: 16, padding: '40px 20px', textAlign: 'center',
            cursor: 'pointer', transition: 'all 0.2s', backgroundColor: file ? 'rgba(99, 102, 241, 0.05)' : 'var(--bg-base)',
            marginBottom: 24
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
              <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                <FileText size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{file.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
               <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <UploadCloud size={24} />
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>点击或拖拽文件到这里上传</div>
            </div>
          )}
        </div>

        {/* 选项区 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={options.detect_chapters} onChange={e => setOptions({...options, detect_chapters: e.target.checked})} style={{ width: 16, height: 16 }} />
            自动检测并切分章节
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={options.extract_metadata} onChange={e => setOptions({...options, extract_metadata: e.target.checked})} style={{ width: 16, height: 16 }} />
            提取书籍元信息 (标题, 作者等)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={options.normalize_paragraphs} onChange={e => setOptions({...options, normalize_paragraphs: e.target.checked})} style={{ width: 16, height: 16 }} />
            自动规范排版缩进
          </label>
        </div>

        {error && (
          <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 16, padding: '8px 12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 8 }}>
            {error}
          </div>
        )}

        {/* 进度显示 */}
        {isUploading && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              <span>{statusMessage || '正在处理...'}</span>
              <span>{progress}%</span>
            </div>
            <div style={{ width: '100%', height: 6, backgroundColor: 'var(--bg-base)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ 
                width: `${progress}%`, height: '100%', 
                backgroundColor: 'var(--accent-primary)', 
                boxShadow: '0 0 10px var(--accent-primary)',
                transition: 'width 0.3s ease' 
              }} />
            </div>
          </div>
        )}

        <button 
          onClick={handleUpload}
          disabled={!file || isUploading}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
            background: file && !isUploading ? 'var(--accent-primary)' : 'var(--bg-base)',
            color: file && !isUploading ? '#fff' : 'var(--text-muted)',
            fontWeight: 600, fontSize: 15, cursor: file && !isUploading ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s'
          }}
        >
          {isUploading ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
          {isUploading ? '正在导入...' : '开始导入'}
        </button>

      </div>
    </div>
  );
}
