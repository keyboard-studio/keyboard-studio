import { memo } from 'react';
import type { RemovalCapability } from '@keyboard-studio/contracts';
import type { GlyphOwner } from '../../../lib/irToCarveNodes.ts';
import { displayChar } from '../../../lib/irToCarveNodes.ts';
import { KeySeq } from './KeySeq.tsx';
import { useHoverInfoStore } from '../../../stores/hoverInfoStore.ts';

interface GlyphCellProps {
  gid: string;
  ch: string;
  keys: string[];
  off: boolean;
  color: string;
  onToggle: (gid: string) => void;
  modifierLabel: string;
  capability: RemovalCapability;
  owners?: GlyphOwner[];
  onOwnerClick?: (nodeId: string) => void;
}

export const GlyphCell = memo(function GlyphCell({ gid, ch, keys, off, color, onToggle, modifierLabel, capability, owners, onOwnerClick }: GlyphCellProps) {
  const setInfo = useHoverInfoStore((s) => s.setInfo);
  const clearInfo = useHoverInfoStore((s) => s.clearInfo);
  const display = displayChar(ch);
  const isNotRemovable = capability.startsWith('not-removable:');
  const storeOwners = owners?.filter((o) => o.kind === 'store') ?? [];
  const handleClick = () => {
    if (isNotRemovable) {
      setInfo({ kind: 'key', keys, ch, off, capability, ...(owners ? { owners } : {}) });
      return;
    }
    onToggle(gid);
  };
  return (
    <div
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        width: '100%', height: '100%', borderRadius: 8,
        border: '1px solid ' + (off ? 'var(--app-border)' : 'var(--app-border-strong)'),
        borderTop: '3px solid ' + (off ? 'var(--app-border-strong)' : color),
        background: off ? 'var(--app-surface-2)' : 'var(--app-surface)',
        opacity: off ? 0.6 : 1,
      }}
    >
      <button
        onClick={handleClick}
        onMouseEnter={() => setInfo({ kind: 'key', keys, ch, off, capability, ...(owners ? { owners } : {}) })}
        onMouseLeave={clearInfo}
        onFocus={() => setInfo({ kind: 'key', keys, ch, off, capability, ...(owners ? { owners } : {}) })}
        onBlur={clearInfo}
        aria-disabled={isNotRemovable}
        style={{
          position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 8, flex: 1,
          width: '100%', padding: '10px 4px 12px', cursor: isNotRemovable ? 'not-allowed' : 'pointer',
          border: 'none', borderRadius: 0, background: 'transparent',
        }}
      >
        {isNotRemovable && (
          <span
            aria-label={`not removable: ${capability.replace('not-removable:', '')}`}
            style={{
              position: 'absolute', top: 4, left: 5,
              font: '600 8px/1 var(--app-font-mono)', letterSpacing: '.04em',
              padding: '1px 4px', borderRadius: 999,
              color: 'var(--amber-text)',
              background: 'var(--amber-bg)',
              border: '1px solid var(--amber-border)',
            }}
          >
            !
          </span>
        )}
        {keys.length > 2 && !off && (
          <span style={{ position: 'absolute', top: 4, right: 5, font: '600 8.5px/1 var(--app-font-mono)', color: 'var(--app-accent-text)' }}>
            {keys.length}⨯
          </span>
        )}
        <span style={{ font: "400 24px/1 'Lora', Georgia, serif", color: off ? 'var(--app-text-subtle)' : 'var(--app-text)' }}>
          {display}
        </span>
        <KeySeq keys={keys} prefix={modifierLabel} dim={off} />
      </button>
      {storeOwners.length > 0 && (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', padding: '0 4px 8px' }}>
          {storeOwners.map((o) => (
            <button
              key={o.nodeId}
              type="button"
              aria-label={`Go to store ${o.label}`}
              onClick={() => onOwnerClick?.(o.nodeId)}
              style={{
                font: '600 9px/1 var(--app-font-mono)', letterSpacing: '.02em',
                padding: '2px 6px', borderRadius: 6, cursor: 'pointer',
                color: 'var(--app-accent-text)',
                background: 'var(--app-accent-subtle)',
                border: '1px solid var(--app-border)',
              }}
            >
              {o.label}
            </button>
          ))}
        </span>
      )}
    </div>
  );
});
