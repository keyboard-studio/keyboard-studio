// Autocomplete — replaces the `<input list> + <datalist>` composite from
// AutocompleteField in QuestionField.tsx.
//
// FR-005: renders the same element structure (input[list] + datalist), role,
// and resolved styles as the inline control it replaces. The base INPUT_STYLE
// values and `autoComplete="off"` are reproduced verbatim. Native
// style/className pass-through ensures call-site overrides survive exactly
// (Decision 2).
//
// The `id` prop is required here because the input's `list` attribute must
// reference a unique datalist element — the listId is derived as
// `datalist-${id}` to mirror the AutocompleteField convention exactly.

import React from "react";
import {
  BG_PAGE,
  BORDER,
  TEXT_MAIN,
  FONT,
} from "./theme.ts";

export type AutocompleteProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /**
   * Option values to populate the datalist. These are rendered as plain
   * `<option value={opt}>` elements (value-only, no separate label), matching
   * the data-model spec for Autocomplete.
   *
   * For the survey's option-with-label variant (QuestionField.AutocompleteField),
   * the call site renders the datalist itself and can pass `list` directly.
   */
  options: string[];
};

/**
 * Autocomplete input primitive. Renders an `<input list=...>` paired with a
 * `<datalist>` populated from the `options` prop.
 *
 * Requires an `id` prop so the `list` linkage can be derived. The datalist id
 * is `datalist-${id}` — identical to the AutocompleteField convention in
 * QuestionField.tsx.
 *
 * Extends all native HTMLInputElement props so value, onChange, disabled,
 * placeholder, aria-*, and other attributes pass through unchanged.
 */
export function Autocomplete({
  options,
  id,
  style,
  ...rest
}: AutocompleteProps): React.ReactElement {
  const listId = id !== undefined ? `datalist-${id}` : "datalist-autocomplete";

  const baseStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    background: BG_PAGE,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: BORDER,
    borderRadius: 6,
    color: TEXT_MAIN,
    fontSize: 14,
    fontFamily: FONT,
    boxSizing: "border-box",
    outline: "none",
  };

  return (
    <>
      <input
        type="text"
        id={id}
        list={listId}
        autoComplete="off"
        style={{ ...baseStyle, ...style }}
        {...rest}
      />
      <datalist id={listId}>
        {options.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
    </>
  );
}
