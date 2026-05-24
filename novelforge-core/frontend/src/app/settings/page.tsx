'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import {
  DEFAULT_PROJECT_PREFERENCES,
  loadProjectPreferences,
  saveProjectPreferences,
  type ProjectPreferences,
} from '@/lib/project-preferences';
import { useSessions } from '@/lib/hooks/use-sessions';
import { authService } from '@/lib/api/novelforge-api';

export default function SettingsPage() {
  const { currentSession, currentSessionId } = useSessions();
  const [preferences, setPreferences] = useState<ProjectPreferences>(DEFAULT_PROJECT_PREFERENCES);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [runtimeOverridesAllowed, setRuntimeOverridesAllowed] = useState(true);

  const preferenceScopeKey = useMemo(() => currentSessionId || 'global', [currentSessionId]);

  useEffect(() => {
    authService.me()
      .then((status) => {
        setRuntimeOverridesAllowed(status.runtime_openai_overrides_allowed);
      })
      .catch(() => {
        setRuntimeOverridesAllowed(true);
      });
  }, []);

  useEffect(() => {
    setPreferences(loadProjectPreferences(preferenceScopeKey === 'global' ? null : preferenceScopeKey));
    setSaveMessage(null);
  }, [preferenceScopeKey]);

  const persistPreferences = (nextPreferences: ProjectPreferences) => {
    saveProjectPreferences(preferenceScopeKey === 'global' ? null : preferenceScopeKey, nextPreferences);
    setPreferences(nextPreferences);
    setSaveMessage('项目偏好已保存。');
    window.setTimeout(() => setSaveMessage(null), 2500);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-3">
          <h1 className="text-4xl font-black tracking-tight text-white">系统设置</h1>
          <p className="max-w-3xl text-slate-400">
            这里管理当前项目的创作偏好。模型由服务端统一托管，普通用户只在聊天框选择快速或 Pro 模式。
          </p>
          <p className="text-sm text-slate-500">
            当前项目：{currentSession?.title || '未选择项目，正在编辑全局默认偏好'}
          </p>
        </div>

        {saveMessage ? (
          <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-emerald-200">
            {saveMessage}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-slate-800 bg-slate-900 text-slate-100">
            <CardHeader>
              <CardTitle>创作模式与模型托管</CardTitle>
              <CardDescription className="text-slate-400">
                第一版公开部署只暴露快速 / Pro 两种创作模式，真实模型映射由管理员在服务端环境变量中配置。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <Badge variant="outline">快速模式</Badge>
                  <Badge variant="outline">Pro 模式</Badge>
                  <Badge variant="outline">
                    {runtimeOverridesAllowed ? '本地开发可调试' : '公开部署已锁定'}
                  </Badge>
                </div>
                <p className="text-sm text-slate-400">
                  模型凭据、网关地址和真实模型名统一由服务端配置管理。公开部署模式下，浏览器不会接收或发送用户侧模型凭据。
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900 text-slate-100">
            <CardHeader>
              <CardTitle>项目偏好</CardTitle>
              <CardDescription className="text-slate-400">
                这些偏好会按当前项目保存，并在刷新后恢复。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                <div>
                  <div className="font-medium text-white">自动保存</div>
                  <div className="text-sm text-slate-500">控制编辑器是否默认启用自动保存策略。</div>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.auto_save}
                  onChange={(event) => persistPreferences({ ...preferences, auto_save: event.target.checked })}
                  className="h-5 w-5"
                />
              </label>

              <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                <div>
                  <div className="font-medium text-white">显示任务中心</div>
                  <div className="text-sm text-slate-500">控制右下角异步任务提示是否默认显示。</div>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.show_task_center}
                  onChange={(event) => persistPreferences({ ...preferences, show_task_center: event.target.checked })}
                  className="h-5 w-5"
                />
              </label>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
                <label className="mb-2 block text-sm font-medium text-slate-300">默认导出格式</label>
                <select
                  value={preferences.default_export_format}
                  onChange={(event) =>
                    persistPreferences({
                      ...preferences,
                      default_export_format: event.target.value as ProjectPreferences['default_export_format'],
                    })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                >
                  <option value="json">JSON 项目包</option>
                  <option value="txt">TXT 纯文本</option>
                </select>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
                <label className="mb-2 block text-sm font-medium text-slate-300">目标章节字数</label>
                <input
                  type="number"
                  min={200}
                  step={100}
                  value={preferences.chapter_target_words}
                  onChange={(event) =>
                    persistPreferences({
                      ...preferences,
                      chapter_target_words:
                        Number(event.target.value) || DEFAULT_PROJECT_PREFERENCES.chapter_target_words,
                    })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                />
                <p className="mt-2 text-xs text-slate-500">
                  供后续章节生成、编辑和分析页面统一参考。
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
