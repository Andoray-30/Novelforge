'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { MessageList, Message } from '@/components/chat/MessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { ArtifactPanel } from '@/components/chat/ArtifactPanel';
import { OpenAIConfigPanel } from '@/components/chat/OpenAIConfigPanel';
import ImportTextModal from '../components/ImportTextModal';
import { WorldTree } from '@/components/dashboard/WorldTree';
import {
  Loader2, CheckCircle2, AlertCircle,
  LayoutDashboard, MessageSquare, User, FileText, Download,
  Plus, GitBranch, SlidersHorizontal, RefreshCw
} from 'lucide-react';
import { chatService, contentService } from '@/lib/api';
import { parseMultipleAIArtifacts, extractCleanText, ParsedArtifact, ToolCall, parseThinkingProcess } from '@/lib/chat-parser';
import {
  buildContentCreateRequestFromArtifact,
  getArtifactPanelType,
  getContentAssetPayload,
  getContentAssetText,
  getContentAssetTitle,
} from '@/lib/content-contract';
import {
  loadOpenAIConfigState,
  saveOpenAIConfigState,
  type OpenAIConfigState,
} from '@/lib/openai-config';
import { loadProjectPreferences, PROJECT_PREFERENCES_CHANGED_EVENT, type ProjectPreferences } from '@/lib/project-preferences';
import { upsertContentAsset } from '@/lib/content-upsert';
import { useSessionTaskEvents } from '@/lib/hooks/use-session-task-events';
import { useSessions } from '@/lib/hooks/use-sessions';
import { useAppStore } from '@/lib/hooks/use-app-store';
import type { ContentItem, ContentTopology, ImportanceLevel, OpenAIConfig } from '@/types';

// 用于 Artifact 面板的数据格式
type ArtifactData = {
  type: ParsedArtifact['type'];
  title: string;
  data: Record<string, unknown>;
  /** 工具调用原始信息，保存时使用 */
  toolCall?: ToolCall;
};

type ProjectAssets = {
  characters: ContentItem[];
  worlds: ContentItem[];
  chapters: ContentItem[];
  outlines: ContentItem[];
};

type WorldTreeNode = {
  id: string;
  label: string;
  type: string;
  importance: string;
  metadata: Record<string, unknown>;
};

