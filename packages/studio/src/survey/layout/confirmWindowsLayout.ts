// confirmWindowsLayout — what Continue does on the layout step, lifted out of
// LayoutStepHost (spec 107 FR-040) so the UI and the headless author complete
// the step the same way.
//
// Continue on an untouched suggestion records the proposal as confirmed (through
// the host's record+apply path, like every renderer change); Continue after a
// pick records nothing more — the pick was already recorded when it happened.
// Either way the step is marked finished.

import type { Decision } from "../../decisions/decisionTypes.ts";
import { decideGalleryValue, type GalleryHostDeps } from "../../steps/galleryHost.tsx";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { LAYOUT_FAMILY_STEP_ID } from "../../lib/layoutFamily.ts";
import windowsLayoutModule from "../questions/gallery/windowsLayout.ts";
import type { WindowsLayoutValue } from "../questions/gallery/windowsLayout.ts";

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
  useSurveyAnswerStore.getState().setStatus(LAYOUT_FAMILY_STEP_ID, { kind: "finished" });
}
