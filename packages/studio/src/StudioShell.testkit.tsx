// Shared harness for the StudioShell.*.test.tsx files: wizard-driving helpers
// and the common beforeEach/afterEach teardown. Not a test file.

import { afterEach, beforeAll, beforeEach, vi } from "vitest";
import { screen, fireEvent, cleanup, act } from "@testing-library/react";
import { render } from "./test/renderWithI18n.tsx";
import { ActiveStepNav } from "./test/ActiveStepNav.tsx";
import { SurveyView } from "./StudioShell.tsx";
import { resetInventoryDecisions } from "./survey/useInventoryDraft.ts";
import { artifactHoisted } from "./test/studioShellMocks/useKeyboardArtifact.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Drive the wizard from "identity" to "base": identity -> layout (spec 076 A4,
 * the real community-layout step; its suggestion is preselected, so confirming
 * is one click) -> choose_base.
 */
export function advanceToStart() {
  fireEvent.click(screen.getByTestId("survey-advance"));
  fireEvent.click(screen.getByTestId("layout-continue"));
}

/**
 * Drive from "identity" to "track" (identity → base → track).
 * Two SEPARATE fireEvent.click calls (preview, then confirm) — mirrors two
 * real user clicks with a render flush in between (preview-before-commit).
 */
export function advanceToTrack() {
  advanceToStart();
  fireEvent.click(screen.getByTestId("base-preview"));
  fireEvent.click(screen.getByTestId("base-confirm"));
}

/**
 * Drive from "identity" to "prefill" via the default Track 1 (Copy) path:
 * identity → base → track → attribution (#1901) → project-name → prefill.
 *
 * Track 2 (Adapt) skips project-name; tests that need that path should
 * click "track-adapt" instead (attribution still applies — it sits
 * before the fork).
 */
export function advanceToPrefill() {
  advanceToTrack();
  fireEvent.click(screen.getByTestId("track-copy"));
  // The attribution step's stub completes on survey-advance, like
  // project_name's — two advances now stand between track and prefill.
  fireEvent.click(screen.getByTestId("survey-advance"));
  fireEvent.click(screen.getByTestId("survey-advance"));
}

/**
 * Drive from "identity" to "B".
 * New order (issue #508): prefill-continue now goes directly to "B".
 */
export function advanceToB() {
  advanceToPrefill();
  fireEvent.click(screen.getByTestId("prefill-continue"));
}

/**
 * Drive from "identity" to "carve".
 * New order (issue #508): prefill → B → punctuation → carve — charlist-done
 * lands on the punctuation page via the marks step's S0 auto-skip (spec 071;
 * marks-free test alphabet); punctuation has no skip gate (zero punctuation is
 * a valid answer), so the walk accepts it empty; convenience then auto-skips.
 *
 * ASYNC since spec 059. The convenience step — the skip between punctuation and
 * carve — deliberately holds its gate until the CLDR/SLDR exemplar lookup
 * settles, and `useCarveNeededSet` only settles synchronously when there is NO
 * language to look up. Track 1 now carries the author's composed BCP47 tag into
 * the working copy (FR-001) — which is the point of that feature — so the
 * lookup genuinely runs and the walk from punctuation to carve is genuinely
 * asynchronous. Awaiting the landing stage is what that costs; asserting
 * synchronously here would only pass while Track 1 had no language at all.
 */
export async function advanceToCarve() {
  advanceToB();
  fireEvent.click(screen.getByTestId("charlist-done"));
  fireEvent.click(screen.getByTestId("punctuation-done"));
  completeInvisibles();
  await screen.findByTestId("stage-carve");
}

/**
 * Click through the invisible-characters page's Continue button (spec 075).
 * Like punctuation, it has no computed gate (FR-020: always renders), so it
 * appears synchronously right after punctuation is accepted; the walk
 * accepts it empty.
 */
export function completeInvisibles() {
  fireEvent.click(screen.getByTestId("invisibles-continue"));
}

/** Drive from "identity" to "deadkeys" (spec 083: between carve and mechanisms). */
export async function advanceToDeadkeys() {
  await advanceToCarve();
  fireEvent.click(screen.getByTestId("carve-continue"));
  await screen.findByTestId("stage-deadkeys");
}

/** Drive from "identity" to "rules" (spec 082: rules sits between deadkeys and mechanisms). */
export async function advanceToRules() {
  await advanceToDeadkeys();
  fireEvent.click(screen.getByTestId("deadkeys-continue"));
  await screen.findByTestId("rules-step");
}

/** Drive from "identity" to "mechanisms". */
export async function advanceToMechanisms() {
  await advanceToRules();
  fireEvent.click(screen.getByTestId("rules-continue"));
  await screen.findByTestId("stage-mechanisms");
}

/** Drive from "identity" to "touch_seed_source" (the seed-source fork chooser). */
export async function advanceToTouchSeedSource() {
  await advanceToMechanisms();
  fireEvent.click(screen.getByTestId("mechanisms-continue"));
}

/** Drive from "identity" to "F". */
export async function advanceToF() {
  await advanceToTouchSeedSource();
  // touch_seed_source fork (spec 035 R4/R12, no choice recorded yet on a fresh
  // walk) renders the mocked TouchSeedSourcePanel chooser; confirming it lands
  // on the real "touch" step (mocked TouchGallery stub, "touch-continue").
  fireEvent.click(screen.getByTestId("seed-source-confirm")); // touch_seed_source -> touch
  fireEvent.click(screen.getByTestId("touch-continue")); // touch -> F
}

/**
 * Registers the shared per-test setup/teardown for every StudioShell test file.
 * Call once at the top level of each file (hooks are per-file in vitest).
 */
export function installShellHooks(options: { warmLazySteps?: boolean } = {}): void {
  if (options.warmLazySteps) {
    // The Characters step (PhaseB) mounts behind a lazy boundary that resolves
    // once per module graph. In the original single file an earlier test that
    // awaited stage-B warmed it for every later test; a file whose first test
    // walks past it synchronously needs the same warm-up once, up front.
    beforeAll(async () => {
      await act(async () => {
        render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
      });
      advanceToPrefill();
      fireEvent.click(screen.getByTestId("prefill-continue"));
      await screen.findByTestId("stage-B");
      cleanup();
    });
  }

  beforeEach(() => {
    artifactHoisted.onInstantiateRef.current = null;
    artifactHoisted.stageSetters = [];
  });

  afterEach(() => {
    cleanup();
    // Spec 079 R-07: alphabetEvidenceKey / sticky decisions survive store.reset();
    // global test-setup only calls reset(), so clear them here.
    resetInventoryDecisions();
    vi.clearAllMocks();
    // The first-visit gate reads ks.visited / the ks.studio.draft key from
    // localStorage; clear it so gate state can't leak between tests.
    localStorage.clear();
  });
}
