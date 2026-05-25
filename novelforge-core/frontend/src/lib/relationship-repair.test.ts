import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contentService } from '@/lib/api';
import {
  buildRelationshipRepairDraftRequest,
  buildRelationshipRepairUpdateRequest,
  saveRelationshipRepairDraft,
  updateRelationshipWithRepair,
} from '@/lib/relationship-repair';
import type { AgentRelationshipRepairSuggestion } from '@/lib/agent-trace';
import type { ContentItem, ContentMetadata } from '@/types';

vi.mock('@/lib/api', () => ({
  contentService: {
    create: vi.fn(async () => ({ success: true, content_id: 'draft-rel-1' })),
    getById: vi.fn(),
    update: vi.fn(async () => ({ success: true })),
  },
}));

function suggestion(overrides: Partial<AgentRelationshipRepairSuggestion> = {}): AgentRelationshipRepairSuggestion {
  return {
    relationship_id: 'rel-1',
    title: 'A/B repair',
    source: 'A',
    target: 'B',
    core: 'A and B must turn a vague bond into a costly choice.',
    current_state: 'old friends',
    dependency: 'A depends on B for safe passage.',
    misunderstanding: 'B thinks A betrayed the group.',
    debt: 'A owes B a rescue.',
    conflict: 'truth versus safety',
    emotional_tension: 'A cannot leave, B cannot trust.',
    arc: 'suspicion to reluctant alliance',
    scene_potential: ['A hides the truth from B'],
    writing_advice: 'Put the repair into an action beat.',
    missing_signals: ['emotional_tension', 'plot_function'],
    usable_signals: ['relationship_type', 'conflict'],
    enriched_relationship_draft: { scene_potential: ['B forces A to choose'] },
    ...overrides,
  };
}

function metadata(overrides: Partial<ContentMetadata> = {}): ContentMetadata {
  return {
    id: 'rel-1',
    title: 'A/B',
    type: 'relationship',
    status: 'draft',
    author: 'tester',
    tags: ['imported'],
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-02T00:00:00.000Z',
    version: 1,
    parent_id: 'novel-a',
    children_ids: [],
    session_id: 'session-a',
    ...overrides,
  };
}

function item(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    metadata: metadata(),
    content: 'old relationship content',
    extracted_data: { source: 'A', target: 'B', quality_flags: ['imported'] },
    stats: null,
    relations: { source: ['A'], target: ['B'] },
    ...overrides,
  };
}

describe('relationship repair writeback helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds and saves a repair draft without overwriting the original relationship', async () => {
    const request = buildRelationshipRepairDraftRequest(suggestion(), {
      sessionId: 'session-a',
      parentId: 'novel-a',
    });

    expect(request.metadata).toMatchObject({
      type: 'relationship',
      status: 'draft',
      parent_id: 'novel-a',
      session_id: 'session-a',
    });
    expect(request.metadata.tags).toEqual(['relationship_enriched', 'repair-draft']);
    expect(request.extracted_data).toMatchObject({
      source_type: 'ai_repaired',
      repair_from_relationship_id: 'rel-1',
      repair_status: 'draft',
      quality_flags: ['relationship_enriched'],
      missing_signals_resolved: ['emotional_tension', 'plot_function'],
      remaining_missing_signals: [],
    });

    await expect(saveRelationshipRepairDraft({
      suggestion: suggestion(),
      sessionId: 'session-a',
      parentId: 'novel-a',
    })).resolves.toEqual({ contentId: 'draft-rel-1' });
    expect(contentService.create).toHaveBeenCalledWith(expect.objectContaining({
      metadata: request.metadata,
      content: request.content,
      relations: request.relations,
      extracted_data: expect.objectContaining({
        source_type: 'ai_repaired',
        repair_from_relationship_id: 'rel-1',
        repair_status: 'draft',
        quality_flags: ['relationship_enriched'],
      }),
    }));
  });

  it('builds a confirmed update with a previous_snapshot and enriched metadata', () => {
    const request = buildRelationshipRepairUpdateRequest(item(), suggestion());

    expect(request.metadata.tags).toEqual(['imported', 'relationship_enriched', 'repair-confirmed']);
    expect(request.extracted_data).toMatchObject({
      source_type: 'user_confirmed_repair',
      repair_from_relationship_id: 'rel-1',
      repair_status: 'confirmed',
      quality_flags: ['imported', 'relationship_enriched'],
      previous_snapshot: {
        old_title: 'A/B',
        old_content: 'old relationship content',
        old_extracted_data: { source: 'A', target: 'B', quality_flags: ['imported'] },
        old_updated_at: '2026-05-02T00:00:00.000Z',
      },
    });
  });

  it('blocks updating a relationship from another project scope', async () => {
    vi.mocked(contentService.getById).mockResolvedValueOnce(item({
      metadata: metadata({ session_id: 'session-b' }),
    }));

    await expect(updateRelationshipWithRepair({
      suggestion: suggestion(),
      sessionId: 'session-a',
      parentId: 'novel-a',
    })).rejects.toThrow('关系资产不属于当前项目');
    expect(contentService.update).not.toHaveBeenCalled();
  });
});
