'use client';

import Link from 'next/link';
import { ArrowLeft, FlaskConical, LayoutDashboard } from 'lucide-react';

export default function AIPlanningPage() {
  return (
    <div className="nf-editor-shell">
      <div className="nf-editor-page">
        <section className="nf-editor-hero">
          <div>
            <p className="nf-kicker">EXPERIMENTAL</p>
            <h1>
              <FlaskConical className="inline h-7 w-7 align-[-4px] text-[var(--nf-accent)]" />
              {' '}AI 规划实验入口
            </h1>
            <p>
              这个入口仍属于实验功能，暂时不放入普通内测路径。当前推荐流程是先导入文本，
              再在工作台基于已提取的角色、关系、章节和世界观继续创作。
            </p>
          </div>
          <div className="nf-pill-row">
            <Link href="/" className="nf-button nf-button-primary">
              <ArrowLeft className="h-4 w-4" />
              返回工作台
            </Link>
            <Link href="/dashboard" className="nf-button">
              <LayoutDashboard className="h-4 w-4" />
              查看项目状态
            </Link>
          </div>
        </section>

        <section className="nf-panel nf-panel-pad">
          <p className="nf-kicker">WHY HIDDEN</p>
          <h2 className="text-xl font-bold text-[var(--nf-text)]">内测阶段不把半成品能力当成主流程</h2>
          <p className="mt-3 text-sm leading-7 text-[var(--nf-text-muted)]">
            规划页的旧能力可以作为后续实验保留，但当前产品目标已经收敛为：
            导入文本、提取资产、质量诊断、AI 基于资产写作、用户确认保存、editor 管理候选。
            为了避免内测用户误入未完成路径，这里只保留说明和返回入口。
          </p>
        </section>
      </div>
    </div>
  );
}
