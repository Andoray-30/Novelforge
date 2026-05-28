'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { MessageList, Message, type ChapterSaveTargetOption } from '@/components/chat/MessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { ArtifactPanel } from '@/components/chat/ArtifactPanel';
import ImportTextModal from '../components/ImportTextModal';
import { WorldTree } from '@/components/dashboard/WorldTree';
import {
  Loader2, CheckCircle2, AlertCircle,
  LayoutDashboard, MessageSquare, User, FileText, Download,
  Plus, GitBranch, RefreshCw, Sparkles
} from 'lucide-react';
import { chatService, contentService, isAPIError } from '@/lib/api';
import { parseMultipleAIArtifacts, extractCleanText, ParsedArtifact, ToolCall, parseThinkingProcess, parseAssetRequest, parseSaveAssetRequests, type AssetRequestDirective, type SaveAssetRequest } from '@/lib/chat-parser';
import {
  buildContentCreateRequestFromArtifact,
  getContentAssetPayload,
  getContentAssetText,
  getContentAssetTitle,
} from '@/lib/content-contract';
import {
  loadAIMode,
  saveAIMode,
  type AIMode,
} from '@/lib/openai-config';
import { loadProjectPreferences, PROJECT_PREFERENCES_CHANGED_EVENT, type ProjectPreferences } from '@/lib/project-preferences';
import { upsertContentAsset } from '@/lib/content-upsert';
import {
  saveReopenedContentItem,
  type ContentItemArtifactData,
} from '@/lib/content-item-reopen';
import { resolveHomepageContentItemReopen } from '@/lib/homepage-reopen';
import {
  bindContentItemToNovel,
  isUnassignedNovelScopedContentItem,
} from '@/lib/content-item-binding';
import {
  applyChapterSaveDestinationToRequest,
  applyChapterSaveTargetToRequest,
  saveAssetRequestToContent,
} from '@/lib/save-asset-requests';
import {
  saveRelationshipRepairDraft,
  updateRelationshipWithRepair,
} from '@/lib/relationship-repair';
import type { ChapterSaveDestination } from '@/lib/chapter-save-destinations';
import { resolveChapterDirectoryMetadata, sortChaptersByDirectory } from '@/lib/chapter-metadata';
import {
  resolveNovelImportCompletionAction,
} from '@/lib/import-workflow';
import { decodeAssetTitle, formatDisplayTitle } from '@/lib/asset-normalization';
import { useSessionTaskEvents } from '@/lib/hooks/use-session-task-events';
import { useSessions } from '@/lib/hooks/use-sessions';
import { useAppStore } from '@/lib/hooks/use-app-store';
import {
  buildFocusedAssetFromArtifact,
  clipFocusedAssetSummary,
  type FocusedAsset,
} from '@/lib/focused-assets';
import { normalizeAgentTrace } from '@/lib/agent-trace';
import { buildProjectQualitySummary, type ProjectQualitySummary } from '@/lib/project-quality-summary';
import type { ContentItem, ContentTopology, ContentType, ImportanceLevel, OpenAIConfig } from '@/types';

// 用于 Artifact 面板的数据格式
type ArtifactData = ContentItemArtifactData & {
  /** 工具调用原始信息，保存时使用 */
  toolCall?: ToolCall;
};

type MessageArtifactData = NonNullable<Message['artifact']>;

