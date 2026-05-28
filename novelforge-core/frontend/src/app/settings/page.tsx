'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Lock, RefreshCw, Server, Settings2, ShieldCheck, SlidersHorizontal, Zap } from 'lucide-react';
import {
  DEFAULT_PROJECT_PREFERENCES,
  loadProjectPreferences,
  saveProjectPreferences,
  type ProjectPreferences,
} from '@/lib/project-preferences';
import { useSessions } from '@/lib/hooks/use-sessions';
import { authService } from '@/lib/api/novelforge-api';

type AuthStatus = Awaited<ReturnType<typeof authService.me>>;

function boolLabel(value: boolean): string {
  return value ? '已启用' : '未启用';
}

function SettingPanel({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="nf-panel nf-panel-pad">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] text-[var(--nf-accent)]">
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--nf-text)]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--nf-text-muted)]">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { currentSession, currentSessionId } = useSessions();
  const [preferences, setPreferences] = useState<ProjectPreferences>(DEFAULT_PROJECT_PREFERENCES);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const preferenceScopeKey = useMemo(() => currentSessionId || 'global', [currentSessionId]);

  useEffect(() => {
    let cancelled = false;
    authService.me()
      .then((status) => {
        if (!cancelled) {
          setAuthStatus(status);
          setStatusError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setStatusError('无法读取运行状态，请确认后端服务正在运行。');
      });
    return () => {
      cancelled = true;
    };
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

  const publicDeployment = authStatus?.public_deployment ?? false;
  const runtimeOverridesAllowed = authStatus?.runtime_openai_overrides_allowed ?? false;

  return (
    <div className="nf-editor-shell">
      <div className="nf-editor-page">
        <section className="nf-editor-hero">
          <div>
            <div className="nf-kicker">Admin Settings</div>
            <h1 className="nf-editor-title">
              <Settings2 size={28} />
              设置
            </h1>
            <p className="nf-editor-subline">
              这里面向管理员配置运行状态、模型模式和项目偏好。普通写作入口只保留 Fast / Pro，不把 provider 调试暴露成日常操作。
            </p>
            <p className="nf-editor-meta">
              当前项目：{currentSession?.title || '未选择项目，正在编辑全局默认偏好'}
            </p>
          </div>
          <div className="nf-editor-actions">
            <button
              type="button"
              className="nf-button"
              onClick={() => {
                setStatusError(null);
                authService.me()
                  .then(setAuthStatus)
                  .catch(() => setStatusError('无法读取运行状态，请确认后端服务正在运行。'));
              }}
            >
              <RefreshCw size={16} />
              刷新状态
            </button>
          </div>
        </section>

        {saveMessage ? <div className="nf-editor-alert success">{saveMessage}</div> : null}
        {statusError ? <div className="nf-editor-alert">{statusError}</div> : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <main className="space-y-5">
            <SettingPanel
              title="运行状态"
              description="确认当前部署是否已启用认证、是否处于公开部署模式，以及浏览器端是否允许覆盖模型配置。"
              icon={<Server size={18} />}
            >
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  { label: '访问认证', value: authStatus ? boolLabel(authStatus.auth_required) : '读取中' },
                  { label: '公开部署', value: authStatus ? boolLabel(publicDeployment) : '读取中' },
                  { label: '浏览器模型覆盖', value: authStatus ? boolLabel(runtimeOverridesAllowed) : '读取中' },
                ].map((item) => (
                  <div key={item.label} className="nf-stat">
                    <span>{item.label}</span>
                    <strong className="text-base">{item.value}</strong>
                  </div>
                ))}
              </div>
            </SettingPanel>

            <SettingPanel
              title="Fast / Pro 模型映射"
              description="第一版产品只在对话框暴露 Fast 与 Pro。具体模型由服务端环境变量和 NewAPI 管理，避免用户误填 Key。"
              icon={<Zap size={18} />}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] p-4">
                  <div className="font-semibold text-[var(--nf-text)]">Fast</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--nf-text-muted)]">
                    适合灵感、聊天、轻量改写和快速探索。建议映射到 flash / fast 类模型。
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] p-4">
                  <div className="font-semibold text-[var(--nf-text)]">Pro</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--nf-text-muted)]">
                    适合序章、深度创作、结构分析和关系驱动写作。建议映射到思考或高质量模型。
                  </p>
                </div>
              </div>
            </SettingPanel>

            <SettingPanel
              title="项目偏好"
              description="这些偏好按当前项目保存，并在刷新后恢复。"
              icon={<SlidersHorizontal size={18} />}
            >
              <div className="space-y-4">
                <label className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] px-4 py-3">
                  <div>
                    <div className="font-medium text-[var(--nf-text)]">自动保存</div>
                    <div className="text-sm text-[var(--nf-text-muted)]">控制编辑器是否默认启用自动保存策略。</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.auto_save}
                    onChange={(event) => persistPreferences({ ...preferences, auto_save: event.target.checked })}
                    className="h-5 w-5"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] px-4 py-3">
                  <div>
                    <div className="font-medium text-[var(--nf-text)]">显示任务中心</div>
                    <div className="text-sm text-[var(--nf-text-muted)]">控制右下角异步任务提示是否默认显示。</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.show_task_center}
                    onChange={(event) => persistPreferences({ ...preferences, show_task_center: event.target.checked })}
                    className="h-5 w-5"
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] px-4 py-4">
                    <span className="mb-2 block text-sm font-medium text-[var(--nf-text-muted)]">默认导出格式</span>
                    <select
                      value={preferences.default_export_format}
                      onChange={(event) =>
                        persistPreferences({
                          ...preferences,
                          default_export_format: event.target.value as ProjectPreferences['default_export_format'],
                        })
                      }
                      className="w-full rounded-xl border border-[var(--nf-border)] bg-[var(--nf-bg)] px-3 py-2 text-[var(--nf-text)]"
                    >
                      <option value="json">JSON 项目包</option>
                      <option value="txt">TXT 纯文本</option>
                    </select>
                  </label>

                  <label className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] px-4 py-4">
                    <span className="mb-2 block text-sm font-medium text-[var(--nf-text-muted)]">目标章节字数</span>
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
                      className="w-full rounded-xl border border-[var(--nf-border)] bg-[var(--nf-bg)] px-3 py-2 text-[var(--nf-text)]"
                    />
                    <p className="mt-2 text-xs text-[var(--nf-text-subtle)]">
                      供章节生成、编辑和分析页面统一参考。
                    </p>
                  </label>
                </div>
              </div>
            </SettingPanel>
          </main>

          <aside className="space-y-4">
            <SettingPanel
              title="公开部署状态"
              description="公开部署建议关闭浏览器端模型覆盖，只使用服务端托管 Key。"
              icon={<ShieldCheck size={18} />}
            >
              <div className="space-y-3 text-sm leading-6 text-[var(--nf-text-muted)]">
                <p>
                  当前模式：<span className="font-semibold text-[var(--nf-text)]">{publicDeployment ? '公开部署' : '本地/开发'}</span>
                </p>
                <p>
                  浏览器端覆盖：<span className="font-semibold text-[var(--nf-text)]">{runtimeOverridesAllowed ? '允许' : '已锁定'}</span>
                </p>
                <p>用户日常写作只需要选择 Fast / Pro；具体 provider 和模型由管理员在服务端配置。</p>
              </div>
            </SettingPanel>

            <SettingPanel
              title="管理员 / 会话"
              description="单管理员产品的会话状态由 HttpOnly Cookie 管理。"
              icon={<Lock size={18} />}
            >
              <div className="space-y-3">
                <div className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] p-4 text-sm text-[var(--nf-text-muted)]">
                  <div className="mb-1 font-semibold text-[var(--nf-text)]">当前登录</div>
                  {authStatus?.authenticated ? '已通过管理员会话访问。' : '尚未确认登录状态。'}
                </div>
                <div className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] p-4 text-sm text-[var(--nf-text-muted)]">
                  <div className="mb-1 font-semibold text-[var(--nf-text)]">当前项目范围</div>
                  {currentSession?.title || '全局默认偏好'}
                </div>
              </div>
            </SettingPanel>

            <details className="nf-panel nf-panel-pad">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--nf-text)]">
                高级 provider 诊断
              </summary>
              <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--nf-text-muted)]">
                <p className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  API Key 不在浏览器展示，也不会写入本地存储。
                </p>
                <p>需要调整 NewAPI 地址、真实模型名或管理员密码时，请修改服务端环境变量后重启后端服务。</p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[var(--nf-success)]" />
                  设置页仅保存项目偏好，不保存 provider 密钥。
                </p>
              </div>
            </details>
          </aside>
        </div>
      </div>
    </div>
  );
}
