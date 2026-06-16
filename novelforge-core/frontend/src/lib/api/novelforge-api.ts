import { APIClient, sanitizeAPIErrorDetail } from './client';
import {
  AITask,
  Character,
  CharacterDesign,
  CharacterDesignRequest,
  ChatResponse,
  ChapterIndexRun,
  ContentCreateRequest,
  ContentItem,
  ContentSearchRequest,
  ContentSearchResult,
  ContentStatus,
  ContentTopology,
  ContentType,
  ContentUpdateRequest,
  Conversation,
  ExtractionResult,
  NovelType,
  LengthType,
  ModelHealthReport,
  OpenAIConfig,
  OpenAIModelListResponse,
  Session,
  StoryOutline,
  StoryOutlineParams,
  TargetAudience,
  WorldBuildingRequest,
  WorldSetting,
  DeepSynthesisRequest,
  DeepSynthesisResult,
  ExtractionAttemptSummary,
  ExtractionAttempt,
  RetryExtractionAttemptResponse,
  RetryQueueSummary,
  RetryJob,
  RunDueRetryJobsResponse,
} from '@/types';

function resolveApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_NOVELFORGE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001';
  if (typeof window === 'undefined') {
    return configured;
  }

  try {
    const url = new URL(configured);
    const isLocalApi = ['localhost', '127.0.0.1', '::1'].includes(url.hostname) && url.port === '8001';
    const isLocalFrontend = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    if (isLocalApi && isLocalFrontend) {
      return '';
    }
  } catch {
    // Keep the configured value if it is not an absolute URL.
  }

  return configured.replace(/\/$/, '');
}

const BASE_URL = resolveApiBaseUrl();
export const novelforgeClient = new APIClient(BASE_URL, 300000);

async function postForm<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, { method: 'POST', body: formData, credentials: 'include' });
  if (!response.ok) {
    let detail = response.statusText || 'Request failed';
    try {
      const payload = await response.json();
      if (typeof payload?.detail === 'string' && payload.detail.trim()) {
        detail = payload.detail;
      } else if (typeof payload?.error === 'string' && payload.error.trim()) {
        detail = payload.error;
      }
    } catch {
      // Ignore JSON parse failures and keep status text.
    }
    if (response.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
    throw new Error(`HTTP ${response.status}: ${sanitizeAPIErrorDetail(detail, response.status, response.statusText)}`);
  }
  return response.json();
}

async function postBlob(path: string, data: unknown): Promise<Blob> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
    throw new Error(`HTTP ${response.status}: ${sanitizeAPIErrorDetail(response.statusText, response.status, response.statusText)}`);
  }
  return response.blob();
}

