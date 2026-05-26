import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@/types';
import { chatService, isAPIError } from '@/lib/api';
import { formatDisplayTitle, looksLikeBrokenDisplayText } from '@/lib/asset-normalization';
import { storage } from '@/lib/utils';
import { useAppStore } from './use-app-store';

const STORAGE_KEY = 'novelforge_current_session';
const HIDDEN_TEST_SESSION_KEYWORDS = [
  'mock response',
  'mock conversation',
  'test conversation',
  'goal7',
  'goal8',
  'goal9',
  'goal10',
  'goal11',
  'goal12',
  '验证',
  '清洁提取测试',
];

function sanitizePreview(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return looksLikeBrokenDisplayText(trimmed) ? '' : trimmed;
}

function toSession(input: any): Session {
  const messageCount = Array.isArray(input.messages) ? input.messages.length : 0;
  const rawPreview =
    messageCount > 0
      ? String(input.messages[input.messages.length - 1]?.content || '').slice(0, 40)
      : String(input.preview || '');

  return {
    id: String(input.id),
    title: formatDisplayTitle(String(input.title || ''), '新对话'),
    preview: sanitizePreview(rawPreview),
    time: String(input.updated_at || input.created_at || input.time || new Date().toISOString()),
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : undefined,
    messageCount,
  };
}

export function isInternalTestSession(session: Pick<Session, 'id' | 'title' | 'preview' | 'metadata'>): boolean {
  const metadata = session.metadata && typeof session.metadata === 'object' ? session.metadata as Record<string, unknown> : {};
  const marker = String(metadata.source ?? metadata.kind ?? metadata.test_run ?? '').toLowerCase();
  if (['test', 'mock', 'smoke', 'validation'].some((item) => marker.includes(item))) {
    return true;
  }
  const haystack = `${session.id} ${session.title} ${session.preview}`.toLowerCase();
  return HIDDEN_TEST_SESSION_KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

export function useSessions() {
  const sessions = useAppStore((s) => s.sessions);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const setSessions = useAppStore((s) => s.setSessions);
  const addSession = useAppStore((s) => s.addSession);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const removeSession = useAppStore((s) => s.deleteSession);
  const patchSession = useAppStore((s) => s.updateSession);
  const updateSessionPreview = useAppStore((s) => s.updateSessionPreview);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const conversations = await chatService.getConversations();
      const mapped = conversations.map(toSession).filter((session) => !isInternalTestSession(session));
      mapped.sort((a, b) => (a.time > b.time ? -1 : 1));
      setSessions(mapped);
      if (!currentSessionId && mapped.length > 0) {
        const saved = storage.get<string | null>(STORAGE_KEY, null);
        const initial = mapped.find((s) => s.id === saved)?.id || mapped[0].id;
        setCurrentSession(initial);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载会话失败');
    } finally {
      setIsLoading(false);
    }
  }, [currentSessionId, setCurrentSession, setSessions]);

  const createSession = useCallback(async (title?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const created = await chatService.startConversation(title);
      const session: Session = {
        id: created.id,
        title: formatDisplayTitle(title || created.title || '', '新对话'),
        preview: '',
        time: String(created.updated_at || created.created_at || new Date().toISOString()),
        metadata: created.metadata,
        messageCount: created.messages?.length ?? 0,
      };
      addSession(session);
      setCurrentSession(session.id);
      storage.set(STORAGE_KEY, session.id);
      return session;
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建会话失败');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [addSession, setCurrentSession]);

  const deleteSession = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      try {
        await chatService.deleteConversation(sessionId);
      } catch (err) {
        if (!isAPIError(err, 404)) {
          throw err;
        }
      }
      removeSession(sessionId);
      const nextId = useAppStore.getState().currentSessionId;
      if (nextId) {
        storage.set(STORAGE_KEY, nextId);
      } else {
        storage.remove(STORAGE_KEY);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除会话失败');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [removeSession]);

  const switchSession = useCallback((sessionId: string | null) => {
    setCurrentSession(sessionId);
    if (sessionId) {
      storage.set(STORAGE_KEY, sessionId);
    } else {
      storage.remove(STORAGE_KEY);
    }
  }, [setCurrentSession]);

  const updateSessionMeta = useCallback((sessionId: string, data: Partial<Session>) => {
    patchSession(sessionId, data);
  }, [patchSession]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId) || null,
    [sessions, currentSessionId],
  );

  return {
    sessions,
    currentSessionId,
    currentSession,
    isLoading,
    error,
    loadSessions,
    createSession,
    deleteSession,
    switchSession,
    updateSession: updateSessionMeta,
    updateSessionPreview,
    createNewSession: () => createSession(),
    selectSession: (id: string) => switchSession(id),
  };
}

export function useSessionMessages(sessionId: string | null) {
  const [messages, setMessages] = useState<Array<{ role: string; content: string; timestamp: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const conversation = await chatService.getConversation(sessionId);
      const mapped = (conversation.messages || []).map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: String(m.timestamp || new Date().toISOString()),
      }));
      setMessages(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载消息失败');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  const sendMessage = useCallback(async (content: string) => {
    if (!sessionId) {
      throw new Error('未选择会话');
    }
    setIsLoading(true);
    setError(null);
    try {
      await chatService.sendMessage(sessionId, content);
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送消息失败');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, loadMessages]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  return { messages, isLoading, error, loadMessages, sendMessage };
}
