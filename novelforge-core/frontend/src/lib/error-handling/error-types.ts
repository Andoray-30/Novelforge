/**
 * 错误类型定义
 */

/**
 * 错误分类
 */
export enum ErrorCategory {
  VALIDATION = 'VALIDATION',
  API = 'API',
  NETWORK = 'NETWORK',
  TIMEOUT = 'TIMEOUT',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  SERVER = 'SERVER',
  UNKNOWN = 'UNKNOWN',
}

/**
 * 错误严重程度
 */
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * 应用错误基类
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * 应用程序错误（兼容旧代码）
 */
export class ApplicationError extends AppError {
  constructor(
    message: string,
    public category: ErrorCategory = ErrorCategory.UNKNOWN,
    public severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    public details?: Record<string, unknown>
  ) {
    super(message, category);
    this.name = 'ApplicationError';
  }
}

export class APIError extends AppError {
  constructor(
    message: string,
    public response?: Response
  ) {
    super(message, 'API_ERROR', response?.status);
    this.name = 'APIError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class NetworkError extends AppError {
  constructor(message: string = '网络连接失败') {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends AppError {
  constructor(message: string = '请求超时') {
    super(message, 'TIMEOUT_ERROR', 408);
    this.name = 'TimeoutError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = '资源未找到') {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = '未授权访问') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = '禁止访问') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
  }
}

export class ServerError extends AppError {
  constructor(message: string = '服务器内部错误') {
    super(message, 'SERVER_ERROR', 500);
    this.name = 'ServerError';
  }
}

/**
 * 错误处理器
 */
export function handleError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    // 网络错误
    if (error.message.includes('fetch') || error.message.includes('network')) {
      return new NetworkError(error.message);
    }
    // 超时错误
    if (error.message.includes('timeout') || error.message.includes('abort')) {
      return new TimeoutError(error.message);
    }
    return new AppError(error.message, 'UNKNOWN_ERROR');
  }

  return new AppError('发生未知错误', 'UNKNOWN_ERROR');
}

/**
 * 获取用户友好的错误消息
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
  const appError = handleError(error);

  const errorMessages: Record<string, string> = {
    API_ERROR: '服务器请求失败，请稍后重试',
    VALIDATION_ERROR: '输入数据验证失败，请检查您的输入',
    NETWORK_ERROR: '网络连接失败，请检查网络设置',
    TIMEOUT_ERROR: '请求超时，请稍后重试',
    NOT_FOUND: '请求的资源不存在',
    UNAUTHORIZED: '请先登录',
    FORBIDDEN: '您没有权限执行此操作',
    SERVER_ERROR: '服务器内部错误，请稍后重试',
    UNKNOWN_ERROR: '发生未知错误，请稍后重试',
  };

  return errorMessages[appError.code] || appError.message;
}
