'use client';

import { useEffect, useRef } from 'react';
import { buildSaveAssetPreviewRows, getSaveAssetOperationLabel } from '@/lib/save-asset-preview';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  thinking?: string;
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
  saveAssetRequests?: Array<{
    type: string;
    title: string;
    data: Record<string, unknown>;
    id?: string;
    status?: 'pending' | 'saved' | 'rejected';
  }>;
  artifact?: {
    type: 'character_card' | 'world_setting' | 'timeline' | 'relationship' | 'outline' | 'chapter';
    title: string;
    data: Record<string, unknown>;
  };
}

interface MessageBubbleProps {
  message: Message;
  onSelectAssetCandidate?: (
    messageId: string,
    candidate: NonNullable<Message['assetRequest']>['candidates'][number],
  ) => void;
  onOpenArtifact?: (artifact: NonNullable<Message['artifact']>) => void;
  onConfirmSaveAsset?: (messageId: string, requestIndex: number) => void;
  onRejectSaveAsset?: (messageId: string, requestIndex: number) => void;
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

export function MessageBubble({ message, onSelectAssetCandidate, onOpenArtifact, onConfirmSaveAsset, onRejectSaveAsset }: MessageBubbleProps) {
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

      {!isUser && message.thinking ? (
        <details
          open={message.isStreaming}
          style={{
            maxWidth: '85%',
            width: '100%',
            borderRadius: 12,
            border: '1px solid var(--border-subtle)',
            background: 'rgba(148, 163, 184, 0.08)',
            color: 'var(--text-muted)',
            fontSize: 12,
            overflow: 'hidden',
          }}
        >
          <summary
            style={{
              cursor: 'pointer',
              listStyle: 'none',
              padding: '10px 14px',
              fontWeight: 600,
              userSelect: 'none',
            }}
          >
            {message.isStreaming ? 'AI 思考中…' : '查看思考过程'}
          </summary>
          <div
            style={{
              padding: '0 14px 12px',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.7,
            }}
          >
            {message.thinking}
          </div>
        </details>
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
                    style={{
                      borderRadius: 6,
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#6ee7b7',
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
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
  onSelectAssetCandidate?: (
    messageId: string,
    candidate: NonNullable<Message['assetRequest']>['candidates'][number],
  ) => void;
  onOpenArtifact?: (artifact: NonNullable<Message['artifact']>) => void;
  onConfirmSaveAsset?: (messageId: string, requestIndex: number) => void;
  onRejectSaveAsset?: (messageId: string, requestIndex: number) => void;
}

export function MessageList({
  messages,
  onSelectAssetCandidate,
  onOpenArtifact,
  onConfirmSaveAsset,
  onRejectSaveAsset,
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
  }, [messages.length, lastMessage?.content, lastMessage?.thinking, lastMessage?.isStreaming]);

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
          onSelectAssetCandidate={onSelectAssetCandidate}
          onOpenArtifact={onOpenArtifact}
          onConfirmSaveAsset={onConfirmSaveAsset}
          onRejectSaveAsset={onRejectSaveAsset}
        />
      ))}
    </div>
  );
}
