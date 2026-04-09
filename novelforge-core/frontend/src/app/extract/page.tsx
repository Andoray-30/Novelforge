'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { extractService } from '@/lib/api';
import { useAppStore } from '@/lib/hooks/use-app-store';
import { useSessions } from '@/lib/hooks/use-sessions';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2, Link2, Clock, Globe2, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { OpenAIConfig } from '@/types';

const OPENAI_CONFIG_STORAGE_KEY = 'novelforge-openai-config';

export default function ExtractPage() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'extracting' | 'success' | 'error'>('idle');
  const [openAIConfig, setOpenAIConfig] = useState<OpenAIConfig | undefined>(undefined);
  
  const { currentSessionId } = useSessions();
  
  // 接入全局状态
  const setCharacters = useAppStore(state => state.setCharacters);
  const setWorldSetting = useAppStore(state => state.setWorldSetting);
  const setTimeline = useAppStore(state => state.setTimeline);
  
  // 初始化加载配置
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(OPENAI_CONFIG_STORAGE_KEY);
      if (raw) {
        try {
          setOpenAIConfig(JSON.parse(raw));
        } catch (e) {
          console.error('Failed to parse openai config', e);
        }
      }
    }
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processFile = async (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.txt')) {
      setStatus('error');
      return;
    }
    
    setFile(selectedFile);
    setStatus('uploading');
    
    // 模拟一段上传进度
    for(let i=0; i<30; i+=10) {
      setProgress(i);
      await new Promise(r => setTimeout(r, 100));
    }
    
    setStatus('extracting');
    
    try {
      // 传递自定义配置和会话 ID
      const result = await extractService.extractFromFile(selectedFile, openAIConfig, currentSessionId || undefined);
      
      setProgress(100);
      setStatus('success');
      
      // 更新全局状态，让其他组件(如角色卡)可以消费
      if (result.characters) setCharacters(result.characters);
      if (result.world) setWorldSetting(result.world);
      if (result.timeline && result.timeline.events) setTimeline(result.timeline.events);

    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-8 flex flex-col items-center">
      {/* 头部标题区 */}
      <div className="max-w-4xl w-full mb-12 text-center mt-10">
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent mb-4">
          智能文本提取引擎
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
          上传你的小说文本，让 AI 引擎自动感知并剥离出人物、世界观设定、人物关系网与核心时间轴，重塑创作视野。
        </p>
      </div>

      {/* 主工作区 (具备玻璃拟物感 Glassmorphism) */}
      <div className="relative max-w-3xl w-full">
        {/* 背景光晕装饰 */}
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-emerald-600 rounded-3xl blur opacity-25 animate-pulse" />
        
        <div className="relative bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-10 shadow-2xl overflow-hidden transition-all duration-500">
          
          {status === 'idle' || status === 'error' ? (
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                border-2 border-dashed rounded-2xl flex flex-col items-center justify-center py-20 px-6 transition-all duration-300
                ${isDragging ? 'border-blue-500 bg-blue-500/10 scale-[1.02]' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'}
                ${status === 'error' ? 'border-red-500/50 bg-red-500/5' : ''}
              `}
            >
              <div className="h-20 w-20 rounded-full bg-slate-800 flex items-center justify-center mb-6 shadow-inner">
                <UploadCloud className={`h-10 w-10 ${isDragging ? 'text-blue-400' : 'text-slate-400'}`} />
              </div>
              <h3 className="text-xl font-semibold mb-2">拖拽小说文本 (.txt) 到此处</h3>
              <p className="text-slate-500 mb-8 text-center max-w-sm">
                支持各类中文网文小说格式，智能切分章节、去除杂质
              </p>
              
              <label className="relative inline-flex items-center justify-center px-8 py-3 font-medium text-white bg-blue-600 rounded-full cursor-pointer hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20 group">
                <input type="file" className="hidden" accept=".txt" onChange={handleFileChange} />
                <span>浏览本地文件</span>
                <div className="absolute inset-0 rounded-full ring-2 ring-white/20 group-hover:ring-white/40 transition-all opacity-0 group-hover:opacity-100 scale-105" />
              </label>

              {status === 'error' && (
                <div className="mt-6 flex items-center text-red-400 bg-red-400/10 px-4 py-2 rounded-full text-sm">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  提取过程发生错误，请检查文本格式或网络连接后重试。
                </div>
              )}
            </div>
          ) : (
            
            /* 进度态与完成态展示区 */
            <div className="py-12 px-6 flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
              
              <div className="relative w-32 h-32 mb-8">
                {/* 环形进度/光环基础 */}
                <svg className="w-full h-full transform -rotate-90">
                  <circle className="text-slate-800" strokeWidth="6" stroke="currentColor" fill="transparent" r="58" cx="64" cy="64" />
                  <circle 
                    className={`transition-all duration-1000 ease-out ${status === 'success' ? 'text-emerald-500' : 'text-blue-500'}`}
                    strokeWidth="6" 
                    strokeDasharray={364} 
                    strokeDashoffset={364 - (progress / 100) * 364}
                    strokeLinecap="round" 
                    stroke="currentColor" 
                    fill="transparent" 
                    r="58" cx="64" cy="64" 
                  />
                </svg>
                
                {/* 中心图标 */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {status === 'success' ? (
                    <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-in zoom-in duration-300" />
                  ) : (
                    <FileText className={`w-10 h-10 ${status === 'extracting' ? 'text-blue-400 animate-pulse' : 'text-slate-400'}`} />
                  )}
                </div>
              </div>

              <h3 className="text-2xl font-bold mb-3">
                {status === 'uploading' && '正在上传文档...'}
                {status === 'extracting' && 'AI 提取引擎处理中...'}
                {status === 'success' && '提取完成！'}
              </h3>
              
              <p className="text-slate-400 text-center mb-10 max-w-md">
                {status === 'extracting' && '系统正在进行并发多线程语义分析，解析数百名潜在角色及复杂世界设定，这可能需要大约 1~3 分钟，请勿关闭页面。'}
                {status === 'success' && '已成功从文本中分离结构化数据，你可以前往角色库查看详情，或将其一键导出为 SillyTavern 格式。'}
              </p>

              {status === 'extracting' && (
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mb-4">
                  <div className="bg-blue-500 h-2 rounded-full relative overflow-hidden w-full">
                    <div className="absolute top-0 bottom-0 left-0 right-0 bg-white/20 h-full w-full animate-[shimmer_2s_infinite]" />
                  </div>
                </div>
              )}

              {status === 'success' && (
                <div className="flex gap-4 animate-in slide-in-from-bottom-4 duration-500">
                  <button
                    onClick={() => router.push('/characters')}
                    className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-full font-medium transition-colors flex items-center"
                  >
                    <Users className="w-4 h-4 mr-2" /> 查看角色库
                  </button>
                  <button
                    onClick={() => router.push('/world')}
                    className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-full font-medium transition-colors shadow-lg shadow-emerald-500/20"
                  >
                    进入世界观配置
                  </button>
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* 底部功能特性说明牌 */}
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 text-slate-400">
         <div className="bg-slate-900/30 p-6 rounded-2xl border border-slate-800/60 backdrop-blur-sm">
           <Users className="w-8 h-8 text-blue-400 mb-4" />
           <h4 className="text-white font-medium text-lg mb-2">深度角色感知</h4>
           <p className="text-sm">支持复杂语境下的名字代指消解，提炼角色外貌、性格及成长弧光。</p>
         </div>
         <div className="bg-slate-900/30 p-6 rounded-2xl border border-slate-800/60 backdrop-blur-sm">
           <Link2 className="w-8 h-8 text-violet-400 mb-4" />
           <h4 className="text-white font-medium text-lg mb-2">流体关系网络</h4>
           <p className="text-sm">绘制全景人物关系图谱，揭示潜藏在对话和行动背后的羁绊与冲突。</p>
         </div>
         <div className="bg-slate-900/30 p-6 rounded-2xl border border-slate-800/60 backdrop-blur-sm">
           <Clock className="w-8 h-8 text-emerald-400 mb-4" />
           <h4 className="text-white font-medium text-lg mb-2">事件编年史</h4>
           <p className="text-sm">跨越倒叙与插叙，还原真实的时间轴，构建结构严谨的背景历史。</p>
         </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}} />
    </div>
  );
}
