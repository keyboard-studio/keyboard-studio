import type { ReactNode } from 'react';

interface KeyCapProps { children: ReactNode }

export function KeyCap({ children }: KeyCapProps) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 18, height: 19, padding: '0 5px', borderRadius: 4,
      font: '600 12px/1 var(--mono)',
      background: 'var(--card-2)', border: '1px solid var(--border-strong)',
      color: 'var(--text)', boxShadow: '0 1px 0 rgba(0,0,0,.35)',
    }}>
      {children}
    </span>
  );
}
