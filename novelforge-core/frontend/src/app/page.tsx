'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { MessageList, Message } from '@/components/chat/MessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { ArtifactPanel } from '@/components/chat/ArtifactPanel';
import { OpenAIConfigPanel } from '@/components/chat/OpenAIConfigPanel';
import { LandingPage } from '@/components/landing/LandingPage';
import ImportTextModal from '../components/ImportTextModal';
import { WorldTree } from '@/components/dashboard/WorldTree';
import {
  Loader2, CheckCircle2, AlertCircle,
  LayoutDashboard, MessageSquare, User, Globe, FileText, Download,
  Plus, Edit3, GitBranch, SlidersHorizontal, RefreshCw
} from 'lucide-react';
import { chatService, contentService } from '@/lib/api';
import { parseAIResponse, parseMultipleAIArtifacts, extractCleanText, ParsedArtifact } from '@/lib/chat-parser';
import { useSessions } from '@/lib/hooks/use-sessions';
import { useAppStore } from '@/lib/hooks/use-app-store';
import { TaskCenter } from '@/components/layout/TaskCenter';
import type { OpenAIConfig } from '@/types';

const OPENAI_CONFIG_STORAGE_KEY = 'novelforge-openai-config';

// 用于 Artifact 面板的数据格式
interface ArtifactData {
  type: 'character_card' | 'world_setting' | 'timeline' | 'relationship' | 'outline' | 'chapter';
  title: string;
  data: Record<string, unknown>;
  /** 工具调用原始信息，保存时使用 */
  toolCall?: import('@/lib/chat-parser').ToolCall;
}

