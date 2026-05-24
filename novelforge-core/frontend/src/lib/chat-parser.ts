/**
 * AI响应解析�? * 用于解析AI返回的各种格式的响应
 */

import { Character, WorldSetting, Timeline, RelationshipNetwork, TimelineEvent, NetworkEdge } from '@/types';

/**
 * 尝试解析JSON响应
 */
export function tryParseJson<T>(text: string): T | null {
  try {
    // 移除markdown代码块标�?    const cleaned = text
      .replace(/```json\s*/g, '')
      .replace(/```\s*$/g, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

/**
 * 解析角色列表响应
 */
export function parseCharacterResponse(text: string): Character[] {
  const data = tryParseJson<{ characters?: Character[] }>(text);
  if (data?.characters && Array.isArray(data.characters)) {
    return data.characters;
  }
  // 尝试直接解析为数�?  const arrayData = tryParseJson<Character[]>(text);
  if (Array.isArray(arrayData)) {
    return arrayData;
  }
  return [];
}

/**
 * 解析世界设定响应
 */
export function parseWorldResponse(text: string): Partial<WorldSetting> {
  const data = tryParseJson<Partial<WorldSetting>>(text);
  return data || {};
}

/**
 * 解析时间线响�? */
export function parseTimelineResponse(text: string): TimelineEvent[] {
  const data = tryParseJson<{ events?: TimelineEvent[] }>(text);
  if (data?.events && Array.isArray(data.events)) {
    return data.events;
  }
  const arrayData = tryParseJson<TimelineEvent[]>(text);
  if (Array.isArray(arrayData)) {
    return arrayData;
  }
  return [];
}

/**
 * 解析关系网络响应
 */
export function parseRelationshipResponse(text: string): NetworkEdge[] {
  const data = tryParseJson<{ relationships?: NetworkEdge[] }>(text);
  if (data?.relationships && Array.isArray(data.relationships)) {
    return data.relationships;
  }
  const arrayData = tryParseJson<NetworkEdge[]>(text);
  if (Array.isArray(arrayData)) {
    return arrayData;
  }
  return [];
}

/**
 * 解析流式响应
 */
export function parseStreamingResponse(chunk: string): string {
  // 处理SSE格式
  const lines = chunk.split('\n');
  let result = '';

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.choices?.[0]?.delta?.content) {
          result += parsed.choices[0].delta.content;
        } else if (parsed.content) {
          result += parsed.content;
        }
      } catch {
        // 如果不是JSON，直接追�?        result += data;
      }
    }
  }

  return result;
}

/**
 * 提取JSON代码�? */
export function extractJsonBlock(text: string): string | null {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  // 尝试查找方括号或花括号包裹的内容
  const bracketMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (bracketMatch) {
    return bracketMatch[1].trim();
  }

  return null;
}

/**
 * 安全解析JSON
 */
