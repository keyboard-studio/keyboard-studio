// Raw U+XXXX entry — the "all options" escape hatch's rendered form + inline
// error. Pure/controlled: all state (the input value, the parse error) lives
// in CharacterMapPane; this component only renders it and forwards events.
// See rawCodepointEntry.ts for the accepted-format parsing this form submits
// into (via the parent's onSubmit).

import type { FormEvent } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { TextField } from "../../ui/index.ts";
import { ERROR_RED, TEXT_DIM, primaryButton } from "../surveyStyles.ts";

export interface RawCodepointEntryProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  error: string | null;
}

export function RawCodepointEntry({ value, onChange, onSubmit, error }: RawCodepointEntryProps) {
  const { t } = useLingui();
  return (
    <>
      <form
        onSubmit={onSubmit}
        style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 160px" }}>
          <label htmlFor="char-map-raw-codepoint" style={{ fontSize: 11, color: TEXT_DIM }}>
            <Trans id="survey.characterMapPane.rawInput.label">Add any character by code point</Trans>
          </label>
          <TextField
            id="char-map-raw-codepoint"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="U+1E900"
            aria-label={t({
              id: "survey.characterMapPane.rawInput.ariaLabel",
              message: "Add a character by Unicode code point",
            })}
            aria-describedby={error !== null ? "char-map-raw-codepoint-error" : undefined}
          />
        </div>
        <button type="submit" disabled={value.trim() === ""} style={primaryButton(value.trim() === "")}>
          <Trans id="survey.characterMapPane.rawInput.addButton">Add</Trans>
        </button>
      </form>
      {error !== null && (
        <div id="char-map-raw-codepoint-error" role="alert" style={{ fontSize: 12, color: ERROR_RED }}>
          {error}
        </div>
      )}
    </>
  );
}
