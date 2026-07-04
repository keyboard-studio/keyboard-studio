import { memo } from 'react';
import type { RemovalCapability } from '@keyboard-studio/contracts';
import type { GlyphOwner } from '../../../lib/irToCarveNodes.ts';
import { displayChar } from '../../../lib/irToCarveNodes.ts';
import { KeySeq } from './KeySeq.tsx';
import { useHoverInfoStore } from '../../../stores/hoverInfoStore.ts';

// Ownership tag kinds — pattern or store, matching GlyphOwner.kind.
export type OwnerKind = 'pattern' | 'store';

interface GlyphCellProps {
  gid: string;
  ch: string;
  keys: string[];
  off: boolean;
  color: string;
  /** Called when the user clicks the chip BODY (plain toggle fallback). */
  onToggle: (gid: string) => void;
  modifierLabel: string;
  capability: RemovalCapability;
  /** Every store/pattern this glyph's rule is tied to — rendered as clickable tags. */
  owners?: GlyphOwner[];
  /** Called when an ownership tag is clicked — navigates to that card in the Rail. */
  onOwnerClick?: (nodeId: string) => void;
  /**
   * Called when the chip BODY is clicked. When provided it replaces the plain
   * toggle as the removal initiator: the cascade flow decides whether to delete
   * just here, remove the character everywhere it is produced, or explain why
   * it cannot be removed. Falls back to `onToggle` when absent.
   */
  onCascadeDelete?: (gid: string) => void;
}

// Per-kind tag colors — pattern vs store, distinct from the amber `!` and the accent `N⨯`.
const OWNER_TAG_STYLE: Record<OwnerKind, { color: string; bg: string; border: string }> = {
  pattern: {
    color: '#6fbbd4',
    bg: 'color-mix(in srgb, #6fbbd4 15%, transparent)',
    border: 'color-mix(in srgb, #6fbbd4 40%, transparent)',
  },
  store: {
    color: '#8b5cc4',
    bg: 'color-mix(in srgb, #8b5cc4 15%, transparent)',
    border: 'color-mix(in srgb, #8b5cc4 40%, transparent)',
  },
};

export const GlyphCell = memo(function GlyphCell({
  gid, ch, keys, off, color, onToggle, modifierLabel, capability, owners, onOwnerClick, onCascadeDelete,
}: GlyphCellProps) {
  const setInfo = useHoverInfoStore((s) => s.setInfo);
  const clearInfo = useHoverInfoStore((s) => s.clearInfo);
  const display = displayChar(ch);
  const isNotRemovable = capability.startsWith('not-removable:');
  const tagOwners = owners ?? [];

  const hoverInfo = { kind: 'key' as const, keys, ch, off, capability, ...(owners ? { owners } : {}) };

  // Chip-body activation. When a cascade handler is wired (the carve gallery), it
  // owns the remove decision (delete-here / remove-everywhere / explain-why). When
  // absent, fall back to the plain behaviour: a not-removable chip is info-only.
  const handleBodyActivate = () => {
    if (onCascadeDelete) { onCascadeDelete(gid); return; }
    if (isNotRemovable) { setInfo(hoverInfo); return; }
    onToggle(gid);
  };

  // The chip body and the ownership tags are SIBLINGS inside this div (the tags
  // are their own <button>s, never nested inside the body <button>) so both are
  // independently clickable without violating interactive-nesting rules.
  return (
    <div
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        width: '100%', height: '100%', borderRadius: 8,
        border: '1px solid ' + (off ? 'var(--app-border)' : 'var(--app-border-strong)'),
        borderTop: '3px solid ' + (off ? 'var(--app-border-strong)' : color),
        background: off ? 'var(--app-surface-2)' : 'var(--app-surface)',
        opacity: off ? 0.6 : 1,
        userSelect: 'none',
      }}
    >
      <button
        onClick={handleBodyActivate}
        onMouseEnter={() => setInfo(hoverInfo)}
        onMouseLeave={clearInfo}
        onFocus={() => setInfo(hoverInfo)}
        onBlur={clearInfo}
        aria-label={`${display} — ${keys.join(' ')}`}
        aria-pressed={off}
        style={{
          position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 8, flex: 1,
          width: '100%', padding: '10px 4px 12px', cursor: 'pointer',
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
              color: 'var(--amber-text)', background: 'var(--amber-bg)', border: '1px solid var(--amber-border)',
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
      {tagOwners.length > 0 && (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', padding: '0 4px 8px' }}>
          {tagOwners.map((o) => {
            const s = OWNER_TAG_STYLE[o.kind];
            return (
              <button
                key={o.kind + ':' + o.nodeId}
                type="button"
                aria-label={`Go to ${o.kind} ${o.label}`}
                onClick={() => onOwnerClick?.(o.nodeId)}
                style={{
                  font: '600 9px/1 var(--app-font-mono)', letterSpacing: '.02em',
                  padding: '2px 6px', borderRadius: 6, cursor: onOwnerClick ? 'pointer' : 'default',
                  color: s.color, background: s.bg, border: `1px solid ${s.border}`,
                  maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {o.label}
              </button>
            );
          })}
        </span>
      )}
    </div>
  );
});
