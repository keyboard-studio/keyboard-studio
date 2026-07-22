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
import { Trans } from "@lingui/react/macro";
import { CUSTOM_KEY_OPTION, CUSTOM_KEY_OPTION_VALUE } from "../../lib/keyOptions.ts";
import {
  resolveKeyPickerSelection,
  reflectCharInput,
  type KeyPickerResolveOptions,
} from "../../lib/charInput.ts";
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
}: KeyPickerFieldProps) {
  const isCustom = value === CUSTOM_KEY_OPTION_VALUE;
  const resolveOptions: KeyPickerResolveOptions =
    blockDelimiters === true ? { blockDelimiters: true } : {};
  const resolution = resolveKeyPickerSelection(value, customChar, resolveOptions);
  // Bidirectional char <-> U+ reflection (Fix 2) — reflectCharInput handles
  // only the character/notation side; the vkey is appended below so the
  // success line still reads e.g. "; → U+003B → K_SEMI" or
  // "U+0041 → A → K_A".
  const reflection = reflectCharInput(customChar, resolveOptions);

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
          <span style={{ fontSize: 10, color: TEXT_DIM, fontFamily: FONT }}>
            <Trans id="editor.assignLoop.customInputHelp">
              Type a character directly, or a Unicode value like U+00E9.
            </Trans>
          </span>
          <input
            type="text"
            value={customChar}
            onChange={(e) => onCustomCharChange(e.target.value)}
            aria-label={customInputAriaLabel}
            maxLength={8}
            style={customInputStyle}
          />
          {resolution.kind === "customOk" && (
            <span role="status" aria-live="polite" style={{ fontSize: 11, color: TEXT_DIM, fontFamily: FONT }}>
              {reflection.kind === "ok" ? `${reflection.text} → ${resolution.vkey}` : `→ ${resolution.vkey}`}
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
