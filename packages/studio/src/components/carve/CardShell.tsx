import type { ReactNode } from 'react';

interface CardShellNode {
  nodeId: string;
  flag?: string | undefined;
  desc?: string | undefined;
}

interface CardShellProps {
  node: CardShellNode;
  deleted: boolean;
  onDelete: () => void;
  onUndo: () => void;
  title: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
}

export function CardShell({ node, deleted, onDelete, onUndo, title, badge, children }: CardShellProps) {
  const flagged = !!node.flag;
  return (
    <div style={{
      background: 'var(--card)', borderRadius: 12, marginBottom: 12,
      border: `1px solid ${flagged && !deleted ? 'var(--amber-border)' : 'var(--border)'}`,
      boxShadow: flagged && !deleted ? 'inset 3px 0 0 var(--amber)' : 'none',
      opacity: deleted ? 0.6 : 1,
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 15px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <span style={{
              font: '600 16px var(--ui)',
              color: deleted ? 'var(--muted)' : 'var(--text)',
              textDecoration: deleted ? 'line-through' : 'none',
            }}>
              {title}
            </span>
            {badge}
          </div>
          {node.desc && !deleted && (
            <div style={{ marginTop: 3, fontSize: 14, color: 'var(--muted)' }}>{node.desc}</div>
          )}
        </div>
        {!deleted && (
          <button
            onClick={onDelete}
            title="Remove this rule"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, flex: '0 0 auto',
              background: 'var(--danger-bg)',
              border: '1px solid color-mix(in srgb, var(--danger) 45%, transparent)',
              borderRadius: 7, color: 'var(--danger)', cursor: 'pointer',
            }}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}
        {deleted && (
          <button
            onClick={onUndo}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '6px 11px',
              background: 'var(--card-2)', border: '1px solid var(--border-strong)',
              borderRadius: 7, color: 'var(--accent)', font: '600 13px var(--ui)',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6" /><path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
            </svg>
            Undo
          </button>
        )}
      </div>

      {/* flag reason banner */}
      {flagged && !deleted && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          margin: '0 15px 12px', padding: '8px 11px',
          background: 'var(--amber-bg)', border: '1px solid var(--amber-border)',
          borderRadius: 8, fontSize: 13.5, color: 'var(--amber-text)',
        }}>
          <span style={{ display: 'inline-flex', flex: '0 0 auto' }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
          </span>
          <span><b style={{ fontWeight: 600 }}>Suggested removal · </b>{node.flag}</span>
        </div>
      )}

      {/* body */}
      {!deleted && children && (
        <div style={{ padding: '0 15px 15px' }}>{children}</div>
      )}
    </div>
  );
}
