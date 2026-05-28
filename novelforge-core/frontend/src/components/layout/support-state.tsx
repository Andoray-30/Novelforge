'use client';

import type { ReactNode } from 'react';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';

type SupportStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
};

export function LoadingState({ title = '正在加载...', description }: Partial<SupportStateProps>) {
  return (
    <div className="nf-editor-shell">
      <div className="nf-editor-loading">
        <div className="nf-editor-spinner" />
        <p className="font-semibold text-[var(--nf-text)]">{title}</p>
        {description ? <p className="text-sm text-[var(--nf-text-muted)]">{description}</p> : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, icon, children }: SupportStateProps) {
  return (
    <div className="nf-editor-empty">
      {icon ?? <Sparkles size={34} />}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {children ? <div className="nf-pill-row" style={{ justifyContent: 'center' }}>{children}</div> : null}
    </div>
  );
}

export function ErrorState({ title, description, icon, children }: SupportStateProps) {
  return (
    <div className="nf-editor-shell">
      <div className="nf-editor-page">
        <div className="nf-editor-empty border-[color-mix(in_srgb,var(--nf-danger)_28%,var(--nf-border))] bg-[color-mix(in_srgb,var(--nf-danger)_7%,var(--nf-panel))]">
          {icon ?? <AlertCircle size={34} />}
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
          {children ? <div className="nf-pill-row" style={{ justifyContent: 'center' }}>{children}</div> : null}
        </div>
      </div>
    </div>
  );
}
