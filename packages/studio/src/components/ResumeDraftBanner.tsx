// ResumeDraftBanner — offered when a server-backed draft is found for a
// signed-in author with no local trace of it on this browser (a new tab / a
// different device; lib/draftPersistence.ts's cloud-restore check). The
// author explicitly chooses Resume (restore both stores from the draft) or
// Discard (drop the server-side draft and continue fresh). We never
// auto-apply a draft, so a stale draft can't silently clobber a new session.
//
// #1451: this banner used to ALSO offer a same-browser local draft (from the
// since-retired draftAutosave.ts engine) — draftPersistence's own silent
// boot-time restore is the one local-resume path now, so that offer is gone;
// the cloud case above is the only one left. Cloud-only per #1451's own
// consolidation: the sole caller (StudioShell.tsx's `cloudResume` state) only
// ever constructs `meta` via `serverMetaToDraftMeta`, which hardcodes
// `source: "cloud"` — so the local-copy branch this component used to carry
// alongside the cloud copy was unreachable dead code, removed here rather
// than left to drift from a caller that can never invoke it.

import type { CSSProperties } from "react";
import type { DraftMeta } from "../lib/draftPersistence.ts";
import { relativeTime, type RelativeTimeValue } from "../lib/relativeTime.ts";
import { BG_CARD, BORDER, TEXT_MAIN, TEXT_DIM, BLUE_ACTION, FONT } from "../survey/surveyStyles.ts";

// Friendly labels for the step the draft was left on.
const STEP_LABELS: Record<DraftMeta["activeStepId"], string> = {
  identity: "language identity",
  choose_base: "choosing a base keyboard",
  track: "authoring track",
  project_name: "project name",
  characters: "characters",
  marks: "combining marks",
  punctuation: "punctuation",
  convenience: "convenience letters",
  carve: "carve",
  mechanisms: "mechanisms",
  touch_seed_source: "touch starting point",
  touch: "touch layout",
  help: "help & docs",
  done: "the final step",
  unsupported: "an unsupported script",
};

// relativeTime() returns a structured {unit, count} so i18n'd consumers
// (MyKeyboardsList) can plural-select per locale; this banner is not yet
// Lingui-ized, so it formats the same English strings the pre-extraction
// helper produced.
function relativeTimeLabel(v: RelativeTimeValue): string {
  switch (v.unit) {
    case "now":
      return "just now";
    case "minute":
      return `${v.count} minute${v.count === 1 ? "" : "s"} ago`;
    case "hour":
      return `${v.count} hour${v.count === 1 ? "" : "s"} ago`;
    case "day":
      return `${v.count} day${v.count === 1 ? "" : "s"} ago`;
  }
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
  color: "var(--app-text-on-accent)",
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
      aria-label="Restore keyboard from your account"
      data-testid="resume-draft-banner"
      data-source="cloud"
      style={bannerStyle}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{`Restore ${name} from your account?`}</div>
        <div style={{ color: TEXT_DIM, fontSize: 13 }}>
          You have an in-progress keyboard saved to your account (last saved{" "}
          {relativeTimeLabel(relativeTime(meta.savedAt))}, on the {stepLabel} step).
        </div>
      </div>
      <button type="button" data-testid="resume-draft" style={primaryButton} onClick={onResume}>
        Restore
      </button>
      <button type="button" data-testid="discard-draft" style={discardButton} onClick={onDiscard}>
        Discard
      </button>
    </div>
  );
}
