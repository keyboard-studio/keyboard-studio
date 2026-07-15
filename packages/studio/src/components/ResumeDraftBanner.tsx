// ResumeDraftBanner — offered on a page (re)load when a saved in-progress survey
// draft exists in localStorage (lib/draftAutosave.ts). The author explicitly
// chooses Resume (restore both stores from the draft) or Discard (clear it and
// start fresh). We never auto-apply a draft, so a stale draft can't silently
// clobber a new session.

import type { CSSProperties } from "react";
import type { DraftMeta } from "../lib/draftAutosave.ts";
import { relativeTime } from "../lib/relativeTime.ts";
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
  const isCloud = meta.source === "cloud";

  return (
    <div
      role="region"
      aria-label={isCloud ? "Restore keyboard from your account" : "Resume unfinished survey"}
      data-testid="resume-draft-banner"
      data-source={meta.source ?? "local"}
      style={bannerStyle}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>
          {isCloud ? `Restore ${name} from your account?` : `Resume ${name}?`}
        </div>
        <div style={{ color: TEXT_DIM, fontSize: 13 }}>
          {isCloud ? (
            <>
              You have an in-progress keyboard saved to your account (last saved{" "}
              {relativeTime(meta.savedAt)}, on the {stepLabel} step).
            </>
          ) : (
            <>
              You have an unfinished survey (last saved {relativeTime(meta.savedAt)}, on the{" "}
              {stepLabel} step).
            </>
          )}
        </div>
      </div>
      <button type="button" data-testid="resume-draft" style={primaryButton} onClick={onResume}>
        {isCloud ? "Restore" : "Resume"}
      </button>
      <button type="button" data-testid="discard-draft" style={discardButton} onClick={onDiscard}>
        Discard
      </button>
    </div>
  );
}
