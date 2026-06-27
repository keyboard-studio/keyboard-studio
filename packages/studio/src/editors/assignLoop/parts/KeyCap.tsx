import type { ReactNode } from 'react';

interface KeyCapProps { children: ReactNode }

export function KeyCap({ children }: KeyCapProps) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 14, height: 15, padding: '0 3px', borderRadius: 3,
      font: '600 10px/1 var(--app-font-mono)',
      background: 'var(--app-surface-2)', border: '1px solid var(--app-border-strong)',
      color: 'var(--app-text-muted)',
    }}>
      {children}
    </span>
  );
}
