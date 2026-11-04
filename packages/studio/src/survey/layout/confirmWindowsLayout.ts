// confirmWindowsLayout — what Continue does on the layout step, lifted out of
// LayoutStepHost (spec 107 FR-040) so the UI and the headless author complete
// the step the same way.
//
// Continue on an untouched suggestion records the proposal as confirmed (through
// the host's record+apply path, like every renderer change); Continue after a
// pick records nothing more — the pick was already recorded when it happened.
// Either way the step is marked finished. A cased alphabet whose caps-handling
// default was never seeded (no live extraction ran) is recorded here as the
// studio's "default", so Continue never leaves the question silently open.

import type { CapsHandlingValue, Decision } from "../../decisions/decisionTypes.ts";
import { decideGalleryValue, type GalleryHostDeps } from "../../steps/galleryHost.tsx";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { LAYOUT_FAMILY_STEP_ID } from "../../lib/layoutFamily.ts";
import windowsLayoutModule from "../questions/gallery/windowsLayout.ts";
import capsHandlingModule from "../questions/gallery/capsHandling.ts";
import { alphabetOf, isCasedAlphabet } from "../caps/capsLogic.ts";
import type { WindowsLayoutValue } from "../questions/gallery/windowsLayout.ts";

/**
 * Record caps handling as the studio's "default" (cased keys) when the
 * confirmed alphabet is cased and no caps-handling decision exists yet. A Copy
 * author confirms the layout before the alphabet exists, so the characters
 * step calls this too; without it the decision (and the companion pre-accept
 * and `&CasedKeys` store that depend on it) would never be recorded there.
 */
export function seedCapsHandlingDefault(deps: GalleryHostDeps): void {
  const decisions = deps.getDecisions();
  if (
    decisions["caps-handling"] === undefined &&
    isCasedAlphabet(alphabetOf(decisions["character-inventory"]?.value))
  ) {
    decideGalleryValue<CapsHandlingValue>(
      capsHandlingModule,
      { mode: "cased-keys" },
      { provenance: "default" },
      LAYOUT_FAMILY_STEP_ID,
      deps,
    );
  }
}

/**
 * @param record The recorded `windows-layout` decision, if the author already picked.
 * @param proposedLayoutId The layout the studio proposed for the identity tag.
 */
export function confirmWindowsLayout(
  record: Decision | undefined,
  proposedLayoutId: string,
  deps: GalleryHostDeps,
): void {
  if (record === undefined) {
    decideGalleryValue<WindowsLayoutValue>(
      windowsLayoutModule,
      { layoutIds: [proposedLayoutId], origin: "confirmed" },
      { provenance: "asked" },
      LAYOUT_FAMILY_STEP_ID,
      deps,
    );
  }
  seedCapsHandlingDefault(deps);
  useSurveyAnswerStore.getState().setStatus(LAYOUT_FAMILY_STEP_ID, { kind: "finished" });
}
