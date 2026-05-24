/**
 * Hooks 统一导出
 */

export { useAppStore, AppProvider } from './use-app-store';
export { useSessions, useSessionMessages } from './use-sessions';
export { useAIPlanning } from './use-ai-planning';

// 错误处理hooks
export function useErrorHandler() {
  return {
    handleError: (error: unknown) => {
      console.error('Error:', error);
      return error instanceof Error ? error.message : '发生错误';
    },
  };
}

export function useAPIErrorHandler() {
  return {
    handleError: (error: unknown) => {
      console.error('API Error:', error);
      return error instanceof Error ? error.message : 'API请求失败';
    },
    withErrorHandling: async <T>(fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch (error) {
        console.error('API Error:', error);
        return null;
      }
    },
  };
}

export function useRetry() {
  return {
    retry: async <T>(fn: () => Promise<T>, maxAttempts: number = 3): Promise<T> => {
      let lastError: Error;
      for (let i = 0; i < maxAttempts; i++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error as Error;
          if (i < maxAttempts - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
          }
        }
      }
      throw lastError!;
    },
  };
}
