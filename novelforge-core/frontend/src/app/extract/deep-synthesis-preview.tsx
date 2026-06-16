'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  Settings2,
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  User,
  Users2,
  Calendar,
  Globe,
  Plus,
  Compass,
  ArrowRight,
  TrendingUp,
  Award,
  BookOpen
} from 'lucide-react';
import {
  DeepSynthesisResult,
  DeepSynthesisBudgetTier,
  DeepSynthesisScopeType,
  DeepSynthesisAssetType,
  ProposedChange
} from '@/types';
import {
  formatDeepSynthesisBudgetTier,
  formatDeepSynthesisScopeType,
  formatRiskLevel,
  formatConvergenceReason,
  formatPassType,
  formatRoundStatus,
  formatPercent,
  formatQualityDelta,
  groupProposedChangesByAssetType,
  sanitizeDeepSynthesisDisplayValue
} from './deep-synthesis-utils';

interface DeepSynthesisPreviewPanelProps {
  result: DeepSynthesisResult | null;
  loading: boolean;
  error: string | null;
  selectionState: Record<string, 'accepted' | 'rejected' | 'undecided'>;
  onAcceptChange: (changeId: string) => void;
  onRejectChange: (changeId: string) => void;
  onResetChange: (changeId: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onRunPreview: () => void;
  budgetTier: DeepSynthesisBudgetTier;
  onBudgetTierChange: (tier: DeepSynthesisBudgetTier) => void;
  scopeType: DeepSynthesisScopeType;
  onScopeTypeChange: (scope: DeepSynthesisScopeType) => void;
}

export function DeepSynthesisPreviewPanel({
  result,
  loading,
  error,
  selectionState,
  onAcceptChange,
  onRejectChange,
  onResetChange,
  onAcceptAll,
  onRejectAll,
  onRunPreview,
  budgetTier,
  onBudgetTierChange,
  scopeType,
  onScopeTypeChange
}: DeepSynthesisPreviewPanelProps) {
  const [collapsedRounds, setCollapsedRounds] = useState<Record<number, boolean>>({});

  const toggleRoundCollapse = (roundNum: number) => {
    setCollapsedRounds(prev => ({
      ...prev,
      [roundNum]: !prev[roundNum]
    }));
  };

  const getAssetTypeIcon = (type: DeepSynthesisAssetType) => {
    switch (type) {
      case 'character':
        return <User className="w-4 h-4 text-emerald-400" />;
      case 'relationship':
        return <Users2 className="w-4 h-4 text-sky-400" />;
      case 'event':
        return <Calendar className="w-4 h-4 text-amber-400" />;
      case 'world_fact':
        return <Globe className="w-4 h-4 text-purple-400" />;
    }
  };

  const getAssetTypeLabel = (type: DeepSynthesisAssetType) => {
    switch (type) {
      case 'character':
        return '角色设定';
      case 'relationship':
        return '关系网络';
      case 'event':
        return '事件时序';
      case 'world_fact':
        return '世界设定';
    }
  };

  const groupedChanges = result ? groupProposedChangesByAssetType(result.preview.proposed_changes) : null;

  const totalChangesCount = result?.preview?.proposed_changes?.length || 0;
  const acceptedCount = Object.values(selectionState).filter(v => v === 'accepted').length;
  const rejectedCount = Object.values(selectionState).filter(v => v === 'rejected').length;
  const undecidedCount = totalChangesCount - acceptedCount - rejectedCount;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl transition-all duration-300">
      {/* Panel Header */}
      <div className="p-6 border-b border-slate-800 bg-slate-900/60 backdrop-blur-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
              深度合成预览 (Deep Synthesis Preview)
              {result && (
                <span className="px-2 py-0.5 text-xs font-mono font-medium rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  Ready
                </span>
              )}
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">跨章节智能冲突消解与多轮深度提炼演进</p>
          </div>
        </div>

        {result && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
            <span>Attempt: {result.attempt_id.slice(0, 8)}</span>
            <span className="text-slate-600">|</span>
            <span>Task: {result.task_type}</span>
          </div>
        )}
      </div>

