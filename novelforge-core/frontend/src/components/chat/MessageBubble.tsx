'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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

type RelationshipRepairSource = 'suggestions' | 'queue';
type RelationshipRepairAction = (
  messageId: string,
  suggestionIndex: number,
  source?: RelationshipRepairSource,
) => void | boolean | Promise<void | boolean>;

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
  onSaveRelationshipRepairDraft?: RelationshipRepairAction;
  onUpdateRelationshipRepair?: RelationshipRepairAction;
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

function isLikelyCorruptedText(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;

  const questionMarkCount = (normalized.match(/\?/g) || []).length;
  const replacementCount = (normalized.match(/\uFFFD/g) || []).length;
  const mojibakeCount = (normalized.match(/[ÃÂÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ]/g) || []).length;
  const suspiciousCount = questionMarkCount + replacementCount + mojibakeCount;

  if (questionMarkCount >= 12 && questionMarkCount / normalized.length > 0.18) return true;
  if (replacementCount >= 2) return true;
  return mojibakeCount >= 24 && suspiciousCount / normalized.length > 0.25;
}

function getDisplayContent(text: string): string {
  if (!isLikelyCorruptedText(text)) return text;
  return '这条历史消息的正文编码已损坏，已隐藏乱码内容。建议重新发送原始提示或从编辑器中的资产继续创作。';
}

function getArtifactIcon(type: string): string {
  const icons: Record<string, string> = {
    character_card: '人',
    world_setting: '世',
    timeline: '时',
    relationship: '关',
    outline: '纲',
    chapter: '章',
  };
  return icons[type] ?? '资';
}

function getArtifactLabel(type: string): string {
  const labels: Record<string, string> = {
    character_card: '角色卡',
    world_setting: '世界观',
    timeline: '时间线',
    relationship: '关系',
    outline: '大纲',
    chapter: '章节',
  };
  return labels[type] ?? '资产';
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
    relationship: '关系',
    novel: '小说',
  };
  return labels[type] ?? type;
}

function getAssetRequestStatusText(request: NonNullable<Message['assetRequest']>): string | null {
  const selectedCount = request.selectedKeys?.length ?? 0;
  if (request.status === 'resolved') {
    return selectedCount > 0
      ? `已加入 ${selectedCount} 条上下文，后续回复会优先参考。`
      : '资产请求已确认。';
  }
  if (request.status === 'stale') return '这条资产请求属于旧项目，请在当前项目重新请求。';
  if (request.status === 'empty') return '当前项目没有匹配资产，可以继续手动选择或先补充内容库。';
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
    build_relationship_repair_queue: '生成关系补强队列',
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
  return entries.length > 0 ? entries.map(([key, count]) => `${key} x ${count}`).join('，') : '暂无';
}

function isLowConfidenceTraceAsset(asset: AgentTrace['used_assets'][number]): boolean {
  return Boolean(asset.low_confidence || asset.needs_ai_repair || asset.diagnostic_seed);
}

function getTraceAssetQualityBadges(asset: AgentTrace['used_assets'][number]): string[] {
  return [
    asset.diagnostic_seed ? '诊断种子' : '',
    asset.needs_ai_repair ? '需修复' : '',
    asset.low_confidence ? '低置信' : '',
    asset.relationship_enriched ? '增强关系' : '',
    ...asset.quality_warnings,
  ].filter((label, index, labels) => label.length > 0 && labels.indexOf(label) === index);
}

