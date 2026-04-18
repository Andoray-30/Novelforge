'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { buildContentCreateRequest } from '@/lib/content-contract';
import { useAIPlanning } from '@/lib/hooks/use-ai-planning';
import { useSessions } from '@/lib/hooks/use-sessions';
import { loadEffectiveOpenAIConfig } from '@/lib/openai-config';
import { upsertContentAsset } from '@/lib/content-upsert';
import type {
  CharacterDesign,
  OpenAIConfig,
  StoryOutline,
  StoryOutlineParams,
  WorldSetting,
} from '@/types';

function toRecord<T extends object>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function buildOutlineContent(outline: StoryOutline): string {
  const plotPoints = outline.plotPoints
    .map((point, index) => `${index + 1}. ${point.title}: ${point.description}`)
    .join('\n');

  return [
    `标题：${outline.title}`,
    `类型：${outline.genre}`,
    `主题：${outline.theme}`,
    `基调：${outline.tone}`,
    `目标受众：${outline.targetAudience}`,
    '',
    '情节点：',
    plotPoints || '暂无情节点。',
  ].join('\n');
}

function buildWorldContent(world: WorldSetting): string {
  return [
    `世界名称：${world.name || '未命名世界'}`,
    `世界概述：${world.description || '暂无描述'}`,
    `地理环境：${world.geography || '暂无描述'}`,
    `社会结构：${world.social_structure || '暂无描述'}`,
    `文化背景：${world.culture || '暂无描述'}`,
    `科技/魔法体系：${world.technology_magic || '暂无描述'}`,
    `历史背景：${world.history || '暂无描述'}`,
  ].join('\n');
}

