import { memo } from 'react';
import type { RemovalCapability } from '@keyboard-studio/contracts';
import { displayChar } from '../../../lib/irToCarveNodes.ts';
import { KeySeq } from './KeySeq.tsx';
import { useHoverInfoStore } from '../../../stores/hoverInfoStore.ts';

// Ownership tag kinds — matches the ownerKind field added to CarveGlyph by km-programmer.
export type OwnerKind = 'pattern' | 'store';

interface GlyphCellProps {
  gid: string;
  ch: string;
  keys: string[];
  off: boolean;
  color: string;
  /** Called when the user clicks the chip BODY (initiate removal/toggle). */
  onToggle: (gid: string) => void;
  modifierLabel: string;
  capability: RemovalCapability;

  // Ownership tag — present when this glyph is cross-wired to a pattern or store node.
  ownerKind?: OwnerKind | undefined;
  /** The nodeId of the owning pattern/store — used for Rail navigation. */
  ownerNodeId?: string | undefined;
  /** Short human-readable label for the ownership tag (e.g. "S-02", "main"). */
  ownerLabel?: string | undefined;
  /**
   * Called when the user clicks the ownership tag.
   * Routes to the owning card in the Rail via setSelectedId.
   */
  onSelectNode?: ((nodeId: string) => void) | undefined;
  /**
   * Called when the user clicks the chip BODY when `onCascadeDelete` is
   * provided — replaces `onToggle` as the removal initiator for cross-wired chips.
   * If absent, falls back to `onToggle`.
   */
  onCascadeDelete?: ((gid: string) => void) | undefined;
}

// Chip colors for ownership tags — distinct from the amber `!` and accent `N⨯`.
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
  gid,
  ch,
  keys,
  off,
  color,
  onToggle,
  modifierLabel,
  capability,
  ownerKind,
  ownerNodeId,
  ownerLabel,
  onSelectNode,
  onCascadeDelete,
}: GlyphCellProps) {
  const setInfo = useHoverInfoStore((s) => s.setInfo);
  const clearInfo = useHoverInfoStore((s) => s.clearInfo);
  const display = displayChar(ch);
  const isNotRemovable = capability.startsWith('not-removable:');

  // Which handler fires on chip-body activation
  const handleBodyActivate = () => {
    if (onCascadeDelete) {
      onCascadeDelete(gid);
    } else {
      onToggle(gid);
    }
  };

  const showOwnerTag = ownerLabel !== undefined && ownerKind !== undefined;
  const tagStyle = ownerKind !== undefined ? OWNER_TAG_STYLE[ownerKind] : undefined;

  // The outer element MUST be a <div role="button"> (not <button>) because we
  // nest a real <button> inside for the ownership tag, and interactive elements
  // nested inside <button> is invalid HTML (Section 4.10.18.5 of the HTML spec).
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${display} — ${keys.join(' ')}`}
      aria-pressed={off}
      onClick={handleBodyActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleBodyActivate();
        }
      }}
      onMouseEnter={() => setInfo({ kind: 'key', keys, ch, off, capability })}
      onMouseLeave={clearInfo}
      onFocus={() => setInfo({ kind: 'key', keys, ch, off, capability })}
      onBlur={clearInfo}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        padding: showOwnerTag ? '10px 4px 20px' : '10px 4px 12px',
        cursor: 'pointer',
        borderRadius: 8,
        border: '1px solid ' + (off ? 'var(--app-border)' : 'var(--app-border-strong)'),
        borderTop: '3px solid ' + (off ? 'var(--app-border-strong)' : color),
        background: off ? 'var(--app-surface-2)' : 'var(--app-surface)',
        opacity: off ? 0.6 : 1,
        userSelect: 'none',
      }}
    >
      {isNotRemovable && (
        <span
          aria-label={`not removable: ${capability.replace('not-removable:', '')}`}
          style={{
            position: 'absolute',
            top: 4,
            left: 5,
            font: '600 8px/1 var(--app-font-mono)',
            letterSpacing: '.04em',
            padding: '1px 4px',
            borderRadius: 999,
            color: 'var(--amber-text)',
            background: 'var(--amber-bg)',
            border: '1px solid var(--amber-border)',
          }}
        >
          !
        </span>
      )}
      {keys.length > 2 && !off && (
        <span
          style={{
            position: 'absolute',
            top: 4,
            right: 5,
            font: '600 8.5px/1 var(--app-font-mono)',
            color: 'var(--app-accent-text)',
          }}
        >
          {keys.length}⨯
        </span>
      )}
      <span
        style={{
          font: "400 24px/1 'Lora', Georgia, serif",
          color: off ? 'var(--app-text-subtle)' : 'var(--app-text)',
        }}
      >
        {display}
      </span>
      <KeySeq keys={keys} prefix={modifierLabel} dim={off} />

      {/* Ownership tag — bottom of the chip, only when ownerLabel is set.
          Rendered as a real <button> so it is its own tab stop and stopping
          propagation prevents the outer div's onClick from also firing. */}
      {showOwnerTag && tagStyle !== undefined && (
        <button
          aria-label={`Go to owning ${ownerKind} ${ownerLabel}`}
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation(); // do NOT fire the outer chip-body handler
            if (ownerNodeId !== undefined && onSelectNode !== undefined) {
              onSelectNode(ownerNodeId);
            }
          }}
          onKeyDown={(e) => {
            // Prevent the outer div's keyDown from also firing on Enter/Space.
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
            }
          }}
          style={{
            position: 'absolute',
            bottom: 4,
            left: '50%',
            transform: 'translateX(-50%)',
            font: '600 8px/1 var(--app-font-mono)',
            padding: '2px 5px',
            borderRadius: 4,
            color: tagStyle.color,
            background: tagStyle.bg,
            border: `1px solid ${tagStyle.border}`,
            cursor: ownerNodeId !== undefined && onSelectNode !== undefined ? 'pointer' : 'default',
            whiteSpace: 'nowrap',
            maxWidth: '90%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ownerLabel}
        </button>
      )}
    </div>
  );
});
