// KeyPickerField — a key-picker <select> plus an optional "Enter my own
// character..." custom-character text input, shared by every key-picker
// dropdown in MechanismGallery (deadkey trigger, S-01 swap, S-08 ralt) and
// TouchGallery (long-press / flick / multitap / replace host key).
//
// Resolution (which physical key the current selection/typed text maps to)
// is computed by the pure resolveKeyPickerSelection() helper in
// lib/charInput.ts — this component renders it, callers (canApply /
// handleApply) call the SAME helper again rather than being handed the
// result via a callback prop, so there is exactly one place the mapping
// logic lives.
//
// OSK tap-to-select: when a real key is tapped in the live preview while
// this picker's custom mode is active, the caller sets `value` back to that
// key id directly (see handleKeyTap in both galleries) — that alone exits
// custom mode, since custom mode is purely `value === CUSTOM_KEY_OPTION_VALUE`.

import type { CSSProperties } from "react";
import { CUSTOM_KEY_OPTION, CUSTOM_KEY_OPTION_VALUE } from "../../lib/keyOptions.ts";
import { resolveKeyPickerSelection } from "../../lib/charInput.ts";
import { BG_PAGE, BORDER, TEXT_MAIN, TEXT_DIM, FONT } from "../../lib/galleryTheme.ts";

const selectStyle: CSSProperties = {
  background: BG_PAGE,
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  color: TEXT_MAIN,
  fontSize: 12,
  padding: "4px 8px",
  fontFamily: FONT,
};

const customInputStyle: CSSProperties = {
  width: 90,
  padding: "4px 8px",
  background: BG_PAGE,
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  color: TEXT_MAIN,
  fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
  fontSize: 12,
  boxSizing: "border-box",
};

export interface KeyPickerFieldProps {
  /** Real vkey id, "", or CUSTOM_KEY_OPTION_VALUE. */
  value: string;
  onChange: (value: string) => void;
  /** Raw typed text for the custom-character input; only read when value === CUSTOM_KEY_OPTION_VALUE. */
  customChar: string;
  onCustomCharChange: (value: string) => void;
  /** Base options (WITHOUT the custom entry — this component appends it). */
  options: ReadonlyArray<{ value: string; label: string }>;
  selectAriaLabel: string;
  customInputAriaLabel: string;
  /**
   * Reject ASCII straight-quote delimiters in the custom-character text —
   * only for pickers whose resolved char is ALSO emitted as a literal
   * output character (the S-02 deadkey trigger, whose resolved char is
   * reused as `accentChar`). Never set for SWAP/RALT/touch host-key
   * pickers, which resolve solely to a K_ vkey id. Default false.
   */
  blockDelimiters?: boolean;
  /**
   * Placeholder text for the custom-character input. Defaults to the
   * accented-character example ("e.g. é or U+00E9") — appropriate for a
   * picker whose custom character is itself the literal output (e.g. the
   * S-02 deadkey trigger). A physical-key picker (SWAP/RALT/touch host-key,
   * where any mappable ASCII char is typical) should pass a key-oriented
   * example instead (e.g. "e.g. a or ;").
   */
  customPlaceholder?: string;
}

export function KeyPickerField({
  value,
  onChange,
  customChar,
  onCustomCharChange,
  options,
  selectAriaLabel,
  customInputAriaLabel,
  blockDelimiters,
  customPlaceholder,
}: KeyPickerFieldProps) {
  const isCustom = value === CUSTOM_KEY_OPTION_VALUE;
  const resolution = resolveKeyPickerSelection(
    value,
    customChar,
    blockDelimiters === true ? { blockDelimiters: true } : {},
  );

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={selectAriaLabel}
        style={selectStyle}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        <option value={CUSTOM_KEY_OPTION_VALUE}>{CUSTOM_KEY_OPTION.label}</option>
      </select>
      {isCustom && (
        <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
          <input
            type="text"
            value={customChar}
            onChange={(e) => onCustomCharChange(e.target.value)}
            aria-label={customInputAriaLabel}
            placeholder={customPlaceholder ?? "e.g. é or U+00E9"}
            maxLength={8}
            style={customInputStyle}
          />
          {resolution.kind === "customOk" && (
            <span role="status" aria-live="polite" style={{ fontSize: 11, color: TEXT_DIM, fontFamily: FONT }}>
              {resolution.wasNotation
                ? `${customChar.trim()} → ${resolution.char} → ${resolution.vkey}`
                : `→ ${resolution.vkey}`}
            </span>
          )}
          {resolution.kind === "customError" && customChar.trim().length > 0 && (
            <span role="alert" style={{ fontSize: 11, color: "#f85149", opacity: 0.85, fontFamily: FONT }}>
              {resolution.reason}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
