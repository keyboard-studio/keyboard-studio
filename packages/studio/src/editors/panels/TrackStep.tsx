// TrackStep — wizard stage that lets the author choose Track 1 (Copy) or
// Track 2 (Adapt) for their selected base keyboard. Rendered after BaseResolution
// confirms a base, before the project-name step (Track 1) or prefill (Track 2).
// spec §8 v1.3.0: two authoring tracks.

import { useState } from "react";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { Button, Card } from "../../ui/index.ts";

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
        <Card
          selected={track === "copy"}
          role="radio"
          aria-checked={track === "copy"}
          data-testid="track-copy"
          onClick={() => setTrack("copy")}
        >
          <span style={{ fontWeight: 600, fontSize: 14 }}>Copy</span>
          <span style={{ fontSize: 12, color: "#8b949e" }}>
            Start a new keyboard based on this layout. You&apos;ll give it a new name and ID.
          </span>
        </Card>

        <Card
          selected={track === "adapt"}
          role="radio"
          aria-checked={track === "adapt"}
          onClick={() => setTrack("adapt")}
        >
          <span style={{ fontWeight: 600, fontSize: 14 }}>Adapt</span>
          <span style={{ fontSize: 12, color: "#8b949e" }}>
            Modify this keyboard in place, keeping its name and ID.
          </span>
        </Card>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Button
          variant="primary"
          disabled={track === null}
          data-testid="track-next"
          onClick={handleNext}
        >
          Next
        </Button>
      </div>

      <Button variant="back" data-testid="track-back" onClick={onBack}>
        {"←"} Back
      </Button>
    </div>
  );
}
