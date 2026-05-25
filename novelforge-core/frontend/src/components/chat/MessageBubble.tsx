'use client';

import { useEffect, useRef, useState } from 'react';
import {
  buildSaveAssetPreviewRows,
  getSaveAssetBlockingReason,
  getSaveAssetOperationLabel,
  getSavedChapterEditorHref,
  getSaveAssetWarningLabel,
} from '@/lib/save-asset-preview';
import {
  CHAPTER_SAVE_DESTINATION_OPTIONS,
  normalizeChapterSaveDestination,
  type ChapterSaveDestination,
} from '@/lib/chapter-save-destinations';
import type { AgentRelationshipRepairSuggestion, AgentTrace } from '@/lib/agent-trace';
import type { SaveAssetRequest } from '@/lib/chat-parser';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  retryText?: string;
  errorKind?: 'transient_provider' | 'general';
  thinking?: string;
  agentTrace?: AgentTrace;
  assetRequest?: {
    query?: string;
    reason?: string;
    sessionId?: string;
    status?: 'pending' | 'resolved' | 'empty' | 'stale';
    selectedKeys?: string[];
    candidates: Array<{
      key: string;
      id?: string;
      title: string;
      type: string;
      summary: string;
      source: 'project_asset' | 'artifact';
    }>;
  };
  saveAssetRequests?: Array<SaveAssetRequest & {
    status?: 'pending' | 'saved' | 'rejected';
    contentId?: string;
  }>;
  artifact?: {
    type: 'character_card' | 'world_setting' | 'timeline' | 'relationship' | 'outline' | 'chapter';
    title: string;
    data: Record<string, unknown>;
  };
}

export type ChapterSaveTargetOption = {
  id: string;
  title: string;
  sourceLabel: string;
  saveDestinationLabel?: string | null;
  roleLabel: string;
  wordCount: number;
};

interface MessageBubbleProps {
  message: Message;
  chapterSaveTargets?: ChapterSaveTargetOption[];
  onSelectAssetCandidate?: (
    messageId: string,
    candidate: NonNullable<Message['assetRequest']>['candidates'][number],
  ) => void;
  onOpenArtifact?: (artifact: NonNullable<Message['artifact']>) => void;
  onConfirmSaveAsset?: (messageId: string, requestIndex: number) => void;
  onRejectSaveAsset?: (messageId: string, requestIndex: number) => void;
  onChangeSaveAssetDestination?: (messageId: string, requestIndex: number, destination: ChapterSaveDestination) => void;
  onSelectSaveAssetTarget?: (messageId: string, requestIndex: number, targetId: string) => void;
  onSaveRelationshipRepairDraft?: (messageId: string, suggestionIndex: number) => void;
  onUpdateRelationshipRepair?: (messageId: string, suggestionIndex: number) => void;
  onRetryMessage?: (messageId: string, retryText: string) => void;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
    .replace(/\n/g, '<br />');
}

function getArtifactIcon(type: string): string {
  const icons: Record<string, string> = {
    character_card: '👤',
    world_setting: '🌍',
    timeline: '🕒',
    relationship: '🕸️',
    outline: '📝',
  };
  return icons[type] ?? '📦';
}

function getArtifactLabel(type: string): string {
  const labels: Record<string, string> = {
    character_card: '角色卡',
    world_setting: '世界设定',
    timeline: '时间线',
    relationship: '关系图谱',
    outline: '故事大纲',
  };
  return labels[type] ?? '产物';
}

function getAssetRequestTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    character: '角色',
    character_card: '角色',
    world: '世界观',
    world_setting: '世界观',
    chapter: '章节',
    outline: '大纲',
    timeline: '时间线',
    relationship: '关系网',
    novel: '小说',
  };
  return labels[type] ?? type;
}

