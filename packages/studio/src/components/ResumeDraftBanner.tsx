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
import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { I18n } from "@lingui/core";
import type { DraftMeta } from "../lib/draftPersistence.ts";
import { relativeTime, type RelativeTimeValue } from "../lib/relativeTime.ts";
import { BG_CARD, BORDER, TEXT_MAIN, TEXT_DIM, BLUE_ACTION, FONT } from "../survey/surveyStyles.ts";

// Friendly labels for the step the draft was left on, as lazy msg()
// descriptors resolved per-render below.
const STEP_LABELS: Record<DraftMeta["activeStepId"], MessageDescriptor> = {
  identity: msg({ id: "resumeDraft.steps.identity", message: "language identity" }),
  layout: msg({ id: "resumeDraft.steps.layout", message: "community keyboard layout" }),
  choose_base: msg({ id: "resumeDraft.steps.chooseBase", message: "choosing a starting keyboard" }),
  track: msg({ id: "resumeDraft.steps.track", message: "authoring track" }),
  attribution: msg({ id: "resumeDraft.steps.attribution", message: "author & copyright" }),
  project_name: msg({ id: "resumeDraft.steps.projectName", message: "project name" }),
  open_languages: msg({ id: "resumeDraft.steps.openLanguages", message: "languages" }),
  open_missing_letters: msg({ id: "resumeDraft.steps.openMissingLetters", message: "letters" }),
  open_upgrades: msg({ id: "resumeDraft.steps.openUpgrades", message: "upgrades" }),
  characters: msg({ id: "resumeDraft.steps.characters", message: "characters" }),
  marks: msg({ id: "resumeDraft.steps.marks", message: "combining marks" }),
  punctuation: msg({ id: "resumeDraft.steps.punctuation", message: "punctuation" }),
  invisibles: msg({ id: "resumeDraft.steps.invisibles", message: "invisible characters" }),
  convenience: msg({ id: "resumeDraft.steps.convenience", message: "convenience letters" }),
  carve: msg({ id: "resumeDraft.steps.carve", message: "carve" }),
  deadkeys: msg({ id: "resumeDraft.steps.deadkeys", message: "deadkeys" }),
  rules: msg({ id: "resumeDraft.steps.rules", message: "rules" }),
  mechanisms: msg({ id: "resumeDraft.steps.mechanisms", message: "mechanisms" }),
  fallback_policy: msg({ id: "resumeDraft.steps.fallbackPolicy", message: "fallback policy for undefined keys" }),
  osk: msg({ id: "resumeDraft.steps.osk", message: "on-screen keyboard" }),
  touch_seed_source: msg({ id: "resumeDraft.steps.touchSeedSource", message: "touch starting point" }),
  touch: msg({ id: "resumeDraft.steps.touch", message: "touch layout" }),
  css: msg({ id: "editor.assignLoop.css.title", message: "Custom CSS" }),
  help: msg({ id: "resumeDraft.steps.help", message: "help & docs" }),
  html: msg({ id: "editor.assignLoop.html.title", message: "Documentation" }),
  icon: msg({ id: "editor.assignLoop.icon.title", message: "Keyboard icon" }),
  done: msg({ id: "resumeDraft.steps.done", message: "the final step" }),
  unsupported: msg({ id: "resumeDraft.steps.unsupported", message: "an unsupported script" }),
};

// relativeTime() returns a structured {unit, count} so i18n'd consumers can
// plural-select per locale; this banner resolves the same units through
// Lingui ICU plurals. Descriptors are module-level msg() calls (not t() calls
// inside the helper) so `lingui extract` picks them up — the extractor cannot
// follow the `t` binding into a helper that receives it as a parameter.
const RELATIVE_TIME_MSGS = {
  now: msg({ id: "resumeDraft.relativeTime.now", message: "just now" }),
  minute: msg({
    id: "resumeDraft.relativeTime.minutesAgo",
    message: "{count, plural, one {# minute ago} other {# minutes ago}}",
  }),
  hour: msg({
    id: "resumeDraft.relativeTime.hoursAgo",
    message: "{count, plural, one {# hour ago} other {# hours ago}}",
  }),
  day: msg({
    id: "resumeDraft.relativeTime.daysAgo",
    message: "{count, plural, one {# day ago} other {# days ago}}",
  }),
} as const;

/** Resolve a module-level msg() descriptor with values (the macro `t` can't take values). */
function tr(i18n: I18n, descriptor: MessageDescriptor, values?: Record<string, unknown>): string {
  return i18n._(descriptor.id, values);
}

function relativeTimeLabel(v: RelativeTimeValue, i18n: I18n): string {
  return tr(i18n, RELATIVE_TIME_MSGS[v.unit], { count: v.count });
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
  const { t, i18n } = useLingui();
  const stepLabel = t(STEP_LABELS[meta.activeStepId]) ?? meta.activeStepId;
  const name =
    meta.label !== null
      ? `"${meta.label}"`
      : t({ id: "resumeDraft.name.fallback", message: "your keyboard" });
  const savedAgo = relativeTimeLabel(relativeTime(meta.savedAt), i18n);

  return (
    <div
      role="region"
      aria-label={t({ id: "resumeDraft.region.ariaLabel", message: "Restore keyboard from your account" })}
      data-testid="resume-draft-banner"
      data-source="cloud"
      style={bannerStyle}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>
          <Trans id="resumeDraft.heading">Restore {name} from your account?</Trans>
        </div>
        <div style={{ color: TEXT_DIM, fontSize: 13 }}>
          <Trans id="resumeDraft.body">
            You have an in-progress keyboard saved to your account (last saved {savedAgo}, on the{" "}
            {stepLabel} step).
          </Trans>
        </div>
      </div>
      <button type="button" data-testid="resume-draft" style={primaryButton} onClick={onResume}>
        <Trans id="resumeDraft.restore">Restore</Trans>
      </button>
      <button type="button" data-testid="discard-draft" style={discardButton} onClick={onDiscard}>
        <Trans id="resumeDraft.discard">Discard</Trans>
      </button>
    </div>
  );
}
