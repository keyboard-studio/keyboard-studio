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
// (invisibleCharLabel, KIND_COLOR.store top border, Lora glyph styling);
// interaction (toggle-on-click, hover/focus info, aria-disabled) is borrowed
// from GlyphCell's not-removable pattern.
export const StoreChip = memo(function StoreChip({ chip, off, onToggle }: StoreChipProps) {
  const setInfo = useHoverInfoStore((s) => s.setInfo);
  const clearInfo = useHoverInfoStore((s) => s.clearInfo);
  const label = invisibleCharLabel(chip.ch);
  const disabled = chip.action === 'disabled';

  const showDisabledInfo = () => {
    if (chip.disabledReason === undefined) return;
    setInfo({ kind: 'text', title: 'Not removable', body: chip.disabledReason });
  };

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
      onMouseEnter={disabled ? showDisabledInfo : clearInfo}
      onFocus={disabled ? showDisabledInfo : clearInfo}
      onMouseLeave={clearInfo}
      onBlur={clearInfo}
      aria-disabled={disabled}
      aria-pressed={!disabled ? !off : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: label ? '9px 10px' : '9px 13px', borderRadius: 8,
        cursor: disabled ? 'default' : 'pointer',
        border: '1px solid ' + (off || disabled ? 'var(--app-border)' : 'var(--app-border-strong)'),
        borderTop: '3px solid ' + (off || disabled ? 'var(--app-border-strong)' : KIND_COLOR.store),
        background: off || disabled ? 'var(--app-surface-2)' : 'var(--app-surface)',
        opacity: off ? 0.6 : disabled ? 0.7 : 1,
      }}
    >
      {label ? (
        <span style={{ font: '600 10px/1 var(--app-font-mono)', color: off ? 'var(--app-text-subtle)' : 'var(--app-text-muted)', letterSpacing: '0.04em' }} title={`U+${chip.ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`}>
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