function getAssetRequestStatusText(request: NonNullable<Message['assetRequest']>): string | null {
  const selectedCount = request.selectedKeys?.length ?? 0;

  if (request.status === 'resolved') {
    return selectedCount > 0
      ? `已确认 ${selectedCount} 项资产，后续回复会带上这些上下文继续生成。`
      : '当前资产请求已完成确认，后续回复会带上这些上下文继续生成。';
  }

  if (request.status === 'stale') {
    return '这条资产请求属于旧项目，请在当前项目重新请求。';
  }

  if (request.status === 'empty') {
    return '当前项目没有匹配资产，你也可以继续手动从工作台中选择。';
  }

  return null;
}

function getAgentToolLabel(name: string): string {
  const labels: Record<string, string> = {
    search_project_assets: '检索项目资产',
    get_asset_detail: '读取资产详情',
    search_chapter_snippets: '读取章节片段',
    get_recent_conversation: '读取最近对话',
    prepare_save_asset: '准备保存建议',
    prepare_chapter_update: '准备章节更新',
    run_quality_check: '写作质量检查',
  };
  return labels[name] ?? name;
}

function getSnippetModeLabel(mode?: string): string {
  if (mode === 'start') return '开头';
  if (mode === 'end') return '结尾';
  if (mode === 'keyword') return '关键词附近';
  return '片段';
}

function getAgentModeLabel(mode?: string): string {
  if (mode === 'model_tool_loop') return '模型工具循环';
  if (mode === 'rule_planner') return '规则规划';
  if (mode === 'fallback') return '降级规划';
  return '上下文读取';
}

function topMissingSignals(missingSignals?: Record<string, number>): string {
  const entries = Object.entries(missingSignals ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  return entries.length > 0 ? entries.map(([key, count]) => `${key}×${count}`).join('、') : '暂无';
}

function RepairSuggestionCard({
  suggestion,
  index,
  messageId,
  onSaveRelationshipRepairDraft,
  onUpdateRelationshipRepair,
}: {
  suggestion: AgentRelationshipRepairSuggestion;
  index: number;
  messageId: string;
  onSaveRelationshipRepairDraft?: (messageId: string, suggestionIndex: number) => void;
  onUpdateRelationshipRepair?: (messageId: string, suggestionIndex: number) => void;
}) {
  const [skipped, setSkipped] = useState(false);
  if (skipped) {
    return null;
  }

  return (
    <div style={{
      display: 'grid',
      gap: 8,
      borderRadius: 8,
      border: '1px solid rgba(245, 158, 11, 0.26)',
      background: 'rgba(245, 158, 11, 0.08)',
      padding: '10px 12px',
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fcd34d', fontWeight: 700, fontSize: 12 }}>
            {suggestion.title || `${suggestion.source ?? '角色A'} -> ${suggestion.target ?? '角色B'}`}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
            {suggestion.source || '角色A'} / {suggestion.target || '角色B'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => onSaveRelationshipRepairDraft?.(messageId, index)}
            style={{
              borderRadius: 6,
              border: '1px solid rgba(16, 185, 129, 0.4)',
              background: 'rgba(16, 185, 129, 0.14)',
              color: '#86efac',
              padding: '4px 8px',
              fontSize: 11,
              cursor: onSaveRelationshipRepairDraft ? 'pointer' : 'default',
            }}
          >
            保存草稿
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('确认更新原关系资产？系统会保留 previous_snapshot，可回溯旧内容。')) {
                onUpdateRelationshipRepair?.(messageId, index);
              }
            }}
            disabled={!suggestion.relationship_id}
            title={suggestion.relationship_id ? undefined : '缺少原关系 ID，无法更新原资产'}
            style={{
              borderRadius: 6,
              border: '1px solid rgba(245, 158, 11, 0.38)',
              background: 'rgba(245, 158, 11, 0.12)',
              color: '#fcd34d',
              padding: '4px 8px',
              fontSize: 11,
              cursor: suggestion.relationship_id && onUpdateRelationshipRepair ? 'pointer' : 'not-allowed',
              opacity: suggestion.relationship_id ? 1 : 0.55,
            }}
          >
            更新原关系
          </button>
          <button
            type="button"
            onClick={() => setSkipped(true)}
            style={{
              borderRadius: 6,
              border: '1px solid rgba(148, 163, 184, 0.28)',
              background: 'rgba(148, 163, 184, 0.08)',
              color: 'var(--text-muted)',
              padding: '4px 8px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            跳过
          </button>
        </div>
      </div>

      <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.55 }}>
        {suggestion.core}
      </div>
      <div style={{ display: 'grid', gap: 4, color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.5 }}>
        {suggestion.missing_signals.length > 0 ? <div>缺失信号：{suggestion.missing_signals.join('、')}</div> : null}
        {suggestion.dependency ? <div>依赖：{suggestion.dependency}</div> : null}
        {suggestion.misunderstanding ? <div>误解：{suggestion.misunderstanding}</div> : null}
        {suggestion.debt ? <div>亏欠：{suggestion.debt}</div> : null}
        {suggestion.conflict ? <div>冲突：{suggestion.conflict}</div> : null}
        {suggestion.emotional_tension ? <div>情绪张力：{suggestion.emotional_tension}</div> : null}
        {suggestion.arc ? <div>关系变化：{suggestion.arc}</div> : null}
        {suggestion.scene_potential.length > 0 ? <div>可写场景：{suggestion.scene_potential.join('；')}</div> : null}
        {suggestion.writing_advice ? <div>写作建议：{suggestion.writing_advice}</div> : null}
      </div>
    </div>
  );
}

