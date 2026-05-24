'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Lock } from 'lucide-react';
import { authService } from '@/lib/api/novelforge-api';

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
        throw new Error('登录未成功');
      }
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请检查管理员密码。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/90 p-8 shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500 text-white">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">NovelForge</p>
            <h1 className="text-2xl font-bold text-white">管理员登录</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-300">管理员密码</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 focus-within:border-violet-400">
              <Lock className="h-4 w-4 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-slate-100 outline-none"
                autoComplete="current-password"
                autoFocus
              />
            </div>
          </label>

          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || !password.trim()}
            className="w-full rounded-xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? '正在登录...' : '进入工作区'}
          </button>
        </form>
      </div>
    </main>
  );
}
