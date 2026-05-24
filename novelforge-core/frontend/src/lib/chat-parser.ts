/**
 * AI response parser.
 */

import { Character, WorldSetting, Timeline, RelationshipNetwork, TimelineEvent, NetworkEdge } from '@/types';

/**
 * Try to parse JSON from a plain or fenced response.
 */
export function tryParseJson<T>(text: string): T | null {
  try {
    const cleaned = text
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
 * Parse character list responses.
 */
export function parseCharacterResponse(text: string): Character[] {
  const data = tryParseJson<{ characters?: Character[] }>(text);
  if (data?.characters && Array.isArray(data.characters)) {
    return data.characters;
  }
  const arrayData = tryParseJson<Character[]>(text);
  if (Array.isArray(arrayData)) {
    return arrayData;
  }
  return [];
}

/**
 * Parse world setting responses.
 */
export function parseWorldResponse(text: string): Partial<WorldSetting> {
  const data = tryParseJson<Partial<WorldSetting>>(text);
  return data || {};
}

/**
 * Parse timeline responses.
 */
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
 * Parse relationship network responses.
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
 * Parse streaming SSE chunks.
 */
export function parseStreamingResponse(chunk: string): string {
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
        result += data;
      }
    }
  }

  return result;
}

/**
 * Extract a JSON block from text.
 */
export function extractJsonBlock(text: string): string | null {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  const bracketMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (bracketMatch) {
    return bracketMatch[1].trim();
  }

  return null;
}

/**
 * Safely parse JSON with a fallback value.
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
 * Split thinking and final answer content.
 */
export function parseThinkingProcess(text: string): { thinking: string; answer: string } {
  const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>([\s\S]*)/);
  if (thinkMatch) {
    return {
      thinking: thinkMatch[1].trim(),
      answer: thinkMatch[2].trim(),
    };
  }

  const chineseMatch = text.match(/思考[:：]([\s\S]*?)答案[:：]([\s\S]*)/);
  if (chineseMatch) {
    return {
      thinking: chineseMatch[1].trim(),
      answer: chineseMatch[2].trim(),
    };
  }

  return {
    thinking: '',
    answer: text.trim(),
  };
}

/**
 * Remove control/directive blocks from AI text.
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
 * Validate a character payload.
 */
export function validateCharacter(character: Partial<Character>): boolean {
  return !!(
    character.name &&
    character.description &&
    character.name.length > 0 &&
    character.description.length > 0
  );
}

/**
 * Validate the extraction result shape.
 */
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
    missing.push('时间线');
  }

  if (!result.relationships?.edges || result.relationships.edges.length === 0) {
    missing.push('关系网络');
  }

  return {
    isValid: missing.length === 0,
    missing,
  };
}

// ==================== Legacy exports ====================

/**
 * Tool call type.
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
 * Parsed artifact payload.
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
 * Parse AI response text.
 */
export function parseAIResponse(text: string): { content: string; artifacts?: ParsedArtifact[] } {
  const cleaned = cleanAiResponse(text);
  return { content: cleaned };
}

/**
 * Extract clean response text.
 */
export function extractCleanText(text: string): string {
  return cleanAiResponse(text);
}

/**
 * Parse multiple AI artifacts.
 */
export function parseMultipleAIArtifacts(text: string): ParsedArtifact[] {
  const artifacts: ParsedArtifact[] = [];

  const jsonData = tryParseJson<{ artifacts?: ParsedArtifact[] }>(text);
  if (jsonData?.artifacts) {
    return jsonData.artifacts;
  }

  const characters = parseCharacterResponse(text);
  if (characters.length > 0) {
    artifacts.push({
      type: 'character_card',
      title: '角色卡片',
      data: { characters },
      cleanText: cleanAiResponse(text),
    });
  }

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
