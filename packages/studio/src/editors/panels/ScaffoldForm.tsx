// Form for creating a new keyboard from a base — Phase A "New from base" mode.
// Validates keyboardId live via validateKeyboardId from @keyboard-studio/contracts.

import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { validateKeyboardId } from "@keyboard-studio/contracts";
import type { ScaffoldSpec } from "../../hooks/useKeyboardArtifact.ts";
import { Button, TextField, Label, ErrorText } from "../../ui/index.ts";
import { CARD_BORDER, TEXT_DIM, FONT_MONO } from "../../ui/theme.ts";

export interface ScaffoldFormProps {
  /** Called when the user submits a valid (keyboardId, displayName) pair. */
  onSubmit: (spec: ScaffoldSpec) => void;
}

// Divergent label color — ScaffoldForm uses TEXT_DIM; Label primitive default is #e6edf3.
const SCAFFOLD_LABEL_STYLE: React.CSSProperties = { color: TEXT_DIM, fontSize: 12 };

// Divergent field border — ScaffoldForm uses CARD_BORDER; TextField primitive default is #30363d.
const SCAFFOLD_FIELD_BORDER: React.CSSProperties = { border: `1px solid ${CARD_BORDER}` };

export function ScaffoldForm({ onSubmit }: ScaffoldFormProps) {
  const { t } = useLingui();
  const [keyboardId, setKeyboardId] = useState("");
  const [displayName, setDisplayName] = useState("");

  const idValidation = validateKeyboardId(keyboardId.trim());
  const idError = idValidation.valid ? null : (idValidation.reason ?? t({ id: "editor.scaffold.invalidKeyboardId", message: "invalid keyboard id" }));
  const showIdError = idError !== null && keyboardId.length > 0;
  const isValid = idValidation.valid && displayName.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({ keyboardId: keyboardId.trim(), displayName: displayName.trim() });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        background: "var(--app-surface)",
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          // Divergent decorative eyebrow color — no --app-* semantic token
          // matches this purple; nearest brand tint is --sil-violet-40 (epic #533).
          color: "var(--sil-violet-40)",
          fontWeight: 700,
        }}
      >
        <Trans id="editor.scaffold.heading">New keyboard details</Trans>
      </div>

      {/* Keyboard ID field row */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {/* Label color TEXT_DIM diverges from primitive default var(--app-text) — style passthrough */}
        <Label htmlFor="scaffold-keyboard-id" style={SCAFFOLD_LABEL_STYLE}>
          <Trans id="editor.scaffold.keyboardIdLabel">Keyboard ID</Trans>
        </Label>
        {/* TextField: error prop sets ERROR_BORDER (var(--app-danger-border)) — matches original exactly.
            Normal border CARD_BORDER diverges from primitive default var(--app-border) — style passthrough. */}
        <TextField
          id="scaffold-keyboard-id"
          value={keyboardId}
          onChange={(e) => { setKeyboardId(e.currentTarget.value); }}
          placeholder={t({ id: "editor.scaffold.keyboardIdPlaceholder", message: "e.g. my_new_keyboard" })}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={showIdError ? "scaffold-id-error" : undefined}
          aria-invalid={showIdError}
          mono
          error={showIdError}
          style={
            showIdError
              ? { fontFamily: FONT_MONO }
              : { ...SCAFFOLD_FIELD_BORDER, fontFamily: FONT_MONO }
          }
        />
        {/* ErrorText tone="error" renders role="alert" + var(--app-danger-text) — matches original exactly.
            Outer div carries the aria-describedby target id; ErrorText has no id passthrough. */}
        {showIdError && (
          <div id="scaffold-id-error">
            <ErrorText tone="error">{idError}</ErrorText>
          </div>
        )}
      </div>

      {/* Display name field row */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {/* Label color TEXT_DIM diverges from primitive default var(--app-text) — style passthrough */}
        <Label htmlFor="scaffold-display-name" style={SCAFFOLD_LABEL_STYLE}>
          <Trans id="editor.scaffold.displayNameLabel">Display name</Trans>
        </Label>
        {/* Border CARD_BORDER diverges from primitive default var(--app-border) — style passthrough */}
        <TextField
          id="scaffold-display-name"
          value={displayName}
          onChange={(e) => { setDisplayName(e.currentTarget.value); }}
          placeholder={t({ id: "editor.scaffold.displayNamePlaceholder", message: "e.g. My New Keyboard" })}
          autoComplete="off"
          style={SCAFFOLD_FIELD_BORDER}
        />
      </div>

      {/* one-off: success-green submit — var(--app-success) */}
      <Button
        type="submit"
        variant="secondary"
        disabled={!isValid}
        style={{
          alignSelf: "flex-start",
          padding: "7px 16px",
          background: isValid ? "var(--app-success)" : "var(--app-surface)",
          color: isValid ? "var(--app-text)" : "var(--app-text-disabled)",
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 6,
          fontSize: 13,
          cursor: isValid ? "pointer" : "not-allowed",
          fontFamily: "inherit",
          transition: "background 0.15s",
        }}
      >
        <Trans id="editor.scaffold.createButton">Create keyboard</Trans>
      </Button>
    </form>
  );
}
