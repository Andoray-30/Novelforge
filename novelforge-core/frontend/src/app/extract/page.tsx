'use client';

import { useEffect, useState, type ChangeEvent, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Clock, FileText, Globe2, Loader2, UploadCloud, Users } from 'lucide-react';
import { extractService } from '@/lib/api';
import { buildContentCreateRequest } from '@/lib/content-contract';
import { useAppStore } from '@/lib/hooks/use-app-store';
import { useSessions } from '@/lib/hooks/use-sessions';
import { loadEffectiveOpenAIConfig } from '@/lib/openai-config';
import { upsertContentAsset } from '@/lib/content-upsert';
import { formatFileSize } from '@/lib/utils';
import type { ExtractionResult, OpenAIConfig, WorldSetting } from '@/types';

const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.text'];

type ExtractStatus = 'idle' | 'uploading' | 'extracting' | 'saving' | 'success' | 'error';

interface SavedSummary {
  characters: number;
  world: boolean;
  timeline: boolean;
  relationships: boolean;
  sessionId: string | null;
}

function hasAcceptedExtension(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function getFileBaseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || '未命名文本';
}

function toRecord<T extends object>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function buildTimelineContent(result: ExtractionResult): string {
  const events = result.timeline?.events ?? [];
  const eventLines = events
    .slice(0, 10)
    .map((event, index) => `${index + 1}. ${event.title}: ${event.description}`)
    .join('\n');

  return [`事件数量：${events.length}`, '', '关键事件：', eventLines || '暂无可保存的事件。'].join('\n');
}

function buildRelationshipContent(result: ExtractionResult): string {
  const edges = result.relationships?.edges ?? [];
  const relationshipLines = edges
    .slice(0, 12)
    .map((edge) => `${edge.source} -> ${edge.target}: ${edge.relationship_type}`)
    .join('\n');

  return [`关系数量：${edges.length}`, '', '关系摘要：', relationshipLines || '暂无可保存的关系。'].join('\n');
}

function buildWorldContent(world: WorldSetting): string {
  return [
    `世界名称：${world.name || '未命名世界'}`,
    `世界概述：${world.description || '暂无描述'}`,
    `社会结构：${world.social_structure || '暂无描述'}`,
    `地理环境：${world.geography || '暂无描述'}`,
    `文化背景：${world.culture || '暂无描述'}`,
  ].join('\n');
}

