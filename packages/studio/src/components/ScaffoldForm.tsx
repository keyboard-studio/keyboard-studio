// Form for creating a new keyboard from a base — Phase A "New from base" mode.
// Validates keyboardId live via validateKeyboardId from @keyboard-studio/contracts.

import { useState } from "react";
import { validateKeyboardId } from "@keyboard-studio/contracts";
import type { ScaffoldSpec } from "../hooks/useKeyboardArtifact.ts";

export interface ScaffoldFormProps {
  /** Called when the user submits a valid (keyboardId, displayName) pair. */
  onSubmit: (spec: ScaffoldSpec) => void;
}

export function ScaffoldForm({ onSubmit }: ScaffoldFormProps) {
  const [keyboardId, setKeyboardId] = useState("");
  const [displayName, setDisplayName] = useState("");

  const idError = validateKeyboardId(keyboardId.trim());
  const isValid = idError === null && displayName.trim().length > 0;

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

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label
          htmlFor="scaffold-keyboard-id"
          style={{
            fontSize: 12,
            color: "#9aa7b8",
            fontWeight: 600,
          }}
        >
          Keyboard ID
        </label>
        <input
          id="scaffold-keyboard-id"
          type="text"
          value={keyboardId}
          onChange={(e) => { setKeyboardId(e.currentTarget.value); }}
          placeholder="e.g. my_new_keyboard"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={idError !== null && keyboardId.length > 0 ? "scaffold-id-error" : undefined}
          aria-invalid={idError !== null && keyboardId.length > 0}
          style={{
            background: "#0d1117",
            color: "#e6edf3",
            border: `1px solid ${idError !== null && keyboardId.length > 0 ? "#7a2a2a" : "#283040"}`,
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 13,
            fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
            outline: "none",
          }}
        />
        {idError !== null && keyboardId.length > 0 && (
          <div
            id="scaffold-id-error"
            role="alert"
            style={{ fontSize: 12, color: "#f0a0a0", lineHeight: 1.4 }}
          >
            {idError}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label
          htmlFor="scaffold-display-name"
          style={{
            fontSize: 12,
            color: "#9aa7b8",
            fontWeight: 600,
          }}
        >
          Display name
        </label>
        <input
          id="scaffold-display-name"
          type="text"
          value={displayName}
          onChange={(e) => { setDisplayName(e.currentTarget.value); }}
          placeholder="e.g. My New Keyboard"
          autoComplete="off"
          style={{
            background: "#0d1117",
            color: "#e6edf3",
            border: "1px solid #283040",
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 13,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      </div>

      <button
        type="submit"
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
      </button>
    </form>
  );
}
