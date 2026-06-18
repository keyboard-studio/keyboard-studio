import { isCombining } from '../../lib/irToCarveNodes.ts';
import { KeySeq } from './KeySeq.tsx';

interface GlyphCellProps {
  gid: string;
  ch: string;
  keys: string[];
  off: boolean;
  color: string;
  onClick: () => void;
}

export function GlyphCell({ ch, keys, off, color, onClick }: GlyphCellProps) {
  const display = isCombining(ch) ? '◌' + ch : ch;
  return (
    <button
      onClick={onClick}
      title={`${keys.join(' ')} → ${ch}${off ? ' · removed' : ''}`}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        padding: '9px 4px 7px', cursor: 'pointer', borderRadius: 8,
        border: '1px solid ' + (off ? 'var(--app-border)' : 'var(--app-border-strong)'),
        borderTop: '3px solid ' + (off ? 'var(--app-border-strong)' : color),
        background: off ? 'var(--app-surface-2)' : 'var(--app-surface)',
        opacity: off ? 0.6 : 1,
      }}
    >
      {keys.length >= 3 && !off && (
        <span style={{ position: 'absolute', top: 4, right: 5, font: '600 8.5px/1 var(--app-font-mono)', color: 'var(--app-accent-text)' }}>
          3⨯
        </span>
      )}
      <span style={{ font: "400 24px/1 'Lora', Georgia, serif", color: off ? 'var(--app-text-subtle)' : 'var(--app-text)' }}>
        {display}
      </span>
      <KeySeq keys={keys} dim={off} />
    </button>
  );
}