function normalizeOpenAIConfig(config?: OpenAIConfig): OpenAIConfig | undefined {
  if (!config) {
    return undefined;
  }

  const normalized: OpenAIConfig = {};
  const apiKey = config.api_key?.trim();
  const baseUrl = config.base_url?.trim();
  const model = config.model?.trim();
  const aiMode = config.ai_mode;

  if (apiKey) {
    normalized.api_key = apiKey;
  }
  if (baseUrl) {
    normalized.base_url = baseUrl;
  }
  if (model) {
    normalized.model = model;
  }
  if (aiMode === 'fast' || aiMode === 'pro') {
    normalized.ai_mode = aiMode;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export const aiService = {
  generateStoryOutline: (params: StoryOutlineParams): Promise<StoryOutline> =>
    novelforgeClient.post('/api/ai/generate-story-outline', {
      ...params,
      openai_config: normalizeOpenAIConfig(params.openai_config),
    }),

  designCharacters: (context: string, roles: string[], openAIConfig?: OpenAIConfig): Promise<CharacterDesign[]> =>
    novelforgeClient.post('/api/ai/design-characters', {
      context,
      roles,
      openai_config: normalizeOpenAIConfig(openAIConfig),
    }),

  buildWorldSetting: (storyOutline: StoryOutline, openAIConfig?: OpenAIConfig): Promise<WorldSetting> =>
    novelforgeClient.post('/api/ai/build-world-setting', {
      story_outline: storyOutline,
      openai_config: normalizeOpenAIConfig(openAIConfig),
    }),

  suggestPrompts: (sessionId?: string, openAIConfig?: OpenAIConfig): Promise<string[]> =>
    novelforgeClient.post('/api/ai/suggest-prompts', {
      session_id: sessionId,
      openai_config: normalizeOpenAIConfig(openAIConfig),
    }),
};

export const aiPlanningService = {
  generateStoryOutline: aiService.generateStoryOutline,
  designCharacter: async (request: CharacterDesignRequest): Promise<CharacterDesign> => {
    const items = await aiService.designCharacters(request.context, request.roles, request.openai_config);
    if (!items.length) {
      throw new Error('角色设计返回为空');
    }
    return items[0];
  },
  buildWorld: (request: WorldBuildingRequest): Promise<WorldSetting> =>
    novelforgeClient.post('/api/ai/build-world-setting', {
      ...request,
      openai_config: normalizeOpenAIConfig(request.openai_config),
    }),
  getNovelTypes: async (): Promise<NovelType[]> =>
    ['fantasy', 'science_fiction', 'romance', 'mystery', 'historical', 'wuxia'],
  getLengthTypes: async (): Promise<LengthType[]> => ['short', 'medium', 'long'],
  getTargetAudiences: async (): Promise<TargetAudience[]> => ['general', 'young_adult', 'adult'],
};

export const extractService = {
  extractFromText: (text: string, openAIConfig?: OpenAIConfig): Promise<ExtractionResult> =>
    novelforgeClient.post('/api/extract/text', {
      text,
      openai_config: normalizeOpenAIConfig(openAIConfig),
    }),

  extractFromFile: async (file: File, openAIConfig?: OpenAIConfig, sessionId?: string): Promise<ExtractionResult> => {
    const formData = new FormData();
    formData.append('file', file);
    if (openAIConfig) {
      const normalized = normalizeOpenAIConfig(openAIConfig);
      if (normalized) {
        formData.append('openai_config', JSON.stringify(normalized));
      }
    }
    if (sessionId) {
      formData.append('session_id', sessionId);
    }
    return postForm('/api/extract/file', formData);
  },

  extractCharacters: (text: string, openAIConfig?: OpenAIConfig): Promise<Character[]> =>
    novelforgeClient.post('/api/extract/characters', {
      text,
      openai_config: normalizeOpenAIConfig(openAIConfig),
    }),

  extractWorldSetting: (text: string, openAIConfig?: OpenAIConfig): Promise<WorldSetting> =>
    novelforgeClient.post('/api/extract/world-setting', {
      text,
      openai_config: normalizeOpenAIConfig(openAIConfig),
    }),

  extractWorld: (text: string, openAIConfig?: OpenAIConfig): Promise<WorldSetting> =>
    novelforgeClient.post('/api/extract/world-setting', {
      text,
      openai_config: normalizeOpenAIConfig(openAIConfig),
    }),

  extractTimeline: (text: string, openAIConfig?: OpenAIConfig): Promise<any[]> =>
    novelforgeClient.post('/api/extract/timeline', {
      text,
      openai_config: normalizeOpenAIConfig(openAIConfig),
    }),

  extractRelationships: (text: string, openAIConfig?: OpenAIConfig): Promise<any[]> =>
    novelforgeClient.post('/api/extract/relationships', {
      text,
      openai_config: normalizeOpenAIConfig(openAIConfig),
    }),
};

export const chatService = {
  startConversation: (title?: string, metadata?: Record<string, unknown>): Promise<Conversation> =>
    novelforgeClient.post('/api/chat/start-conversation', {
      title,
      metadata,
    }),

  sendMessage: (
    conversationId: string,
    message: string,
    context?: Record<string, unknown>,
    openAIConfig?: OpenAIConfig
  ): Promise<ChatResponse> =>
    novelforgeClient.post('/api/chat/send-message', {
      conversation_id: conversationId,
      message,
      context,
      openai_config: normalizeOpenAIConfig(openAIConfig),
    }),

  streamMessage: async function* (
    conversationId: string,
    message: string,
    context?: Record<string, unknown>,
    openAIConfig?: OpenAIConfig
  ): AsyncGenerator<Record<string, unknown>, void, unknown> {
    const response = await fetch(`${BASE_URL}/api/chat/send-message-stream`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conversationId,
        message,
        context,
        openai_config: normalizeOpenAIConfig(openAIConfig),
      }),
    });

    if (!response.ok || !response.body) {
      if (response.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
      let detail = response.ok ? '响应流为空' : response.statusText;
      try {
        const payload = await response.clone().json();
        if (typeof payload?.detail === 'string' && payload.detail.trim()) {
          detail = payload.detail;
        } else if (typeof payload?.error === 'string' && payload.error.trim()) {
          detail = payload.error;
        }
      } catch {
        // Keep status text or the empty-stream fallback.
      }
      throw new Error(`HTTP ${response.status}: ${sanitizeAPIErrorDetail(detail, response.status, response.statusText)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        const line = chunk.split('\n').find((entry) => entry.startsWith('data: '));
        if (!line) {
          continue;
        }
        const payload = line.slice(6);
        if (payload === '[DONE]') {
          return;
        }
        yield JSON.parse(payload) as Record<string, unknown>;
      }
    }
  },

  getConversation: (conversationId: string): Promise<Conversation> =>
    novelforgeClient.get(`/api/chat/conversation/${conversationId}`),

  getConversations: (): Promise<Conversation[]> =>
    novelforgeClient.get('/api/chat/conversations'),

  deleteConversation: (conversationId: string): Promise<{ success: boolean }> =>
    novelforgeClient.delete(`/api/chat/conversations/${conversationId}`),

  cleanupEmptyConversations: (): Promise<{ success: boolean; deleted: number; deleted_ids: string[] }> =>
    novelforgeClient.delete('/api/chat/conversations/empty'),

  // compatibility APIs
  getMessages: async (conversationId: string): Promise<Array<{ role: string; content: string; timestamp: string }>> => {
    const conversation = await novelforgeClient.get<Conversation>(`/api/chat/conversation/${conversationId}`);
    return (conversation.messages || []).map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: String(m.timestamp || new Date().toISOString()),
    }));
  },
};

export const openAIService = {
  listModels: (openAIConfig?: OpenAIConfig): Promise<OpenAIModelListResponse> =>
    novelforgeClient.post('/api/openai/models', {
      openai_config: normalizeOpenAIConfig(openAIConfig),
    }),
};

export const authService = {
  login: (password: string): Promise<{ authenticated: boolean; mode: string }> =>
    novelforgeClient.post('/api/auth/login', { password }),
  logout: (): Promise<{ authenticated: boolean }> =>
    novelforgeClient.post('/api/auth/logout'),
  me: (): Promise<{
    authenticated: boolean;
    auth_required: boolean;
    mode?: string | null;
    public_deployment: boolean;
    runtime_openai_overrides_allowed: boolean;
    admin_password_configured: boolean;
    session_secret_configured: boolean;
    provider_key_configured: boolean;
    frontend_origin_configured: boolean;
    data_dir_configured: boolean;
    data_dir?: string;
    storage_type?: string | null;
    content_database_enabled: boolean;
  }> => novelforgeClient.get('/api/auth/me'),
};

export const contentService = {
  getStats: (): Promise<Record<string, number>> => novelforgeClient.get('/api/content/stats'),

  listByType: (type: ContentType, session_id?: string, status?: ContentStatus): Promise<ContentItem[]> => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (session_id) params.append('session_id', session_id);
    const query = params.toString();
    return novelforgeClient.get(query ? `/api/content/type/${type}?${query}` : `/api/content/type/${type}`);
  },

  getById: (id: string): Promise<ContentItem> => novelforgeClient.get(`/api/content/${id}`),
  getContentItem: (id: string): Promise<ContentItem> => novelforgeClient.get(`/api/content/${id}`),

  create: (request: ContentCreateRequest): Promise<{ success: boolean; content_id: string }> =>
    novelforgeClient.post('/api/content/create', request),

  update: (id: string, data: ContentUpdateRequest): Promise<{ success: boolean }> =>
    novelforgeClient.put(`/api/content/${id}`, data),
  updateContentItem: (id: string, data: ContentUpdateRequest): Promise<{ success: boolean }> =>
    novelforgeClient.put(`/api/content/${id}`, data),

  delete: (id: string): Promise<{ success: boolean }> =>
    novelforgeClient.delete(`/api/content/${id}`),
  deleteContentItem: (id: string): Promise<{ success: boolean }> =>
    novelforgeClient.delete(`/api/content/${id}`),

  search: (params: {
    query?: string;
    content_type?: ContentType;
    content_types?: ContentType[];
    tags?: string[];
    session_id?: string;
    parent_id?: string;
    limit?: number;
    offset?: number;
    include_content?: boolean;
  }): Promise<ContentSearchResult> =>
    novelforgeClient.post('/api/content/search', {
      query: params.query || '',
      content_type: params.content_type || null,
      content_types: params.content_types || null,
      tags: params.tags,
      session_id: params.session_id,
      parent_id: params.parent_id || null,
      limit: params.limit || 500,
      offset: params.offset || 0,
      include_content: params.include_content ?? true,
    }),
  searchContent: (request: ContentSearchRequest): Promise<ContentSearchResult> =>
    novelforgeClient.post('/api/content/search', request),

  getNovels: (sessionId: string): Promise<{ novels: Array<{ id: string; title: string; created_at: string; updated_at: string; stats: Record<string, number> }>; total: number }> =>
    novelforgeClient.get(`/api/content/novels/${sessionId}`),

  getTopology: (sessionId: string, parentId?: string | null): Promise<ContentTopology> => {
    const params = new URLSearchParams();
    if (parentId) params.append('parent_id', parentId);
    const query = params.toString();
    return novelforgeClient.get(query ? `/api/content/topology/${sessionId}?${query}` : `/api/content/topology/${sessionId}`);
  },

  export: (ids: string[], format: 'json' | 'txt' = 'json'): Promise<Blob> =>
    postBlob('/api/content/export', { content_ids: ids, format }),
  exportContent: (ids: string[], format: 'json' | 'txt' = 'json'): Promise<Blob> =>
    postBlob('/api/content/export', { content_ids: ids, format }),
};

export const chapterIndexRunService = {
  list: (params: { sessionId: string; parentId?: string | null; limit?: number }): Promise<ChapterIndexRun[]> => {
    const query = new URLSearchParams({ session_id: params.sessionId });
    if (params.parentId) query.append('parent_id', params.parentId);
    if (params.limit) query.append('limit', String(params.limit));
    return novelforgeClient.get(`/api/extraction/chapter-index-runs?${query.toString()}`);
  },

  get: (
    runKey: string,
    params: { sessionId: string; parentId?: string | null; includeIndices?: boolean },
  ): Promise<ChapterIndexRun> => {
    const query = new URLSearchParams({ session_id: params.sessionId });
    if (params.parentId) query.append('parent_id', params.parentId);
    if (params.includeIndices) query.append('include_indices', 'true');
    return novelforgeClient.get(`/api/extraction/chapter-index-runs/${encodeURIComponent(runKey)}?${query.toString()}`);
  },
};

export const modelHealthService = {
  get: (params: { sessionId: string; parentId?: string | null; role?: string | null; limit?: number }): Promise<ModelHealthReport> => {
    const query = new URLSearchParams({ session_id: params.sessionId });
    if (params.parentId) query.append('parent_id', params.parentId);
    if (params.role) query.append('role', params.role);
    if (params.limit) query.append('limit', String(params.limit));
    return novelforgeClient.get(`/api/extraction/model-health?${query.toString()}`);
  },
};

export const workflowService = {
  startCompleteProcess: (aiPlan: Record<string, unknown>, sourceText?: string): Promise<any> =>
    novelforgeClient.post('/api/workflow/start-process', { aiPlan, sourceText }),
  getProcessStatus: (taskId: string): Promise<any> =>
    novelforgeClient.get(`/api/workflow/status/${taskId}`),
};

export const generationService = {
  generateNovel: (storyContext: Record<string, unknown>, options?: {
    type?: 'continuation' | 'character_focus' | 'plot_twist' | 'scene';
    length?: number;
    focusOn?: string[];
    openAIConfig?: OpenAIConfig;
  }): Promise<any> =>
    novelforgeClient.post('/api/generate/novel', {
      story_context: storyContext,
      generation_type: options?.type || 'continuation',
      target_length: options?.length || 1000,
      focus_on: options?.focusOn,
      openai_config: normalizeOpenAIConfig(options?.openAIConfig),
    }),
  generateText: (prompt: string, options?: {
    temperature?: number;
    length?: number;
    extractInfo?: boolean;
    openAIConfig?: OpenAIConfig;
  }): Promise<any> =>
    novelforgeClient.post('/api/generate/text', {
      prompt,
      temperature: options?.temperature || 0.7,
      length: options?.length || 1000,
      extract_info: options?.extractInfo || false,
      openai_config: normalizeOpenAIConfig(options?.openAIConfig),
    }),
};

export const taskService = {
  submitTask: (
    taskType: string,
    parameters: Record<string, unknown>,
    priority = 2,
    userId?: string
  ): Promise<{
    success: boolean;
    task_id: string;
    message: string;
    duplicate?: boolean;
    session_id?: string;
    parent_id?: string;
    result?: unknown;
  }> => {
    const params = new URLSearchParams({
      task_type: taskType,
      priority: String(priority),
    });
    if (userId) {
      params.append('user_id', userId);
    }
    return novelforgeClient.post(`/api/scheduler/submit?${params.toString()}`, parameters);
  },
  getTaskStatus: (taskId: string): Promise<AITask> =>
    novelforgeClient.get(`/api/scheduler/task/${taskId}`),
  getActiveTasks: (sessionId: string): Promise<AITask[]> =>
    novelforgeClient.get(`/api/scheduler/active/${sessionId}`),
  getRecentTasks: (sessionId: string, params?: { limit?: number; task_type?: string }): Promise<AITask[]> => {
    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.task_type) query.append('task_type', params.task_type);
    const suffix = query.toString();
    return novelforgeClient.get(suffix ? `/api/scheduler/recent/${sessionId}?${suffix}` : `/api/scheduler/recent/${sessionId}`);
  },
  cancelTask: (taskId: string): Promise<{ success: boolean }> =>
    novelforgeClient.post(`/api/scheduler/cancel/${taskId}`),
};

export const textProcessingService = {
  uploadAndProcess: (
    file: File,
    options?: {
      session_id: string;
      parent_id?: string;
      remove_extra_whitespace?: boolean;
      normalize_paragraphs?: boolean;
      detect_chapters?: boolean;
      extract_metadata?: boolean;
      remove_headers_footers?: boolean;
      preserve_line_breaks?: boolean;
    },
    openAIConfig?: OpenAIConfig
  ): Promise<{
    success: boolean;
    task_id: string;
    message: string;
    duplicate?: boolean;
    session_id?: string;
    parent_id?: string;
    result?: unknown;
  }> => {
    const formData = new FormData();
    formData.append('file', file);
    if (options) {
      Object.entries(options).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          formData.append(k, String(v));
        }
      });
    }
    if (openAIConfig) {
      const normalized = normalizeOpenAIConfig(openAIConfig);
      if (normalized) {
        formData.append('openai_config', JSON.stringify(normalized));
      }
    }
    return postForm('/api/text-processing/upload-and-process', formData);
  },
  processText: (text: string, options?: Record<string, unknown>): Promise<any> => {
    const formData = new FormData();
    formData.append('text', text);
    if (options) {
      Object.entries(options).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          formData.append(k, String(v));
        }
      });
    }
    return postForm('/api/text-processing/process-text', formData);
  },
  getTaskStatus: (taskId: string) => taskService.getTaskStatus(taskId),
};

export const systemService = {
  healthCheck: () => novelforgeClient.get('/health'),
};

export const sessionService = {
  getSessions: async (): Promise<Session[]> => {
    const conversations = await chatService.getConversations();
    return conversations.map((c) => ({
      id: c.id,
      title: c.title || '未命名会话',
      preview: c.messages?.length ? c.messages[c.messages.length - 1].content.slice(0, 40) : '',
      time: String(c.updated_at || c.created_at || new Date().toISOString()),
    }));
  },
  createSession: async (title?: string): Promise<Session> => {
    const created = await chatService.startConversation(title);
    return {
      id: created.id,
      title: title || created.title || '新对话',
      preview: '',
      time: String(created.updated_at || created.created_at || new Date().toISOString()),
    };
  },
  getSession: async (sessionId: string): Promise<Session> => {
    const c = await chatService.getConversation(sessionId);
    return {
      id: c.id,
      title: c.title || '未命名会话',
      preview: c.messages?.length ? c.messages[c.messages.length - 1].content.slice(0, 40) : '',
      time: String(c.updated_at || c.created_at || new Date().toISOString()),
    };
  },
  updateSession: async (_sessionId: string, data: Partial<Session>): Promise<Session> => ({
    id: _sessionId,
    title: data.title || '未命名会话',
    preview: data.preview || '',
    time: data.time || new Date().toISOString(),
  }),
  deleteSession: async (sessionId: string): Promise<void> => {
    await chatService.deleteConversation(sessionId);
  },
  sendMessage: async (sessionId: string, content: string): Promise<void> => {
    await chatService.sendMessage(sessionId, content);
  },
  getMessages: async (sessionId: string): Promise<Array<{ role: string; content: string; timestamp: string }>> =>
    chatService.getMessages(sessionId),
};

export const extractionAttemptService = {
  getSummary: (params: { sessionId: string; parentId?: string | null }) => {
    const query = new URLSearchParams({ session_id: params.sessionId });
    if (params.parentId) query.set('parent_id', params.parentId);
    return novelforgeClient.get<ExtractionAttemptSummary>(`/api/extraction/attempts/summary?${query}`);
  },

  list: (params: { sessionId: string; parentId?: string | null; status?: string; chapterId?: string | null; limit?: number }) => {
    const query = new URLSearchParams({ session_id: params.sessionId });
    if (params.parentId) query.set('parent_id', params.parentId);
    if (params.status) query.set('status', params.status);
    if (params.chapterId) query.set('chapter_id', params.chapterId);
    if (params.limit) query.set('limit', String(params.limit));
    return novelforgeClient.get<{ items: ExtractionAttempt[]; total: number }>(`/api/extraction/attempts?${query}`);
  },

  get: (attemptId: string, params: { sessionId: string }) => {
    const query = new URLSearchParams({ session_id: params.sessionId });
    return novelforgeClient.get<ExtractionAttempt>(`/api/extraction/attempts/${encodeURIComponent(attemptId)}?${query}`);
  },

  retry: (attemptId: string, params: { sessionId: string }) => {
    return novelforgeClient.post<RetryExtractionAttemptResponse>(
      `/api/extraction/attempts/${encodeURIComponent(attemptId)}/retry`,
      { session_id: params.sessionId },
    );
  },
};

export const retryQueueService = {
  list: (params: { sessionId: string; parentId?: string | null; status?: string; limit?: number }) => {
    const query = new URLSearchParams({ session_id: params.sessionId });
    if (params.parentId) query.set('parent_id', params.parentId);
    if (params.status) query.set('status', params.status);
    if (params.limit) query.set('limit', String(params.limit));
    return novelforgeClient.get<RetryQueueSummary>(`/api/extraction/retry-queue?${query}`);
  },

  get: (jobId: string, params: { sessionId: string }) => {
    const query = new URLSearchParams({ session_id: params.sessionId });
    return novelforgeClient.get<RetryJob>(`/api/extraction/retry-queue/${encodeURIComponent(jobId)}?${query}`);
  },

  runDue: (params: { sessionId: string; modelRole?: string }) => {
    return novelforgeClient.post<RunDueRetryJobsResponse>('/api/extraction/retry-queue/run-due', {
      session_id: params.sessionId,
      model_role: params.modelRole || 'extractor_repair',
    });
  },
};

export const deepSynthesisService = {
  createPreview: (request: DeepSynthesisRequest): Promise<DeepSynthesisResult> => {
    return novelforgeClient.post<DeepSynthesisResult>('/api/extraction/deep-synthesis/preview', request);
  },
};