function AgentTracePanel({
  trace,
  messageId,
  onSaveRelationshipRepairDraft,
  onUpdateRelationshipRepair,
}: {
  trace: AgentTrace;
  messageId: string;
  onSaveRelationshipRepairDraft?: (messageId: string, suggestionIndex: number) => void;
  onUpdateRelationshipRepair?: (messageId: string, suggestionIndex: number) => void;
}) {
  const usedCount = trace.used_assets.length + trace.chapter_snippets.length;
  const summary = trace.plan_summary || '已按任务读取必要上下文。';
  const relationshipReport = trace.relationship_quality_report;

  return (
    <details
      style={{
        maxWidth: '85%',
        width: '100%',
        borderRadius: 12,
        border: '1px solid var(--border-subtle)',
        background: 'rgba(99, 102, 241, 0.08)',
        color: 'var(--text-secondary)',
        fontSize: 12,
        overflow: 'hidden',
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          listStyle: 'none',
          padding: '10px 14px',
          fontWeight: 700,
          userSelect: 'none',
          color: 'var(--text-primary)',
        }}
      >
        本轮写作依据
        <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontWeight: 500 }}>
          {trace.tool_calls.length} 个工具 · {usedCount} 条依据
          {trace.degraded ? ' · 已降级' : ''}
        </span>
      </summary>
      <div style={{ padding: '0 14px 12px', display: 'grid', gap: 10 }}>
        <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{summary}</div>
        <div style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
          模式：{getAgentModeLabel(trace.mode)}
          {trace.stopped_reason ? <span> · 停止原因：{trace.stopped_reason}</span> : null}
          {trace.fallback_reason ? <span> · 降级原因：{trace.fallback_reason}</span> : null}
        </div>

        {trace.retrieval_coverage ? (
          <div style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
            检索覆盖：角色 {trace.retrieval_coverage.counts.characters} · 关系 {trace.retrieval_coverage.counts.relationships} · 世界观 {trace.retrieval_coverage.counts.world} · 章节片段 {trace.retrieval_coverage.counts.chapter_snippets}
            {trace.retrieval_coverage.issues.length > 0 ? <div style={{ color: '#fcd34d' }}>{trace.retrieval_coverage.issues.join('；')}</div> : null}
          </div>
        ) : null}

        {relationshipReport ? (
          <div style={{
            display: 'grid',
            gap: 5,
            borderRadius: 8,
            border: '1px solid rgba(245, 158, 11, 0.22)',
            background: 'rgba(245, 158, 11, 0.07)',
            padding: '9px 10px',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}>
            <div style={{ color: '#fcd34d', fontWeight: 700 }}>关系质量报告</div>
            <div>
              总关系 {relationshipReport.total_relationships} · 有张力 {relationshipReport.tension_relationships} · 低信息 {relationshipReport.low_information_relationships} · 缺剧情功能 {relationshipReport.missing_plot_function_relationships}
            </div>
            <div>缺失最多：{topMissingSignals(relationshipReport.missing_signals)}</div>
          </div>
        ) : null}

        {trace.tool_calls.length > 0 ? (
          <div style={{ display: 'grid', gap: 6 }}>
            {trace.tool_calls.map((call, index) => (
              <div key={`${call.name}-${index}`} style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>
                {typeof call.step === 'number' ? <span>#{call.step} </span> : null}
                <strong style={{ color: 'var(--text-secondary)' }}>{getAgentToolLabel(call.name)}</strong>
                <span> · {call.status}</span>
                {typeof call.item_count === 'number' ? <span> · {call.item_count} 条</span> : null}
                {call.summary ? <span>：{call.summary}</span> : null}
              </div>
            ))}
          </div>
        ) : null}

        {trace.used_assets.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {trace.used_assets.map((asset, index) => (
              <span
                key={`${asset.id ?? asset.title}-${index}`}
                style={{
                  borderRadius: 999,
                  border: '1px solid var(--border-subtle)',
                  padding: '4px 8px',
                  color: 'var(--text-secondary)',
                }}
              >
                {asset.title || asset.id}
                {asset.type ? <span style={{ color: 'var(--text-muted)' }}> · {asset.type}</span> : null}
              </span>
            ))}
          </div>
        ) : null}

        {trace.chapter_snippets.length > 0 ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {trace.chapter_snippets.map((snippet, index) => (
              <div
                key={`${snippet.id ?? snippet.title}-${index}`}
                style={{
                  borderLeft: '2px solid rgba(139, 92, 246, 0.7)',
                  paddingLeft: 10,
                  color: 'var(--text-muted)',
                  lineHeight: 1.6,
                }}
              >
                <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {snippet.title || '章节片段'} · {getSnippetModeLabel(snippet.mode)}
                </div>
                {snippet.preview ? <div>{snippet.preview}</div> : null}
              </div>
            ))}
          </div>
        ) : null}

        {trace.relationship_repair_suggestions.length > 0 ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ color: '#fcd34d', fontWeight: 700 }}>关系修复建议</div>
            {trace.relationship_repair_suggestions.map((suggestion, index) => (
              <RepairSuggestionCard
                key={`${suggestion.relationship_id ?? suggestion.title}-${index}`}
                suggestion={suggestion}
                index={index}
                messageId={messageId}
                onSaveRelationshipRepairDraft={onSaveRelationshipRepairDraft}
                onUpdateRelationshipRepair={onUpdateRelationshipRepair}
              />
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function MessageBubble({
  message,
  chapterSaveTargets = [],
  onSelectAssetCandidate,
  onOpenArtifact,
  onConfirmSaveAsset,
  onRejectSaveAsset,
  onChangeSaveAssetDestination,
  onSelectSaveAssetTarget,
  onSaveRelationshipRepairDraft,
  onUpdateRelationshipRepair,
  onRetryMessage,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className="message-animate"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 20,
        gap: 8,
      }}
    >
      {!isUser && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 4,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              color: '#fff',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            N
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-muted)',
              letterSpacing: '0.04em',
            }}
          >
            NovelForge Agent
          </span>
        </div>
      )}

      {!isUser && message.thinking && message.isStreaming ? (
        <div
          style={{
            maxWidth: '85%',
            borderRadius: 12,
            border: '1px solid var(--border-subtle)',
            background: 'rgba(148, 163, 184, 0.08)',
            color: 'var(--text-muted)',
            fontSize: 12,
            padding: '10px 14px',
          }}
        >
          AI 正在整理回应，隐藏模型原始思考链。
        </div>
      ) : null}

      {!isUser && message.agentTrace ? (
        <AgentTracePanel
          trace={message.agentTrace}
          messageId={message.id}
          onSaveRelationshipRepairDraft={onSaveRelationshipRepairDraft}
          onUpdateRelationshipRepair={onUpdateRelationshipRepair}
        />
      ) : null}

      <div
        style={{
          maxWidth: isUser ? '70%' : '85%',
          padding: isUser ? '10px 15px' : '14px 18px',
          borderRadius: isUser ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
          background: isUser
            ? 'linear-gradient(135deg, #8b5cf6, #6366f1)'
            : 'var(--bg-elevated)',
          border: isUser ? 'none' : '1px solid var(--border-subtle)',
          color: isUser ? '#fff' : 'var(--text-secondary)',
          fontSize: 14,
          lineHeight: 1.75,
          boxShadow: isUser ? '0 2px 12px rgba(139, 92, 246, 0.3)' : 'var(--shadow-sm)',
        }}
      >
        {isUser ? (
          <span style={{ color: '#fff' }}>{message.content}</span>
        ) : (
          <div
            className={`prose-dark ${message.isStreaming ? 'typing-cursor' : ''}`}
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(message.content || ''),
            }}
          />
        )}
      </div>

      {!isUser && message.retryText ? (
        <button
          type="button"
          onClick={() => onRetryMessage?.(message.id, message.retryText!)}
          style={{
            maxWidth: '85%',
            alignSelf: 'flex-start',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            background: 'rgba(99, 102, 241, 0.12)',
            color: '#c4b5fd',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            cursor: onRetryMessage ? 'pointer' : 'default',
          }}
        >
          重试本次请求
        </button>
      ) : null}

      {message.artifact ? (
        <button
          type="button"
          data-artifact-id={message.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 10,
            background: 'rgba(139, 92, 246, 0.08)',
            border: '1px solid rgba(139, 92, 246, 0.25)',
            cursor: onOpenArtifact ? 'pointer' : 'default',
            maxWidth: '85%',
            fontSize: 13,
            color: '#c4b5fd',
            transition: 'background 150ms',
            textAlign: 'left',
          }}
          onClick={() => onOpenArtifact?.(message.artifact!)}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = 'rgba(139, 92, 246, 0.08)';
          }}
        >
          <span style={{ fontSize: 16 }}>{getArtifactIcon(message.artifact.type)}</span>
          <div>
            <span style={{ fontWeight: 600 }}>{getArtifactLabel(message.artifact.type)}</span>
            <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
              {message.artifact.title}
            </span>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
            点击预览 →
          </span>
        </button>
      ) : null}

      {!isUser && message.assetRequest ? (
        <div
          style={{
            maxWidth: '85%',
            width: '100%',
            borderRadius: 12,
            border: '1px solid rgba(99, 102, 241, 0.24)',
            background: 'rgba(99, 102, 241, 0.08)',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#c4b5fd', marginBottom: 4 }}>
              AI 请求项目资产上下文
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {message.assetRequest.reason || 'AI 希望先读取当前项目中的特定资产，再继续保持设定一致地创作。'}
            </div>
            {message.assetRequest.query ? (
              <div style={{ fontSize: 11, color: 'var(--text-disabled)', marginTop: 4 }}>
                检索关键词：{message.assetRequest.query}
              </div>
            ) : null}
          </div>

          {message.assetRequest.candidates.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {message.assetRequest.candidates.map((candidate) => {
                const isSelected = message.assetRequest?.selectedKeys?.includes(candidate.key) ?? false;
                const isStale = message.assetRequest?.status === 'stale';

                return (
                  <button
                    key={candidate.key}
                    type="button"
                    onClick={() => onSelectAssetCandidate?.(message.id, candidate)}
                    disabled={isSelected || isStale}
                    style={{
                      borderRadius: 999,
                      border: isSelected
                        ? '1px solid rgba(16, 185, 129, 0.45)'
                        : '1px solid rgba(99, 102, 241, 0.3)',
                      background: isSelected
                        ? 'rgba(16, 185, 129, 0.12)'
                        : 'rgba(15, 23, 42, 0.45)',
                      color: isSelected ? '#a7f3d0' : 'var(--text-secondary)',
                      padding: '8px 12px',
                      cursor: isSelected || isStale ? 'default' : 'pointer',
                      opacity: isStale ? 0.6 : 1,
                      maxWidth: 240,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 2,
                    }}
                    title={candidate.summary}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {candidate.title}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: isSelected ? '#6ee7b7' : 'var(--text-muted)',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isSelected
                        ? `${getAssetRequestTypeLabel(candidate.type)} · 已加入当前上下文`
                        : isStale
                          ? `${getAssetRequestTypeLabel(candidate.type)} · 请在当前项目重新请求`
                          : `${getAssetRequestTypeLabel(candidate.type)} · 点击加入上下文`}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              当前项目里还没有匹配到合适资产，你也可以继续手动从工作台中选择。
            </div>
          )}

          {getAssetRequestStatusText(message.assetRequest) ? (
            <div
              style={{
                fontSize: 11,
                color: message.assetRequest.status === 'resolved'
                  ? '#86efac'
                  : message.assetRequest.status === 'stale'
                    ? '#fca5a5'
                    : 'var(--text-muted)',
              }}
            >
              {getAssetRequestStatusText(message.assetRequest)}
            </div>
          ) : null}
        </div>
      ) : null}

      {!isUser && message.saveAssetRequests && message.saveAssetRequests.length > 0 ? (
        <div
          style={{
            maxWidth: '85%',
            width: '100%',
            borderRadius: 12,
            border: '1px solid rgba(16, 185, 129, 0.24)',
            background: 'rgba(16, 185, 129, 0.08)',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6ee7b7', marginBottom: 2 }}>
            AI 建议保存以下资产到项目内容库
          </div>
          {message.saveAssetRequests.map((request, index) => {
            const previewRows = buildSaveAssetPreviewRows(request, 4);
            const operationLabel = getSaveAssetOperationLabel(request);
            const warningLabel = getSaveAssetWarningLabel(request);
            const blockingReason = getSaveAssetBlockingReason(request);
            const selectedDestination = normalizeChapterSaveDestination(
              request.save_destination ?? request.data.save_destination,
              'ai_draft',
            );
            const selectedTargetId = typeof request.id === 'string'
              ? request.id
              : typeof request.data.id === 'string'
                ? request.data.id
                : typeof request.data.contentItemId === 'string'
                  ? request.data.contentItemId
                  : typeof request.data.content_item_id === 'string'
                    ? request.data.content_item_id
                    : '';
            const selectedTarget = chapterSaveTargets.find((target) => target.id === selectedTargetId);
            const savedChapterEditorHref = getSavedChapterEditorHref(request);

            return (
            <div
              key={`${message.id}-save-${index}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 8,
                background: request.status === 'saved'
                  ? 'rgba(16, 185, 129, 0.12)'
                  : request.status === 'rejected'
                    ? 'rgba(239, 68, 68, 0.1)'
                    : 'rgba(15, 23, 42, 0.45)',
                border: request.status === 'saved'
                  ? '1px solid rgba(16, 185, 129, 0.3)'
                  : request.status === 'rejected'
                    ? '1px solid rgba(239, 68, 68, 0.2)'
                    : '1px solid rgba(16, 185, 129, 0.15)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 15 }}>{getArtifactIcon(request.type)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {request.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {request.status === 'saved'
                    ? '已保存到项目内容库'
                    : request.status === 'rejected'
                      ? '已跳过'
                      : `${getArtifactLabel(request.type)} · ${operationLabel}`}
                </div>
              </div>
              {request.status === 'pending' ? (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => onConfirmSaveAsset?.(message.id, index)}
                    disabled={Boolean(blockingReason)}
                    title={blockingReason ?? undefined}
                    style={{
                      borderRadius: 6,
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#6ee7b7',
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: blockingReason ? 'not-allowed' : 'pointer',
                      opacity: blockingReason ? 0.5 : 1,
                    }}
                  >
                    确认保存
                  </button>
                  <button
                    type="button"
                    onClick={() => onRejectSaveAsset?.(message.id, index)}
                    style={{
                      borderRadius: 6,
                      border: '1px solid var(--border-subtle)',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      padding: '4px 10px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    跳过
                  </button>
                </div>
              ) : null}
              </div>
              {request.type === 'chapter' && request.status === 'pending' ? (
                <label style={{
                  display: 'grid',
                  gridTemplateColumns: '72px minmax(0, 1fr)',
                  gap: 8,
                  alignItems: 'center',
                  paddingLeft: 25,
                  fontSize: 11,
                  color: 'var(--text-muted)',
                }}>
                  <span style={{ color: 'var(--text-disabled)' }}>保存为</span>
                  <select
                    value={selectedDestination}
                    onChange={(event) => {
                      onChangeSaveAssetDestination?.(
                        message.id,
                        index,
                        normalizeChapterSaveDestination(event.currentTarget.value),
                      );
                    }}
                    style={{
                      width: '100%',
                      borderRadius: 8,
                      border: '1px solid rgba(16, 185, 129, 0.24)',
                      background: 'rgba(15, 23, 42, 0.85)',
                      color: 'var(--text-secondary)',
                      padding: '6px 8px',
                      fontSize: 12,
                      outline: 'none',
                    }}
                  >
                    {CHAPTER_SAVE_DESTINATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {request.type === 'chapter' && request.status === 'pending' && selectedDestination === 'update_existing' ? (
                <div style={{
                  display: 'grid',
                  gap: 8,
                  paddingLeft: 25,
                }}>
                  <label style={{
                    display: 'grid',
                    gridTemplateColumns: '72px minmax(0, 1fr)',
                    gap: 8,
                    alignItems: 'center',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                  }}>
                    <span style={{ color: 'var(--text-disabled)' }}>目标章节</span>
                    <select
                      value={selectedTargetId}
                      onChange={(event) => {
                        onSelectSaveAssetTarget?.(message.id, index, event.currentTarget.value);
                      }}
                      style={{
                        width: '100%',
                        borderRadius: 8,
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        background: 'rgba(15, 23, 42, 0.85)',
                        color: 'var(--text-secondary)',
                        padding: '6px 8px',
                        fontSize: 12,
                        outline: 'none',
                      }}
                    >
                      <option value="">请选择要覆盖的章节</option>
                      {chapterSaveTargets.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.title} | {target.sourceLabel} | {target.saveDestinationLabel || '无保存目的'} | {target.roleLabel} | {target.wordCount}字
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedTarget ? (
                    <div style={{
                      borderRadius: 8,
                      border: '1px solid rgba(245, 158, 11, 0.28)',
                      background: 'rgba(245, 158, 11, 0.08)',
                      color: '#fcd34d',
                      padding: '7px 9px',
                      fontSize: 11,
                      lineHeight: 1.55,
                    }}>
                      将覆盖：{selectedTarget.title} / {selectedTarget.sourceLabel} / {selectedTarget.saveDestinationLabel || '无保存目的'} / {selectedTarget.roleLabel} / {selectedTarget.wordCount}字
                    </div>
                  ) : null}
                </div>
              ) : null}
              {previewRows.length > 0 ? (
                <div style={{ display: 'grid', gap: 4, paddingLeft: 25 }}>
                  {previewRows.map((row) => (
                    <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 8, fontSize: 11 }}>
                      <span style={{ color: 'var(--text-disabled)' }}>{row.label}</span>
                      <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {warningLabel ? (
                <div style={{
                  marginLeft: 25,
                  borderRadius: 8,
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: '#fcd34d',
                  padding: '7px 9px',
                  fontSize: 11,
                  lineHeight: 1.5,
                }}>
                  {warningLabel}
                </div>
              ) : null}
              {blockingReason ? (
                <div style={{
                  marginLeft: 25,
                  borderRadius: 8,
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#fca5a5',
                  padding: '7px 9px',
                  fontSize: 11,
                  lineHeight: 1.5,
                }}>
                  {blockingReason}
                </div>
              ) : null}
              {savedChapterEditorHref ? (
                <a
                  href={savedChapterEditorHref}
                  style={{
                    marginLeft: 25,
                    width: 'fit-content',
                    borderRadius: 8,
                    border: '1px solid rgba(99, 102, 241, 0.35)',
                    background: 'rgba(99, 102, 241, 0.12)',
                    color: '#c4b5fd',
                    padding: '7px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  打开编辑器
                </a>
              ) : null}
            </div>
            );
          })}
        </div>
      ) : null}

      <span
        style={{
          fontSize: 11,
          color: 'var(--text-disabled)',
          paddingLeft: isUser ? 0 : 4,
          paddingRight: isUser ? 4 : 0,
        }}
      >
        {message.timestamp.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    </div>
  );
}

interface MessageListProps {
  messages: Message[];
  chapterSaveTargets?: ChapterSaveTargetOption[];
  onSelectAssetCandidate?: (
    messageId: string,
    candidate: NonNullable<Message['assetRequest']>['candidates'][number],
  ) => void;
  onOpenArtifact?: (artifact: NonNullable<Message['artifact']>) => void;
  onConfirmSaveAsset?: (messageId: string, requestIndex: number) => void;
  onRejectSaveAsset?: (messageId: string, requestIndex: number) => void;
  onChangeSaveAssetDestination?: (messageId: string, requestIndex: number, destination: ChapterSaveDestination) => void;
  onSelectSaveAssetTarget?: (messageId: string, requestIndex: number, targetId: string) => void;
  onSaveRelationshipRepairDraft?: (messageId: string, suggestionIndex: number) => void;
  onUpdateRelationshipRepair?: (messageId: string, suggestionIndex: number) => void;
  onRetryMessage?: (messageId: string, retryText: string) => void;
}

export function MessageList({
  messages,
  chapterSaveTargets = [],
  onSelectAssetCandidate,
  onOpenArtifact,
  onConfirmSaveAsset,
  onRejectSaveAsset,
  onChangeSaveAssetDestination,
  onSelectSaveAssetTarget,
  onSaveRelationshipRepairDraft,
  onUpdateRelationshipRepair,
  onRetryMessage,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: lastMessage?.isStreaming ? 'auto' : 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, lastMessage?.content, lastMessage?.thinking, lastMessage?.agentTrace, lastMessage?.isStreaming]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px clamp(16px, 5%, 80px)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          chapterSaveTargets={chapterSaveTargets}
          onSelectAssetCandidate={onSelectAssetCandidate}
          onOpenArtifact={onOpenArtifact}
          onConfirmSaveAsset={onConfirmSaveAsset}
          onRejectSaveAsset={onRejectSaveAsset}
          onChangeSaveAssetDestination={onChangeSaveAssetDestination}
          onSelectSaveAssetTarget={onSelectSaveAssetTarget}
          onSaveRelationshipRepairDraft={onSaveRelationshipRepairDraft}
          onUpdateRelationshipRepair={onUpdateRelationshipRepair}
          onRetryMessage={onRetryMessage}
        />
      ))}
    </div>
  );
}