export default function ChatPage() {
  // 使用 null 作为初始值，表示正在检查登录状态
  
  // 在客户端挂载后从 localStorage 读取登录状态

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
  const [openAIConfigState, setOpenAIConfigState] = useState<OpenAIConfigState>({ enabled: false, config: {} });
  const [projectPreferences, setProjectPreferences] = useState<ProjectPreferences>(() => loadProjectPreferences(null));
  const openAIConfig = useMemo<OpenAIConfig>(() => {
    return openAIConfigState.enabled ? openAIConfigState.config : {};
  }, [openAIConfigState]);

  useEffect(() => {
    setOpenAIConfigState(loadOpenAIConfigState());
  }, []);

  useEffect(() => {
    setProjectPreferences(loadProjectPreferences(currentSessionId));

    const handlePreferencesChanged = () => {
      setProjectPreferences(loadProjectPreferences(currentSessionId));
    };

    window.addEventListener(PROJECT_PREFERENCES_CHANGED_EVENT, handlePreferencesChanged as EventListener);
    return () => {
      window.removeEventListener(PROJECT_PREFERENCES_CHANGED_EVENT, handlePreferencesChanged as EventListener);
    };
  }, [currentSessionId]);

  const [viewMode, setViewMode] = useState<'chat' | 'dashboard'>('chat');
  const [dashboardType, setDashboardType] = useState<'list' | 'tree'>('list');
  const [topologyData, setTopologyData] = useState<ContentTopology>({ nodes: [], edges: [] });
  const [projectAssets, setProjectAssets] = useState<ProjectAssets>({ characters: [], worlds: [], chapters: [], outlines: [] });
  const [isRefreshingAssets, setIsRefreshingAssets] = useState(false);

  const [activeArtifacts, setActiveArtifacts] = useState<ArtifactData[]>([]);
  const [saveNotification, setSaveNotification] = useState<string | null>(null);
  const [messagesMap, setMessagesMap] = useState<Map<string, Message[]>>(new Map());

  const { addCharacter } = useAppStore();

  const worldTreeTopology = useMemo(() => ({
    nodes: topologyData.nodes.map((node): WorldTreeNode => ({
      id: node.id,
      label: node.title,
      type: String(node.type),
      importance: 'medium',
      metadata: {},
    })),
    edges: topologyData.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      type: edge.type,
      label: edge.type,
    })),
  }), [topologyData]);

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

  const currentSessionTitle = useMemo(
    () => sessions.find((session) => session.id === currentSessionId)?.title ?? null,
    [currentSessionId, sessions]
  );

  const projectSummary = useMemo(
    () => buildProjectChatSummary(currentSessionTitle, projectAssets),
    [currentSessionTitle, projectAssets]
  );

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
      if (!currentSessionId) return;
      const existing = messagesMap.get(currentSessionId);
      if (existing && existing.length > 1) return;

      setIsGenerating(true);
      try {
        const history = await chatService.getConversation(currentSessionId);
        if (history && history.messages) {
          const formatted = history.messages.map(m => ({
            id: m.id || `hist-${Math.random()}`,
            role: toMessageRole(m.role),
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
  }, [currentSessionId, messagesMap]);

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
              characters: res.items.filter((i) => i.metadata.type === 'character'),
              worlds: res.items.filter((i) => i.metadata.type === 'world'),
              chapters: res.items.filter((i) => i.metadata.type === 'chapter'),
              outlines: res.items.filter((i) => i.metadata.type === 'novel' || i.metadata.type === 'outline'),
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
    if (!currentSessionId) {
      setTopologyData({ nodes: [], edges: [] });
      setProjectAssets({ characters: [], worlds: [], chapters: [], outlines: [] });
      return;
    }

    refreshProjectAssets();
  }, [currentSessionId, refreshProjectAssets]);

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
    const handleTaskCompleted = (event: Event) => {
      const customEvent = event as CustomEvent<{
        taskId?: string;
        taskType?: string;
        sessionId?: string | null;
        result?: Record<string, unknown>;
      }>;
      const detail = customEvent.detail;
      if (!detail) return;
      if (detail.sessionId && currentSessionId && detail.sessionId !== currentSessionId) return;

      refreshProjectAssets();

      if (detail.taskType === 'novel_import') {
        const result = detail.result as Record<string, unknown> | undefined;
        const chaptersCount = typeof result?.chapters_count === 'number' ? result.chapters_count : null;
        const warning = typeof result?.analysis_warning === 'string' ? result.analysis_warning : '';
        const suffix = chaptersCount !== null ? `，新增 ${chaptersCount} 个章节资产` : '';
        const baseMessage = `导入任务已完成${suffix}`;
        setSaveNotification(warning ? `${baseMessage}。${warning}` : baseMessage);
        setTimeout(() => setSaveNotification(null), 4000);
      }
    };

    window.addEventListener('novelforge:task-completed', handleTaskCompleted as EventListener);
    return () => {
      window.removeEventListener('novelforge:task-completed', handleTaskCompleted as EventListener);
    };
  }, [currentSessionId, refreshProjectAssets]);

  useSessionTaskEvents({
    sessionId: currentSessionId,
    onFailed: (detail) => {
      if (detail.taskType !== 'novel_import') {
        return;
      }
      setSaveNotification(`Import task failed: ${detail.error || detail.message || 'unknown error'}`);
      setTimeout(() => setSaveNotification(null), 4000);
    },
    onCancelled: (detail) => {
      if (detail.taskType !== 'novel_import') {
        return;
      }
      setSaveNotification('Import task was cancelled before completion');
      setTimeout(() => setSaveNotification(null), 3000);
    },
  });

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
      const exportFormat = projectPreferences.default_export_format;
      const blob = await contentService.export(allAssetIds, exportFormat);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NovelForge-Project-${currentSessionId}.${exportFormat}`;
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
    const charNames = projectAssets.characters
      .map((character) => {
        const payload = character.extracted_data;
        if (payload && typeof payload === 'object' && typeof payload.name === 'string' && payload.name.trim().length > 0) {
          return payload.name;
        }
        return character.metadata.title;
      })
      .join('、');
    const firstWorld = projectAssets.worlds[0];
    const worldName = firstWorld
      ? (() => {
          const payload = firstWorld.extracted_data;
          if (payload && typeof payload === 'object' && typeof payload.name === 'string' && payload.name.trim().length > 0) {
            return payload.name;
          }
          return firstWorld.metadata.title;
        })()
      : '';
    const chapterNum = projectAssets.chapters.length + 1;
    const outlineHint = projectAssets.outlines[0]?.metadata?.title || '';
    const targetWords = Math.max(200, projectPreferences.chapter_target_words || 1500);
    const lowerBound = Math.max(200, targetWords - 200);
    const upperBound = targetWords + 200;
    let prompt = `请根据当前项目设定，创作第 ${chapterNum} 章的正文内容（约${lowerBound}-${upperBound}字，目标 ${targetWords} 字）。`;
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

  const updateMessage = useCallback((sessionId: string, messageId: string, patch: Partial<Message>) => {
    setMessagesMap(prev => {
      const next = new Map(prev);
      const existing = next.get(sessionId) ?? [];
      next.set(
        sessionId,
        existing.map((msg) => (msg.id === messageId ? { ...msg, ...patch } : msg))
      );
      return next;
    });
  }, []);

  const handleArtifactSave = useCallback(async (artifact: ParsedArtifact, updatedData?: Record<string, unknown>) => {
    const finalData = updatedData ?? artifact.data;
    const saveRequest = buildContentCreateRequestFromArtifact({
      artifact,
      data: finalData,
      sessionId: currentSessionId || undefined,
    });

    if (saveRequest.metadata.type === 'character') {
      addCharacter({
        id: readString(finalData.name) ?? saveRequest.metadata.title,
        name: readString(finalData.name) ?? saveRequest.metadata.title,
        role: readString(finalData.role) ?? 'supporting',
        description: readString(finalData.description) ?? '',
        background: readString(finalData.background) ?? '',
        personality: readString(finalData.personality) ?? '',
        importance: normalizeImportanceLevel(finalData.importance),
        abilities: readStringArray(finalData.abilities),
        tags: readStringArray(finalData.tags),
        relationships: parseCharacterRelationships(finalData.relationships),
        example_messages: [],
      });
    }

    try {
      await upsertContentAsset(saveRequest);
      setSaveNotification(`「${saveRequest.metadata.title}」已同步至项目档案`);
      setTimeout(() => setSaveNotification(null), 3000);
      refreshProjectAssets();
    } catch (err) {
      console.error('保存失败:', err);
    }
  }, [addCharacter, currentSessionId, refreshProjectAssets]);

  const handleApplyOpenAIConfig = useCallback((state: OpenAIConfigState) => {
    const savedState = saveOpenAIConfigState(state);
    setOpenAIConfigState(savedState);
  }, []);

  const handleSendMessage = async (text: string) => {
    if (!currentSessionId) return;
    const requestContext = {
      session_id: currentSessionId,
      project_title: currentSessionTitle ?? undefined,
      project_summary: projectSummary,
      system_prompt:
        '如果当前项目已经存在角色、世界观、章节或大纲，请优先沿用它们的命名、设定和关系，不要无故重置或改写既有资产。',
    };
    appendMessage(currentSessionId, { id: `msg-${Date.now()}`, role: 'user', content: text, timestamp: new Date() });
    const assistantMessageId = `msg-agent-${Date.now()}`;
    appendMessage(currentSessionId, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      thinking: '',
      isStreaming: true,
      timestamp: new Date(),
    });
    setIsGenerating(true);
    setArtifactPanelVisible(false);
    try {
      let finalContent = '';
      let finalThinking = '';
      let streamedSuccessfully = false;

      try {
        for await (const event of chatService.streamMessage(currentSessionId, text, requestContext, openAIConfig)) {
          if (event.type === 'thinking_delta' && typeof event.delta === 'string') {
            finalThinking += event.delta;
            updateMessage(currentSessionId, assistantMessageId, { thinking: finalThinking });
          }
          if (event.type === 'content_delta' && typeof event.delta === 'string') {
            finalContent += event.delta;
            updateMessage(currentSessionId, assistantMessageId, { content: finalContent, thinking: finalThinking });
          }
          if (event.type === 'message_complete') {
            if (typeof event.content === 'string') finalContent = event.content;
            if (typeof event.thinking === 'string') finalThinking = event.thinking;
            streamedSuccessfully = true;
            updateMessage(currentSessionId, assistantMessageId, {
              content: finalContent,
              thinking: finalThinking,
              isStreaming: false,
            });
          }
          if (event.type === 'error') {
            throw new Error(typeof event.error === 'string' ? event.error : '流式消息失败');
          }
        }
      } catch (streamError) {
        console.warn('Streaming failed, falling back to sync chat:', streamError);
        const reply = await chatService.sendMessage(currentSessionId, text, requestContext, openAIConfig);
        const aiContent = reply.message?.content || '...';
        const parsed = parseThinkingProcess(aiContent);
        finalContent = parsed.answer || aiContent;
        finalThinking = parsed.thinking;
        updateMessage(currentSessionId, assistantMessageId, {
          content: finalContent,
          thinking: finalThinking,
          isStreaming: false,
        });
        streamedSuccessfully = true;
      }

      if (!streamedSuccessfully) {
        updateMessage(currentSessionId, assistantMessageId, { isStreaming: false });
      }

      const artifacts = parseMultipleAIArtifacts(finalContent);
      const displayContent = artifacts.length > 0 ? (artifacts[0].cleanText || finalContent) : finalContent;
      updateMessage(currentSessionId, assistantMessageId, {
        content: displayContent,
        thinking: finalThinking,
        isStreaming: false,
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
      const message = error instanceof Error ? error.message : '发送消息失败';
      updateMessage(currentSessionId, assistantMessageId, {
        content: `请求失败：${message}`,
        thinking: '',
        isStreaming: false,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // 全局加载判断
  if (isSessionsLoading && sessions.length === 0) {
    return (
      <div style={{ display: 'flex', minHeight: '60vh', width: '100%', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', flexDirection: 'column', gap: 16 }}>
        <Loader2 className="animate-spin" size={32} color="var(--accent-primary)" />
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>正在初始化工作区...</div>
      </div>
    );
  }

  // 错误状态兜底
  if (sessionsError && sessions.length === 0) {
    return (
      <div style={{ display: 'flex', minHeight: '60vh', width: '100%', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', flexDirection: 'column', gap: 20 }}>
        <AlertCircle size={48} color="#ef4444" />
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>工作区同步失败</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{sessionsError}</p>
        </div>
        <button onClick={() => loadSessions()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, background: 'var(--accent-primary)', color: '#fff', border: 'none', cursor: 'pointer' }}>
          <RefreshCw size={16} /> 立即重试
        </button>
      </div>
    );
  }
  
  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        minHeight: 0,
        width: '100%',
        overflow: 'hidden',
        background: 'var(--bg-base)',
      }}
    >
        <ChatSidebar
          collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          currentSessionId={currentSessionId || ''} onSelectSession={handleSelectSession}
          onNewSession={createNewSession} onDeleteSession={deleteSession} sessions={sessions}
        />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
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
                {openAIConfigState.enabled ? (openAIConfig.model || '自定义模型') : '后端默认模型'}
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

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {viewMode === 'chat' ? (
            <>
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <MessageList messages={currentMessages.filter(m => m.role !== 'system')} />
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
                      topology={worldTreeTopology} 
                      onNodeDelete={async (nodeId) => {
                        try {
                          await contentService.deleteContentItem(nodeId);
                          refreshProjectAssets();
                        } catch (err) {
                          console.error('Failed to delete node:', err);
                        }
                      }}
                      onNodeClick={async (node: WorldTreeNode) => {
                        const detail = await contentService.getById(node.id);
                        if (detail) {
                          const payload = getContentAssetPayload(detail);
                          const parsedData = Object.keys(payload).length > 0
                            ? payload
                            : { content: detail.content || '' };
                          setActiveArtifacts([{
                            type: getArtifactPanelType(detail.metadata.type),
                            title: detail.metadata.title,
                            data: parsedData,
                          }]);
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
                          {projectAssets.chapters.map((chap) => {
                            const parsedChapData = getContentAssetPayload(chap);
                            const chapterTitle = getContentAssetTitle(chap, parsedChapData);
                            const chapText = getContentAssetText(chap, parsedChapData);
                            return (
                              <div key={chap.metadata.id} style={{
                                padding: 24, borderRadius: 16, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                                boxShadow: 'var(--shadow-sm)', cursor: 'pointer'
                              }} onClick={() => {
                                setActiveArtifacts([{ type: 'chapter', title: chapterTitle, data: { ...parsedChapData, chapter_title: chapterTitle, content: chapText } }]);
                                setArtifactPanelVisible(true);
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
                                  <h4 style={{ fontWeight: 700, fontSize: 15 }}>{chapterTitle}</h4>
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
                          projectAssets.characters.map((char) => {
                            const charData = getContentAssetPayload(char);
                            const role = readString(charData.role) ?? '设定';
                            return (
                              <div key={char.metadata.id} onClick={() => {
                                setActiveArtifacts([{ type: 'character_card', title: char.metadata.title, data: charData }]);
                                setArtifactPanelVisible(true);
                              }} style={assetMiniCardStyle}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{char.metadata.title[0]}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, fontSize: 14 }}>{char.metadata.title}</div>
                                  <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{role}</div>
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
          handleArtifactSave(toParsedArtifact(art), updatedData);
        }}
        onSaveAll={async (payload) => {
          for (const item of payload) {
            await handleArtifactSave(toParsedArtifact(item.artifact), item.data);
          }
        }}
      />

      <ImportTextModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        currentSessionId={currentSessionId || ''}
        openAIConfig={openAIConfig}
        onSubmitted={({ fileName }) => {
          setSaveNotification(`导入任务已提交：${fileName}，可在右下角任务中心查看进度`);
          setTimeout(() => setSaveNotification(null), 3000);
        }}
      />
      <OpenAIConfigPanel
        open={isOpenAIConfigOpen}
        value={openAIConfigState}
        onOpenChange={setIsOpenAIConfigOpen}
        onApply={handleApplyOpenAIConfig}
      />
    </div>
  );
}

function toMessageRole(role: string): Message['role'] {
  if (role === 'user' || role === 'assistant' || role === 'system') {
    return role;
  }
  return 'assistant';
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function normalizeImportanceLevel(value: unknown): ImportanceLevel {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low'
    ? value
    : 'medium';
}

function parseCharacterRelationships(value: unknown): Array<{ target_name: string; relationship: string; description: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      target_name: readString(item.target_name) ?? '',
      relationship: readString(item.relationship) ?? 'other',
      description: readString(item.description) ?? '',
    }))
    .filter((item) => item.target_name.length > 0);
}

function summarizeAssetTitles(items: ContentItem[], limit: number): string {
  const titles = items
    .slice(0, limit)
    .map((item) => getContentAssetTitle(item))
    .filter((title) => typeof title === 'string' && title.trim().length > 0);

  if (titles.length === 0) {
    return '无';
  }

  const suffix = items.length > limit ? ` 等 ${items.length} 项` : '';
  return `${titles.join('、')}${suffix}`;
}

function summarizeAssetTexts(items: ContentItem[], limit: number, maxLength = 220): string {
  const snippets = items
    .slice(0, limit)
    .map((item) => {
      const title = getContentAssetTitle(item);
      const text = getContentAssetText(item, getContentAssetPayload(item)).replace(/\s+/g, ' ').trim();
      if (!text) {
        return undefined;
      }

      const clipped = text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
      return `${title}: ${clipped}`;
    })
    .filter((item): item is string => typeof item === 'string' && item.length > 0);

  return snippets.join('\n');
}

function buildProjectChatSummary(sessionTitle: string | null, assets: ProjectAssets): string {
  const lines = [
    `项目名称：${sessionTitle ?? '未命名项目'}`,
    `角色数量：${assets.characters.length}`,
    `世界观资产数量：${assets.worlds.length}`,
    `章节数量：${assets.chapters.length}`,
    `大纲数量：${assets.outlines.length}`,
    `角色列表：${summarizeAssetTitles(assets.characters, 8)}`,
    `世界观列表：${summarizeAssetTitles(assets.worlds, 4)}`,
    `章节列表：${summarizeAssetTitles(assets.chapters, 6)}`,
    `大纲列表：${summarizeAssetTitles(assets.outlines, 4)}`,
  ];

  const outlineDetails = summarizeAssetTexts(assets.outlines, 1, 260);
  if (outlineDetails) {
    lines.push(`大纲摘要：\n${outlineDetails}`);
  }

  const worldDetails = summarizeAssetTexts(assets.worlds, 1, 260);
  if (worldDetails) {
    lines.push(`世界观摘要：\n${worldDetails}`);
  }

  return lines.join('\n');
}

function toParsedArtifact(artifact: ArtifactData): ParsedArtifact {
  return {
    ...artifact,
    cleanText: '',
  };
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
