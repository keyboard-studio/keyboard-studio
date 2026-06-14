// TrackStep — wizard stage that lets the author choose Track 1 (Copy) or
// Track 2 (Adapt) for their selected base keyboard. Rendered after BaseResolution
// confirms a base, before the project-name step (Track 1) or prefill (Track 2).
// spec §8 v1.3.0: two authoring tracks.

import { useState } from "react";
import type { BaseKeyboard } from "@keyboard-studio/contracts";

export type Track = "copy" | "adapt";

export interface TrackStepProps {
  base: BaseKeyboard;
  onNext: (track: Track) => void;
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

const CARD_BASE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "12px 16px",
  background: "#161b22",
  border: "1px solid #30363d",
  borderRadius: 8,
  color: "#e6edf3",
  fontSize: 14,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box" as const,
  transition: "border-color 120ms ease, background 120ms ease",
};

const CARD_SELECTED: React.CSSProperties = {
  ...CARD_BASE,
  border: "1px solid #6ea8fe",
  background: "#0d1f38",
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

export function TrackStep({ base, onNext, onBack }: TrackStepProps) {
  const [track, setTrack] = useState<Track | null>(null);

  function handleNext() {
    if (track !== null) onNext(track);
  }

  return (
    <div style={{ color: "#e6edf3", fontFamily: "system-ui, sans-serif" }}>
      <h2 style={HEADING}>How do you want to use this base?</h2>
      <p style={SUBTLE}>
        You chose <strong>{base.displayName}</strong>. Pick how you want to work with it.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        <button
          type="button"
          role="radio"
          aria-checked={track === "copy"}
          onClick={() => setTrack("copy")}
          style={track === "copy" ? CARD_SELECTED : CARD_BASE}
        >
          <span style={{ fontWeight: 600, fontSize: 14 }}>Copy</span>
          <span style={{ fontSize: 12, color: "#8b949e" }}>
            Start a new keyboard based on this layout. You&apos;ll give it a new name and ID.
          </span>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={track === "adapt"}
          onClick={() => setTrack("adapt")}
          style={track === "adapt" ? CARD_SELECTED : CARD_BASE}
        >
          <span style={{ fontWeight: 600, fontSize: 14 }}>Adapt</span>
          <span style={{ fontSize: 12, color: "#8b949e" }}>
            Modify this keyboard in place, keeping its name and ID.
          </span>
        </button>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          disabled={track === null}
          onClick={handleNext}
          style={track !== null ? NEXT_BTN_ENABLED : NEXT_BTN_DISABLED}
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
