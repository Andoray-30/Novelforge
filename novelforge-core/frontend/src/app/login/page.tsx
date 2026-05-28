'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Lock, ShieldCheck } from 'lucide-react';
import { authService } from '@/lib/api/novelforge-api';

function normalizeLoginError(error: unknown): string {
  if (error instanceof Error && /401|403|unauthorized|forbidden|password/i.test(error.message)) {
    return '管理员密码不正确，请重新输入。';
  }
  return '登录失败，请检查管理员密码或稍后重试。';
}

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await authService.login(password);
      if (!result.authenticated) {
        throw new Error('password rejected');
      }
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(normalizeLoginError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--nf-bg)] px-6 py-10 text-[var(--nf-text)]">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <section className="hidden lg:block">
            <div className="nf-kicker">NovelForge</div>
            <h1 className="mt-3 max-w-xl text-4xl font-semibold tracking-tight text-[var(--nf-text)]">
              进入你的小说创作工作区
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--nf-text-muted)]">
              第一版公开部署采用单管理员模式。登录后可以导入长篇、查看项目资产，并让 AI 基于资料库继续创作。
            </p>
            <div className="mt-6 grid max-w-xl gap-3">
              {['服务端统一托管 AI Key', '用户确认后才写回内容库', '支持 light / dark / system 主题'].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-panel)] px-4 py-3 text-sm text-[var(--nf-text-muted)]">
                  <ShieldCheck className="h-4 w-4 text-[var(--nf-accent)]" />
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="nf-panel nf-panel-pad mx-auto w-full max-w-md">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--nf-accent)] text-white">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--nf-text-subtle)]">NovelForge</p>
                <h2 className="text-2xl font-semibold text-[var(--nf-text)]">管理员登录</h2>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-[var(--nf-text-muted)]">管理员密码</span>
                <div className="flex items-center gap-2 rounded-xl border border-[var(--nf-border)] bg-[var(--nf-surface)] px-3 py-2 focus-within:border-[color-mix(in_srgb,var(--nf-accent)_42%,transparent)]">
                  <Lock className="h-4 w-4 text-[var(--nf-text-subtle)]" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-[var(--nf-text)] outline-none"
                    autoComplete="current-password"
                    autoFocus
                  />
                </div>
              </label>

              {error ? (
                <div className="rounded-xl border border-[color-mix(in_srgb,var(--nf-danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--nf-danger)_8%,transparent)] px-4 py-3 text-sm text-[var(--nf-danger)]">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting || !password.trim()}
                className="nf-button nf-button-primary w-full justify-center py-3 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? '正在登录...' : '进入工作区'}
              </button>

              <p className="text-xs leading-5 text-[var(--nf-text-subtle)]">
                忘记密码时，请在服务器环境变量中更新 `NOVELFORGE_ADMIN_PASSWORD` 后重启服务。
              </p>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