      {/* Control Configuration Bar */}
      <div className="p-6 border-b border-slate-800 bg-slate-950/40 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5" /> 深度合成范围 (Scope)
          </label>
          <div className="relative">
            <select
              value={scopeType}
              onChange={(e) => onScopeTypeChange(e.target.value as DeepSynthesisScopeType)}
              disabled={loading}
              className="w-full h-10 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-50 appearance-none cursor-pointer"
            >
              <option value="full">全量分析并重组 (Full)</option>
              <option value="character">仅聚焦角色设定 (Character Only)</option>
              <option value="relationship">仅聚焦关系网络 (Relationship Only)</option>
              <option value="event">仅聚焦事件时序 (Event Only)</option>
              <option value="world_fact">仅聚焦世界设定 (World Fact Only)</option>
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
            <Settings2 className="w-3.5 h-3.5" /> 预算档次 (Budget Tier)
          </label>
          <div className="relative">
            <select
              value={budgetTier}
              onChange={(e) => onBudgetTierChange(e.target.value as DeepSynthesisBudgetTier)}
              disabled={loading}
              className="w-full h-10 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-50 appearance-none cursor-pointer"
            >
              <option value="low">低预算演进 (1轮, 快速探测)</option>
              <option value="medium">标准预算演进 (最多3轮, 自动消解)</option>
              <option value="high">高预算极智演进 (最多5轮, 极限消解)</option>
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div>
          <button
            onClick={onRunPreview}
            disabled={loading}
            className="w-full h-10 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-slate-800 text-slate-100 font-medium text-sm rounded-lg transition-colors border border-emerald-500/30 disabled:border-slate-700 disabled:text-slate-500 shadow-lg shadow-emerald-950/10 cursor-pointer"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                正在执行深度演进与合成评估...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current text-slate-100" />
                生成 Deep Synthesis Preview
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="p-6">
        {error && (
          <div className="mb-6 p-4 bg-red-900/10 border border-red-500/20 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-red-200">深度合成预览生成失败</h4>
              <p className="text-xs text-red-400 mt-1">{error}</p>
            </div>
          </div>
        )}

        {!result && !loading && !error && (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <div className="p-4 bg-slate-950 rounded-full border border-slate-800 text-slate-500 mb-4">
              <Compass className="w-8 h-8" />
            </div>
            <h3 className="text-slate-300 font-medium">无可用的深度合成预览数据</h3>
            <p className="text-slate-500 text-xs mt-1 max-w-sm">
              请点击上方“生成 Deep Synthesis Preview”按钮，系统将开启多轮验证、冲突消解和全量提炼分析。
            </p>
          </div>
        )}

