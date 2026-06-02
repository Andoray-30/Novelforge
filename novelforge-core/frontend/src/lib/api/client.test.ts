import { describe, expect, it, vi } from 'vitest';
import { APIClient, APIError, isAPIError, sanitizeAPIErrorDetail } from './client';

describe('APIClient errors', () => {
  it('throws status-aware APIError for failed JSON responses', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ detail: 'not found' }),
      {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'application/json' },
      },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const client = new APIClient('http://novelforge.test');
    await expect(client.get('/missing')).rejects.toMatchObject({
      name: 'APIError',
      status: 404,
      detail: 'not found',
    });

    try {
      await client.get('/missing');
    } catch (error) {
      expect(error).toBeInstanceOf(APIError);
      expect(isAPIError(error, 404)).toBe(true);
      expect(isAPIError(error, 500)).toBe(false);
    }
  });

  it('replaces mojibake backend details with readable status-specific messages', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ detail: 'HTTP 404 閿欒' }),
      {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'application/json' },
      },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const client = new APIClient('http://novelforge.test');
    await expect(client.get('/missing')).rejects.toMatchObject({
      name: 'APIError',
      status: 404,
      detail: '请求的内容不存在或已被删除',
    });
  });

  it('preserves readable backend details', () => {
    expect(sanitizeAPIErrorDetail('模型健康记录查询失败', 500, 'Internal Server Error')).toBe('模型健康记录查询失败');
  });
});