export default function AIPlanningPage() {
  const { isLoading, error, generateStoryOutline, designCharacter, buildWorld } = useAIPlanning();
  const { currentSession, currentSessionId, createSession } = useSessions();
  const [openAIConfig, setOpenAIConfig] = useState<OpenAIConfig | undefined>(undefined);

  const [formData, setFormData] = useState<StoryOutlineParams>({
    novel_type: 'fantasy',
    theme: '',
    length: 'medium',
    target_audience: 'general',
  });
  const [currentOutline, setCurrentOutline] = useState<StoryOutline | null>(null);
  const [generatedCharacters, setGeneratedCharacters] = useState<CharacterDesign[]>([]);
  const [worldSetting, setWorldSetting] = useState<WorldSetting | null>(null);
  const [savedOutlineId, setSavedOutlineId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isGeneratingCharacters, setIsGeneratingCharacters] = useState(false);
  const [isBuildingWorld, setIsBuildingWorld] = useState(false);

  useEffect(() => {
    setOpenAIConfig(loadEffectiveOpenAIConfig());
  }, []);

  const ensureSessionId = async (): Promise<string> => {
    if (currentSessionId) {
      return currentSessionId;
    }

    const created = await createSession('AI 故事规划');
    return created.id;
  };

  const saveOutlineAsset = async (outline: StoryOutline, sessionId: string): Promise<string> => {
    const request = buildContentCreateRequest({
      type: 'outline',
      title: outline.title,
      data: toRecord(outline),
      content: buildOutlineContent(outline),
      sessionId,
      tags: ['ai-planning'],
    });

    return upsertContentAsset(request);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formData.theme.trim()) {
      return;
    }

    setSaveError(null);
    setStatusMessage('正在生成并保存大纲...');

    try {
      const outline = await generateStoryOutline({
        ...formData,
        openai_config: openAIConfig,
      });
      const sessionId = await ensureSessionId();
      const outlineId = await saveOutlineAsset(outline, sessionId);

      setCurrentOutline(outline);
      setGeneratedCharacters([]);
      setWorldSetting(null);
      setSavedOutlineId(outlineId);
      setStatusMessage(`大纲已保存到项目「${currentSession?.title || sessionId}」中。`);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : '故事规划失败';
      setSaveError(message);
      setStatusMessage(null);
    }
  };

  const handleGenerateCharacters = async () => {
    if (!currentOutline) {
      return;
    }

    setIsGeneratingCharacters(true);
    setSaveError(null);
    setStatusMessage('正在根据大纲生成角色并保存...');

    try {
      const sessionId = await ensureSessionId();
      const outlineId = savedOutlineId ?? (await saveOutlineAsset(currentOutline, sessionId));
      setSavedOutlineId(outlineId);

      const context = JSON.stringify({
        title: currentOutline.title,
        theme: currentOutline.theme,
        genre: currentOutline.genre,
        plotPoints: currentOutline.plotPoints,
      });

      const characters = await Promise.all(
        currentOutline.characterRoles.map((role) =>
          designCharacter({
            context,
            roles: [role.role],
            openai_config: openAIConfig,
          })
        )
      );

      await Promise.all(
        characters.map((character) =>
          upsertContentAsset(
            buildContentCreateRequest({
              type: 'character',
              title: character.name,
              data: toRecord(character),
              content: character.description,
              sessionId,
              parentId: outlineId,
              tags: ['ai-planning'],
            })
          )
        )
      );

      setGeneratedCharacters(characters);
      setStatusMessage(`已生成并保存 ${characters.length} 个角色资产。`);
    } catch (characterError) {
      const message = characterError instanceof Error ? characterError.message : '角色生成失败';
      setSaveError(message);
      setStatusMessage(null);
    } finally {
      setIsGeneratingCharacters(false);
    }
  };

  const handleBuildWorld = async () => {
    if (!currentOutline) {
      return;
    }

    setIsBuildingWorld(true);
    setSaveError(null);
    setStatusMessage('正在根据大纲生成世界观并保存...');

    try {
      const sessionId = await ensureSessionId();
      const outlineId = savedOutlineId ?? (await saveOutlineAsset(currentOutline, sessionId));
      setSavedOutlineId(outlineId);

      const world = await buildWorld({
        story_outline: toRecord(currentOutline),
        openai_config: openAIConfig,
      });

      await upsertContentAsset(
        buildContentCreateRequest({
          type: 'world',
          title: world.name || `${currentOutline.title} 世界观`,
          data: toRecord(world),
          content: buildWorldContent(world),
          sessionId,
          parentId: outlineId,
          tags: ['ai-planning'],
        })
      );

      setWorldSetting(world);
      setStatusMessage('世界观已生成并保存到当前项目。');
    } catch (worldError) {
      const message = worldError instanceof Error ? worldError.message : '世界观生成失败';
      setSaveError(message);
      setStatusMessage(null);
    } finally {
      setIsBuildingWorld(false);
    }
  };

  const projectLabel = currentSession?.title || '未选择，首次保存时会自动创建项目';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-6">
            <h1 className="bg-gradient-to-r from-violet-400 via-sky-300 to-emerald-300 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
              AI 故事规划
            </h1>
            <p className="mt-3 text-sm text-slate-400">
              从大纲开始，逐步生成角色与世界观，并按统一内容资产契约保存到当前项目。
            </p>
            <p className="mt-2 text-xs text-slate-500">当前项目：{projectLabel}</p>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300">小说类型</span>
              <select
                value={formData.novel_type}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    novel_type: event.target.value as StoryOutlineParams['novel_type'],
                  })
                }
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-sky-400/50"
              >
                <option value="fantasy">奇幻</option>
                <option value="science_fiction">科幻</option>
                <option value="romance">言情</option>
                <option value="mystery">悬疑</option>
                <option value="historical">历史</option>
                <option value="wuxia">武侠</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300">目标受众</span>
              <select
                value={formData.target_audience}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    target_audience: event.target.value as StoryOutlineParams['target_audience'],
                  })
                }
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-sky-400/50"
              >
                <option value="general">大众</option>
                <option value="young_adult">青少年</option>
                <option value="adult">成人</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300">篇幅</span>
              <select
                value={formData.length}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    length: event.target.value as StoryOutlineParams['length'],
                  })
                }
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-sky-400/50"
              >
                <option value="short">短篇</option>
                <option value="medium">中篇</option>
                <option value="long">长篇</option>
              </select>
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-300">核心主题</span>
              <input
                type="text"
                value={formData.theme}
                onChange={(event) => setFormData({ ...formData, theme: event.target.value })}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-sky-400/50"
                placeholder="例如：在衰败王朝中寻找真相与自我"
                required
              />
            </label>

            <div className="flex flex-wrap gap-3 md:col-span-2">
              <button
                type="submit"
                disabled={isLoading}
                className="rounded-2xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
              >
                {isLoading ? '生成中...' : '生成并保存大纲'}
              </button>
              <button
                type="button"
                disabled={!currentOutline || isGeneratingCharacters}
                onClick={handleGenerateCharacters}
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-sky-400/40 hover:text-sky-300 disabled:opacity-60"
              >
                {isGeneratingCharacters ? '生成角色中...' : '从大纲生成角色并保存'}
              </button>
              <button
                type="button"
                disabled={!currentOutline || isBuildingWorld}
                onClick={handleBuildWorld}
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-emerald-400/40 hover:text-emerald-300 disabled:opacity-60"
              >
                {isBuildingWorld ? '生成世界观中...' : '从大纲生成世界观并保存'}
              </button>
            </div>
          </form>

          {(error || saveError || statusMessage) && (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm">
              {statusMessage ? <p className="text-emerald-300">{statusMessage}</p> : null}
              {error ? <p className="text-red-300">{error}</p> : null}
              {saveError ? <p className="text-red-300">{saveError}</p> : null}
            </div>
          )}
        </div>

        {currentOutline ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl backdrop-blur-xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">{currentOutline.title}</h2>
                <p className="mt-1 text-sm text-slate-400">{currentOutline.theme}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                <span className="rounded-full bg-slate-800 px-3 py-1">{currentOutline.genre}</span>
                <span className="rounded-full bg-slate-800 px-3 py-1">{currentOutline.targetAudience}</span>
                {savedOutlineId ? <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-300">已保存</span> : null}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-200">情节点</h3>
                <div className="space-y-3">
                  {currentOutline.plotPoints.map((point) => (
                    <div key={point.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-sm text-slate-100">{point.title}</strong>
                        <span className="text-xs text-slate-500">{point.position}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-400">{point.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-200">角色职责</h3>
                <div className="space-y-3">
                  {currentOutline.characterRoles.map((role) => (
                    <div key={`${role.role}-${role.name}`} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-sm text-slate-100">{role.name}</strong>
                        <span className="text-xs text-slate-500">{role.role}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-400">{role.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {generatedCharacters.length > 0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl backdrop-blur-xl">
            <h2 className="mb-4 text-lg font-semibold text-slate-100">已生成角色</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {generatedCharacters.map((character) => {
                const keyTraits = toStringArray(character.keyTraits);

                return (
                  <div key={character.name} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-slate-100">{character.name}</strong>
                      <span className="text-xs text-slate-500">{character.role}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{character.description}</p>
                    {keyTraits.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {keyTraits.map((trait) => (
                          <span key={trait} className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                            {trait}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {worldSetting ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl backdrop-blur-xl">
            <h2 className="mb-4 text-lg font-semibold text-slate-100">已生成世界观</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <h3 className="text-sm font-semibold text-slate-100">世界概述</h3>
                <p className="mt-2 text-sm text-slate-400">{worldSetting.description || '暂无描述'}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <h3 className="text-sm font-semibold text-slate-100">社会结构</h3>
                <p className="mt-2 text-sm text-slate-400">{worldSetting.social_structure || '暂无描述'}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <h3 className="text-sm font-semibold text-slate-100">核心冲突</h3>
                <p className="mt-2 text-sm text-slate-400">
                  {worldSetting.core_conflicts.length > 0 ? worldSetting.core_conflicts.join(' / ') : '暂无核心冲突'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <h3 className="text-sm font-semibold text-slate-100">地点数量</h3>
                <p className="mt-2 text-sm text-slate-400">{worldSetting.locations.length} 个已生成地点</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
