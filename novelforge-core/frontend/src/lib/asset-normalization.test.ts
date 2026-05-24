import { describe, expect, it } from 'vitest';
import { decodeAssetTitle, normalizeRelationshipType, resolveRelationshipEdges } from './asset-normalization';
import type { Character, ContentItem } from '@/types';

function character(id: string, name: string, aliases: string[] = []): Character {
  return {
    id,
    name,
    aliases,
    description: '',
    personality: '',
    background: '',
    role: 'supporting',
    abilities: [],
    tags: [],
    relationships: [],
    importance: 'medium',
  };
}

function relationship(params: {
  id: string;
  source: string;
  target: string;
  type: string;
  tension?: string;
  confidence?: string;
}): ContentItem {
  return {
    metadata: {
      id: params.id,
      title: `${params.source} -> ${params.target}`,
      type: 'relationship',
      status: 'draft',
      tags: [],
      created_at: '',
      updated_at: '',
      version: 1,
    },
    content: '',
    extracted_data: {
      source: params.source,
      target: params.target,
      relationship_type: params.type,
      description: `${params.source} and ${params.target}`,
      relationship_tension: params.tension,
      confidence: params.confidence,
      evolution: params.tension ? [params.tension] : [],
      evidence: [`${params.source} met ${params.target}`],
    },
  };
}

describe('asset normalization', () => {
  it('decodes persisted HTML entities in titles', () => {
    expect(decodeAssetTitle('第一卷 续&#12539;终章')).toBe('第一卷 续・终章');
    expect(decodeAssetTitle('A &middot; B')).toBe('A · B');
  });

  it('normalizes internal relationship enum strings', () => {
    expect(normalizeRelationshipType('RelationshipType.FRIEND')).toBe('friendship');
    expect(normalizeRelationshipType('lover')).toBe('romantic');
  });

  it('maps relationship endpoints by aliases and merges duplicate pairs with explainable details', () => {
    const characters = [character('c-1', '辉夜', ['月之少女']), character('c-2', '酒寄彩叶')];
    const edges = resolveRelationshipEdges(characters, [
      relationship({ id: 'r-1', source: '月之少女', target: '酒寄彩叶', type: 'RelationshipType.FRIEND', tension: '好奇与保护', confidence: 'medium' }),
      relationship({ id: 'r-2', source: '辉夜', target: '酒寄彩叶', type: 'lover', tension: '依恋与不安', confidence: 'high' }),
    ]);

    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('c-1');
    expect(edges[0].target).toBe('c-2');
    expect(edges[0].source_name).toBe('辉夜');
    expect(edges[0].target_name).toBe('酒寄彩叶');
    expect(edges[0].relationship_types).toEqual(['friendship', 'romantic']);
    expect(edges[0].label).toBe('friendship / romantic');
    expect(edges[0].confidence).toBe('high');
    expect(edges[0].evolution).toEqual(['好奇与保护', '依恋与不安']);
    expect(edges[0].relationship_details).toHaveLength(2);
  });
});
