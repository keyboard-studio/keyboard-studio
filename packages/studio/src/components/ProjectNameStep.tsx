// ProjectNameStep — wizard stage for Track 1 (Copy) where the author names
// their new keyboard. Pre-fills with the language autonym; derives a keyboardId
// slug live as the user types. "Next" is blocked while the derived id is invalid.
// spec §8 v1.3.0, Track 1.

import { useState, useMemo } from "react";
import { slugifyKeyboardId, validateKeyboardId } from "@keyboard-studio/contracts";

export interface ProjectNameStepProps {
  /** Default display name — autonym from identity_lite (il_language_autonym). */
  defaultDisplayName: string;
  onNext: (displayName: string, keyboardId: string) => void;
  onBack: () => void;
}

const HEADING: React.CSSProperties = {
  margin: "0 0 8px 0",
  fontSize: "1.1rem",
  color: "#6ea8fe",
  fontWeight: 600,
};

const SUBTLE: React.CSSProperties = {
  margin: "0 0 20px 0",
  fontSize: 13,
  color: "#8b949e",
};

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "#8b949e",
  marginBottom: 6,
};

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "8px 10px",
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 6,
  color: "#e6edf3",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
};

const SLUG_LINE_VALID: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: "#8b949e",
  fontFamily: "monospace",
};

const SLUG_LINE_ERROR: React.CSSProperties = {
  ...SLUG_LINE_VALID,
  color: "#f85149",
  fontFamily: "inherit",
};

const BACK_BTN: React.CSSProperties = {
  marginTop: 20,
  padding: "6px 14px",
  background: "transparent",
  border: "1px solid #30363d",
  borderRadius: 6,
  color: "#8b949e",
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};

const NEXT_BTN_DISABLED: React.CSSProperties = {
  padding: "8px 18px",
  background: "transparent",
  border: "1px solid #30363d",
  borderRadius: 6,
  color: "#484f58",
  fontSize: 13,
  cursor: "not-allowed",
  fontFamily: "inherit",
};

const NEXT_BTN_ENABLED: React.CSSProperties = {
  padding: "8px 18px",
  background: "#1f6feb",
  border: "1px solid #1f6feb",
  borderRadius: 6,
  color: "#fff",
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};

export function ProjectNameStep({
  defaultDisplayName,
  onNext,
  onBack,
}: ProjectNameStepProps) {
  const [displayName, setDisplayName] = useState(defaultDisplayName);

  const derivedId = useMemo(() => slugifyKeyboardId(displayName), [displayName]);
  const validation = useMemo(() => validateKeyboardId(derivedId), [derivedId]);
  const isValid = validation.valid;

  function handleNext() {
    if (isValid) onNext(displayName, derivedId);
  }

  return (
    <div style={{ color: "#e6edf3", fontFamily: "system-ui, sans-serif" }}>
      <h2 style={HEADING}>Name your keyboard</h2>
      <p style={SUBTLE}>
        Give your new keyboard a display name. The keyboard ID will be derived automatically.
      </p>

      <div style={{ marginBottom: 20 }}>
        <label htmlFor="project-display-name" style={LABEL_STYLE}>
          Display name
        </label>
        <input
          id="project-display-name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          style={INPUT_STYLE}
          autoComplete="off"
          spellCheck={false}
          aria-describedby="project-id-hint"
        />

        <div
          id="project-id-hint"
          style={isValid ? SLUG_LINE_VALID : SLUG_LINE_ERROR}
          aria-live="polite"
        >
          {isValid
            ? `Will be saved as: ${derivedId}`
            : validation.reason ?? "Invalid keyboard ID"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          disabled={!isValid}
          onClick={handleNext}
          style={isValid ? NEXT_BTN_ENABLED : NEXT_BTN_DISABLED}
          aria-disabled={!isValid}
        >
          Next
        </button>
      </div>

      <button type="button" onClick={onBack} style={BACK_BTN}>
        {"←"} Back
      </button>
    </div>
  );
}