export function safeJsonParse<T>(text: string, defaultValue: T): T {
  try {
    const jsonStr = extractJsonBlock(text) || text;
    return JSON.parse(jsonStr) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * 解析AI思考过�? */
export function parseThinkingProcess(text: string): { thinking: string; answer: string } {
  // 尝试分离思考过程和答案
  const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>([\s\S]*)/);
  if (thinkMatch) {
    return {
      thinking: thinkMatch[1].trim(),
      answer: thinkMatch[2].trim(),
    };
  }

  // 尝试查找"思考："�?答案�?格式
  const chineseMatch = text.match(/思考[:：]([\s\S]*?)答案[:：]([\s\S]*)/);
  if (chineseMatch) {
    return {
      thinking: chineseMatch[1].trim(),
      answer: chineseMatch[2].trim(),
    };
  }

  // 默认返回全部作为答案
  return {
    thinking: '',
    answer: text.trim(),
  };
}

/**
 * 清理AI响应文本
 */
export function cleanAiResponse(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<asset_request>[\s\S]*?<\/asset_request>/gi, '')
    .replace(/<save_asset>[\s\S]*?<\/save_asset>/gi, '')
    .replace(/思考[:：][\s\S]*?(?=答案[:：]|$)/g, '')
    .replace(/答案[:：]/g, '')
    .replace(/```json\s*/g, '')
    .replace(/```\s*$/g, '')
    .replace(/```/g, '')
    .trim();
}

/**
 * 验证角色数据完整�? */
export function validateCharacter(character: Partial<Character>): boolean {
  return !!(
    character.name &&
    character.description &&
    character.name.length > 0 &&
    character.description.length > 0
  );
}

/**
 * 验证提取结果完整�? */
export function validateExtractionResult(result: {
  characters?: Character[];
  world?: Partial<WorldSetting>;
  timeline?: { events?: TimelineEvent[] };
  relationships?: { edges?: NetworkEdge[] };
}): { isValid: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!result.characters || result.characters.length === 0) {
    missing.push('角色');
  }

  if (!result.world) {
    missing.push('世界设定');
  }

  if (!result.timeline?.events || result.timeline.events.length === 0) {
    missing.push('时间�?);
  }

  if (!result.relationships?.edges || result.relationships.edges.length === 0) {
    missing.push('关系网络');
  }

  return {
    isValid: missing.length === 0,
    missing,
  };
}

// ==================== 兼容旧代码的导出 ====================

/**
 * 工具调用类型
 */
export interface ToolCall {
  id: string;
  type: string;
  action?: string;
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * 解析的Artifact
 */
export interface ParsedArtifact {
  type: 'character_card' | 'world_setting' | 'timeline' | 'relationship' | 'outline' | 'chapter';
  title: string;
  data: Record<string, unknown>;
  toolCall?: ToolCall;
  cleanText?: string;
}

export interface AssetRequestDirective {
  types: string[];
  query?: string;
  reason?: string;
  limit?: number;
}

export interface SaveAssetRequest {
  type: string;
  title: string;
  data: Record<string, unknown>;
  id?: string;
}

export function parseAssetRequest(text: string): AssetRequestDirective | null {
  const match = text.match(/<asset_request>([\s\S]*?)<\/asset_request>/i);
  if (!match) {
    return null;
  }

  const parsed = safeJsonParse<{
    types?: unknown;
    query?: unknown;
    reason?: unknown;
    limit?: unknown;
  }>(match[1].trim(), {});

  const types = Array.isArray(parsed.types)
    ? parsed.types
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
    : [];

  const query = typeof parsed.query === 'string' && parsed.query.trim().length > 0 ? parsed.query.trim() : undefined;
  const reason = typeof parsed.reason === 'string' && parsed.reason.trim().length > 0 ? parsed.reason.trim() : undefined;
  const limit = typeof parsed.limit === 'number' && Number.isFinite(parsed.limit)
    ? Math.max(1, Math.min(10, Math.floor(parsed.limit)))
    : undefined;

  if (types.length === 0 && !query && !reason) {
    return null;
  }

  return {
    types,
    query,
    reason,
    limit,
  };
}

const VALID_SAVE_ASSET_TYPES = new Set(['character', 'world', 'timeline', 'relationship', 'outline', 'chapter']);

export function parseSaveAssetRequests(text: string): SaveAssetRequest[] {
  const results: SaveAssetRequest[] = [];
  const regex = /<save_asset>([\s\S]*?)<\/save_asset>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const parsed = safeJsonParse<{
      type?: unknown;
      title?: unknown;
      data?: unknown;
      id?: unknown;
    }>(match[1].trim(), {});

    const type = typeof parsed.type === 'string' && VALID_SAVE_ASSET_TYPES.has(parsed.type) ? parsed.type : null;
    const title = typeof parsed.title === 'string' && parsed.title.trim().length > 0 ? parsed.title.trim() : null;
    const data = parsed.data && typeof parsed.data === 'object' ? parsed.data as Record<string, unknown> : null;
    const id = typeof parsed.id === 'string' && parsed.id.trim().length > 0 ? parsed.id.trim() : undefined;

    if (type && title && data) {
      const request: SaveAssetRequest = { type, title, data };
      if (id) {
        request.id = id;
      }
      results.push(request);
    }
  }

  return results;
}

/**
 * 解析AI响应（兼容旧代码�? */
export function parseAIResponse(text: string): { content: string; artifacts?: ParsedArtifact[] } {
  const cleaned = cleanAiResponse(text);
  return { content: cleaned };
}

/**
 * 提取干净文本（兼容旧代码�? */
export function extractCleanText(text: string): string {
  return cleanAiResponse(text);
}

/**
 * 解析多个AI产物（兼容旧代码�? */
export function parseMultipleAIArtifacts(text: string): ParsedArtifact[] {
  const artifacts: ParsedArtifact[] = [];

  // 尝试解析JSON
  const jsonData = tryParseJson<{ artifacts?: ParsedArtifact[] }>(text);
  if (jsonData?.artifacts) {
    return jsonData.artifacts;
  }

  // 尝试提取角色
  const characters = parseCharacterResponse(text);
  if (characters.length > 0) {
    artifacts.push({
      type: 'character_card',
      title: '角色卡片',
      data: { characters },
      cleanText: cleanAiResponse(text),
    });
  }

  // 尝试提取世界设定
  const world = parseWorldResponse(text);
  if (world && Object.keys(world).length > 0) {
    artifacts.push({
      type: 'world_setting',
      title: '世界设定',
      data: world,
      cleanText: cleanAiResponse(text),
    });
  }

  return artifacts;
}
