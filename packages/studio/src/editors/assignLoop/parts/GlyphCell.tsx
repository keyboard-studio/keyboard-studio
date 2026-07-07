import { memo } from 'react';
import type { RemovalCapability } from '@keyboard-studio/contracts';
import type { GlyphOwner, CharLocation } from '../../../lib/irToCarveNodes.ts';
import { displayChar } from '../../../lib/irToCarveNodes.ts';
import { KeySeq } from './KeySeq.tsx';
import { KIND_COLOR } from './KindBadge.tsx';
import { useHoverInfoStore } from '../../../stores/hoverInfoStore.ts';

// Order the cross-reference summary tags render in: group, then pattern, then store.
const WEB_KINDS = ['group', 'pattern', 'store'] as const;

interface GlyphCellProps {
  gid: string;
  ch: string;
  keys: string[];
  off: boolean;
  color: string;
  /** Called when the chip BODY is clicked (plain toggle fallback). */
  onToggle: (gid: string) => void;
  modifierLabel: string;
  capability: RemovalCapability;
  /** For the hover info panel only — the full owner list. */
  owners?: GlyphOwner[];
  /**
   * The OTHER locations this character appears in (already excludes the card
   * being viewed). Drives the cross-reference summary tags.
   */
  webLocations?: CharLocation[];
  /** Clicking a summary tag — parent decides: 1 location → navigate, >1 → popup. */
  onWebTag?: (ch: string, locations: CharLocation[]) => void;
  /**
   * Called when the chip BODY is clicked. When provided it replaces the plain
   * toggle as the removal initiator: the cascade flow decides whether to delete
   * just here, remove everywhere, or explain why it can't be removed.
   */
  onCascadeDelete?: (gid: string) => void;
}

export const GlyphCell = memo(function GlyphCell({
  gid, ch, keys, off, color, onToggle, modifierLabel, capability, owners, webLocations, onWebTag, onCascadeDelete,
}: GlyphCellProps) {
  const setInfo = useHoverInfoStore((s) => s.setInfo);
  const clearInfo = useHoverInfoStore((s) => s.clearInfo);
  const display = displayChar(ch);
  const isNotRemovable = capability.startsWith('not-removable:');
  const locations = webLocations ?? [];
  // One summary tag per KIND actually present in the other locations.
  const kindsPresent = WEB_KINDS.filter((k) => locations.some((l) => l.kind === k));

  const hoverInfo = { kind: 'key' as const, keys, ch, off, capability, ...(owners ? { owners } : {}) };

  const handleBodyActivate = () => {
    if (onCascadeDelete) { onCascadeDelete(gid); return; }
    if (isNotRemovable) { setInfo(hoverInfo); return; }
    onToggle(gid);
  };

  // Chip body and summary tags are SIBLINGS in this div (tags are their own
  // <button>s, never nested in the body <button>) so both stay independently
  // clickable. No fixed height — the grid row grows to fit the tags.
  return (
    <div
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        width: '100%', borderRadius: 8,
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
      {kindsPresent.length > 0 && (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', padding: '0 4px 8px' }}>
          {kindsPresent.map((k) => {
            const c = KIND_COLOR[k];
            const count = locations.filter((l) => l.kind === k).length;
            return (
              <button
                key={k}
                type="button"
                aria-label={`${k} — ${count === 1 ? 'go to' : `${count} places`}`}
                onClick={(e) => { e.stopPropagation(); onWebTag?.(ch, locations); }}
                style={{
                  font: '600 9px/1 var(--app-font-mono)', letterSpacing: '.04em',
                  padding: '2px 6px', borderRadius: 6, cursor: onWebTag ? 'pointer' : 'default',
                  color: c,
                  background: `color-mix(in srgb, ${c} 15%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`,
                  maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {k}
              </button>
            );
          })}
        </span>
      )}
    </div>
  );
});