export default function ChatPage() {
  // 使用 null 作为初始值，表示正在检查登录状态
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  
  // 在客户端挂载后从 localStorage 读取登录状态
  useEffect(() => {
    try {
      const loggedIn = localStorage.getItem('novelforge-logged-in') === 'true';
      setIsLoggedIn(loggedIn);
    } catch {
      setIsLoggedIn(false);
    }
  }, []);

  const {
    sessions, currentSessionId, isLoading: isSessionsLoading, error: sessionsError,
    createNewSession, selectSession, deleteSession, updateSessionPreview, loadSessions
  } = useSessions();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [artifactPanelVisible, setArtifactPanelVisible] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingChapter, setIsGeneratingChapter] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isOpenAIConfigOpen, setIsOpenAIConfigOpen] = useState(false);
  const [openAIConfig, setOpenAIConfig] = useState<OpenAIConfig>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(OPENAI_CONFIG_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setOpenAIConfig(normalizeOpenAIConfig(parsed));
    } catch {
      setOpenAIConfig({});
    }
  }, []);

  const [viewMode, setViewMode] = useState<'chat' | 'dashboard'>('chat');
  const [dashboardType, setDashboardType] = useState<'list' | 'tree'>('list');
  const [topologyData, setTopologyData] = useState<{ nodes: any[], edges: any[] }>({ nodes: [], edges: [] });
  const [projectAssets, setProjectAssets] = useState<{
    characters: any[];
    worlds: any[];
    chapters: any[];
    outlines: any[];
  }>({ characters: [], worlds: [], chapters: [], outlines: [] });
  const [isRefreshingAssets, setIsRefreshingAssets] = useState(false);

  const [activeArtifacts, setActiveArtifacts] = useState<ArtifactData[]>([]);
  const [saveNotification, setSaveNotification] = useState<string | null>(null);
  const [messagesMap, setMessagesMap] = useState<Map<string, Message[]>>(new Map());

  const { addCharacter } = useAppStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentMessages = currentSessionId
    ? (messagesMap.get(currentSessionId) ?? [
        {
          id: 'msg-sys-init',
          role: 'assistant' as const,
          content: '欢迎来到 NovelForge Agent。我是你的专属小说设计 Agent，可以一起梳理大纲、设定人物、甚至生成章节。**请问我们今天构思点什么？**',
          timestamp: new Date(),
        }
      ])
    : [];

  // 处理会话切换：重置所有局部状态防止抽搐
  const handleSelectSession = useCallback((id: string) => {
    if (id === currentSessionId) return;
    setTopologyData({ nodes: [], edges: [] });
    setProjectAssets({ characters: [], worlds: [], chapters: [], outlines: [] });
    selectSession(id);
  }, [currentSessionId, selectSession]);

  // ============================================================
  // 历史消息拉取
  // ============================================================
  useEffect(() => {
    const fetchHistory = async () => {
      if (!currentSessionId || !isLoggedIn) return;
      const existing = messagesMap.get(currentSessionId);
      if (existing && existing.length > 1) return;

      setIsGenerating(true);
      try {
        const history = await chatService.getConversation(currentSessionId);
        if (history && history.messages) {
          const formatted = history.messages.map(m => ({
            id: m.id || `hist-${Math.random()}`,
            role: m.role as any,
            content: extractCleanText(m.content),
            timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
          }));
          setMessagesMap(prev => {
            const next = new Map(prev);
            if (formatted.length > 0) next.set(currentSessionId, formatted);
            return next;
          });
        }
      } catch (err) {
        console.error('拉取历史失败:', err);
      } finally {
        setIsGenerating(false);
      }
    };
    fetchHistory();
  }, [currentSessionId, isLoggedIn]);

  // ============================================================
  // 仪表盘资产管理
  // ============================================================
  const refreshProjectAssets = useCallback(async () => {
    if (!currentSessionId) return;
    setIsRefreshingAssets(true);
    try {
      const searchPromise = contentService.search({ tags: [`project-${currentSessionId}`], session_id: currentSessionId || undefined })
        .then(res => {
          if (res && res.items) {
            setProjectAssets({
              characters: res.items.filter((i: any) => (i.metadata?.type || i.type) === 'character'),
              worlds: res.items.filter((i: any) => (i.metadata?.type || i.type) === 'world'),
              chapters: res.items.filter((i: any) => (i.metadata?.type || i.type) === 'chapter'),
              outlines: res.items.filter((i: any) => (i.metadata?.type || i.type) === 'novel' || (i.metadata?.type || i.type) === 'outline'),
            });
          }
        })
        .catch(err => console.error('搜索资产失败:', err));

      const topologyPromise = contentService.getTopology(currentSessionId)
        .then(setTopologyData)
        .catch(err => {
          console.error('获取拓扑结构失败:', err);
          setTopologyData({ nodes: [], edges: [] });
        });

      await Promise.allSettled([searchPromise, topologyPromise]);
    } catch (err) {
      console.error('刷新资产失败:', err);
    } finally {
      setIsRefreshingAssets(false);
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (viewMode === 'dashboard') {
      refreshProjectAssets();
      const interval = setInterval(() => {
        refreshProjectAssets();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [viewMode, currentSessionId, refreshProjectAssets]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages.length]);

  const handleExportProject = async () => {
    if (!currentSessionId) return;
    setIsRefreshingAssets(true);
    try {
      const allAssetIds = [
        ...projectAssets.characters.map(i => i.metadata.id),
        ...projectAssets.worlds.map(i => i.metadata.id),
        ...projectAssets.chapters.map(i => i.metadata.id),
        ...projectAssets.outlines.map(i => i.metadata.id),
      ];
      if (allAssetIds.length === 0) {
        alert('当前项目还没有任何已保存的资产可以导出。');
        return;
      }
      const blob = await contentService.export(allAssetIds, 'json');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NovelForge-Project-${currentSessionId}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      setSaveNotification('项目数据已成功打包导出');
      setTimeout(() => setSaveNotification(null), 3000);
    } catch (err) {
      console.error('导出失败:', err);
      alert('导出项目时遇到错误，请重试');
    } finally {
      setIsRefreshingAssets(false);
    }
  };

  const handleGenerateChapter = () => {
    if (!currentSessionId) return;
    setIsGeneratingChapter(true);
    const charNames = projectAssets.characters.map((c: any) => {
      try { const d = JSON.parse(c.content || '{}'); return d.name || c.metadata.title; }
      catch { return c.metadata.title; }
    }).join('、');
    const worldName = projectAssets.worlds[0]
      ? (() => { try { const d = JSON.parse(projectAssets.worlds[0].content || '{}'); return d.name || projectAssets.worlds[0].metadata.title; } catch { return projectAssets.worlds[0].metadata.title; } })()
      : '';
    const chapterNum = projectAssets.chapters.length + 1;
    const outlineHint = projectAssets.outlines[0]?.metadata?.title || '';
    let prompt = `请根据当前项目设定，创作第 ${chapterNum} 章的正文内容（约1000-1500字）。`;
    if (charNames) prompt += `主要角色：${charNames}。`;
    if (worldName) prompt += `故事背景：${worldName}。`;
    if (outlineHint) prompt += `参考大纲：${outlineHint}。`;
    prompt += `请直接写出精彩的正文，不需要任何前置说明。写完后请用 write_chapter 工具调用保存。`;
    setViewMode('chat');
    setTimeout(() => {
      handleSendMessage(prompt);
      setIsGeneratingChapter(false);
    }, 100);
  };

  const handleLogin = () => {
    setIsLoggedIn(true);
    try {
      localStorage.setItem('novelforge-logged-in', 'true');
    } catch {}
    window.scrollTo(0, 0);
  };

  const appendMessage = useCallback((sessionId: string, msg: Message) => {
    setMessagesMap(prev => {
      const next = new Map(prev);
      const existing = next.get(sessionId) ?? [{
        id: 'msg-sys-init', role: 'assistant' as const,
        content: '欢迎来到 NovelForge Agent...', timestamp: new Date(),
      }];
      next.set(sessionId, [...existing, msg]);
      return next;
    });
  }, []);

  const handleArtifactSave = useCallback(async (artifact: ParsedArtifact, updatedData?: Record<string, any>) => {
    const finalData = updatedData || artifact.data;
    const ACTION_TO_CONTENT_TYPE: Record<string, string> = {
      record_character: 'character',
      update_character: 'character',
      record_world: 'world',
      record_outline: 'novel',
      record_timeline: 'timeline',
      write_chapter: 'chapter',
    };
    const action = artifact.toolCall?.action || '';
    const contentType = ACTION_TO_CONTENT_TYPE[action] || 'character';

    if (contentType === 'character') {
      addCharacter({
        id: String(finalData.name || artifact.title),
        name: (finalData.name as string) || artifact.title,
        role: (finalData.role as string) || 'supporting',
        description: (finalData.description as string) || '',
        background: (finalData.background as string) || '',
        personality: (finalData.personality as string) || '',
        importance: (finalData.importance as any) || 'medium',
        abilities: (finalData.abilities as string[]) || [],
        tags: (finalData.tags as string[]) || [],
        relationships: (finalData.relationships as any[]) || [],
        example_messages: [],
      });
    }

    try {
      await contentService.create({
        content_type: contentType,
        title: (finalData.name as string) || (finalData.chapter_title as string) || (finalData.title as string) || artifact.title,
        content: JSON.stringify(finalData, null, 2),
        metadata: finalData,
        tags: [contentType, 'ai-generated', `project-${currentSessionId}`],
        session_id: currentSessionId || undefined,
      });
      setSaveNotification(`「${(finalData.name as string) || artifact.title}」已同步至项目档案`);
      setTimeout(() => setSaveNotification(null), 3000);
      refreshProjectAssets();
    } catch (err) {
      console.error('保存失败:', err);
    }
  }, [addCharacter, currentSessionId, refreshProjectAssets]);

  const handleApplyOpenAIConfig = useCallback((nextConfig: OpenAIConfig) => {
    const normalized = normalizeOpenAIConfig(nextConfig);
    setOpenAIConfig(normalized);
    try {
      if (Object.keys(normalized).length > 0) {
        localStorage.setItem(OPENAI_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
      } else {
        localStorage.removeItem(OPENAI_CONFIG_STORAGE_KEY);
      }
    } catch {}
  }, []);

  const handleSendMessage = async (text: string) => {
    if (!currentSessionId) return;
    appendMessage(currentSessionId, { id: `msg-${Date.now()}`, role: 'user', content: text, timestamp: new Date() });
    setIsGenerating(true);
    setArtifactPanelVisible(false);
    try {
      const reply = await chatService.sendMessage(currentSessionId, text, undefined, openAIConfig);
      const aiContent = reply.message?.content || '...';
      const artifacts = parseMultipleAIArtifacts(aiContent);
      const displayContent = artifacts.length > 0 ? (artifacts[0].cleanText || aiContent) : aiContent;
      appendMessage(currentSessionId, {
        id: reply.message?.id || `msg-agent-${Date.now()}`,
        role: 'assistant', content: displayContent, timestamp: new Date(),
      });
      if (artifacts.length > 0) {
        setActiveArtifacts(artifacts.map((a: ParsedArtifact) => ({
          type: a.type,
          title: a.title,
          data: a.data,
          toolCall: a.toolCall
        })));
        setArtifactPanelVisible(true);
      }
      updateSessionPreview(currentSessionId, displayContent, text.slice(0, 20));
    } catch (error) {
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  // 全局加载判断
  if (isLoggedIn === null) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', flexDirection: 'column', gap: 16 }}>
        <Loader2 className="animate-spin" size={32} color="var(--accent-primary)" />
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>正在初始化您的创作空间...</div>
      </div>
    );
  }

  // 错误状态兜底
  if (sessionsError) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', flexDirection: 'column', gap: 20 }}>
        <AlertCircle size={48} color="#ef4444" />
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>空间同步失败</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{sessionsError}</p>
        </div>
        <button onClick={() => loadSessions()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, background: 'var(--accent-primary)', color: '#fff', border: 'none', cursor: 'pointer' }}>
          <RefreshCw size={16} /> 立即重试
        </button>
      </div>
    );
  }
  
  if (!isLoggedIn) return <LandingPage onLogin={handleLogin} />;

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <ChatSidebar
        collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        currentSessionId={currentSessionId || ''} onSelectSession={handleSelectSession}
        onNewSession={createNewSession} onDeleteSession={deleteSession} sessions={sessions}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minWidth: 0 }}>
        <header style={{
          height: 60, padding: '0 24px', borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          zIndex: 30
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {sessions.find(s => s.id === currentSessionId)?.title || '加载中...'}
            </div>
          </div>

          <div style={{
            display: 'flex', background: 'var(--bg-elevated)', padding: 3, borderRadius: 10, border: '1px solid var(--border-subtle)'
          }}>
            <button onClick={() => setViewMode('chat')} style={toggleBtnStyle(viewMode === 'chat')}>
              <MessageSquare size={16} /> 创作聊天
            </button>
            <button onClick={() => setViewMode('dashboard')} style={toggleBtnStyle(viewMode === 'dashboard')}>
              <LayoutDashboard size={16} /> 项目仪表盘
            </button>
          </div>

          {viewMode === 'dashboard' && (
            <div style={{
              display: 'flex', background: 'var(--bg-elevated)', padding: 3, borderRadius: 10, border: '1px solid var(--border-subtle)'
            }}>
              <button onClick={() => setDashboardType('list')} style={toggleBtnStyle(dashboardType === 'list')}>
                列表
              </button>
              <button onClick={() => setDashboardType('tree')} style={toggleBtnStyle(dashboardType === 'tree')}>
                世界树
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setIsOpenAIConfigOpen(true)}
              title="配置 OpenAI API 与模型"
              style={{
                height: 36, padding: '0 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', maxWidth: 220,
              }}
            >
              <SlidersHorizontal size={16} />
              <span style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {openAIConfig.model || 'AI 配置'}
              </span>
            </button>
            <button
              onClick={handleExportProject}
              title="导出项目数据包"
              style={{
                width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border-subtle)', color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
              }}
            >
              <Download size={18} />
            </button>
          </div>
        </header>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {viewMode === 'chat' ? (
            <>
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <MessageList messages={currentMessages.filter(m => m.role !== 'system')} />
                <div ref={messagesEndRef} />
                {isGenerating && (
                  <div style={{ display: 'flex', alignItems: 'center', padding: '16px 40px', color: 'var(--text-muted)' }}>
                    <Loader2 size={18} className="animate-spin" style={{ marginRight: 10 }} />
                    <span>AI 正在思考...</span>
                  </div>
                )}
              </div>
              <div style={{ maxWidth: 800, width: '100%', margin: '0 auto' }}>
                <ChatInput
                  onSend={handleSendMessage}
                  sessionId={currentSessionId || undefined}
                  openAIConfig={openAIConfig}
                />
              </div>
            </>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', padding: '40px' }}>
              <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                <div style={{
                  padding: '24px 32px', borderRadius: 20, background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
                  marginBottom: 40, border: '1px solid rgba(255,255,255,0.05)', display: 'flex',
                  alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
                }}>
                  <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', marginBottom: 8 }}>创作工坊</h1>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                      关联资产: {projectAssets.characters.length} 角色 · {projectAssets.worlds.length} 设定 · {projectAssets.chapters.length} 章节
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      onClick={handleGenerateChapter}
                      disabled={isGeneratingChapter}
                      style={{
                        background: '#fff', color: '#4338ca', padding: '10px 20px', borderRadius: 12,
                        fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                        border: 'none', boxShadow: '0 8px 16px rgba(0,0,0,0.2)', opacity: isGeneratingChapter ? 0.6 : 1
                      }}
                    >
                      {isGeneratingChapter ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                      生成正文章节
                    </button>
                    <button
                      onClick={() => setIsImportModalOpen(true)}
                      style={{
                        background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '10px 20px', borderRadius: 12,
                        fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                        border: '1px solid rgba(255,255,255,0.2)', transition: 'background 0.2s'
                      }}
                    >
                      导入文本
                    </button>
                  </div>
                </div>

                {dashboardType === 'tree' ? (
                  <div style={{ marginBottom: 40 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                      <GitBranch size={20} color="var(--accent-primary)" />
                      <h3 style={{ fontSize: 18, fontWeight: 600 }}>世界树拓扑 (Visualization Core)</h3>
                    </div>
                    <WorldTree 
                      key={currentSessionId} // 关键修复：强制重置世界树实例
                      sessionId={currentSessionId || ''} 
                      topology={topologyData} 
                      onNodeDelete={async (nodeId) => {
                        try {
                          await contentService.deleteContentItem(nodeId);
                          refreshProjectAssets();
                        } catch (err) {
                          console.error('Failed to delete node:', err);
                        }
                      }}
                      onNodeClick={async (node: any) => {
                        const detail = await contentService.getById(node.id);
                        if (detail) {
                          let parsedData: any = {};
                          try { parsedData = JSON.parse(detail.content || '{}'); } catch { parsedData = detail.extracted_data || {}; }
                          setActiveArtifacts([{ 
                            type: detail.metadata.type === 'novel' ? 'outline' : detail.metadata.type, 
                            title: detail.metadata.title, 
                            data: parsedData 
                          } as any]);
                          setArtifactPanelVisible(true);
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 40 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        <FileText size={20} color="var(--accent-primary)" />
                        <h3 style={{ fontSize: 18, fontWeight: 600 }}>小说正文 (Manuscript)</h3>
                      </div>
                      {projectAssets.chapters.length === 0 ? (
                        <div style={{ padding: 40, border: '1px dashed var(--border-subtle)', borderRadius: 16, textAlign: 'center', color: 'var(--text-muted)' }}>
                          <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
                          <div style={{ marginBottom: 8, fontWeight: 600 }}>正文章节尚未生成</div>
                          <div style={{ fontSize: 13, color: 'var(--text-disabled)' }}>
                            点击右上角&quot;＋ 生成正文章节&quot;，AI 将根据现有角色和世界设定自动创作
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                          {projectAssets.chapters.map((chap: any) => {
                            let parsedChapData: any = {};
                            try { parsedChapData = JSON.parse(chap.content || '{}'); } catch { parsedChapData = { content: chap.content || '' }; }
                            const chapText = parsedChapData.content || chap.content || '';
                            return (
                              <div key={chap.metadata.id} style={{
                                padding: 24, borderRadius: 16, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                                boxShadow: 'var(--shadow-sm)', cursor: 'pointer'
                              }} onClick={() => {
                                setActiveArtifacts([{ type: 'chapter', title: chap.metadata.title, data: { chapter_title: parsedChapData.chapter_title || chap.metadata.title, content: chapText } }]);
                                setArtifactPanelVisible(true);
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
                                  <h4 style={{ fontWeight: 700, fontSize: 15 }}>{chap.metadata.title}</h4>
                                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                    <span style={{ fontSize: 11, color: 'var(--text-disabled)', background: 'var(--bg-base)', padding: '2px 8px', borderRadius: 6 }}>{chapText.length} 字</span>
                                  </div>
                                </div>
                                <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-wrap' }}>
                                  {chapText}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        <User size={20} color="#3b82f6" />
                        <h3 style={{ fontSize: 18, fontWeight: 600 }}>角色设定</h3>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 40 }}>
                        {projectAssets.characters.length === 0 ? (
                          <div style={{ padding: 20, border: '1px dashed var(--border-subtle)', borderRadius: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>还没有角色</div>
                        ) : (
                          projectAssets.characters.map((char: any) => {
                            let charData: Record<string, any> = {};
                            try { charData = JSON.parse(char.content || '{}'); } catch { charData = char.extracted_data || {}; }
                            return (
                              <div key={char.metadata.id} onClick={() => {
                                setActiveArtifacts([{ type: 'character_card', title: char.metadata.title, data: charData }]);
                                setArtifactPanelVisible(true);
                              }} style={assetMiniCardStyle}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{char.metadata.title[0]}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, fontSize: 14 }}>{char.metadata.title}</div>
                                  <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{charData.role || '设定'}</div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {saveNotification && (
          <div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', zIndex: 100, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 12, background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.5)', color: '#34d399', fontSize: 13, fontWeight: 700, backdropFilter: 'blur(16px)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <CheckCircle2 size={16} /> {saveNotification}
          </div>
        )}
      </main>

      <ArtifactPanel
        visible={artifactPanelVisible}
        onClose={() => setArtifactPanelVisible(false)}
        artifacts={activeArtifacts}
        onSaveToProject={(art, updatedData) => {
          handleArtifactSave({ type: art.type, title: art.title, data: art.data, toolCall: art.toolCall, cleanText: '' } as any, updatedData);
        }}
        onSaveAll={async (payload) => {
          for (const item of payload) {
            await handleArtifactSave({ type: item.artifact.type, title: item.artifact.title, data: item.artifact.data, toolCall: item.artifact.toolCall, cleanText: '' } as any, item.data);
          }
        }}
      />

      <ImportTextModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        currentSessionId={currentSessionId || ''}
        openAIConfig={openAIConfig}
        onSuccess={(count) => {
          setSaveNotification(`成功导入并拆分提取 ${count} 章节！`);
          setTimeout(() => setSaveNotification(null), 3000);
          refreshProjectAssets();
        }}
      />
      <OpenAIConfigPanel
        open={isOpenAIConfigOpen}
        value={openAIConfig}
        onOpenChange={setIsOpenAIConfigOpen}
        onApply={handleApplyOpenAIConfig}
      />
      <TaskCenter />
    </div>
  );
}

function normalizeOpenAIConfig(input: unknown): OpenAIConfig {
  if (!input || typeof input !== 'object') return {};
  const candidate = input as Record<string, unknown>;
  const normalized: OpenAIConfig = {};
  if (typeof candidate.api_key === 'string' && candidate.api_key.trim()) normalized.api_key = candidate.api_key.trim();
  if (typeof candidate.base_url === 'string' && candidate.base_url.trim()) normalized.base_url = candidate.base_url.trim();
  if (typeof candidate.model === 'string' && candidate.model.trim()) normalized.model = candidate.model.trim();
  return normalized;
}

const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
  background: active ? 'var(--bg-surface)' : 'transparent',
  color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
  border: 'none', fontWeight: active ? 600 : 400, transition: 'all 200ms'
});

const assetMiniCardStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12,
  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
  cursor: 'pointer', transition: 'all 150ms'
};
