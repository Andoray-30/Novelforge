export class APIError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(`HTTP ${status}: ${detail}`);
    this.name = 'APIError';
    this.status = status;
    this.detail = detail;
  }
}

export function isAPIError(error: unknown, status?: number): error is APIError {
  return error instanceof APIError && (status === undefined || error.status === status);
}

function getHTTPStatusFallback(status: number, statusText?: string): string {
  if (status === 400) return '请求参数无效';
  if (status === 401) return '请先登录';
  if (status === 403) return '没有权限执行此操作';
  if (status === 404) return '请求的内容不存在或已被删除';
  if (status === 409) return '请求与当前数据状态冲突';
  if (status === 429) return '请求过于频繁，请稍后重试';
  if (status >= 500) return '服务器暂时无法完成请求';
  return statusText?.trim() || '请求失败';
}

function looksLikeMojibake(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  const suspiciousFragments = ['锟', '閿', '鐢', '绋', '璧', 'Ã', 'Â', 'ä¸', 'äº', 'è§', 'ç»'];
  if (suspiciousFragments.some((fragment) => normalized.includes(fragment))) {
    return true;
  }
  const latinNoise = (normalized.match(/[ÃÂÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ]/g) || []).length;
  const questionRuns = (normalized.match(/\?{3,}/g) || []).length;
  return latinNoise >= 4 || questionRuns > 0;
}

export function sanitizeAPIErrorDetail(detail: string | undefined, status: number, statusText?: string): string {
  const fallback = getHTTPStatusFallback(status, statusText);
  const trimmed = detail?.trim();
  if (!trimmed || looksLikeMojibake(trimmed)) {
    return fallback;
  }
  return trimmed;
}

export class APIClient {
  private baseURL: string;
  private timeout: number;

  constructor(baseURL: string, timeout = 30000) {
    this.baseURL = baseURL;
    this.timeout = timeout;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        signal: controller.signal,
        credentials: options.credentials ?? 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let detail = response.statusText;
        try {
          const payload = await response.json();
          if (typeof payload?.detail === 'string' && payload.detail.trim()) {
            detail = payload.detail;
          } else if (typeof payload?.error === 'string' && payload.error.trim()) {
            detail = payload.error;
          }
        } catch {
          // Ignore non-JSON error bodies and fall back to status text.
        }
        if (response.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
        throw new APIError(response.status, sanitizeAPIErrorDetail(detail, response.status, response.statusText));
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}
