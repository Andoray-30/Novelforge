import type { ReactNode } from 'react';
import { create } from 'zustand';
import type {
  Character,
  NetworkEdge,
  Session,
  TimelineEvent,
  WorldSetting,
} from '@/types';

export interface TaskItem {
  id: string;
  type: string;
  status: string;
  progress: number;
  message: string;
  result?: unknown;
  error?: string;
  created_at?: string;
}

interface AppStoreState {
  sessions: Session[];
  currentSessionId: string | null;
  selectedNovelId: string | null;
  characters: Character[];
  worldSetting: WorldSetting | null;
  timeline: TimelineEvent[];
  relationships: NetworkEdge[];
  activeTasks: Record<string, TaskItem>;
  activeConversationId: string | null;
}

interface AppStoreActions {
  setSessions: (sessions: Session[]) => void;
  setCurrentSession: (id: string | null) => void;
  setSelectedNovelId: (id: string | null) => void;
  addSession: (session: Session) => void;
  updateSession: (id: string, patch: Partial<Session>) => void;
  deleteSession: (id: string) => void;
  updateSessionPreview: (id: string, preview: string, fallbackTitle?: string) => void;

  setCharacters: (characters: Character[]) => void;
  addCharacter: (character: Character) => void;
  setWorldSetting: (worldSetting: WorldSetting | null) => void;
  setTimeline: (timeline: TimelineEvent[]) => void;
  setRelationships: (relationships: NetworkEdge[]) => void;

  setActiveConversationId: (id: string | null) => void;
  addTask: (task: TaskItem) => void;
  updateTask: (taskId: string, patch: Partial<TaskItem>) => void;
  removeTask: (taskId: string) => void;
  clearTasks: () => void;
}

export type AppStore = AppStoreState & AppStoreActions;

export const useAppStore = create<AppStore>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  selectedNovelId: null,
  characters: [],
  worldSetting: null,
  timeline: [],
  relationships: [],
  activeTasks: {},
  activeConversationId: null,

  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (id) =>
    set({
      currentSessionId: id,
      activeConversationId: id,
      selectedNovelId: null,
    }),
  setSelectedNovelId: (id) => set({ selectedNovelId: id }),
  addSession: (session) =>
    set((state) => {
      const exists = state.sessions.some((s) => s.id === session.id);
      if (exists) {
        return state;
      }
      return {
        sessions: [session, ...state.sessions],
        currentSessionId: session.id,
        activeConversationId: session.id,
      };
    }),
  updateSession: (id, patch) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })),
  deleteSession: (id) =>
    set((state) => {
      const nextSessions = state.sessions.filter((s) => s.id !== id);
      const isCurrent = state.currentSessionId === id;
      const nextCurrent = isCurrent ? nextSessions[0]?.id || null : state.currentSessionId;
      return {
        sessions: nextSessions,
        currentSessionId: nextCurrent,
        activeConversationId: nextCurrent,
      };
    }),
  updateSessionPreview: (id, preview, fallbackTitle) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id
          ? {
              ...s,
              preview,
              title: s.title || fallbackTitle || '新对话',
              time: new Date().toISOString(),
            }
          : s
      ),
    })),

  setCharacters: (characters) => set({ characters }),
  addCharacter: (character) =>
    set((state) => {
      const exists = state.characters.find((c) => c.id === character.id || c.name === character.name);
      if (exists) {
        return {
          characters: state.characters.map((c) =>
            c.id === exists.id ? { ...c, ...character, relationships: character.relationships || c.relationships } : c
          ),
        };
      }
      return {
        characters: [character, ...state.characters],
      };
    }),
  setWorldSetting: (worldSetting) => set({ worldSetting }),
  setTimeline: (timeline) => set({ timeline }),
  setRelationships: (relationships) => set({ relationships }),

  setActiveConversationId: (id) => set({ activeConversationId: id }),
  addTask: (task) =>
    set((state) => ({
      activeTasks: {
        ...state.activeTasks,
        [task.id]: {
          ...task,
          created_at: task.created_at || new Date().toISOString(),
        },
      },
    })),
  updateTask: (taskId, patch) =>
    set((state) => {
      const existing = state.activeTasks[taskId];
      if (!existing) {
        return state;
      }
      return {
        activeTasks: {
          ...state.activeTasks,
          [taskId]: { ...existing, ...patch },
        },
      };
    }),
  removeTask: (taskId) =>
    set((state) => {
      const next = { ...state.activeTasks };
      delete next[taskId];
      return { activeTasks: next };
    }),
  clearTasks: () => set({ activeTasks: {} }),
}));

// Compatibility no-op provider for legacy imports/components.
export function AppProvider({ children }: { children: ReactNode }) {
  return children;
}