type ProjectAssets = {
  characters: ContentItem[];
  worlds: ContentItem[];
  timelines: ContentItem[];
  relationships: ContentItem[];
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

type QuickReferenceGroup = {
  key: string;
  label: string;
  items: ContentItem[];
};

type AssetRequestState = NonNullable<Message['assetRequest']>;
type AssetRequestCandidate = AssetRequestState['candidates'][number];
type ReconciledAssetRequestState = {
  selectedKeys: string[];
  status: NonNullable<AssetRequestState['status']>;
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
  const [aiMode, setAIMode] = useState<AIMode>(() => loadAIMode('fast'));
  const [projectPreferences, setProjectPreferences] = useState<ProjectPreferences>(() => loadProjectPreferences(null));
  const openAIConfig = useMemo<OpenAIConfig>(() => {
    return { ai_mode: aiMode };
  }, [aiMode]);

  const handleAIModeChange = useCallback((mode: AIMode) => {
    setAIMode(saveAIMode(mode));
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
  const [projectAssets, setProjectAssets] = useState<ProjectAssets>({ characters: [], worlds: [], timelines: [], relationships: [], chapters: [], outlines: [] });
  const [isRefreshingAssets, setIsRefreshingAssets] = useState(false);

  const [activeArtifacts, setActiveArtifacts] = useState<ArtifactData[]>([]);
  const [focusedAssets, setFocusedAssets] = useState<FocusedAsset[]>([]);
  const [chatPrefill, setChatPrefill] = useState<{ id: string; text: string } | null>(null);
  const [assetQuickSearch, setAssetQuickSearch] = useState('');
  const [saveNotification, setSaveNotification] = useState<string | null>(null);
  const [messagesMap, setMessagesMap] = useState<Map<string, Message[]>>(new Map());
  const saveNotificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousSelectedNovelIdRef = useRef<string | null>(null);

  const { addCharacter, selectedNovelId, setSelectedNovelId } = useAppStore();
  const router = useRouter();

  const showSaveNotification = useCallback((message: string, duration = 3000) => {
    if (saveNotificationTimerRef.current) {
      clearTimeout(saveNotificationTimerRef.current);
    }
    setSaveNotification(message);
    saveNotificationTimerRef.current = setTimeout(() => {
      setSaveNotification(null);
      saveNotificationTimerRef.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    return () => {
      if (saveNotificationTimerRef.current) {
        clearTimeout(saveNotificationTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem('novelforge.editorHandoff');
    if (!raw) {
      return;
    }

    window.localStorage.removeItem('novelforge.editorHandoff');
    try {
      const handoff = JSON.parse(raw) as {
        prompt?: unknown;
        focusedAsset?: FocusedAsset;
        actionLabel?: unknown;
      };
      if (typeof handoff.prompt === 'string' && handoff.prompt.trim().length > 0) {
        setChatPrefill({ id: `editor-${Date.now()}`, text: handoff.prompt.trim() });
      }
      if (handoff.focusedAsset?.key && handoff.focusedAsset.title) {
        setFocusedAssets((current) => {
          if (current.some((asset) => asset.key === handoff.focusedAsset?.key)) {
            return current;
          }
          return [...current, handoff.focusedAsset as FocusedAsset];
        });
      }
      if (typeof handoff.actionLabel === 'string') {
        showSaveNotification(`${handoff.actionLabel}已放入聊天输入框，请确认后发送。`);
      }
    } catch (error) {
      console.warn('Failed to read editor handoff', error);
    }
  }, [showSaveNotification]);

  const worldTreeTopology = useMemo(() => ({
    nodes: topologyData.nodes.map((node): WorldTreeNode => ({
      id: node.id,
      label: formatDisplayTitle(node.title, '未命名节点'),
      type: String(node.type),
      importance: String(node.metadata?.importance || 'medium'),
      metadata: node.metadata || {},
    })),
    edges: topologyData.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      type: edge.type,
      label: edge.type,
    })),
  }), [topologyData]);

  const projectAssetItems = useMemo(
    () => [
      ...projectAssets.characters,
      ...projectAssets.worlds,
      ...projectAssets.timelines,
      ...projectAssets.relationships,
      ...projectAssets.chapters,
      ...projectAssets.outlines,
    ],
    [projectAssets],
  );
  const projectQualitySummary = useMemo(
    () => buildProjectQualitySummary(projectAssets),
    [projectAssets],
  );
  const currentNovelParentId = useMemo(() => {
    if (selectedNovelId) {
      return selectedNovelId;
    }
    return projectAssets.outlines.find((item) => item.metadata.type === 'novel')?.metadata.id ?? null;
  }, [projectAssets.outlines, selectedNovelId]);

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
    () => buildProjectChatSummary(currentSessionTitle, projectAssets, selectedNovelId),
    [currentSessionTitle, projectAssets, selectedNovelId]
  );

  const focusedAssetSummary = useMemo(
    () => buildFocusedAssetSummary(focusedAssets),
    [focusedAssets]
  );

  const quickReferenceGroups = useMemo<QuickReferenceGroup[]>(() => {
    const query = assetQuickSearch.trim().toLowerCase();
    const filterItems = (items: ContentItem[]) => {
      if (!query) {
        return items;
      }

      return items.filter((item) => {
        const payload = getContentAssetPayload(item);
        const title = getContentAssetTitle(item, payload).toLowerCase();
        const text = getContentAssetText(item, payload).toLowerCase();
        return title.includes(query) || text.includes(query);
      });
    };

    return [
      { key: 'characters', label: '角色', items: filterItems(projectAssets.characters).slice(0, 6) },
      { key: 'worlds', label: '世界观', items: filterItems(projectAssets.worlds).slice(0, 4) },
      { key: 'chapters', label: '章节', items: filterItems(projectAssets.chapters).slice(0, 5) },
      { key: 'outlines', label: '大纲', items: filterItems(projectAssets.outlines).slice(0, 3) },
    ].filter((group) => group.items.length > 0);
  }, [assetQuickSearch, projectAssets]);

  // 处理会话切换：重置所有局部状态防止抽搐
  const handleSelectSession = useCallback((id: string) => {
    if (id === currentSessionId) return;
    setTopologyData({ nodes: [], edges: [] });
    setProjectAssets({ characters: [], worlds: [], timelines: [], relationships: [], chapters: [], outlines: [] });
    setFocusedAssets([]);
    setActiveArtifacts([]);
    setArtifactPanelVisible(false);
    setAssetQuickSearch('');
    setViewMode('chat');
    selectSession(id);
  }, [currentSessionId, selectSession]);

  const chapterSaveTargets = useMemo<ChapterSaveTargetOption[]>(() => {
    return sortChaptersByDirectory(projectAssets.chapters).map((chapter, index) => {
      const metadata = resolveChapterDirectoryMetadata(chapter, index + 1);
      return {
        id: chapter.metadata.id,
        title: metadata.displayTitle,
        sourceLabel: metadata.sourceLabel,
        saveDestinationLabel: metadata.saveDestinationLabel,
        roleLabel: metadata.roleLabel,
        wordCount: metadata.wordCount,
      };
    });
  }, [projectAssets.chapters]);

  const handleCleanupEmptySessions = useCallback(async () => {
    const result = await chatService.cleanupEmptyConversations();
    await loadSessions();
    showSaveNotification(
      result.deleted > 0 ? `已清理 ${result.deleted} 个空项目` : '没有可清理的空项目',
      3000,
    );
  }, [loadSessions, showSaveNotification]);

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
          const formatted = history.messages.map(m => {
            const saveAssetRequests = parseSaveAssetRequests(m.content);
            return {
              id: m.id || `hist-${Math.random()}`,
              role: toMessageRole(m.role),
              content: extractCleanText(m.content),
              timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
              agentTrace: normalizeAgentTrace(m.metadata?.agent_trace),
              saveAssetRequests: saveAssetRequests.length > 0
                ? saveAssetRequests.map((req) => ({
                    ...req,
                    status: 'pending' as const,
                  }))
                : undefined,
            };
          });
          setMessagesMap(prev => {
            const next = new Map(prev);
            if (formatted.length > 0) next.set(currentSessionId, formatted);
            return next;
          });
        }
      } catch (err) {
        if (isAPIError(err, 404)) {
          useAppStore.getState().deleteSession(currentSessionId);
          setMessagesMap(prev => {
            const next = new Map(prev);
            next.delete(currentSessionId);
            return next;
          });
          return;
        }
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
      const selectedNovelId = useAppStore.getState().selectedNovelId || undefined;
      const applyAssets = (items: ContentItem[]) => {
        setProjectAssets({
          characters: items.filter((i) => i.metadata.type === 'character'),
          worlds: items.filter((i) => i.metadata.type === 'world'),
          timelines: items.filter((i) => i.metadata.type === 'timeline'),
          relationships: items.filter((i) => i.metadata.type === 'relationship'),
          chapters: items.filter((i) => i.metadata.type === 'chapter'),
          outlines: items.filter((i) => i.metadata.type === 'novel' || i.metadata.type === 'outline'),
        });
      };
      const searchPromise = contentService.search({ tags: [`project-${currentSessionId}`], session_id: currentSessionId || undefined, parent_id: selectedNovelId, include_content: false })
        .then(async res => {
          let items = res?.items ?? [];
          const usableAssetCount = items.filter((item) =>
            ['character', 'world', 'timeline', 'relationship', 'chapter', 'novel', 'outline'].includes(item.metadata.type)
          ).length;
          if (usableAssetCount === 0 && !selectedNovelId) {
            const fallback = await contentService.search({ include_content: false });
            items = fallback?.items ?? [];
          }
          applyAssets(items);
        })
        .catch(err => console.warn('搜索资产失败:', err));

      const topologyPromise = contentService.getTopology(currentSessionId, selectedNovelId)
        .then(setTopologyData)
        .catch(err => {
          console.warn('获取拓扑结构失败:', err);
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
      setFocusedAssets([]);
      setAssetQuickSearch('');
      previousSelectedNovelIdRef.current = null;
      contentService.search({ include_content: false })
        .then((res) => {
          const items = res?.items ?? [];
          setProjectAssets({
            characters: items.filter((i) => i.metadata.type === 'character'),
            worlds: items.filter((i) => i.metadata.type === 'world'),
            timelines: items.filter((i) => i.metadata.type === 'timeline'),
            relationships: items.filter((i) => i.metadata.type === 'relationship'),
            chapters: items.filter((i) => i.metadata.type === 'chapter'),
            outlines: items.filter((i) => i.metadata.type === 'novel' || i.metadata.type === 'outline'),
          });
        })
        .catch(err => {
          console.warn('加载全库资产失败:', err);
          setProjectAssets({ characters: [], worlds: [], timelines: [], relationships: [], chapters: [], outlines: [] });
        });
      return;
    }

    const previousSelectedNovelId = previousSelectedNovelIdRef.current;
    const novelChanged = previousSelectedNovelId !== selectedNovelId;
    previousSelectedNovelIdRef.current = selectedNovelId;

    if (novelChanged) {
      setFocusedAssets([]);
      setAssetQuickSearch('');
    }

    refreshProjectAssets();
  }, [currentSessionId, refreshProjectAssets, selectedNovelId, showSaveNotification]);

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
    const handleTaskCompleted = async (event: Event) => {
      const customEvent = event as CustomEvent<any>;
      const detail = customEvent.detail;
      if (!detail) return;

      const importAction = resolveNovelImportCompletionAction(detail, currentSessionId);
      if (importAction) {
        if (importAction.shouldSwitchSession && importAction.targetSessionId) {
          await loadSessions();
          selectSession(importAction.targetSessionId);
        }
        if (importAction.focusedNovelId) {
          setSelectedNovelId(importAction.focusedNovelId);
          setFocusedAssets([]);
        }
        refreshProjectAssets();
        showSaveNotification(importAction.notification, 4000);
        return;
      }

      if (detail.sessionId && currentSessionId && detail.sessionId !== currentSessionId) return;
      refreshProjectAssets();
    };

    window.addEventListener('novelforge:task-completed', handleTaskCompleted as EventListener);
    return () => {
      window.removeEventListener('novelforge:task-completed', handleTaskCompleted as EventListener);
    };
  }, [currentSessionId, loadSessions, refreshProjectAssets, selectSession, setSelectedNovelId, showSaveNotification]);

  useSessionTaskEvents({
    sessionId: currentSessionId,
    onFailed: (detail) => {
      if (detail.taskType !== 'novel_import') {
        return;
      }
      showSaveNotification(`导入任务失败：${detail.error || detail.message || '未知错误'}`, 4000);
    },
    onCancelled: (detail) => {
      if (detail.taskType !== 'novel_import') {
        return;
      }
      showSaveNotification('导入任务已在完成前取消', 3000);
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
      showSaveNotification('项目数据已成功打包导出', 3000);
    } catch (err) {
      console.error('导出失败:', err);
      alert('导出项目时遇到错误，请重试');
    } finally {
      setIsRefreshingAssets(false);
    }
  };

  const ensureWritableSession = async () => {
    if (currentSessionId) return currentSessionId;
    const session = await createNewSession();
    return session.id;
  };

  const handleGenerateChapter = async () => {
    setIsGeneratingChapter(true);
    try {
      const targetSessionId = await ensureWritableSession();
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
      prompt += `请直接写出精彩的正文，不需要任何前置说明。写完后请在末尾附加 <save_asset>{"type":"chapter","title":"第 ${chapterNum} 章","save_destination":"ai_draft","chapter_role":"正文","data":{"content":"章节全文"}}</save_asset>，等待我确认写回内容库。`;
      setViewMode('chat');
      await handleSendMessage(prompt, targetSessionId, 'pro');
    } finally {
      setIsGeneratingChapter(false);
    }
  };

  const handleGeneratePrologue = async () => {
    setIsGeneratingChapter(true);
    try {
      const targetSessionId = await ensureWritableSession();
      const targetWords = Math.max(800, Math.min(projectPreferences.chapter_target_words || 1500, 2200));
      const prompt = [
        `请基于当前项目已经提取出的角色、关系、时间线、世界观和章节资产，创作一版小说《序章》。`,
        `目标是写出动人、优美、有情绪张力的开篇，而不是泛泛介绍设定。`,
        `请优先使用主角的欲望/伤痕、核心关系张力、世界观规则、关键意象和伏笔；如果资产里缺失某些信息，请从现有资产中合理补全，不要写成说明文。`,
        `篇幅约 ${targetWords} 字。正文之后，请简短列出：情绪钩子、使用到的资产、埋下的伏笔。`,
        `最后请附加 <save_asset>{"type":"chapter","title":"序章","save_destination":"formal_prologue","chapter_role":"序章","data":{"content":"序章全文"}}</save_asset>，等待我确认写回内容库。`,
      ].join('\n');
      setViewMode('chat');
      await handleSendMessage(prompt, targetSessionId, 'pro');
    } finally {
      setIsGeneratingChapter(false);
    }
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

  const addFocusedAsset = useCallback((asset: FocusedAsset) => {
    setFocusedAssets((previous) => {
      const deduped = previous.filter((item) => item.key !== asset.key);
      return [asset, ...deduped].slice(0, 6);
    });
  }, []);

  const pushFocusedAssetToChat = useCallback((
    asset: FocusedAsset,
    mode: 'select' | 'pin' | 'reference' = 'select',
  ) => {
    const alreadyFocused = focusedAssets.some((item) => item.key === asset.key);
    addFocusedAsset(asset);

    if (mode === 'pin') {
      showSaveNotification(
        alreadyFocused
          ? `已更新「${asset.title}」在当前聊天上下文中的草稿版本`
          : `已将「${asset.title}」固定到当前聊天上下文`,
        2500,
      );
      return;
    }

    showSaveNotification(
      alreadyFocused
        ? `已更新「${asset.title}」在当前聊天上下文中的优先级`
        : `已将「${asset.title}」加入当前聊天上下文`,
      2500,
    );
  }, [focusedAssets, addFocusedAsset, showSaveNotification]);

  const removeFocusedAsset = useCallback((assetKey: string) => {
    setFocusedAssets((previous) => previous.filter((item) => item.key !== assetKey));
  }, []);

  const clearFocusedAssets = useCallback(() => {
    setFocusedAssets([]);
  }, []);

  useEffect(() => {
    if (!currentSessionId) {
      return;
    }

    const focusedKeys = new Set(focusedAssets.map((asset) => asset.key));
    setMessagesMap((previous) => {
      const sessionMessages = previous.get(currentSessionId);
      if (!sessionMessages || sessionMessages.length === 0) {
        return previous;
      }

      let hasChanges = false;
      const nextSessionMessages = sessionMessages.map((message) => {
        const requestState = message.assetRequest;
        if (!requestState) {
          return message;
        }

        const nextRequestState = reconcileAssetRequestWithFocusedAssets(
          requestState,
          currentSessionId,
          focusedKeys,
        );

        const selectedChanged =
          (requestState.selectedKeys ?? []).join('|') !== nextRequestState.selectedKeys.join('|');
        const statusChanged = requestState.status !== nextRequestState.status;

        if (!selectedChanged && !statusChanged) {
          return message;
        }

        hasChanges = true;
        return {
          ...message,
          assetRequest: {
            ...requestState,
            selectedKeys: nextRequestState.selectedKeys,
            status: nextRequestState.status,
          },
        };
      });

      if (!hasChanges) {
        return previous;
      }

      const next = new Map(previous);
      next.set(currentSessionId, nextSessionMessages);
      return next;
    });
  }, [currentSessionId, focusedAssets]);

  const handleSelectAssetCandidate = useCallback((
    messageId: string,
    candidate: AssetRequestCandidate,
  ) => {
    if (!currentSessionId) {
      return;
    }

    const sessionMessages = messagesMap.get(currentSessionId) ?? [];
    const targetMessage = sessionMessages.find((message) => message.id === messageId);
    const requestState = targetMessage?.assetRequest;
    if (!requestState) {
      return;
    }

    const requestSessionId = requestState.sessionId ?? currentSessionId;
    if (requestSessionId !== currentSessionId) {
      updateMessage(requestSessionId, messageId, {
        assetRequest: {
          ...requestState,
          status: 'stale',
        },
      });
      showSaveNotification('这个资产请求属于其他项目，请在当前项目重新请求。', 2800);
      return;
    }

    if (requestState.selectedKeys?.includes(candidate.key)) {
      showSaveNotification(`「${candidate.title}」已经在当前聊天上下文中了。`, 2200);
      return;
    }

    const nextSelectedKeys = Array.from(
      new Set([...(requestState.selectedKeys ?? []), candidate.key]),
    );

    updateMessage(currentSessionId, messageId, {
      assetRequest: {
        ...requestState,
        selectedKeys: nextSelectedKeys,
        status: nextSelectedKeys.length > 0 ? 'resolved' : 'pending',
      },
    });

    pushFocusedAssetToChat(candidate, 'select');
  }, [currentSessionId, messagesMap, pushFocusedAssetToChat, showSaveNotification, updateMessage]);

  const openContentItem = useCallback((item: ContentItem) => {
    const result = resolveHomepageContentItemReopen(item, selectedNovelId);

    if (result.kind === 'error') {
      showSaveNotification(result.message, 3200);
      return;
    }

    pushFocusedAssetToChat(buildFocusedAssetFromContentItem(item), 'reference');

    if (result.kind === 'route') {
      router.push(result.href);
      return;
    }

    setActiveArtifacts([result.artifact]);
    setArtifactPanelVisible(true);
    showSaveNotification(result.message, 2500);
  }, [pushFocusedAssetToChat, router, selectedNovelId, showSaveNotification]);

  const openTopologyNode = useCallback(async (node: WorldTreeNode) => {
    const isVirtualWorldFact = node.id.includes('::world_fact::') || node.type.startsWith('world_');

    if (isVirtualWorldFact) {
      setActiveArtifacts([{
        type: 'world_setting',
        title: node.label,
        data: {
          title: node.label,
          node_type: node.type,
          world_fact_type: node.metadata?.world_fact_type,
          parent_id: node.metadata?.parent_id,
          description: '这是从世界观资产中拆出的派生事实节点，不是独立内容库资产。',
        },
      }]);
      setArtifactPanelVisible(true);
      showSaveNotification('已打开世界观派生节点详情。', 2200);
      return;
    }

    try {
      const detail = await contentService.getById(node.id);
      if (detail) {
        openContentItem(detail);
      }
    } catch (error) {
      if (isAPIError(error, 404)) {
        setActiveArtifacts([{
          type: 'world_setting',
          title: node.label,
          data: {
            title: node.label,
            node_type: node.type,
            ...node.metadata,
            description: '这个拓扑节点没有对应的独立内容资产，已按只读节点打开。',
          },
        }]);
        setArtifactPanelVisible(true);
        showSaveNotification('该拓扑节点没有独立资产，已打开只读详情。', 2600);
        return;
      }
      console.error('打开拓扑节点失败:', error);
      showSaveNotification('打开拓扑节点失败，请稍后重试。', 3200);
    }
  }, [openContentItem, showSaveNotification]);

  const bindContentItemToSelectedNovel = useCallback(async (item: ContentItem) => {
    if (!selectedNovelId || !isUnassignedNovelScopedContentItem(item)) {
      return;
    }

    try {
      await bindContentItemToNovel(item, selectedNovelId);
      showSaveNotification(`「${getContentAssetTitle(item)}」已绑定到当前小说`, 3000);
      refreshProjectAssets();
    } catch (err) {
      console.error('绑定资产到当前小说失败:', err);
      showSaveNotification('绑定资产到当前小说失败，请稍后重试', 3200);
    }
  }, [refreshProjectAssets, selectedNovelId, showSaveNotification]);

  const handleOpenMessageArtifact = useCallback((artifact: MessageArtifactData) => {
    pushFocusedAssetToChat(buildFocusedAssetFromArtifact({
      type: artifact.type,
      title: artifact.title,
      data: artifact.data,
    }), 'reference');
    setActiveArtifacts([{ type: artifact.type, title: artifact.title, data: artifact.data }]);
    setArtifactPanelVisible(true);
  }, [pushFocusedAssetToChat]);

  const handleArtifactSave = useCallback(async (artifact: ParsedArtifact, updatedData?: Record<string, unknown>) => {
    const finalData = updatedData ?? artifact.data;
    try {
      const reopenedResult = await saveReopenedContentItem({
        items: projectAssetItems,
        artifact,
        updatedData: finalData,
      });

      if (reopenedResult.ok) {
        addFocusedAsset(buildFocusedAssetFromArtifact({
          type: artifact.type,
          title: reopenedResult.title,
          data: finalData,
          contentItemId: reopenedResult.contentItemId,
        }));
        showSaveNotification(`「${reopenedResult.title}」已同步至项目档案`, 3000);
        refreshProjectAssets();
        return;
      }
    } catch (err) {
      console.error('保存已打开资产失败:', err);
    }

    const saveRequest = buildContentCreateRequestFromArtifact({
      artifact,
      data: finalData,
      sessionId: currentSessionId || undefined,
      parentId: currentNovelParentId || undefined,
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
      addFocusedAsset(buildFocusedAssetFromArtifact({
        type: saveRequest.metadata.type,
        title: saveRequest.metadata.title,
        data: finalData,
      }));
      showSaveNotification(`「${saveRequest.metadata.title}」已同步至项目档案`, 3000);
      refreshProjectAssets();
    } catch (err) {
      console.error('保存失败:', err);
    }
  }, [addCharacter, addFocusedAsset, currentNovelParentId, currentSessionId, projectAssetItems, refreshProjectAssets, showSaveNotification]);

  const handleConfirmSaveAsset = useCallback(async (messageId: string, requestIndex: number) => {
    let targetSessionId = currentSessionId || '';
    let messages = targetSessionId ? (messagesMap.get(targetSessionId) ?? []) : [];
    if (!messages.some((m) => m.id === messageId)) {
      Array.from(messagesMap.entries()).some(([sessionId, sessionMessages]) => {
        if (sessionMessages.some((m: Message) => m.id === messageId)) {
          targetSessionId = sessionId;
          messages = sessionMessages;
          return true;
        }
        return false;
      });
    }
    if (!targetSessionId) {
      showSaveNotification('保存失败：当前没有可写入的创作会话', 3200);
      return;
    }
    const msg = messages.find((m) => m.id === messageId);
    const request = msg?.saveAssetRequests?.[requestIndex];
    if (!request || request.status !== 'pending') {
      showSaveNotification('保存失败：没有找到可保存的 AI 建议', 3200);
      return;
    }

    try {
      const saveResult = await saveAssetRequestToContent({
        request,
        sessionId: targetSessionId,
        parentId: currentNovelParentId || undefined,
      });

      updateMessage(targetSessionId, messageId, {
        saveAssetRequests: msg!.saveAssetRequests!.map((r, i) =>
          i === requestIndex ? {
            ...r,
            id: saveResult.contentId ?? r.id,
            contentId: saveResult.contentId,
            status: 'saved' as const,
          } : r,
        ),
      });
      addFocusedAsset(buildFocusedAssetFromArtifact({
        type: request.type,
        title: request.title,
        data: request.data,
        contentItemId: saveResult.contentId,
      }));
      showSaveNotification(
        saveResult.updatedExisting
          ? `已更新「${request.title}」`
          : `已保存「${request.title}」到项目内容库`,
        3000,
      );
      refreshProjectAssets();
    } catch (err) {
      console.error('保存 AI 建议资产失败:', err);
      showSaveNotification('保存失败，请稍后重试', 3200);
    }
  }, [addFocusedAsset, currentNovelParentId, currentSessionId, messagesMap, refreshProjectAssets, showSaveNotification, updateMessage]);

  useEffect(() => {
    const handleConfirmSaveAssetEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ messageId?: string; requestIndex?: number }>).detail;
      if (!detail?.messageId || typeof detail.requestIndex !== 'number') {
        return;
      }
      handleConfirmSaveAsset(detail.messageId, detail.requestIndex);
    };

    window.addEventListener('novelforge:confirm-save-asset', handleConfirmSaveAssetEvent);
    return () => {
      window.removeEventListener('novelforge:confirm-save-asset', handleConfirmSaveAssetEvent);
    };
  }, [handleConfirmSaveAsset]);

  const handleRejectSaveAsset = useCallback((messageId: string, requestIndex: number) => {
    if (!currentSessionId) return;
    const messages = messagesMap.get(currentSessionId) ?? [];
    const msg = messages.find((m) => m.id === messageId);
    if (!msg?.saveAssetRequests?.[requestIndex]) return;

    updateMessage(currentSessionId, messageId, {
      saveAssetRequests: msg.saveAssetRequests.map((r, i) =>
        i === requestIndex ? { ...r, status: 'rejected' as const } : r,
      ),
    });
  }, [currentSessionId, messagesMap, updateMessage]);

  const handleChangeSaveAssetDestination = useCallback((
    messageId: string,
    requestIndex: number,
    destination: ChapterSaveDestination,
  ) => {
    let targetSessionId = currentSessionId || '';
    let messages = targetSessionId ? (messagesMap.get(targetSessionId) ?? []) : [];
    if (!messages.some((m) => m.id === messageId)) {
      Array.from(messagesMap.entries()).some(([sessionId, sessionMessages]) => {
        if (sessionMessages.some((m: Message) => m.id === messageId)) {
          targetSessionId = sessionId;
          messages = sessionMessages;
          return true;
        }
        return false;
      });
    }

    if (!targetSessionId) {
      return;
    }

    const msg = messages.find((m) => m.id === messageId);
    const request = msg?.saveAssetRequests?.[requestIndex];
    if (!request || request.status !== 'pending') {
      return;
    }

    updateMessage(targetSessionId, messageId, {
      saveAssetRequests: msg!.saveAssetRequests!.map((item, index) =>
        index === requestIndex ? {
          ...applyChapterSaveDestinationToRequest(item, destination),
          status: item.status,
        } : item,
      ),
    });
  }, [currentSessionId, messagesMap, updateMessage]);

  const handleSelectSaveAssetTarget = useCallback((
    messageId: string,
    requestIndex: number,
    targetId: string,
  ) => {
    let targetSessionId = currentSessionId || '';
    let messages = targetSessionId ? (messagesMap.get(targetSessionId) ?? []) : [];
    if (!messages.some((m) => m.id === messageId)) {
      Array.from(messagesMap.entries()).some(([sessionId, sessionMessages]) => {
        if (sessionMessages.some((m: Message) => m.id === messageId)) {
          targetSessionId = sessionId;
          messages = sessionMessages;
          return true;
        }
        return false;
      });
    }

    if (!targetSessionId) {
      return;
    }

    const msg = messages.find((m) => m.id === messageId);
    const request = msg?.saveAssetRequests?.[requestIndex];
    if (!request || request.status !== 'pending') {
      return;
    }

    const cleanTargetId = targetId.trim();
    updateMessage(targetSessionId, messageId, {
      saveAssetRequests: msg!.saveAssetRequests!.map((item, index) =>
        index === requestIndex ? {
          ...applyChapterSaveTargetToRequest(item, cleanTargetId),
          status: item.status,
        } : item,
      ),
    });
  }, [currentSessionId, messagesMap, updateMessage]);

  const findRelationshipRepairSuggestion = useCallback((
    messageId: string,
    suggestionIndex: number,
    source: 'suggestions' | 'queue' = 'suggestions',
  ) => {
    let targetSessionId = currentSessionId || '';
    let messages = targetSessionId ? (messagesMap.get(targetSessionId) ?? []) : [];
    if (!messages.some((m) => m.id === messageId)) {
      Array.from(messagesMap.entries()).some(([sessionId, sessionMessages]) => {
        if (sessionMessages.some((m: Message) => m.id === messageId)) {
          targetSessionId = sessionId;
          messages = sessionMessages;
          return true;
        }
        return false;
      });
    }
    const msg = messages.find((m) => m.id === messageId);
    const suggestion = source === 'queue'
      ? msg?.agentTrace?.relationship_repair_queue?.[suggestionIndex]
      : msg?.agentTrace?.relationship_repair_suggestions?.[suggestionIndex];
    return { targetSessionId, suggestion };
  }, [currentSessionId, messagesMap]);

  const handleSaveRelationshipRepairDraft = useCallback(async (
    messageId: string,
    suggestionIndex: number,
    source: 'suggestions' | 'queue' = 'suggestions',
  ) => {
    const { targetSessionId, suggestion } = findRelationshipRepairSuggestion(messageId, suggestionIndex, source);
    if (!targetSessionId || !suggestion) {
      showSaveNotification('保存失败：没有找到关系修复建议', 3200);
      return false;
    }
    try {
      const result = await saveRelationshipRepairDraft({
        suggestion,
        sessionId: targetSessionId,
        parentId: currentNovelParentId || undefined,
      });
      showSaveNotification(`已保存关系补强草稿：${result.contentId}`, 3200);
      refreshProjectAssets();
      return true;
    } catch (err) {
      console.error('保存关系补强草稿失败:', err);
      showSaveNotification('保存关系补强草稿失败，请稍后重试', 3200);
      return false;
    }
  }, [currentNovelParentId, findRelationshipRepairSuggestion, refreshProjectAssets, showSaveNotification]);

  const handleUpdateRelationshipRepair = useCallback(async (
    messageId: string,
    suggestionIndex: number,
    source: 'suggestions' | 'queue' = 'suggestions',
  ) => {
    const { targetSessionId, suggestion } = findRelationshipRepairSuggestion(messageId, suggestionIndex, source);
    if (!targetSessionId || !suggestion) {
      showSaveNotification('更新失败：没有找到关系修复建议', 3200);
      return false;
    }
    try {
      const result = await updateRelationshipWithRepair({
        suggestion,
        sessionId: targetSessionId,
        parentId: currentNovelParentId || undefined,
      });
      showSaveNotification(`已更新原关系资产：${result.contentId}`, 3200);
      refreshProjectAssets();
      return true;
    } catch (err) {
      console.error('更新关系资产失败:', err);
      showSaveNotification(err instanceof Error ? err.message : '更新关系资产失败，请稍后重试', 3600);
      return false;
    }
  }, [currentNovelParentId, findRelationshipRepairSuggestion, refreshProjectAssets, showSaveNotification]);

  const resolveAssetRequestCandidatesFromProject = useCallback(async (
    request: AssetRequestDirective,
  ): Promise<FocusedAsset[]> => {
    const fallbackCandidates = resolveRankedAssetRequestCandidates(request, projectAssets, focusedAssets);
    if (!currentSessionId) {
      return fallbackCandidates;
    }

    const requestedTypes = request.types
      .map(normalizeAssetRequestType)
      .filter((value): value is ContentType => value !== null);
    const queryVariants = Array.from(
      new Set([
        request.query?.trim() ?? '',
        ...tokenizeLookupText(request.query ?? '').filter((token) => token.length >= 2).slice(0, 4),
        ...(request.query?.trim()
          ? []
          : tokenizeLookupText(request.reason ?? '').filter((token) => token.length >= 2).slice(0, 3)),
      ].filter((value) => value.length > 0)),
    );
    const candidatePool = new Map<string, ContentItem>();
    const candidateLimit = Math.max(request.limit ?? 4, 4) * 6;

    try {
      const queries = queryVariants.length > 0 ? queryVariants : [''];
      for (const query of queries) {
        const searchResult = await contentService.search({
          query: query || undefined,
          content_types: requestedTypes.length > 0 ? requestedTypes : undefined,
          session_id: currentSessionId,
          parent_id: useAppStore.getState().selectedNovelId || undefined,
          limit: candidateLimit,
          offset: 0,
        });

        for (const item of searchResult.items) {
          if (item.metadata.session_id && item.metadata.session_id !== currentSessionId) {
            continue;
          }
          candidatePool.set(item.metadata.id, item);
        }

        if (candidatePool.size >= candidateLimit) {
          break;
        }
      }

      if (candidatePool.size === 0) {
        return fallbackCandidates;
      }

      return rankAssetRequestCandidateItems(request, Array.from(candidatePool.values()), focusedAssets);
    } catch (error) {
      console.warn('项目资产检索回退到本地候选解析:', error);
      return fallbackCandidates;
    }
  }, [currentSessionId, focusedAssets, projectAssets]);

  const handleSendMessage = async (text: string, sessionIdOverride?: string, aiModeOverride?: AIMode) => {
    const targetSessionId = sessionIdOverride || currentSessionId;
    if (!targetSessionId) return;
    const requestOpenAIConfig: OpenAIConfig = {
      ...openAIConfig,
      ai_mode: aiModeOverride ?? aiMode,
    };
    const requestContext = {
      session_id: targetSessionId,
      selected_novel_id: selectedNovelId ?? undefined,
      project_title: currentSessionTitle ?? undefined,
      project_summary: projectSummary,
      focused_assets: focusedAssets.map((asset) => ({
        id: asset.id,
        type: asset.type,
        title: asset.title,
        summary: asset.summary,
        source: asset.source,
      })),
      focused_assets_summary: focusedAssetSummary || undefined,
      system_prompt:
        '如果当前项目已经存在角色、世界观、章节或大纲，请优先沿用它们的命名、设定和关系，不要无故重置或改写既有资产。',
    };
    appendMessage(targetSessionId, { id: `msg-${Date.now()}`, role: 'user', content: text, timestamp: new Date() });
    const assistantMessageId = `msg-agent-${Date.now()}`;
    appendMessage(targetSessionId, {
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
      let agentTrace: Message['agentTrace'] | undefined;
      let streamedSuccessfully = false;
      let streamAccepted = false;

      try {
        for await (const event of chatService.streamMessage(targetSessionId, text, requestContext, requestOpenAIConfig)) {
          streamAccepted = true;
          if (event.type === 'agent_trace') {
            agentTrace = normalizeAgentTrace(event.trace);
            if (agentTrace) {
              updateMessage(targetSessionId, assistantMessageId, { agentTrace });
            }
          }
          if (event.type === 'thinking_delta' && typeof event.delta === 'string') {
            finalThinking += event.delta;
            updateMessage(targetSessionId, assistantMessageId, { thinking: finalThinking });
          }
          if (event.type === 'content_delta' && typeof event.delta === 'string') {
            finalContent += event.delta;
            updateMessage(targetSessionId, assistantMessageId, { content: finalContent, thinking: finalThinking });
          }
          if (event.type === 'message_complete') {
            if (typeof event.content === 'string') finalContent = event.content;
            if (typeof event.thinking === 'string') finalThinking = event.thinking;
            streamedSuccessfully = true;
            updateMessage(targetSessionId, assistantMessageId, {
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
        if (streamAccepted) {
          throw streamError;
        }
        console.warn('Streaming request failed before response, falling back to sync chat:', streamError);
        const reply = await chatService.sendMessage(targetSessionId, text, requestContext, requestOpenAIConfig);
        agentTrace = normalizeAgentTrace(reply.context?.agent_trace);
        const aiContent = reply.message?.content || '...';
        const parsed = parseThinkingProcess(aiContent);
        finalContent = parsed.answer || aiContent;
        finalThinking = parsed.thinking;
        updateMessage(targetSessionId, assistantMessageId, {
          content: finalContent,
          thinking: finalThinking,
          agentTrace,
          isStreaming: false,
        });
        streamedSuccessfully = true;
      }

      if (!streamedSuccessfully) {
        updateMessage(targetSessionId, assistantMessageId, { isStreaming: false });
      }

        const artifacts = parseMultipleAIArtifacts(finalContent);
        const assetRequest = parseAssetRequest(finalContent);
        const saveAssetRequests = parseSaveAssetRequests(finalContent);
        const assetRequestCandidates = assetRequest
          ? await resolveAssetRequestCandidatesFromProject(assetRequest)
          : [];
      const cleanedContent = extractCleanText(finalContent);
      const displayContent = artifacts.length > 0
        ? (artifacts[0].cleanText || cleanedContent)
        : cleanedContent;
        updateMessage(targetSessionId, assistantMessageId, {
          content: displayContent,
          thinking: finalThinking,
          agentTrace,
          isStreaming: false,
          artifact: artifacts.length > 0
            ? {
                type: artifacts[0].type,
                title: artifacts[0].title,
                data: artifacts[0].data,
              }
            : undefined,
          assetRequest: assetRequest
            ? {
                query: assetRequest.query,
                reason: assetRequest.reason,
                sessionId: targetSessionId,
                status: assetRequestCandidates.length > 0 ? 'pending' : 'empty',
                selectedKeys: [],
                candidates: assetRequestCandidates,
              }
            : undefined,
          saveAssetRequests: saveAssetRequests.length > 0
            ? saveAssetRequests.map((req) => ({
                ...req,
                status: 'pending' as const,
              }))
            : undefined,
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
      updateSessionPreview(targetSessionId, displayContent, text.slice(0, 20));
    } catch (error) {
      console.error(error);
      const { message, transient } = formatChatErrorMessage(error);
      updateMessage(targetSessionId, assistantMessageId, {
        content: `请求失败：${message}`,
        thinking: '',
        isStreaming: false,
        retryText: transient ? text : undefined,
        errorKind: transient ? 'transient_provider' : 'general',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRetryMessage = (messageId: string, retryText: string) => {
    if (!retryText.trim() || isGenerating) {
      return;
    }
    void handleSendMessage(retryText, currentSessionId || undefined, aiMode);
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
      className="nf-shell"
      style={{
        display: 'flex',
        height: '100%',
        minHeight: 0,
        width: '100%',
        overflow: 'hidden',
        background: 'var(--nf-bg)',
      }}
    >
        <ChatSidebar
          collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          currentSessionId={currentSessionId || ''} onSelectSession={handleSelectSession}
          onNewSession={createNewSession} onDeleteSession={deleteSession}
          onCleanupEmptySessions={handleCleanupEmptySessions} sessions={sessions}
        />

      <main className="nf-main" style={{ position: 'relative' }}>
        <header className="nf-topbar" style={{
          zIndex: 30
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontWeight: 600, color: 'var(--nf-text)' }}>
              {sessions.find(s => s.id === currentSessionId)?.title || '加载中...'}
            </div>
          </div>

          <div style={{
            display: 'flex', background: 'var(--nf-panel-soft)', padding: 3, borderRadius: 10, border: '1px solid var(--nf-border)'
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
              display: 'flex', background: 'var(--nf-panel-soft)', padding: 3, borderRadius: 10, border: '1px solid var(--nf-border)'
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
            <div
              role="group"
              aria-label="创作模式"
              style={{
                display: 'flex', alignItems: 'center', padding: 3, borderRadius: 999,
                background: 'var(--nf-panel-soft)', border: '1px solid var(--nf-border)'
              }}
            >
              {(['fast', 'pro'] as AIMode[]).map((mode) => {
                const active = aiMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleAIModeChange(mode)}
                    title={mode === 'fast' ? '快速模式：适合灵感、聊天和轻量改写' : 'Pro 模式：适合深度创作、序章和复杂分析'}
                    style={{
                      border: 'none', borderRadius: 999, padding: '7px 11px',
                      background: active ? 'var(--nf-accent-soft)' : 'transparent',
                      color: active ? 'var(--nf-accent)' : 'var(--nf-text-muted)',
                      fontSize: 12, fontWeight: active ? 800 : 600, cursor: 'pointer'
                    }}
                  >
                    {mode === 'fast' ? '快速' : 'Pro'}
                  </button>
                );
              })}
            </div>
            <button
              onClick={handleExportProject}
              title="导出项目数据包"
              style={{
                width: 36, height: 36, borderRadius: 8, background: 'var(--nf-panel-soft)',
                border: '1px solid var(--nf-border)', color: 'var(--nf-text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
              }}
            >
              <Download size={18} />
            </button>
          </div>
        </header>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {viewMode === 'chat' ? (
            <div className="nf-chat-layout">
              <section className="nf-chat-main">
              {currentMessages.length === 0 && (
                <ProjectQualityOverview
                  summary={projectQualitySummary}
                  compact
                  onOpenEditor={() => router.push('/editor')}
                  onOpenExtract={() => router.push('/extract')}
                  onOpenDashboard={() => {
                    setViewMode('dashboard');
                    setDashboardType('list');
                  }}
                />
              )}
              {currentMessages.length === 0 && focusedAssets.length > 0 && (
                <div
                  style={{
                    padding: '14px 20px 10px',
                    borderBottom: '1px solid var(--nf-border)',
                    background: 'var(--nf-accent-soft)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    flexShrink: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--nf-accent)' }}>当前聚焦资产</div>
                      <div style={{ fontSize: 12, color: 'var(--nf-text-muted)' }}>
                        本轮聊天会优先参考这些项目资产，强化连续性、关联性和逻辑一致性。
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearFocusedAssets}
                      style={{
                        border: '1px solid var(--nf-border)',
                        background: 'var(--nf-surface)',
                        color: 'var(--nf-text-muted)',
                        borderRadius: 10,
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      清空聚焦
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {focusedAssets.map((asset) => (
                      <div
                        key={asset.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          borderRadius: 999,
                          padding: '8px 12px',
                          background: 'var(--nf-surface)',
                          border: '1px solid var(--nf-border)',
                          maxWidth: 360,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--nf-text)' }}>
                            {formatContentTypeLabel(asset.type)} · {asset.title}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--nf-text-subtle)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: 260,
                            }}
                          >
                            {asset.summary}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFocusedAsset(asset.key)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--nf-text-subtle)',
                            cursor: 'pointer',
                            fontSize: 16,
                            lineHeight: 1,
                          }}
                          aria-label={`移除 ${asset.title}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {currentMessages.length === 0 && (quickReferenceGroups.length > 0 || assetQuickSearch.trim().length > 0) && (
                <div
                  style={{
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--nf-border)',
                    background: 'var(--nf-surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    flexShrink: 0,
                    maxHeight: currentMessages.length > 0 ? 180 : 260,
                    overflowY: 'auto',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--nf-text-muted)' }}>
                      项目资产快捷引用
                    </div>
                    <input
                      type="text"
                      value={assetQuickSearch}
                      onChange={(event) => setAssetQuickSearch(event.target.value)}
                      placeholder="搜索角色、章节、世界观..."
                      style={{
                        width: 260,
                        maxWidth: '50%',
                        borderRadius: 10,
                        border: '1px solid var(--nf-border)',
                        background: 'var(--nf-bg)',
                        color: 'var(--nf-text)',
                        padding: '8px 12px',
                        fontSize: 12,
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {quickReferenceGroups.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>
                        当前搜索没有命中项目资产。
                      </div>
                    ) : (
                      quickReferenceGroups.map((group) => (
                        <div
                          key={group.key}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '72px 1fr',
                            gap: 10,
                            alignItems: 'start',
                          }}
                        >
                          <div style={{ fontSize: 12, color: 'var(--nf-text-subtle)', paddingTop: 8 }}>
                            {group.label}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {group.items.map((item) => {
                              const asset = buildFocusedAssetFromContentItem(item);
                              const isFocused = focusedAssets.some((focused) => focused.key === asset.key);
                              return (
                                <button
                                  key={asset.key}
                                  type="button"
                                  onClick={() => pushFocusedAssetToChat(asset, 'reference')}
                                  style={{
                                    borderRadius: 999,
                                    border: isFocused ? '1px solid color-mix(in srgb, var(--nf-accent) 42%, transparent)' : '1px solid var(--nf-border)',
                                    background: isFocused ? 'var(--nf-accent-soft)' : 'var(--nf-bg)',
                                    color: isFocused ? 'var(--nf-accent)' : 'var(--nf-text-muted)',
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    maxWidth: 220,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-start',
                                    gap: 2,
                                  }}
                                  title={asset.summary}
                                >
                                  <span
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 700,
                                      maxWidth: '100%',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {asset.title}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      color: 'var(--nf-text-subtle)',
                                      maxWidth: '100%',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {isFocused ? '已加入当前上下文' : asset.summary}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <MessageList
                    messages={currentMessages.filter(m => m.role !== 'system')}
                    chapterSaveTargets={chapterSaveTargets}
                    onSelectAssetCandidate={handleSelectAssetCandidate}
                    onOpenArtifact={handleOpenMessageArtifact}
                    onConfirmSaveAsset={handleConfirmSaveAsset}
                    onRejectSaveAsset={handleRejectSaveAsset}
                    onChangeSaveAssetDestination={handleChangeSaveAssetDestination}
                    onSelectSaveAssetTarget={handleSelectSaveAssetTarget}
                    onSaveRelationshipRepairDraft={handleSaveRelationshipRepairDraft}
                    onUpdateRelationshipRepair={handleUpdateRelationshipRepair}
                    onRetryMessage={handleRetryMessage}
                  />
                {isGenerating && (
                  <div style={{ display: 'flex', alignItems: 'center', padding: '16px 40px', color: 'var(--nf-text-muted)' }}>
                    <Loader2 size={18} className="animate-spin" style={{ marginRight: 10 }} />
                    <span>AI 正在思考...</span>
                  </div>
                )}
              </div>
              <div className="nf-input-wrap">
                <ChatInput
                  onSend={handleSendMessage}
                  sessionId={currentSessionId || undefined}
                  openAIConfig={openAIConfig}
                  aiMode={aiMode}
                  onAIModeChange={handleAIModeChange}
                  prefill={chatPrefill}
                />
              </div>
              </section>
              <aside className="nf-context-rail" aria-label="项目上下文">
                <div className="nf-panel nf-panel-pad">
                  <div className="nf-panel-title">项目状态</div>
                  <div className="nf-panel-subtitle">
                    {projectQualitySummary.status_label}。资料不足时仍可聊天，但建议先导入小说或整理章节。
                  </div>
                  <div className="nf-pill-row" style={{ marginTop: 12 }}>
                    <button className="nf-button" type="button" onClick={() => router.push('/extract')}>导入小说</button>
                    <button className="nf-button" type="button" onClick={() => router.push('/editor')}>打开 editor</button>
                  </div>
                </div>
                <div className="nf-panel nf-panel-pad">
                  <div className="nf-panel-title">上下文</div>
                  <div className="nf-stat-grid" style={{ marginTop: 12 }}>
                    <div className="nf-stat"><span>角色</span><strong>{projectAssets.characters.length}</strong></div>
                    <div className="nf-stat"><span>关系</span><strong>{projectAssets.relationships.length}</strong></div>
                    <div className="nf-stat"><span>章节</span><strong>{projectAssets.chapters.length}</strong></div>
                    <div className="nf-stat"><span>世界观</span><strong>{projectAssets.worlds.length}</strong></div>
                  </div>
                </div>
                <div className="nf-panel nf-panel-pad">
                  <div className="nf-panel-title">聚焦资产</div>
                  <div className="nf-panel-subtitle">
                    {focusedAssets.length > 0 ? `${focusedAssets.length} 条资产会优先进入本轮创作。` : '还没有聚焦资产。可以从快捷引用中加入角色、章节或世界观。'}
                  </div>
                </div>
              </aside>
            </div>
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
                      onClick={handleGeneratePrologue}
                      disabled={isGeneratingChapter || projectAssets.characters.length === 0}
                      style={{
                        background: '#a7f3d0', color: '#064e3b', padding: '10px 20px', borderRadius: 12,
                        fontWeight: 800, fontSize: 14, cursor: projectAssets.characters.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                        border: 'none', boxShadow: '0 8px 16px rgba(0,0,0,0.2)', opacity: isGeneratingChapter || projectAssets.characters.length === 0 ? 0.6 : 1
                      }}
                      title={projectAssets.characters.length === 0 ? '请先导入并提取小说资产' : '基于当前资产生成并保存序章建议'}
                    >
                      {isGeneratingChapter ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                      生成序章
                    </button>
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

                <ProjectQualityOverview
                  summary={projectQualitySummary}
                  onOpenEditor={() => router.push('/editor')}
                  onOpenExtract={() => router.push('/extract')}
                  onOpenDashboard={() => {
                    setViewMode('dashboard');
                    setDashboardType('list');
                  }}
                />

                {dashboardType === 'tree' ? (
                  <div style={{ marginBottom: 40 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                      <GitBranch size={20} color="var(--accent-primary)" />
                      <h3 style={{ fontSize: 18, fontWeight: 600 }}>世界树拓扑</h3>
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
                      onNodeClick={(node: WorldTreeNode) => {
                        void openTopologyNode(node);
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
                            const chapterTitle = formatDisplayTitle(getContentAssetTitle(chap, parsedChapData), '未命名章节');
                            const chapText = getContentAssetText(chap, parsedChapData);
                            const canBindToCurrentNovel = Boolean(selectedNovelId && isUnassignedNovelScopedContentItem(chap));
                            return (
                              <div key={chap.metadata.id} style={{
                                padding: 24, borderRadius: 16, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                                boxShadow: 'var(--shadow-sm)', cursor: 'pointer'
                              }} onClick={() => openContentItem(chap)}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
                                  <h4 style={{ fontWeight: 700, fontSize: 15 }}>{chapterTitle}</h4>
                                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                    {canBindToCurrentNovel && (
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          bindContentItemToSelectedNovel(chap);
                                        }}
                                        style={{ border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.12)', color: '#c4b5fd', borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}
                                      >
                                        绑定到当前小说
                                      </button>
                                    )}
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                        {projectAssets.characters.length === 0 ? (
                          <div style={{ padding: 20, border: '1px dashed var(--border-subtle)', borderRadius: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>还没有角色</div>
                        ) : (
                          projectAssets.characters.map((char) => {
                            const charData = getContentAssetPayload(char);
                            const role = readString(charData.role) ?? '设定';
                            const characterTitle = formatDisplayTitle(char.metadata.title, '未命名角色');
                            const canBindToCurrentNovel = Boolean(selectedNovelId && isUnassignedNovelScopedContentItem(char));
                            return (
                              <div key={char.metadata.id} onClick={() => openContentItem(char)} style={assetMiniCardStyle}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{characterTitle[0]}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, fontSize: 14 }}>{characterTitle}</div>
                                  <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{role}</div>
                                  {canBindToCurrentNovel && (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        bindContentItemToSelectedNovel(char);
                                      }}
                                      style={{ marginTop: 6, border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.12)', color: '#c4b5fd', borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}
                                    >
                                      绑定到当前小说
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        <LayoutDashboard size={20} color="#10b981" />
                        <h3 style={{ fontSize: 18, fontWeight: 600 }}>世界观 / 时间线 / 关系</h3>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[
                          ...projectAssets.worlds,
                          ...projectAssets.timelines,
                          ...projectAssets.relationships,
                        ].length === 0 ? (
                          <div style={{ padding: 20, border: '1px dashed var(--border-subtle)', borderRadius: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>还没有世界观、时间线或关系资产</div>
                        ) : (
                          [
                            ...projectAssets.worlds,
                            ...projectAssets.timelines,
                            ...projectAssets.relationships,
                          ].slice(0, 12).map((item) => {
                            const payload = getContentAssetPayload(item);
                            const subtitle = item.metadata.type === 'world'
                              ? readString(payload.description) ?? '世界观资产'
                              : item.metadata.type === 'timeline'
                                ? readString(payload.description) ?? readString(payload.date) ?? '时间线资产'
                                : readString(payload.description) ?? `${readString(payload.source) ?? '未知'} → ${readString(payload.target) ?? readString(payload.target_name) ?? '未知'}`;
                            const canBindToCurrentNovel = Boolean(selectedNovelId && isUnassignedNovelScopedContentItem(item));
                            return (
                              <div
                                key={item.metadata.id}
                                onClick={() => openContentItem(item)}
                                style={assetMiniCardStyle}
                              >
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                                  {item.metadata.type === 'world' ? '世' : item.metadata.type === 'timeline' ? '时' : '关'}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, fontSize: 14 }}>{formatDisplayTitle(getContentAssetTitle(item, payload), '未命名资产')}</div>
                                  <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {formatContentTypeLabel(item.metadata.type)} · {subtitle}
                                  </div>
                                  {canBindToCurrentNovel && (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        bindContentItemToSelectedNovel(item);
                                      }}
                                      style={{ marginTop: 6, border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.12)', color: '#c4b5fd', borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}
                                    >
                                      绑定到当前小说
                                    </button>
                                  )}
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
        onPinToContext={(art, updatedData) => {
          pushFocusedAssetToChat(buildFocusedAssetFromArtifact({
            type: art.type,
            title: art.title,
            data: updatedData,
          }), 'pin');
          setViewMode('chat');
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
        openAIConfig={{ ...openAIConfig, ai_mode: 'pro' }}
        onSubmitted={({ fileName }) => {
          showSaveNotification(`导入任务已提交：${fileName}，可在右下角任务中心查看进度`, 3000);
        }}
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

function formatContentTypeLabel(type: ContentType | string): string {
  switch (type) {
    case 'character':
    case 'character_card':
      return '角色';
    case 'world':
    case 'world_setting':
      return '世界观';
    case 'chapter':
      return '章节';
    case 'outline':
      return '大纲';
    case 'timeline':
      return '时间线';
    case 'relationship':
      return '关系网';
    case 'novel':
      return '小说';
    default:
      return String(type);
  }
}

function isTransientProviderError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /HTTP\s+(500|502|503|504)|timeout|timed?\s*out|socket|ECONNRESET|network|fetch failed/i.test(message);
}

function isProviderAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /HTTP\s*401|401\s+Unauthorized|Unauthorized|invalid api key|incorrect api key|authentication|鉴权|认证/i.test(message);
}

function formatChatErrorMessage(error: unknown): { message: string; transient: boolean } {
  if (isProviderAuthError(error)) {
    return {
      transient: false,
      message: 'AI provider 鉴权失败，请检查服务端 OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL 配置后重试。系统没有保存本次失败输出。',
    };
  }

  const transient = isTransientProviderError(error);
  if (transient) {
    return {
      transient: true,
      message: '上游模型服务暂时不可用或响应超时。可以点击“重试本次请求”，或切换到快速模式后再试；系统不会自动重复保存任何内容。',
    };
  }
  return {
    transient: false,
    message: error instanceof Error ? error.message : '发送消息失败',
  };
}

function buildFocusedAssetFromContentItem(item: ContentItem): FocusedAsset {
  const payload = getContentAssetPayload(item);
  const title = formatDisplayTitle(getContentAssetTitle(item, payload), '未命名资产');
  const text = getContentAssetText(item, payload);
  const summarySeed = text || JSON.stringify(payload);

  return {
    key: item.metadata.id,
    id: item.metadata.id,
    type: item.metadata.type,
    title,
    summary: clipFocusedAssetSummary(summarySeed),
    source: 'project_asset',
  };
}

function buildFocusedAssetSummary(items: FocusedAsset[]): string {
  if (items.length === 0) {
    return '';
  }

  return items
    .map((item, index) => `${index + 1}. [${formatContentTypeLabel(item.type)}] ${item.title}\n${item.summary}`)
    .join('\n\n');
}

function ProjectQualityOverview({
  summary,
  compact = false,
  onOpenEditor,
  onOpenExtract,
  onOpenDashboard,
}: {
  summary: ProjectQualitySummary;
  compact?: boolean;
  onOpenEditor: () => void;
  onOpenExtract: () => void;
  onOpenDashboard: () => void;
}) {
  const statusColor = summary.overall_status === 'ready'
    ? { bg: 'color-mix(in srgb, var(--nf-success) 12%, transparent)', border: 'color-mix(in srgb, var(--nf-success) 35%, transparent)', text: 'var(--nf-success)' }
    : summary.overall_status === 'needs_repair'
      ? { bg: 'color-mix(in srgb, var(--nf-warning) 12%, transparent)', border: 'color-mix(in srgb, var(--nf-warning) 35%, transparent)', text: 'var(--nf-warning)' }
      : summary.overall_status === 'insufficient'
        ? { bg: 'color-mix(in srgb, var(--nf-danger) 10%, transparent)', border: 'color-mix(in srgb, var(--nf-danger) 30%, transparent)', text: 'var(--nf-danger)' }
        : { bg: 'var(--nf-panel-soft)', border: 'var(--nf-border)', text: 'var(--nf-text-muted)' };
  const sections = [
    {
      label: '章节质量',
      value: `${summary.chapter.imported_originals + summary.chapter.formal_body + summary.chapter.formal_prologue}/${summary.chapter.total}`,
      hint: summary.chapter.issues[0] ?? '章节来源可用。',
      status: summary.chapter.status,
    },
    {
      label: '角色质量',
      value: `${summary.character.writable}/${summary.character.total}`,
      hint: summary.character.issues[0] ?? '已有可写角色。',
      status: summary.character.status,
    },
    {
      label: '关系质量',
      value: `${summary.relationship.usable}/${summary.relationship.total}`,
      hint: summary.relationship.issues[0] ?? '已有可写关系张力。',
      status: summary.relationship.status,
      sublabel: summary.relationship.quality_status === 'usable' ? 'usable' : summary.relationship.quality_status === 'thin' ? 'thin' : 'empty',
    },
    {
      label: '世界观质量',
      value: `${summary.world.usable_signals}`,
      hint: summary.world.issues[0] ?? '已有可写世界观信号。',
      status: summary.world.status,
    },
    {
      label: '写作准备度',
      value: summary.writing_ready ? '通过' : '未通过',
      hint: summary.writing_readiness.issues[0] ?? '可以进入 AI 创作。',
      status: summary.writing_readiness.status,
      sublabel: '',
    },
  ];
  const actionHints = [
    ...summary.relationship.actions,
    ...summary.chapter.actions,
    ...summary.character.actions,
    ...summary.world.actions,
    ...summary.writing_readiness.actions,
  ].slice(0, compact ? 3 : 6);

  return (
    <div
      style={{
        padding: compact ? '12px 20px' : '18px 20px',
        borderBottom: compact ? '1px solid var(--nf-border)' : undefined,
        marginBottom: compact ? 0 : 28,
        background: compact ? 'color-mix(in srgb, var(--nf-surface) 72%, transparent)' : 'var(--nf-surface)',
        border: compact ? undefined : '1px solid var(--nf-border)',
        borderRadius: compact ? 0 : 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--nf-text)' }}>项目质量总览</span>
            <span style={{
              borderRadius: 999,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 800,
              color: statusColor.text,
              background: statusColor.bg,
              border: `1px solid ${statusColor.border}`,
            }}>
              {summary.status_label}
            </span>
          </div>
          <div style={{ marginTop: 5, fontSize: 12, color: 'var(--nf-text-muted)' }}>
            内测闸门：至少需要可写角色、usable 关系、世界观信号和章节片段来源。
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={onOpenExtract} style={qualityButtonStyle}>提取/修复</button>
          <button type="button" onClick={onOpenEditor} style={qualityButtonStyle}>整理章节</button>
          {!compact ? <button type="button" onClick={onOpenDashboard} style={qualityButtonStyle}>项目仪表盘</button> : null}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: compact ? 'repeat(auto-fit, minmax(130px, 1fr))' : 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 10,
      }}>
        {sections.map((section) => (
          <div key={section.label} style={{
            border: '1px solid var(--nf-border)',
            borderRadius: 12,
            padding: '10px 12px',
            background: 'var(--nf-panel-soft)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--nf-text-muted)', fontWeight: 700 }}>{section.label}</span>
              <span style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: section.status === 'ready' ? 'var(--nf-success)' : section.status === 'needs_repair' ? 'var(--nf-warning)' : 'var(--nf-danger)',
                flexShrink: 0,
              }} />
            </div>
            <div style={{ marginTop: 7, fontSize: 19, fontWeight: 900, color: 'var(--nf-text)' }}>{section.value}</div>
            {section.sublabel ? <div style={{ marginTop: 2, fontSize: 10, color: 'var(--nf-text-subtle)' }}>{section.sublabel}</div> : null}
            {!compact ? <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.5, color: 'var(--nf-text-subtle)' }}>{section.hint}</div> : null}
          </div>
        ))}
      </div>

      {actionHints.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {actionHints.map((action, index) => (
            <span key={`${action}-${index}`} style={{
              border: '1px solid color-mix(in srgb, var(--nf-accent) 25%, transparent)',
              background: 'var(--nf-accent-soft)',
              color: 'var(--nf-accent)',
              borderRadius: 999,
              padding: '6px 10px',
              fontSize: 11,
              lineHeight: 1.4,
            }}>
              {action}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function reconcileAssetRequestWithFocusedAssets(
  request: AssetRequestState,
  currentSessionId: string,
  focusedKeys: Set<string>,
): ReconciledAssetRequestState {
  const selectedKeys = request.candidates
    .map((candidate) => candidate.key)
    .filter((key) => focusedKeys.has(key));

  if ((request.sessionId ?? currentSessionId) !== currentSessionId) {
    return {
      selectedKeys,
      status: 'stale',
    };
  }

  if (request.candidates.length === 0) {
    return {
      selectedKeys: [],
      status: 'empty',
    };
  }

  return {
    selectedKeys,
    status: selectedKeys.length > 0 ? 'resolved' : 'pending',
  };
}

function normalizeAssetRequestType(type: string): ContentType | null {
  switch (type.trim().toLowerCase()) {
    case 'character':
    case 'character_card':
      return 'character';
    case 'world':
    case 'world_setting':
      return 'world';
    case 'chapter':
      return 'chapter';
    case 'outline':
      return 'outline';
    case 'novel':
      return 'novel';
    default:
      return null;
  }
}

function getCandidateRecencyScore(updatedAt?: string): number {
  if (!updatedAt) {
    return 0;
  }

  const timestamp = Date.parse(updatedAt);
  if (Number.isNaN(timestamp)) {
    return 0;
  }

  const ageHours = Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60));
  if (ageHours <= 6) {
    return 10;
  }
  if (ageHours <= 24) {
    return 7;
  }
  if (ageHours <= 24 * 7) {
    return 4;
  }
  return 1;
}

function normalizeLookupText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeLookupText(value: string): string[] {
  const normalized = normalizeLookupText(value);
  if (!normalized) {
    return [];
  }

  return Array.from(
    new Set(
      normalized
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 0),
    ),
  );
}

function collectAssetLookupTerms(item: ContentItem, payload: Record<string, unknown>): string[] {
  const directKeys = [
    'name',
    'title',
    'chapter_title',
    'summary',
    'description',
    'role',
    'world_name',
    'world',
    'setting_name',
    'source',
    'target',
    'target_name',
    'relationship',
    'relationship_type',
  ];
  const arrayKeys = [
    'aliases',
    'aka',
    'nickname',
    'nicknames',
    'tags',
    'characters',
    'locations',
    'related_characters',
  ];
  const nestedArrayKeys: Array<{ key: string; valueKeys: string[] }> = [
    { key: 'relationships', valueKeys: ['target_name', 'target', 'name', 'character'] },
    { key: 'characterRoles', valueKeys: ['name'] },
    { key: 'character_mentions', valueKeys: ['name', 'character', 'target_name'] },
    { key: 'location_mentions', valueKeys: ['name', 'location', 'target_name'] },
    { key: 'characters', valueKeys: ['name', 'target_name'] },
    { key: 'locations', valueKeys: ['name', 'location'] },
  ];

  const values: string[] = [item.metadata.title, getContentAssetTitle(item, payload)];

  for (const key of directKeys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      values.push(value.trim());
    }
  }

  for (const key of arrayKeys) {
    const value = payload[key];
    if (!Array.isArray(value)) {
      continue;
    }

    for (const entry of value) {
      if (typeof entry === 'string' && entry.trim()) {
        values.push(entry.trim());
      }
    }
  }

  for (const { key, valueKeys } of nestedArrayKeys) {
    const value = payload[key];
    if (!Array.isArray(value)) {
      continue;
    }

    for (const entry of value) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const record = entry as Record<string, unknown>;
      for (const valueKey of valueKeys) {
        const nestedValue = record[valueKey];
        if (typeof nestedValue === 'string' && nestedValue.trim()) {
          values.push(nestedValue.trim());
        }
      }
    }
  }

  for (const tag of item.metadata.tags ?? []) {
    if (typeof tag === 'string' && tag.trim()) {
      values.push(tag.trim());
    }
  }

  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));
}

function rankAssetRequestCandidateItems(
  request: AssetRequestDirective,
  items: ContentItem[],
  currentFocusedAssets: FocusedAsset[] = []
): FocusedAsset[] {
  const requestedTypes = request.types
    .map(normalizeAssetRequestType)
    .filter((value): value is ContentType => value !== null);

  const normalizedQuery = normalizeLookupText(request.query ?? '');
  const requestedTokens = normalizedQuery
    .split(/[\s,，、]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const reasonTokens = tokenizeLookupText(request.reason ?? '').slice(0, 8);
  const limit = request.limit ?? 4;

  return items
    .filter((item) => requestedTypes.length === 0 || requestedTypes.includes(item.metadata.type))
    .map((item) => {
      const payload = getContentAssetPayload(item);
      const title = formatDisplayTitle(getContentAssetTitle(item, payload), '未命名资产');
      const text = getContentAssetText(item, payload);
      const relationText = JSON.stringify(item.relations ?? {});
      const lookupTerms = collectAssetLookupTerms(item, payload);
      const normalizedLookupTerms = lookupTerms
        .map((term) => normalizeLookupText(term))
        .filter((term) => term.length > 0);
      const haystack = normalizeLookupText([title, text, JSON.stringify(payload), relationText, ...lookupTerms].join(' '));
      const normalizedTitle = normalizeLookupText(title);

      let score = 0;
      let matchedTokens = 0;

      if (!normalizedQuery) {
        score += 20;
      } else {
        if (normalizedLookupTerms.some((term) => term === normalizedQuery)) {
          score += 132;
        } else if (normalizedLookupTerms.some((term) => term.includes(normalizedQuery))) {
          score += 92;
        } else if (haystack.includes(normalizedQuery)) {
          score += 44;
        }

        for (const token of requestedTokens) {
          if (normalizedLookupTerms.some((term) => term === token)) {
            matchedTokens += 1;
            score += 28;
            continue;
          }

          if (normalizedLookupTerms.some((term) => term.includes(token))) {
            matchedTokens += 1;
            score += 18;
            continue;
          }

          if (haystack.includes(token)) {
            matchedTokens += 1;
            score += 8;
          }
        }

        if (requestedTokens.length > 0 && matchedTokens === 0 && !haystack.includes(normalizedQuery)) {
          return null;
        }

        if (requestedTokens.length > 0 && matchedTokens === requestedTokens.length) {
          score += 16;
        }
      }

      for (const token of reasonTokens) {
        if (normalizedLookupTerms.some((term) => term === token)) {
          score += 8;
        } else if (normalizedLookupTerms.some((term) => term.includes(token))) {
          score += 4;
        } else if (haystack.includes(token)) {
          score += 2;
        }
      }

      const focusKey = `${item.metadata.type}:${item.metadata.id}`;
      if (currentFocusedAssets.some((focused) => focused.id === item.metadata.id || focused.key === focusKey)) {
        score += 18;
      }

      if (currentFocusedAssets.some((focused) => normalizeLookupText(focused.title) === normalizedTitle)) {
        score += 8;
      }

      const normalizedFocusedTitles = currentFocusedAssets
        .map((focused) => normalizeLookupText(focused.title))
        .filter((focusedTitle) => focusedTitle.length > 0 && focusedTitle !== normalizedTitle);
      if (normalizedFocusedTitles.some((focusedTitle) => haystack.includes(focusedTitle))) {
        score += 12;
      }

      score += getCandidateRecencyScore(item.metadata.updated_at);

      return { item, score };
    })
    .filter((entry): entry is { item: ContentItem; score: number } => entry !== null)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return Date.parse(right.item.metadata.updated_at || '') - Date.parse(left.item.metadata.updated_at || '');
    })
    .map((entry) => buildFocusedAssetFromContentItem(entry.item))
    .slice(0, limit);
}

function resolveRankedAssetRequestCandidates(
  request: AssetRequestDirective,
  assets: ProjectAssets,
  currentFocusedAssets: FocusedAsset[] = []
): FocusedAsset[] {
  const allItems: ContentItem[] = [
    ...assets.characters,
    ...assets.worlds,
    ...assets.chapters,
    ...assets.outlines,
  ];

  return rankAssetRequestCandidateItems(request, allItems, currentFocusedAssets);
}

function summarizeAssetTitles(items: ContentItem[], limit: number): string {
  const titles = items
    .slice(0, limit)
    .map((item) => formatDisplayTitle(getContentAssetTitle(item), '未命名资产'))
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
      const title = formatDisplayTitle(getContentAssetTitle(item), '未命名资产');
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

function buildProjectChatSummary(sessionTitle: string | null, assets: ProjectAssets, selectedNovelId: string | null): string {
  const activeOutline = assets.outlines.find((item) => item.metadata.id === selectedNovelId);
  const activeNovelTitle = selectedNovelId
    ? formatDisplayTitle(activeOutline?.metadata.title ?? activeOutline?.metadata.id ?? selectedNovelId, '未命名小说')
    : null;
  const lines = [
    `项目名称：${sessionTitle ?? '未命名项目'}`,
    activeNovelTitle ? `当前小说容器：${activeNovelTitle}` : '当前小说容器：全部小说',
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
  background: active ? 'var(--nf-surface)' : 'transparent',
  color: active ? 'var(--nf-accent)' : 'var(--nf-text-muted)',
  border: 'none', fontWeight: active ? 600 : 400, transition: 'all 200ms'
});

const assetMiniCardStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12,
  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
  cursor: 'pointer', transition: 'all 150ms'
};

const qualityButtonStyle: React.CSSProperties = {
  border: '1px solid var(--nf-border)',
  background: 'var(--nf-panel-soft)',
  color: 'var(--nf-text-muted)',
  borderRadius: 10,
  padding: '8px 11px',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
};
