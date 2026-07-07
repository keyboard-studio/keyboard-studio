import { memo } from 'react';
import type { StoreCharChip } from '../../../lib/irToCarveNodes.ts';
import { displayChar, invisibleCharLabel } from '../../../lib/irToCarveNodes.ts';
import { KIND_COLOR } from './KindBadge.tsx';
import { useHoverInfoStore } from '../../../stores/hoverInfoStore.ts';

interface StoreChipProps {
  chip: StoreCharChip;
  off: boolean;
  onToggle: (chipId: string) => void;
  /**
   * Display name(s) of a coordinated partner store whose SAME-position
   * slot is currently deleted — this chip's character WILL be spliced at
   * commit (the engine's coordinated drop) even though ITS OWN id isn't in
   * deletedItemIds. Purely a render-time visual cue: it must never cause
   * this chip's own id to be added to deletedItemIds (the engine already
   * handles the splice) — that would break restore/undo symmetry. Absent
   * or undefined when this chip has no coordinated partner in that state.
   */
  coordinatedRemovedBy?: string | undefined;
}

// StoreChip — a single per-character toggle chip inside a store's detail
// view (StoreDetail). Visuals mirror the pre-#523 static store-char spans
// (invisibleCharLabel, KIND_COLOR.store top border, Lora glyph styling).
// Interaction (toggle-on-click, aria-disabled) is borrowed from GlyphCell;
// hover/focus info has two paths mirroring GlyphCell's own split — a
// disabled chip surfaces its blocked-reason text, an enabled chip surfaces
// the character plus its codepoint (GlyphCell's enabled path additionally
// shows key sequence/capability, which don't apply to a store slot).
export const StoreChip = memo(function StoreChip({ chip, off, onToggle, coordinatedRemovedBy }: StoreChipProps) {
  const setInfo = useHoverInfoStore((s) => s.setInfo);
  const clearInfo = useHoverInfoStore((s) => s.clearInfo);
  const label = invisibleCharLabel(chip.ch);
  const disabled = chip.action === 'disabled';
  const codepoint = `U+${chip.ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
  // "Effectively removed via coordination" — this chip's OWN id isn't in
  // deletedItemIds (off is false), but a paired store's SAME-position slot
  // is, so the engine will splice this position too at commit.
  const coordinated = !off && !disabled && coordinatedRemovedBy !== undefined;

  const showDisabledInfo = () => {
    if (chip.disabledReason === undefined) return;
    setInfo({ kind: 'text', title: 'Not removable', body: chip.disabledReason });
  };

  const showCoordinatedInfo = () => {
    setInfo({
      kind: 'text',
      title: 'Removed together',
      body: `This character will also be removed — "${coordinatedRemovedBy}" was removed at the same position, and the two are linked by the keyboard's pairing mechanism.`,
    });
  };

  const showEnabledInfo = () => {
    setInfo({ kind: 'text', title: label ?? displayChar(chip.ch), body: codepoint });
  };

  const showHoverInfo = disabled ? showDisabledInfo : coordinated ? showCoordinatedInfo : showEnabledInfo;

  const handleClick = () => {
    if (disabled) {
      showDisabledInfo();
      return;
    }
    onToggle(chip.chipId);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={showHoverInfo}
      onFocus={showHoverInfo}
      onMouseLeave={clearInfo}
      onBlur={clearInfo}
      aria-disabled={disabled}
      aria-pressed={!disabled ? !off : undefined}
      data-coordinated-removed={coordinated ? 'true' : undefined}
      style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: label ? '9px 10px' : '9px 13px', borderRadius: 8,
        cursor: disabled ? 'default' : 'pointer',
        border: '1px solid ' + (off || disabled ? 'var(--app-border)' : coordinated ? 'color-mix(in srgb, var(--app-accent-text) 45%, transparent)' : 'var(--app-border-strong)'),
        borderStyle: coordinated ? 'dashed' : 'solid',
        borderTop: '3px solid ' + (off || disabled ? 'var(--app-border-strong)' : coordinated ? 'color-mix(in srgb, var(--app-accent-text) 60%, transparent)' : KIND_COLOR.store),
        background: off || disabled ? 'var(--app-surface-2)' : 'var(--app-surface)',
        opacity: off ? 0.6 : disabled ? 0.7 : coordinated ? 0.7 : 1,
      }}
    >
      {coordinated && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', top: -6, right: -6, width: 14, height: 14, borderRadius: 7,
            background: 'var(--app-accent-subtle)', border: '1px solid var(--app-border-strong)',
            font: '600 8px/14px var(--app-font)', color: 'var(--app-accent-text)', textAlign: 'center',
          }}
        >
          ⇄
        </span>
      )}
      {label ? (
        <span style={{ font: '600 10px/1 var(--app-font-mono)', color: off ? 'var(--app-text-subtle)' : 'var(--app-text-muted)', letterSpacing: '0.04em' }} title={codepoint}>
          {label}
        </span>
      ) : (
        <span style={{ font: "400 22px/1 'Lora', serif", color: off ? 'var(--app-text-subtle)' : 'var(--app-text)' }}>
          {displayChar(chip.ch)}
        </span>
      )}
    </button>
  );
});
