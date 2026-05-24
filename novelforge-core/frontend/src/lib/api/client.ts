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
        throw new APIError(response.status, detail);
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