function RepairSuggestionCard({
  suggestion,
  index,
  messageId,
  source = 'suggestions',
  onSaveRelationshipRepairDraft,
  onUpdateRelationshipRepair,
}: {
  suggestion: AgentRelationshipRepairSuggestion;
  index: number;
  messageId: string;
  source?: RelationshipRepairSource;
  onSaveRelationshipRepairDraft?: RelationshipRepairAction;
  onUpdateRelationshipRepair?: RelationshipRepairAction;
}) {
  const [status, setStatus] = useState<'pending' | 'saved' | 'updated' | 'skipped'>(
    suggestion.queue_status === 'saved' || suggestion.queue_status === 'updated' || suggestion.queue_status === 'skipped'
      ? suggestion.queue_status
      : 'pending',
  );

  const runAction = async (action: 'save' | 'update') => {
    const handler = action === 'save' ? onSaveRelationshipRepairDraft : onUpdateRelationshipRepair;
    if (!handler || status !== 'pending') return;
    const result = await handler(messageId, index, source);
    if (result !== false) setStatus(action === 'save' ? 'saved' : 'updated');
  };

  const statusLabel = status === 'pending'
    ? '待处理'
    : status === 'saved'
      ? '已保存草稿'
      : status === 'updated'
        ? '已更新原关系'
        : '已跳过';

  return (
    <div className="nf-action-card">
      <div className="nf-card-header">
        <div style={{ minWidth: 0 }}>
          <div className="nf-panel-title">
            {typeof suggestion.queue_rank === 'number' ? `#${suggestion.queue_rank} ` : ''}
            {suggestion.title || `${suggestion.source ?? '角色A'} -> ${suggestion.target ?? '角色B'}`}
          </div>
          <div className="nf-panel-subtitle">
            {suggestion.source || '角色A'} / {suggestion.target || '角色B'}
            {typeof suggestion.queue_score === 'number' ? <span> · 队列分 {suggestion.queue_score}</span> : null}
            <span> · {statusLabel}</span>
          </div>
        </div>
        <div className="nf-pill-row" style={{ flexShrink: 0 }}>
          <button className="nf-button nf-button-primary" type="button" onClick={() => runAction('save')} disabled={status !== 'pending'}>
            保存草稿
          </button>
          <button
            className="nf-button"
            type="button"
            onClick={() => {
              if (window.confirm('确认更新原关系资产吗？系统会保留 previous_snapshot，可恢复旧内容。')) runAction('update');
            }}
            disabled={!suggestion.relationship_id || status !== 'pending'}
            title={suggestion.relationship_id ? undefined : '缺少原关系 ID，无法更新原资产'}
          >
            更新原关系
          </button>
          <button className="nf-button" type="button" onClick={() => setStatus('skipped')} disabled={status !== 'pending'}>
            跳过
          </button>
        </div>
      </div>
      <div className="nf-card-body">
        {suggestion.core ? <div className="nf-small" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{suggestion.core}</div> : null}
        {(suggestion.queue_reasons?.length ?? 0) > 0 ? <div className="nf-alert">入队原因：{suggestion.queue_reasons?.join('，')}</div> : null}
        <div className="nf-card-grid nf-small nf-muted" style={{ lineHeight: 1.55 }}>
          {suggestion.missing_signals.length > 0 ? <div>缺失信号：{suggestion.missing_signals.join('，')}</div> : null}
          {suggestion.dependency ? <div>依赖：{suggestion.dependency}</div> : null}
          {suggestion.misunderstanding ? <div>误解：{suggestion.misunderstanding}</div> : null}
          {suggestion.debt ? <div>亏欠：{suggestion.debt}</div> : null}
          {suggestion.conflict ? <div>冲突：{suggestion.conflict}</div> : null}
          {suggestion.emotional_tension ? <div>情绪张力：{suggestion.emotional_tension}</div> : null}
          {suggestion.arc ? <div>关系弧线：{suggestion.arc}</div> : null}
          {suggestion.scene_potential.length > 0 ? <div>可写场景：{suggestion.scene_potential.join('，')}</div> : null}
          {suggestion.writing_advice ? <div>写作建议：{suggestion.writing_advice}</div> : null}
        </div>
      </div>
    </div>
  );
}

