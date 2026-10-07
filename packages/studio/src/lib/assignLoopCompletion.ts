// assignLoopCompletion — the assign-loop steps' completion effects
// (spec 090 T041/T042, execution shape D-090-38).
//
// Until US4, these effects lived in steps/reducer.ts as the R1 (lock
// gate) and R2 (touch-layout build) completion hooks. They are not
// decision `apply` work — 089's WorkingCopyPatch has no channel for
// the `desktopLocked` flag, the serialized touch-layout JSON, or the
// staleness-driven re-propagation — so when the mechanisms/touch
// steps became decision modules, the effects re-homed here: plain
// store-driven functions in the lib layer, fired by each step's
// completion wiring. The decision RECORDING is not here — the
// adapters record their step's decision on completion (the
// editor-step precedent: CarveAdapter, DeadkeyAdapter); these
// functions carry only the non-decision effects, so both completion
// paths can share them:
//
//   - the live path: AddPhysicalAdapter / AddTouchAdapter call them
//     from their onComplete wrappers, after recording;
//   - the replay path: survey/journey-runner.ts calls them in place
//     of its former applyStepCompletion("mechanisms" / "touch", …)
//     calls, which reached the same effects through the reducer.

import type {
  KeyboardIR,
  TouchAssignment,
  VirtualFS,
} from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import type { DesktopModifications } from "@keyboard-studio/engine";
import { repropagate } from "../steps/repropagate.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { buildTouchLayoutJson } from "./buildTouchLayoutJson.ts";
import { resolveBaseTouchJson } from "./resolveBaseTouchJson.ts";
import {
  resolveTouchSeedSource,
  shouldEmitTouchLayout,
} from "./touchEmission.ts";

/**
 * R1 — the mechanisms (physical-layout) completion effects, in the
 * reducer hook's exact order: lock the desktop layout, then run the
 * spec-014 touch re-propagation over the staleness closure
 * (no-clobber: suggested touch keys refresh, hand-set keys survive;
 * an empty closure is a no-op, R5). The reducer gated the
 * re-propagation on its injected deps being present; the store
 * accessors here always exist, and repropagate itself owns the
 * empty-closure short-circuit, so the behaviour is unchanged.
 */
export function applyPhysicalCompletionEffects(): void {
  useWorkingCopyStore.getState().lockDesktop();
  repropagate({
    staleSteps: useWorkingCopyStore.getState().staleSteps,
    getWorkingIR: () => useWorkingCopyStore.getState().ir,
    setWorkingIR: (next) => useWorkingCopyStore.getState().setWorkingIR(next),
  });
}

/**
 * The touch step's completion payload (moved from steps/reducer.ts
 * at T042 with the R2 hook): everything the touch-layout build
 * needs, assembled by the step's adapter (AddTouchAdapter) — or by
 * journey-runner's replay — from the working copy at completion.
 */
export interface TouchCompleteResult {
  /** Non-inherited touch assignments from Phase E (pre-filtered by TouchGallery). */
  assignments: TouchAssignment[];
  /** The base IR at lock time (post-lockDesktop snapshot). */
  baseIr: KeyboardIR | null;
  /** The base VFS (for resolving the shipped .keyman-touch-layout, if any). */
  baseVfs: VirtualFS | null;
  /**
   * Desktop modifications to replay onto the touch seed (spec 035 R3) — carve
   * removals + Phase C individual letter placements. Computed by the touch
   * step's adapter (AddTouchAdapter) via deriveDesktopModifications.
   * Optional so existing/mocked callers that don't care about the replay
   * can omit it — the effects default to the empty (no-op) modifications.
   */
  mods?: DesktopModifications;
  /**
   * The author's raw touch_seed_source fork choice (spec 035 FR-006), or null
   * if the fork was never recorded (defensive — the R11 Entity-5 default is
   * applied inside the build wrapper below, not here). Optional for the
   * same reason as `mods`.
   */
  seedSource?: "import-adapt" | "reseed-from-desktop" | null;
}

