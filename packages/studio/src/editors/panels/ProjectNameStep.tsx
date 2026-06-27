// ProjectNameStep — wizard stage for Track 1 (Copy) where the author names
// their new keyboard. Pre-fills with the language autonym; derives a keyboardId
// slug live as the user types. "Next" is blocked while the derived id is invalid.
// spec §8 v1.3.0, Track 1.

import { useState, useMemo } from "react";
import { slugifyKeyboardId, validateKeyboardId } from "@keyboard-studio/contracts";
import { Button, TextField, Label } from "../../ui/index.ts";

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

// SLUG_LINE_VALID: #8b949e + monospace — kept inline; color does not match any
// ErrorText tone (hint = var(--app-text-muted) = #aebcd6).
const SLUG_LINE_VALID: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: "#8b949e",
  fontFamily: "monospace",
};

// one-off: slug-validation color #f85149 (research Decision 1)
const SLUG_LINE_ERROR: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: "#f85149",
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
        {/* Label base color is #e6edf3; LABEL_STYLE used #8b949e — pass through. */}
        <Label htmlFor="project-display-name" style={{ color: "#8b949e", fontWeight: "normal" }}>
          Display name
        </Label>
        <TextField
          id="project-display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
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
        <Button
          variant="primary"
          disabled={!isValid}
          onClick={handleNext}
          aria-disabled={!isValid}
        >
          Next
        </Button>
      </div>

      <Button variant="back" onClick={onBack}>
        {"←"} Back
      </Button>
    </div>
  );
}
