import type { MouseEvent } from 'react';

interface ToggleBoxProps {
  glyph?: string | undefined;
  state: 'on' | 'partial' | 'off';
  size?: number | undefined;
  onClick: (e: MouseEvent) => void;
}

export function ToggleBox({ glyph, state, size = 30, onClick }: ToggleBoxProps) {
  const off = state === 'off';
  const partial = state === 'partial';
  const badge = Math.round(size * 0.5);
  return (
    <button
      onClick={onClick}
      title={off ? 'Click to keep' : 'Click to remove'}
      style={{
        position: 'relative', width: size, height: size, flex: '0 0 auto',
        borderRadius: Math.round(size * 0.27), cursor: 'pointer', padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: off ? '1.5px dashed var(--app-border-strong)' : '2px solid var(--app-accent)',
        background: off ? 'var(--app-surface-2)' : 'var(--app-accent-subtle)',
        transition: 'all .14s',
      }}
    >
      {glyph !== undefined && (
        <span style={{ font: `400 ${Math.round(size * 0.55)}px/1 'Lora', serif`, color: off ? 'var(--app-text-subtle)' : 'var(--app-accent-text)' }}>
          {glyph}
        </span>
      )}
      <span style={{
        position: 'absolute', top: -6, left: -6,
        width: badge, height: badge, borderRadius: '50%',
        border: '2px solid var(--app-surface)',
        background: off ? 'var(--app-border-strong)' : 'var(--app-accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {off ? (
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        ) : partial ? (
          <span style={{ width: 7, height: 2.3, background: '#fff', borderRadius: 2 }} />
        ) : (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </span>
    </button>
  );
}
