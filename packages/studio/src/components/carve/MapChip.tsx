import { KeySeq } from './KeySeq.tsx';
import { isCombining } from '../../lib/irToCarveNodes.ts';

interface MapChipProps {
  keys: string[];
  ch: string;
  removed: boolean;
  onToggle: () => void;
  color?: string;
}

export function MapChip({ keys, ch, removed, onToggle, color }: MapChipProps) {
  const c = color ?? 'var(--accent)';
  const display = isCombining(ch) ? '◌' + ch : ch;
  return (
    <button
      onClick={onToggle}
      title={removed ? 'Removed — click to keep' : 'Kept — click to remove'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        flex: '0 0 auto', padding: '5px 10px 5px 8px', cursor: 'pointer',
        background: removed ? 'transparent' : `color-mix(in srgb, ${c} 14%, transparent)`,
        border: `1px solid ${removed ? 'var(--border)' : `color-mix(in srgb, ${c} 50%, transparent)`}`,
        borderRadius: 7, opacity: removed ? 0.5 : 1,
        transition: 'opacity .12s, border-color .12s, background .12s',
        font: 'inherit',
      }}
    >
      {/* checkmark */}
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16, borderRadius: 4, flex: '0 0 auto',
        background: !removed ? `color-mix(in srgb, ${c} 20%, transparent)` : 'transparent',
        border: `1.5px solid ${!removed ? `color-mix(in srgb, ${c} 60%, transparent)` : 'var(--border-strong)'}`,
        color: c, transition: 'background .12s, border-color .12s',
      }}>
        {!removed && (
          <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </span>
      <KeySeq keys={keys} />
      {/* arrow */}
      <span style={{ color: 'var(--muted)', display: 'inline-flex' }}>
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
      <span style={{ font: `400 18px/1 var(--serif)`, color: removed ? 'var(--muted)' : 'var(--text)' }}>
        {display}
      </span>
    </button>
  );
}