const EMPTY_DESKTOP_MODIFICATIONS: DesktopModifications = {
  removals: [],
  placements: [],
};

/**
 * The R11 emission gate around buildTouchLayoutJson — StudioShell's
 * former ReducerDeps wrapper, moved verbatim (T042): resolve the
 * seed source (Entity-5 default), ask the emission matrix, and on
 * the reseed path never pass the shipped layout through (R10).
 */
function buildTouchLayoutJsonForStep(
  baseIr: KeyboardIR,
  assignments: TouchAssignment[],
  opts: {
    baseTouchJson?: string;
    mods: DesktopModifications;
    seedSource: "import-adapt" | "reseed-from-desktop" | null;
  },
): { json: string | null; warnings: string[] } {
  const seedSource = resolveTouchSeedSource(
    opts.seedSource,
    opts.baseTouchJson !== undefined,
  );
  const hasRealEdits = assignments.length > 0;
  if (!shouldEmitTouchLayout(seedSource, opts.mods, hasRealEdits)) {
    return { json: null, warnings: [] };
  }
  return buildTouchLayoutJson(baseIr, assignments, {
    // Reseed discards the shipped layout (R10) — never pass baseTouchJson
    // through on that path, even though buildTouchLayoutJson's own Case A
    // branch condition would ignore it anyway.
    ...(seedSource !== "reseed-from-desktop" && opts.baseTouchJson !== undefined
      ? { baseTouchJson: opts.baseTouchJson }
      : {}),
    mods: opts.mods,
    seedSource,
  });
}

/**
 * R2 — the touch (touch-layout) completion effects, in the reducer
 * hook's exact semantics: no base IR → clear the stored layout;
 * otherwise build (R11-gated) and store the JSON, with build
 * failure degrading to no layout rather than blocking the
 * transition; the touch step's stale flag clears on EVERY path
 * (re-completion resolves the re-review flag a mechanisms edit
 * set). The devLog tags keep their "[applyStepCompletion:touch]"
 * wording from the reducer era for log continuity.
 */
export function applyTouchCompletionEffects(
  result: Partial<TouchCompleteResult> | undefined,
): void {
  const payload = result ?? {};
  const {
    assignments = [],
    baseIr = null,
    baseVfs = null,
    mods = EMPTY_DESKTOP_MODIFICATIONS,
    seedSource = null,
  } = payload;

  const wc = useWorkingCopyStore.getState();
  if (baseIr === null) {
    // No working IR to derive from — clear the stored touch layout (KMW
    // uses its native default).
    wc.setTouchLayoutJson(null);
  } else {
    try {
      const baseTouchJson = resolveBaseTouchJson(baseVfs);
      const { json, warnings } = buildTouchLayoutJsonForStep(baseIr, assignments, {
        ...(baseTouchJson !== undefined ? { baseTouchJson } : {}),
        mods,
        seedSource,
      });
      if (warnings.length > 0) {
        devLog.error("[applyStepCompletion:touch] buildTouchLayoutJson warnings:", warnings);
      }
      // json is null when the R11 matrix said "don't emit" OR the emit
      // pipeline threw — omit rather than injecting null/empty either way.
      wc.setTouchLayoutJson(json);
    } catch (err) {
      devLog.error("[applyStepCompletion:touch] buildTouchLayoutJson threw unexpectedly:", err);
      // Per spec, the transition proceeds regardless of build failure.
      // Graceful degradation: no touch layout → KMW falls back to shipped file or its default.
      wc.setTouchLayoutJson(null);
    }
  }
  // Re-completing the touch step resolves whatever re-review flag was set
  // on it (e.g. by a Mechanisms edit after unlock — MechanismGallery marks
  // "touch" stale directly, since the production manifest gives "touch"
  // inputs: [] and a mechanisms→touch stale-propagation edge does not
  // exist). Clearing here, not on entry, means the flag survives until
  // the user has actually re-reviewed and re-completed the step.
  wc.clearStale("touch");
}