export default function ExtractPage() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<ExtractStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('等待上传文本');
  const [savedSummary, setSavedSummary] = useState<SavedSummary | null>(null);
  const [openAIConfig, setOpenAIConfig] = useState<OpenAIConfig | undefined>(undefined);

  const { currentSession, currentSessionId, createSession } = useSessions();
  const setCharacters = useAppStore((state) => state.setCharacters);
  const setWorldSetting = useAppStore((state) => state.setWorldSetting);
  const setTimeline = useAppStore((state) => state.setTimeline);
  const setRelationships = useAppStore((state) => state.setRelationships);

  useEffect(() => {
    setOpenAIConfig(loadEffectiveOpenAIConfig());
  }, []);

  const ensureSessionId = async (selectedFile: File): Promise<string> => {
    if (currentSessionId) {
      return currentSessionId;
    }

    const created = await createSession(`${getFileBaseName(selectedFile.name)} 提取项目`);
    return created.id;
  };

  const persistExtractionResult = async (
    result: ExtractionResult,
    sessionId: string,
    sourceFileName: string
  ): Promise<SavedSummary> => {
    const sourceTitle = getFileBaseName(sourceFileName);
    const characters = result.characters ?? [];
    const timelineData = result.timeline ?? null;
    const relationshipsData = result.relationships ?? null;
    const timelineEvents = result.timeline?.events ?? [];
    const relationshipEdges = result.relationships?.edges ?? [];
    const saved: SavedSummary = {
      characters: 0,
      world: false,
      timeline: false,
      relationships: false,
      sessionId,
    };

    await Promise.all(
      characters.map(async (character) => {
        await upsertContentAsset(
          buildContentCreateRequest({
            type: 'character',
            title: character.name,
            data: toRecord(character),
            content: character.description,
            sessionId,
            tags: ['extract'],
          })
        );
        saved.characters += 1;
      })
    );

    if (result.world) {
      await upsertContentAsset(
        buildContentCreateRequest({
          type: 'world',
          title: result.world.name || `${sourceTitle} 世界观`,
          data: {
            ...toRecord(result.world),
            source_file: sourceFileName,
          },
          content: buildWorldContent(result.world),
          sessionId,
          tags: ['extract'],
        })
      );
      saved.world = true;
    }

    if (timelineData && timelineEvents.length > 0) {
      await upsertContentAsset(
        buildContentCreateRequest({
          type: 'timeline',
          title: `${sourceTitle} 时间线`,
          data: {
            ...toRecord(timelineData),
            source_file: sourceFileName,
          },
          content: buildTimelineContent(result),
          sessionId,
          tags: ['extract'],
        })
      );
      saved.timeline = true;
    }

    if (relationshipsData && relationshipEdges.length > 0) {
      await upsertContentAsset(
        buildContentCreateRequest({
          type: 'relationship',
          title: `${sourceTitle} 关系网`,
          data: {
            ...toRecord(relationshipsData),
            source_file: sourceFileName,
          },
          content: buildRelationshipContent(result),
          sessionId,
          tags: ['extract'],
        })
      );
      saved.relationships = true;
    }

    return saved;
  };

  const processFile = async (selectedFile: File) => {
    if (!hasAcceptedExtension(selectedFile.name)) {
      setFile(selectedFile);
      setStatus('error');
      setProgress(0);
      setSavedSummary(null);
      setErrorMessage(`暂时仅支持 ${ACCEPTED_EXTENSIONS.join(', ')} 文件。`);
      setStatusMessage('文件格式不受支持');
      return;
    }

    setFile(selectedFile);
    setStatus('uploading');
    setProgress(15);
    setErrorMessage(null);
    setSavedSummary(null);
    setStatusMessage('正在上传并准备提取...');

    try {
      const sessionId = await ensureSessionId(selectedFile);

      setStatus('extracting');
      setProgress(45);
      setStatusMessage('AI 正在提取角色、世界观、时间线和关系网...');

      const result = await extractService.extractFromFile(selectedFile, openAIConfig, sessionId);
      const extractionErrors = Array.isArray(result.errors)
        ? result.errors.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
      const hasExtractedAssets =
        (result.characters?.length ?? 0) > 0 ||
        Boolean(result.world) ||
        (result.timeline?.events?.length ?? 0) > 0 ||
        (result.relationships?.edges?.length ?? 0) > 0;

      if (!hasExtractedAssets && extractionErrors.length > 0) {
        throw new Error(`提取失败：${extractionErrors.join('；')}`);
      }

      setStatus('saving');
      setProgress(75);
      setStatusMessage('正在把提取结果保存到当前项目资产库...');

      const summary = await persistExtractionResult(result, sessionId, selectedFile.name);
      const hasSavedAssets = summary.characters > 0 || summary.world || summary.timeline || summary.relationships;
      if (!hasSavedAssets) {
        const warning = extractionErrors.length > 0 ? `（${extractionErrors.join('；')}）` : '';
        throw new Error(`未检测到可保存的提取资产${warning}`);
      }

      setCharacters(result.characters ?? []);
      setWorldSetting(result.world ?? null);
      setTimeline(result.timeline?.events ?? []);
      setRelationships(result.relationships?.edges ?? []);

      setSavedSummary(summary);
      setProgress(100);
      setStatus('success');
      if (extractionErrors.length > 0) {
        setStatusMessage(`提取部分完成，资产已保存。告警：${extractionErrors.join('；')}`);
      } else {
        setStatusMessage('提取完成，结构化资产已写入当前项目。');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '提取失败，请稍后重试。';
      setStatus('error');
      setProgress(0);
      setErrorMessage(message);
      setStatusMessage('提取流程已中断');
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    if (event.dataTransfer.files?.[0]) {
      void processFile(event.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.[0]) {
      void processFile(event.target.files[0]);
    }
  };

  const projectLabel = currentSession?.title || '未选择项目，首次保存时会自动创建';

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <h1 className="bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
            智能文本提取引擎
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-base text-slate-300">
            上传小说文本，让系统提取角色、世界观、时间线与关系网，并直接写入当前项目的统一资产库。
          </p>
          <p className="mt-3 text-sm text-slate-500">当前项目：{projectLabel}</p>
        </div>

        <div className="relative">
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-sky-500/30 via-cyan-500/20 to-emerald-500/30 blur-2xl" />

          <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={[
                'rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-all duration-300',
                isDragging ? 'scale-[1.01] border-sky-400 bg-sky-500/10' : 'border-slate-700 bg-slate-950/40',
                status === 'error' ? 'border-red-500/60 bg-red-500/5' : '',
              ].join(' ')}
            >
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-800 shadow-inner">
                {status === 'extracting' || status === 'saving' ? (
                  <Loader2 className="h-10 w-10 animate-spin text-sky-300" />
                ) : status === 'success' ? (
                  <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                ) : (
                  <UploadCloud className={`h-10 w-10 ${isDragging ? 'text-sky-300' : 'text-slate-400'}`} />
                )}
              </div>

              <h2 className="text-2xl font-semibold text-white">
                {status === 'success' ? '提取完成' : '拖拽文本文件到这里，或点击选择文件'}
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
                当前入口已接入统一内容契约。支持 {ACCEPTED_EXTENSIONS.join(', ')}，提取完成后会直接写入项目资产。
              </p>

              <label className="mt-8 inline-flex cursor-pointer items-center justify-center rounded-full bg-sky-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400">
                <input type="file" accept={ACCEPTED_EXTENSIONS.join(',')} className="hidden" onChange={handleFileChange} />
                选择文本文件
              </label>

              {file ? (
                <div className="mx-auto mt-6 flex max-w-md items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-left">
                  <FileText className="h-5 w-5 text-sky-300" />
                  <div>
                    <p className="text-sm font-medium text-slate-100">{file.name}</p>
                    <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
                  </div>
                </div>
              ) : null}

              {status !== 'idle' || errorMessage ? (
                <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-left">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-200">
                    {status === 'error' ? <AlertCircle className="h-4 w-4 text-red-400" /> : <Clock className="h-4 w-4 text-sky-300" />}
                    <span>{statusMessage}</span>
                  </div>

                  {status !== 'error' ? (
                    <div className="mt-3">
                      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">进度 {progress}%</p>
                    </div>
                  ) : null}

                  {errorMessage ? <p className="mt-3 text-sm text-red-400">{errorMessage}</p> : null}
                </div>
              ) : null}
            </div>

            {savedSummary ? (
              <div className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
                <div className="flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="h-5 w-5" />
                  <h3 className="text-lg font-semibold">已保存到项目资产库</h3>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">角色</p>
                    <p className="mt-2 text-2xl font-bold text-white">{savedSummary.characters}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">世界观</p>
                    <p className="mt-2 text-2xl font-bold text-white">{savedSummary.world ? 1 : 0}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">时间线</p>
                    <p className="mt-2 text-2xl font-bold text-white">{savedSummary.timeline ? 1 : 0}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">关系网</p>
                    <p className="mt-2 text-2xl font-bold text-white">{savedSummary.relationships ? 1 : 0}</p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => router.push('/characters')}
                    className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-sky-400 hover:text-sky-300"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    查看角色
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/world')}
                    className="inline-flex items-center rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                  >
                    <Globe2 className="mr-2 h-4 w-4" />
                    查看世界观
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <Users className="h-8 w-8 text-sky-300" />
            <h3 className="mt-4 text-lg font-semibold text-white">角色提取</h3>
            <p className="mt-2 text-sm text-slate-400">
              提取结果会按角色名写入 `character` 资产，后续可直接在角色页读取。
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <Globe2 className="h-8 w-8 text-emerald-300" />
            <h3 className="mt-4 text-lg font-semibold text-white">世界观沉淀</h3>
            <p className="mt-2 text-sm text-slate-400">
              世界观、时间线和关系网会保存到内容库，而不是只停留在临时页面状态。
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <Clock className="h-8 w-8 text-cyan-300" />
            <h3 className="mt-4 text-lg font-semibold text-white">项目闭环</h3>
            <p className="mt-2 text-sm text-slate-400">
              提取完成后，后续聊天、规划和编辑器可以复用同一项目上下文继续创作。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