function TraceSection({ title, children }: { title: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <section className="nf-card-grid">
      <div className="nf-kicker">{title}</div>
      {children}
    </section>
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
  onSaveRelationshipRepairDraft?: RelationshipRepairAction;
  onUpdateRelationshipRepair?: RelationshipRepairAction;
}) {
  const relationshipReport = trace.relationship_quality_report;
  const chapterSnippetCount = trace.chapter_snippets.length;
  const relationshipCount = trace.retrieval_coverage?.counts.relationships ?? 0;
  const characterCount = trace.retrieval_coverage?.counts.characters ?? 0;
  const worldCount = trace.retrieval_coverage?.counts.world ?? 0;
  const usedEnrichedRelationships = trace.used_assets.some((asset) => asset.relationship_enriched);
  const lowConfidenceAssetCount = trace.retrieval_coverage?.counts.low_confidence_assets
    ?? trace.used_assets.filter(isLowConfidenceTraceAsset).length;
  const retrievalIssues = trace.retrieval_coverage?.issues ?? [];
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="nf-trace-card" data-open={isOpen ? 'true' : 'false'}>
      <button className="nf-trace-summary" type="button" onClick={() => setIsOpen((value) => !value)} aria-expanded={isOpen}>
        <div>
          <div className="nf-panel-title">本轮写作依据</div>
          <div className="nf-panel-subtitle">
            角色 {characterCount} · 关系 {relationshipCount} · 世界观 {worldCount} · 章节片段 {chapterSnippetCount}
            {usedEnrichedRelationships ? ' · 使用增强关系' : ''}
            {lowConfidenceAssetCount > 0 ? ` · 低置信资产 ${lowConfidenceAssetCount}` : ''}
            {trace.degraded ? ' · fallback' : ''}
          </div>
        </div>
        <span className="nf-chip">{isOpen ? '收起详情' : '展开详情'}</span>
      </button>
      {isOpen ? <div className="nf-trace-body">
        <TraceSection title="计划">
          <div className="nf-small nf-muted" style={{ lineHeight: 1.6 }}>
            {trace.plan_summary || '已按任务读取必要上下文。'}
            <br />
            模式：{getAgentModeLabel(trace.mode)}
            {trace.stopped_reason ? <span> · 停止原因：{trace.stopped_reason}</span> : null}
            {trace.fallback_reason ? <span> · 降级原因：{trace.fallback_reason}</span> : null}
          </div>
        </TraceSection>

        {retrievalIssues.length > 0 ? (
          <TraceSection title="上下文风险">
            <div className="nf-card-grid">
              {retrievalIssues.map((issue, index) => (
                <div className="nf-alert" key={`retrieval-issue-${index}`}>{issue}</div>
              ))}
            </div>
          </TraceSection>
        ) : null}

        {trace.tool_calls.length > 0 ? (
          <TraceSection title="工具调用">
            <div className="nf-card-grid">
              {trace.tool_calls.map((call, index) => (
                <div key={`${call.name}-${index}`} className="nf-small nf-muted">
                  {typeof call.step === 'number' ? <span>#{call.step} </span> : null}
                  <strong style={{ color: 'var(--text-secondary)' }}>{getAgentToolLabel(call.name)}</strong>
                  <span> · {call.status}</span>
                  {typeof call.item_count === 'number' ? <span> · {call.item_count} 条</span> : null}
                  {call.summary ? <span>：{call.summary}</span> : null}
                </div>
              ))}
            </div>
          </TraceSection>
        ) : null}

        {trace.used_assets.length > 0 ? (
          <TraceSection title="使用资产">
            <div className="nf-pill-row">
              {trace.used_assets.map((asset, index) => (
                <span className="nf-chip" key={`${asset.id ?? asset.title}-${index}`}>
                  {asset.title || asset.id}
                  {asset.type ? <span className="nf-muted"> · {asset.type}</span> : null}
                  {getTraceAssetQualityBadges(asset).map((badge) => (
                    <span className="nf-muted" key={`${asset.id ?? asset.title}-${badge}`}> · {badge}</span>
                  ))}
                </span>
              ))}
            </div>
          </TraceSection>
        ) : null}

        {trace.chapter_snippets.length > 0 ? (
          <TraceSection title="章节片段">
            <div className="nf-card-grid">
              {trace.chapter_snippets.map((snippet, index) => (
                <div key={`${snippet.id ?? snippet.title}-${index}`} className="nf-alert" style={{ borderColor: 'color-mix(in srgb, var(--nf-accent) 28%, transparent)', background: 'var(--nf-accent-soft)', color: 'var(--nf-text-muted)' }}>
                  <strong>{snippet.title || '章节片段'} · {getSnippetModeLabel(snippet.mode)}</strong>
                  {snippet.preview ? <div className="nf-muted" style={{ marginTop: 4 }}>{snippet.preview}</div> : null}
                </div>
              ))}
            </div>
          </TraceSection>
        ) : null}

        {relationshipReport ? (
          <TraceSection title="关系质量">
            <div className="nf-stat-grid">
              <div className="nf-stat"><span>关系总数</span><strong>{relationshipReport.total_relationships}</strong></div>
              <div className="nf-stat"><span>有张力</span><strong>{relationshipReport.tension_relationships}</strong></div>
              <div className="nf-stat"><span>低信息</span><strong>{relationshipReport.low_information_relationships}</strong></div>
              <div className="nf-stat"><span>缺剧情功能</span><strong>{relationshipReport.missing_plot_function_relationships}</strong></div>
            </div>
            <div className="nf-alert">缺失最多：{topMissingSignals(relationshipReport.missing_signals)}</div>
          </TraceSection>
        ) : null}

        {trace.relationship_repair_queue.length > 0 ? (
          <TraceSection title="关系补强队列">
            {trace.relationship_repair_queue_report?.before && trace.relationship_repair_queue_report.projected_after ? (
              <div className="nf-alert" style={{ borderColor: 'color-mix(in srgb, var(--nf-success) 28%, transparent)', background: 'color-mix(in srgb, var(--nf-success) 8%, transparent)', color: 'var(--nf-success)' }}>
                修复前有张力 {trace.relationship_repair_queue_report.before.tension_relationships}，预计后 {trace.relationship_repair_queue_report.projected_after.tension_relationships}。
              </div>
            ) : null}
            <div className="nf-card-grid">
              {trace.relationship_repair_queue.map((suggestion, index) => (
                <RepairSuggestionCard
                  key={`queue-${suggestion.relationship_id ?? suggestion.title}-${index}`}
                  suggestion={suggestion}
                  index={index}
                  source="queue"
                  messageId={messageId}
                  onSaveRelationshipRepairDraft={onSaveRelationshipRepairDraft}
                  onUpdateRelationshipRepair={onUpdateRelationshipRepair}
                />
              ))}
            </div>
          </TraceSection>
        ) : null}

        {trace.relationship_repair_suggestions.length > 0 ? (
          <TraceSection title="关系修复建议">
            <div className="nf-card-grid">
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
          </TraceSection>
        ) : null}
      </div> : null}
    </div>
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
  const displayContent = getDisplayContent(message.content || '');

  return (
    <div className={`message-animate nf-message-row ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && (
        <div className="nf-message-author">
          <span className="nf-avatar">N</span>
          <span>NovelForge Agent</span>
        </div>
      )}

      {!isUser && message.thinking && message.isStreaming ? (
        <div className="nf-action-card nf-panel-pad nf-small nf-muted">
          AI 正在整理回复，已隐藏模型原始思考链。
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

      <div className={`nf-message-bubble ${isUser ? 'user' : 'assistant'}`}>
        {isUser ? (
          <span>{displayContent}</span>
        ) : (
          <div
            className={`prose-dark ${message.isStreaming ? 'typing-cursor' : ''}`}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(displayContent) }}
          />
        )}
      </div>

      {!isUser && message.retryText ? (
        <button className="nf-button nf-button-primary" type="button" onClick={() => onRetryMessage?.(message.id, message.retryText!)}>
          重试本次请求
        </button>
      ) : null}

      {message.artifact ? (
        <button className="nf-action-card nf-card-header" type="button" data-artifact-id={message.id} onClick={() => onOpenArtifact?.(message.artifact!)}>
          <span className="nf-chip">{getArtifactIcon(message.artifact.type)}</span>
          <span style={{ minWidth: 0, textAlign: 'left' }}>
            <span className="nf-panel-title">{getArtifactLabel(message.artifact.type)}</span>
            <span className="nf-panel-subtitle" style={{ display: 'block' }}>{message.artifact.title}</span>
          </span>
          <span className="nf-muted nf-small" style={{ marginLeft: 'auto' }}>打开预览</span>
        </button>
      ) : null}

      {!isUser && message.assetRequest ? (
        <div className="nf-action-card">
          <div className="nf-card-header">
            <div>
              <div className="nf-panel-title">AI 请求项目上下文</div>
              <div className="nf-panel-subtitle">{message.assetRequest.reason || 'AI 需要先读取项目资产，再继续保持设定一致地创作。'}</div>
              {message.assetRequest.query ? <div className="nf-kicker" style={{ marginTop: 6 }}>关键词：{message.assetRequest.query}</div> : null}
            </div>
          </div>
          <div className="nf-card-body">
            {message.assetRequest.candidates.length > 0 ? (
              <div className="nf-pill-row">
                {message.assetRequest.candidates.map((candidate) => {
                  const isSelected = message.assetRequest?.selectedKeys?.includes(candidate.key) ?? false;
                  const isStale = message.assetRequest?.status === 'stale';
                  return (
                    <button
                      key={candidate.key}
                      className={`nf-chip ${isSelected ? 'nf-button-primary' : ''}`}
                      type="button"
                      onClick={() => onSelectAssetCandidate?.(message.id, candidate)}
                      disabled={isSelected || isStale}
                      title={candidate.summary}
                    >
                      <strong>{candidate.title}</strong>
                      <span className="nf-muted">
                        {getAssetRequestTypeLabel(candidate.type)} · {isSelected ? '已加入' : isStale ? '需重新请求' : '加入上下文'}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="nf-small nf-muted">当前项目没有匹配资产，可以继续手动选择或先补充内容库。</div>
            )}
            {getAssetRequestStatusText(message.assetRequest) ? (
              <div className="nf-alert">{getAssetRequestStatusText(message.assetRequest)}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!isUser && message.saveAssetRequests && message.saveAssetRequests.length > 0 ? (
        <div className="nf-action-card">
          <div className="nf-card-header">
            <div>
              <div className="nf-panel-title">AI 建议写回内容库</div>
              <div className="nf-panel-subtitle">请确认后再保存，系统不会绕过你的确认直接覆盖资产。</div>
            </div>
          </div>
          <div className="nf-card-body">
            {message.saveAssetRequests.map((request, index) => {
              const previewRows = buildSaveAssetPreviewRows(request, 4);
              const operationLabel = getSaveAssetOperationLabel(request);
              const warningLabel = getSaveAssetWarningLabel(request);
              const blockingReason = getSaveAssetBlockingReason(request);
              const selectedDestination = normalizeChapterSaveDestination(request.save_destination ?? request.data.save_destination, 'ai_draft');
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
                <div className="nf-panel nf-panel-pad nf-card-grid" key={`${message.id}-save-${index}`}>
                  <div className="nf-card-header" style={{ padding: 0 }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="nf-panel-title">{getArtifactIcon(request.type)} {request.title}</div>
                      <div className="nf-panel-subtitle">
                        {request.status === 'saved'
                          ? '已保存到项目内容库'
                          : request.status === 'rejected'
                            ? '已跳过'
                            : `${getArtifactLabel(request.type)} · ${operationLabel}`}
                      </div>
                    </div>
                    {request.status === 'pending' ? (
                      <div className="nf-pill-row">
                        <button className="nf-button nf-button-primary" type="button" onClick={() => onConfirmSaveAsset?.(message.id, index)} disabled={Boolean(blockingReason)} title={blockingReason ?? undefined}>
                          确认保存
                        </button>
                        <button className="nf-button" type="button" onClick={() => onRejectSaveAsset?.(message.id, index)}>
                          跳过
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {request.type === 'chapter' && request.status === 'pending' ? (
                    <label className="nf-form-row nf-small nf-muted">
                      <span>保存为</span>
                      <select
                        className="nf-select"
                        value={selectedDestination}
                        onChange={(event) => onChangeSaveAssetDestination?.(message.id, index, normalizeChapterSaveDestination(event.currentTarget.value))}
                      >
                        {CHAPTER_SAVE_DESTINATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {request.type === 'chapter' && request.status === 'pending' && selectedDestination === 'update_existing' ? (
                    <div className="nf-card-grid">
                      <label className="nf-form-row nf-small nf-muted">
                        <span>目标章节</span>
                        <select className="nf-select" value={selectedTargetId} onChange={(event) => onSelectSaveAssetTarget?.(message.id, index, event.currentTarget.value)}>
                          <option value="">请选择要覆盖的章节</option>
                          {chapterSaveTargets.map((target) => (
                            <option key={target.id} value={target.id}>
                              {target.title} | {target.sourceLabel} | {target.saveDestinationLabel || '无保存目的'} | {target.roleLabel} | {target.wordCount} 字
                            </option>
                          ))}
                        </select>
                      </label>
                      {selectedTarget ? <div className="nf-alert">将覆盖：{selectedTarget.title} / {selectedTarget.sourceLabel} / {selectedTarget.saveDestinationLabel || '无保存目的'} / {selectedTarget.roleLabel} / {selectedTarget.wordCount} 字</div> : null}
                    </div>
                  ) : null}

                  {previewRows.length > 0 ? (
                    <details className="nf-card-grid nf-save-details">
                      <summary className="nf-chip" style={{ width: 'fit-content' }}>查看预览与影响</summary>
                      {previewRows.map((row) => (
                        <div className="nf-form-row nf-small" key={row.label}>
                          <span className="nf-muted">{row.label}</span>
                          <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.value}</span>
                        </div>
                      ))}
                    </details>
                  ) : null}

                  {warningLabel ? <div className="nf-alert">{warningLabel}</div> : null}
                  {blockingReason ? <div className="nf-alert" style={{ borderColor: 'color-mix(in srgb, var(--nf-danger) 32%, transparent)', background: 'color-mix(in srgb, var(--nf-danger) 8%, transparent)', color: 'var(--nf-danger)' }}>{blockingReason}</div> : null}
                  {savedChapterEditorHref ? <a className="nf-button nf-button-primary" href={savedChapterEditorHref} style={{ width: 'fit-content', textDecoration: 'none' }}>打开编辑器</a> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <span className="nf-small nf-muted" style={{ paddingLeft: isUser ? 0 : 4, paddingRight: isUser ? 4 : 0 }}>
        {message.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
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
  onSaveRelationshipRepairDraft?: RelationshipRepairAction;
  onUpdateRelationshipRepair?: RelationshipRepairAction;
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
    if (!container) return;

    const frame = window.requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: lastMessage?.isStreaming ? 'auto' : 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, lastMessage?.content, lastMessage?.thinking, lastMessage?.agentTrace, lastMessage?.isStreaming]);

  return (
    <div ref={containerRef} className="nf-message-list">
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
