// ResumeDraftBanner — offered on a page (re)load when a saved in-progress survey
// draft exists in localStorage (lib/draftAutosave.ts). The author explicitly
// chooses Resume (restore both stores from the draft) or Discard (clear it and
// start fresh). We never auto-apply a draft, so a stale draft can't silently
// clobber a new session.

import type { CSSProperties } from "react";
import type { DraftMeta } from "../lib/draftAutosave.ts";
import { BG_CARD, BORDER, TEXT_MAIN, TEXT_DIM, BLUE_ACTION, FONT } from "../survey/surveyStyles.ts";

// Friendly labels for the step the draft was left on.
const STEP_LABELS: Record<DraftMeta["activeStepId"], string> = {
  identity: "language identity",
  choose_base: "choosing a base keyboard",
  track: "authoring track",
  project_name: "project name",
  characters: "characters",
  carve: "carve",
  mechanisms: "mechanisms",
  touch: "touch layout",
  help: "help & docs",
  done: "the final step",
  unsupported: "an unsupported script",
};

/** Coarse relative-time label ("just now", "3 hours ago", "2 days ago"). */
function relativeTime(savedAt: number): string {
  const secs = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export interface ResumeDraftBannerProps {
  meta: DraftMeta;
  onResume: () => void;
  onDiscard: () => void;
}

const bannerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "12px 16px",
  marginBottom: 16,
  background: BG_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  color: TEXT_MAIN,
  fontFamily: FONT,
};

const primaryButton: CSSProperties = {
  padding: "6px 14px",
  background: BLUE_ACTION,
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 14,
};

const discardButton: CSSProperties = {
  padding: "6px 14px",
  background: "transparent",
  color: TEXT_DIM,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 14,
};

export function ResumeDraftBanner({ meta, onResume, onDiscard }: ResumeDraftBannerProps) {
  const stepLabel = STEP_LABELS[meta.activeStepId] ?? meta.activeStepId;
  const name = meta.label !== null ? `"${meta.label}"` : "your keyboard";

  return (
    <div
      role="region"
      aria-label="Resume unfinished survey"
      data-testid="resume-draft-banner"
      style={bannerStyle}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>
          Resume {name}?
        </div>
        <div style={{ color: TEXT_DIM, fontSize: 13 }}>
          You have an unfinished survey (last saved {relativeTime(meta.savedAt)}, on the{" "}
          {stepLabel} step).
        </div>
      </div>
      <button type="button" data-testid="resume-draft" style={primaryButton} onClick={onResume}>
        Resume
      </button>
      <button type="button" data-testid="discard-draft" style={discardButton} onClick={onDiscard}>
        Discard
      </button>
    </div>
  );
}