        {result && (
          <div className="space-y-8">
            {/* Quick Metrics Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="p-4 bg-slate-950 border border-slate-800/80 rounded-lg">
                <span className="block text-[11px] text-slate-500 font-medium">总更正资产项</span>
                <span className="block text-2xl font-semibold font-mono text-slate-100 mt-1">{totalChangesCount}</span>
              </div>
              <div className="p-4 bg-slate-950 border border-slate-800/80 rounded-lg">
                <span className="block text-[11px] text-slate-500 font-medium">高置信更正项</span>
                <span className="block text-2xl font-semibold font-mono text-emerald-400 mt-1">
                  {result.preview.proposed_changes.filter(c => c.confidence >= 0.85).length}
                </span>
              </div>
              <div className="p-4 bg-slate-950 border border-slate-800/80 rounded-lg">
                <span className="block text-[11px] text-slate-500 font-medium">未消解矛盾点</span>
                <span className="block text-2xl font-semibold font-mono text-amber-400 mt-1">
                  {result.convergence_summary?.converged ? 0 : 1}
                </span>
              </div>
              <div className="p-4 bg-slate-950 border border-slate-800/80 rounded-lg">
                <span className="block text-[11px] text-slate-500 font-medium">精炼后质量变化</span>
                <span className="block text-2xl font-semibold font-mono text-emerald-400 mt-1 flex items-center gap-1">
                  {formatQualityDelta(result.quality_trace?.quality_delta ?? null)}
                  {result.quality_trace?.quality_after_preview && result.quality_trace?.quality_before && (
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                  )}
                </span>
              </div>
              <div className="p-4 bg-slate-950 border border-slate-800/80 rounded-lg col-span-2 lg:col-span-1">
                <span className="block text-[11px] text-slate-500 font-medium">当前审核接受率</span>
                <span className="block text-2xl font-semibold font-mono text-indigo-400 mt-1">
                  {totalChangesCount > 0 ? `${Math.round((acceptedCount / totalChangesCount) * 100)}%` : '0%'}
                </span>
              </div>
            </div>

            {/* Preview Summary Description */}
            <div className="p-5 bg-slate-950 border border-slate-800 rounded-lg">
              <h3 className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-400" /> 提炼演进摘要
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed font-normal">
                {sanitizeDeepSynthesisDisplayValue(result.preview.summary)}
              </p>
              {result.preview.requires_user_confirmation && (
                <div className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-md text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>注意：提炼中检测到深度冲突，需要进行人工冲突决策方可写入资产。</span>
                </div>
              )}
            </div>

            {/* Selection Status Workflow Summary */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-slate-950 border border-slate-800 rounded-lg">
              <div className="flex flex-wrap gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <span className="text-slate-400 font-normal">已接受:</span>
                  <span className="font-semibold text-emerald-400 font-mono">{acceptedCount} 项</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                  <span className="text-slate-400 font-normal">已拒绝:</span>
                  <span className="font-semibold text-rose-400 font-mono">{rejectedCount} 项</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-500"></span>
                  <span className="text-slate-400 font-normal">待决策:</span>
                  <span className="font-semibold text-slate-300 font-mono">{undecidedCount} 项</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={onAcceptAll}
                  className="px-3 py-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 active:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 rounded text-xs font-medium cursor-pointer transition-colors"
                >
                  全部接受
                </button>
                <button
                  onClick={onRejectAll}
                  className="px-3 py-1.5 bg-rose-600/10 hover:bg-rose-600/20 active:bg-rose-600/30 text-rose-400 border border-rose-500/20 rounded text-xs font-medium cursor-pointer transition-colors"
                >
                  全部拒绝
                </button>
              </div>
            </div>

            {/* Proposed Changes list, grouped by asset_type */}
            <div className="space-y-6">
              <h3 className="text-sm font-semibold text-slate-200">待更正或填充资产（按大类分组）</h3>

              {groupedChanges && Object.entries(groupedChanges).map(([type, changes]) => {
                if (changes.length === 0) return null;

                return (
                  <div key={type} className="border border-slate-800/60 rounded-lg overflow-hidden bg-slate-950/20">
                    <div className="px-4 py-3 bg-slate-950 border-b border-slate-800/80 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getAssetTypeIcon(type as DeepSynthesisAssetType)}
                        <span className="text-sm font-medium text-slate-200">{getAssetTypeLabel(type as DeepSynthesisAssetType)}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-xs text-slate-400 font-mono">
                        {changes.length} 项更改
                      </span>
                    </div>

                    <div className="divide-y divide-slate-800/50">
                      {changes.map((change) => {
                        const decision = selectionState[change.change_id] || 'undecided';

                        return (
                          <div
                            key={change.change_id}
                            className={`p-5 transition-all ${
                              decision === 'accepted'
                                ? 'bg-emerald-950/5'
                                : decision === 'rejected'
                                ? 'bg-rose-950/5'
                                : ''
                            }`}
                          >
                            <div className="flex flex-col lg:flex-row justify-between gap-4">
                              {/* Left Content Area */}
                              <div className="space-y-4 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-200 bg-slate-900 px-2.5 py-1 rounded border border-slate-800">
                                    {change.asset_name}
                                  </span>
                                  <span className="text-xs text-slate-400 bg-slate-950 px-2 py-1 rounded border border-slate-800 font-mono">
                                    字段: {change.field_path}
                                  </span>
                                  <span className="text-xs font-semibold font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                                    置信度: {Math.round(change.confidence * 100)}%
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                      change.risk_level === 'high'
                                        ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                                        : change.risk_level === 'medium'
                                        ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                                        : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                    }`}
                                  >
                                    {formatRiskLevel(change.risk_level)}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/60 p-4 border border-slate-900 rounded-lg">
                                  <div>
                                    <span className="block text-[11px] text-slate-500 font-medium mb-1">当前存量数据 (Current)</span>
                                    <div className="text-xs text-slate-400 bg-slate-900/50 p-2.5 rounded border border-slate-800 font-normal break-words leading-relaxed min-h-[40px]">
                                      {sanitizeDeepSynthesisDisplayValue(change.current_value)}
                                    </div>
                                  </div>
                                  <div>
                                    <span className="block text-[11px] text-emerald-400/80 font-medium mb-1 flex items-center gap-1">
                                      提炼更正数据 (Proposed) <ArrowRight className="w-3 h-3 text-emerald-400" />
                                    </span>
                                    <div className="text-xs text-emerald-300 bg-emerald-950/10 p-2.5 rounded border border-emerald-500/10 font-normal break-words leading-relaxed min-h-[40px]">
                                      {sanitizeDeepSynthesisDisplayValue(change.proposed_value)}
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-1.5">
                                  <span className="block text-[11px] text-slate-500 font-medium">提炼修正理由 (Reasoning)</span>
                                  <p className="text-xs text-slate-300 leading-relaxed font-normal">{change.reason}</p>
                                </div>

                                {change.evidence_refs && change.evidence_refs.length > 0 && (
                                  <div className="space-y-2">
                                    <span className="block text-[11px] text-slate-500 font-medium">来源证据及线索 (Evidence)</span>
                                    <div className="flex flex-col gap-1.5">
                                      {change.evidence_refs.map((ev, index) => (
                                        <div key={ev.evidence_id || index} className="text-xs text-slate-400 bg-slate-950 p-2.5 rounded border border-slate-900/80 leading-relaxed">
                                          <span className="font-semibold text-slate-300 mr-2 font-mono">[{ev.source_type}]</span>
                                          <span className="text-slate-500 mr-2 font-mono">{ev.field_path}</span>
                                          <span className="font-normal">{sanitizeDeepSynthesisDisplayValue(ev.summary)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Right Interactive Buttons */}
                              <div className="flex lg:flex-col justify-end items-center gap-2 shrink-0">
                                {decision === 'undecided' ? (
                                  <>
                                    <button
                                      onClick={() => onAcceptChange(change.change_id)}
                                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-100 font-medium rounded-lg text-xs cursor-pointer transition-colors shadow shadow-emerald-950/20"
                                    >
                                      <CheckCircle className="w-3.5 h-3.5" /> 接受更正
                                    </button>
                                    <button
                                      onClick={() => onRejectChange(change.change_id)}
                                      className="flex items-center gap-1.5 px-4 py-2 bg-rose-600/15 hover:bg-rose-600/25 active:bg-rose-600/35 border border-rose-500/20 text-rose-400 font-medium rounded-lg text-xs cursor-pointer transition-colors"
                                    >
                                      <XCircle className="w-3.5 h-3.5" /> 拒绝
                                    </button>
                                  </>
                                ) : (
                                  <div className="flex items-center gap-3">
                                    <span
                                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                                        decision === 'accepted'
                                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                      }`}
                                    >
                                      {decision === 'accepted' ? (
                                        <>
                                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> 已接受更正
                                        </>
                                      ) : (
                                        <>
                                          <XCircle className="w-3.5 h-3.5 text-rose-400" /> 已拒绝更改
                                        </>
                                      )}
                                    </span>
                                    <button
                                      onClick={() => onResetChange(change.change_id)}
                                      className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded border border-transparent hover:border-slate-700 transition-colors cursor-pointer"
                                      title="重置选项"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Convergence & Summary Panel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 bg-slate-950 border border-slate-800 rounded-lg space-y-4">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Award className="w-4 h-4 text-emerald-400" /> 演进收敛结果 (Convergence)
                </h3>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center py-2 border-b border-slate-900">
                    <span className="text-slate-400">是否成功收敛:</span>
                    <span className={`font-semibold ${result.convergence_summary?.converged ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {result.convergence_summary?.converged ? '是 (收敛)' : '否 (达到极值)'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-900">
                    <span className="text-slate-400">收敛说明:</span>
                    <span className="font-medium text-slate-200 text-right max-w-[200px] truncate" title={result.convergence_summary?.reason ?? ''}>
                      {formatConvergenceReason(result.convergence_summary?.reason)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-900">
                    <span className="text-slate-400">已执行迭代轮次:</span>
                    <span className="font-semibold text-slate-200 font-mono">{result.convergence_summary?.rounds_completed ?? 0} 轮</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-400">建议继续深度精炼:</span>
                    <span className={`font-semibold ${result.convergence_summary?.should_continue ? 'text-amber-400' : 'text-slate-400'}`}>
                      {result.convergence_summary?.should_continue ? '是' : '否'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-5 bg-slate-950 border border-slate-800 rounded-lg space-y-4">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" /> 质量变化轨迹 (Quality Trace)
                </h3>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center py-2 border-b border-slate-900">
                    <span className="text-slate-400">演进前资产评估分:</span>
                    <span className="font-semibold text-slate-200 font-mono">
                      {result.quality_trace?.quality_before?.toFixed(2) || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-900">
                    <span className="text-slate-400">深度合成后预期得分:</span>
                    <span className="font-semibold text-emerald-400 font-mono">
                      {result.quality_trace?.quality_after_preview?.toFixed(2) || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-400">预期质量跃升值:</span>
                    <span className="font-semibold text-emerald-400 font-mono">
                      {formatQualityDelta(result.quality_trace?.quality_delta ?? null)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Warnings Alert list */}
            {result.warnings && result.warnings.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-200">深度精炼警示信息</h3>
                <div className="flex flex-col gap-2">
                  {result.warnings.map((warn, index) => (
                    <div
                      key={index}
                      className={`p-3.5 border rounded-lg text-xs flex items-start gap-2.5 ${
                        warn.severity === 'high'
                          ? 'bg-red-900/10 border-red-500/20 text-red-400'
                          : warn.severity === 'medium'
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold font-mono text-[10px] uppercase tracking-wider block mb-1">
                          类型: {warn.warning_type}
                        </span>
                        <p className="font-normal leading-relaxed">{warn.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Round-by-round Detailed History logs */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-200">深度合成详细执行日志 (Round summaries)</h3>
              <div className="flex flex-col gap-3">
                {result.round_summaries.map((round) => {
                  const isCollapsed = collapsedRounds[round.round_number] ?? true;

                  return (
                    <div key={round.round_number} className="border border-slate-800 rounded-lg bg-slate-950/30 overflow-hidden">
                      <button
                        onClick={() => toggleRoundCollapse(round.round_number)}
                        className="w-full px-4 py-3 bg-slate-950 flex items-center justify-between hover:bg-slate-900/80 cursor-pointer transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-slate-200 bg-slate-900 px-2 py-0.5 rounded font-mono">
                            Round {round.round_number}
                          </span>
                          <span className="text-xs text-slate-400">
                            步骤: {formatPassType(round.pass_type)}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            round.status === 'completed'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-rose-500/10 text-rose-400'
                          }`}>
                            {formatRoundStatus(round.status)}
                          </span>
                        </div>
                        {isCollapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
                      </button>

                      {!isCollapsed && (
                        <div className="p-4 border-t border-slate-800 bg-slate-950/10 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div>
                            <span className="block text-slate-500">并发查询数:</span>
                            <span className="font-semibold text-slate-300 font-mono">{round.query_count}</span>
                          </div>
                          <div>
                            <span className="block text-slate-500">发现全新小说要素:</span>
                            <span className="font-semibold text-emerald-400 font-mono">+{round.novel_ideas_discovered}</span>
                          </div>
                          <div>
                            <span className="block text-slate-500">自动消解冲突数:</span>
                            <span className="font-semibold text-emerald-400 font-mono">+{round.conflicts_resolved}</span>
                          </div>
                          <div>
                            <span className="block text-slate-500">单轮质量演进率:</span>
                            <span className="font-semibold text-emerald-400 font-mono">
                              {formatPercent(round.quality_delta_percent)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
