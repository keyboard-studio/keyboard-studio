import { memo } from 'react';
import type { StoreCharChip } from '../../../lib/irToCarveNodes.ts';
import { displayChar, invisibleCharLabel } from '../../../lib/irToCarveNodes.ts';
import { KIND_COLOR } from './KindBadge.tsx';
import { useHoverInfoStore } from '../../../stores/hoverInfoStore.ts';

interface StoreChipProps {
  chip: StoreCharChip;
  off: boolean;
  onToggle: (chipId: string) => void;
}

// StoreChip — a single per-character toggle chip inside a store's detail
// view (StoreDetail). Visuals mirror the pre-#523 static store-char spans
// (invisibleCharLabel, KIND_COLOR.store top border, Lora glyph styling).
// Interaction (toggle-on-click, aria-disabled) is borrowed from GlyphCell;
// hover/focus info has two paths mirroring GlyphCell's own split — a
// disabled chip surfaces its blocked-reason text, an enabled chip surfaces
// the character plus its codepoint (GlyphCell's enabled path additionally
// shows key sequence/capability, which don't apply to a store slot).
export const StoreChip = memo(function StoreChip({ chip, off, onToggle }: StoreChipProps) {
  const setInfo = useHoverInfoStore((s) => s.setInfo);
  const clearInfo = useHoverInfoStore((s) => s.clearInfo);
  const label = invisibleCharLabel(chip.ch);
  const disabled = chip.action === 'disabled';
  const codepoint = `U+${chip.ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;

  const showDisabledInfo = () => {
    if (chip.disabledReason === undefined) return;
    setInfo({ kind: 'text', title: 'Not removable', body: chip.disabledReason });
  };

  const showEnabledInfo = () => {
    setInfo({ kind: 'text', title: label ?? displayChar(chip.ch), body: codepoint });
  };

  const handleClick = () => {
    if (disabled) {
      showDisabledInfo();
      return;
    }
    onToggle(chip.chipId);
  };

  const inactive = off || disabled;
  const chipStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: label ? '9px 10px' : '9px 13px', borderRadius: 8,
    cursor: disabled ? 'default' : 'pointer',
    border: `1px solid var(--app-border${inactive ? '' : '-strong'})`,
    borderTop: `3px solid ${inactive ? 'var(--app-border-strong)' : KIND_COLOR.store}`,
    background: inactive ? 'var(--app-surface-2)' : 'var(--app-surface)',
    opacity: off ? 0.6 : disabled ? 0.7 : 1,
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={disabled ? showDisabledInfo : showEnabledInfo}
      onFocus={disabled ? showDisabledInfo : showEnabledInfo}
      onMouseLeave={clearInfo}
      onBlur={clearInfo}
      aria-disabled={disabled}
      aria-pressed={!disabled ? !off : undefined}
      style={chipStyle}
    >
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
