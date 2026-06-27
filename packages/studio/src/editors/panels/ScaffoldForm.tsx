// Form for creating a new keyboard from a base — Phase A "New from base" mode.
// Validates keyboardId live via validateKeyboardId from @keyboard-studio/contracts.

import { useState } from "react";
import { validateKeyboardId } from "@keyboard-studio/contracts";
import type { ScaffoldSpec } from "../../hooks/useKeyboardArtifact.ts";
import { Button, TextField, Label, ErrorText } from "../../ui/index.ts";

export interface ScaffoldFormProps {
  /** Called when the user submits a valid (keyboardId, displayName) pair. */
  onSubmit: (spec: ScaffoldSpec) => void;
}

// Divergent label color — ScaffoldForm uses #9aa7b8; Label primitive default is #e6edf3.
const SCAFFOLD_LABEL_STYLE: React.CSSProperties = { color: "#9aa7b8", fontSize: 12 };

// Divergent field border — ScaffoldForm uses #283040; TextField primitive default is #30363d.
const SCAFFOLD_FIELD_BORDER: React.CSSProperties = { border: "1px solid #283040" };

// Divergent mono font stack — original uses this literal; var(--app-font-mono) resolves
// to a different stack. Preserved exactly via fontFamily style override on keyboard-id input.
const SCAFFOLD_MONO_FONT = "ui-monospace, 'Cascadia Code', Consolas, monospace";

export function ScaffoldForm({ onSubmit }: ScaffoldFormProps) {
  const [keyboardId, setKeyboardId] = useState("");
  const [displayName, setDisplayName] = useState("");

  const idValidation = validateKeyboardId(keyboardId.trim());
  const idError = idValidation.valid ? null : (idValidation.reason ?? "invalid keyboard id");
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
        background: "#161b22",
        border: "1px solid #283040",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#d2a8ff",
          fontWeight: 700,
        }}
      >
        New keyboard details
      </div>

      {/* Keyboard ID field row */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {/* Label color #9aa7b8 diverges from primitive default #e6edf3 — style passthrough */}
        <Label htmlFor="scaffold-keyboard-id" style={SCAFFOLD_LABEL_STYLE}>
          Keyboard ID
        </Label>
        {/* TextField: error prop sets ERROR_BORDER #7a2a2a (matches original #7a2a2a exactly).
            Normal border #283040 diverges from primitive default #30363d — style passthrough. */}
        <TextField
          id="scaffold-keyboard-id"
          value={keyboardId}
          onChange={(e) => { setKeyboardId(e.currentTarget.value); }}
          placeholder="e.g. my_new_keyboard"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={showIdError ? "scaffold-id-error" : undefined}
          aria-invalid={showIdError}
          mono
          error={showIdError}
          style={
            showIdError
              ? { fontFamily: SCAFFOLD_MONO_FONT }
              : { ...SCAFFOLD_FIELD_BORDER, fontFamily: SCAFFOLD_MONO_FONT }
          }
        />
        {/* ErrorText tone="error" renders role="alert" + #f0a0a0 — matches original exactly.
            Outer div carries the aria-describedby target id; ErrorText has no id passthrough. */}
        {showIdError && (
          <div id="scaffold-id-error">
            <ErrorText tone="error">{idError}</ErrorText>
          </div>
        )}
      </div>

      {/* Display name field row */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {/* Label color #9aa7b8 diverges from primitive default #e6edf3 — style passthrough */}
        <Label htmlFor="scaffold-display-name" style={SCAFFOLD_LABEL_STYLE}>
          Display name
        </Label>
        {/* Border #283040 diverges from primitive default #30363d — style passthrough */}
        <TextField
          id="scaffold-display-name"
          value={displayName}
          onChange={(e) => { setDisplayName(e.currentTarget.value); }}
          placeholder="e.g. My New Keyboard"
          autoComplete="off"
          style={SCAFFOLD_FIELD_BORDER}
        />
      </div>

      {/* one-off: success-green submit #238636 */}
      <Button
        type="submit"
        variant="secondary"
        disabled={!isValid}
        style={{
          alignSelf: "flex-start",
          padding: "7px 16px",
          background: isValid ? "#238636" : "#161b22",
          color: isValid ? "#e6edf3" : "#484f58",
          border: "1px solid #283040",
          borderRadius: 6,
          fontSize: 13,
          cursor: isValid ? "pointer" : "not-allowed",
          fontFamily: "inherit",
          transition: "background 0.15s",
        }}
      >
        Create keyboard
      </Button>
    </form>
  );
}
