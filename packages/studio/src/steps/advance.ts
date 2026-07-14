// advance — pure step-advance policy for the survey wizard (spec 028 Stage 5).
//
// Encodes the complete copy/adapt fork, joinTarget hops, terminal transitions,
// and spine-step sequencing in a single pure function. Replaces the private
// manifestIndexOf/nextSpineStepAfter helpers and the inline fork logic that
// were scattered across SurveyView's per-step handlers before Stage 5.
//
// CONTRACT (advance-and-stephost.contract.md §1):
//   - Pure: same inputs → same output. No store reads, no I/O.
//   - Total over ActiveStepId: every manifest step id + the two terminals.
//   - Imports ONLY ./manifest.ts + ./types.ts (depcruise: steps/ boundary clean).
//   - ActiveStepId and Track are defined locally (type mirrors) to avoid a
//     steps/ → stores/ import that depcruise would reject.
//
// Research decisions: R1 (advance owns the fork), R2 (signature), R3 (mapping),
// R9 (boundary).

import { manifest } from "./manifest.ts";

// ---------------------------------------------------------------------------
// Local type mirrors — defined here to avoid steps/ → stores/ import.
// These must stay in sync with surveySessionStore.ActiveStepId and
// survey/PhaseTrack.Track. Any drift is a compile error at the call site
// (StepHost passes a surveySessionStore.ActiveStepId and receives one back).
// ---------------------------------------------------------------------------

/** Mirror of surveySessionStore.ActiveStepId (kept local, boundary-clean). */
type ActiveStepId =
  | "identity"
  | "choose_base"
  | "track"
  | "project_name"
  | "characters"
  | "carve"
  | "mechanisms"
  | "touch_seed_source"
  | "touch"
  | "help"
  | "done"
  | "unsupported";

/** Mirror of survey/index.ts Track (kept local, boundary-clean). */
type Track = "copy" | "adapt";

/**
 * Mirror of surveySessionStore.TouchSeedSource (kept local, boundary-clean —
 * see the module header: advance.ts imports ONLY ./manifest.ts + ./types.ts).
 * Spec 035 FR-006 / contracts/seed-source-fork.md.
 */
type TouchSeedSource = "import-adapt" | "reseed-from-desktop";

// ---------------------------------------------------------------------------
// AdvanceContext — the session snapshot the advance policy branches on.
// Passed in by the host (which reads the store); the policy never reads a store.
// ---------------------------------------------------------------------------

export interface AdvanceContext {
  /** "copy" | "adapt" | null — the track selected at the track step. */
  readonly selectedTrack: Track | null;
  /** Whether the identity step's chosen script is supported in v1. */
  readonly identitySupported: boolean;
  /**
   * The recorded touch_seed_source fork choice, or null when none is recorded
   * yet (spec 035 R12 fork memory). Read by the "mechanisms" case to decide
   * whether to route into the touch_seed_source chooser or straight to touch.
   */
  readonly touchSeedSource: TouchSeedSource | null;
}

// ---------------------------------------------------------------------------
// AdvanceOutcome — what the host does next.
// ---------------------------------------------------------------------------

export interface AdvanceOutcome {
  /** The next active step id (incl. terminals "done" / "unsupported"). */
  readonly next: ActiveStepId;
  /**
   * Set ONLY when the advance reaches the "done" terminal — signals the host
   * to call navigateTo("output") after session.advance(next).
   */
  readonly navigate?: "output";
  /**
   * Set when the advance outcome requires setCharactersSubStage("prefill") to
   * fire AFTER session.advance(next). Used for adapt-track and project_name so
   * the sub-stage reset happens in the correct position relative to advance
   * (matching the pre-Stage-5 handler ordering asserted by the golden-walk oracle).
   */
  readonly setCharactersSubStage?: "prefill";
}

// ---------------------------------------------------------------------------
// STEPS_WITH_APPLY_COMPLETION — data table (not host control flow).
//
// The steps listed here had applyStepCompletion called by their pre-Stage-5
// handlers. The host reads this set to decide whether to call
// applyStepCompletion after the generic completion path. Steps absent from
// this set either had no handler call (identity, track) or fire applyStepCompletion
// from a non-handler path (choose_base: fires from the async onInstantiate
// callback, never from the completion handler). This is the "small effect table"
// per research R7.
// ---------------------------------------------------------------------------

export const STEPS_WITH_APPLY_COMPLETION: ReadonlySet<string> = new Set([
  "characters",
  "carve",
  "mechanisms",
  "touch",
  "help",
]);

// ---------------------------------------------------------------------------
// manifestIndexOf — moved from StudioShell.tsx (was private, now exported).
// ---------------------------------------------------------------------------

/** Return the manifest index for a given step id, or -1 if not found. */
export function manifestIndexOf(id: string): number {
  return manifest.findIndex((s) => s.id === id);
}

// ---------------------------------------------------------------------------
// nextSpineStepAfter — moved from StudioShell.tsx (was private, now exported).
//
// Advances to the next spine step in the manifest after currentId, skipping
// spine:false side-trail steps. Returns "done" when "package" or
// end-of-manifest is reached.
// ---------------------------------------------------------------------------

export function nextSpineStepAfter(currentId: string): ActiveStepId {
  const currentIdx = manifestIndexOf(currentId);
  // Guard: unknown id returns -1; scanning from index 0 would return the first
  // spine step ("identity") which is incorrect. Return "done" instead.
  if (currentIdx === -1) return "done";
  for (let i = currentIdx + 1; i < manifest.length; i++) {
    const step = manifest[i];
    if (step === undefined) break;
    if (step.spine === false) continue;
    const id = step.id;
    // "package" is the reserved terminal; reaching it means we're done.
    if (id === "package") return "done";
    // All other spine step IDs are valid ActiveStepId values (terminals excluded).
    // The manifest only contains valid step IDs, so no exhaustive check needed.
    return id as ActiveStepId;
  }
  return "done";
}

// ---------------------------------------------------------------------------
// advance — the pure policy (contract §1).
//
// Encodes R3's mapping exactly. All fork/terminal logic lives here; the host
// has no per-step advance branching.
// ---------------------------------------------------------------------------

export function advance(
  completedStepId: ActiveStepId,
  _result: unknown,
  ctx: AdvanceContext,
): AdvanceOutcome {
  switch (completedStepId) {
    case "identity":
      return ctx.identitySupported
        ? { next: nextSpineStepAfter("identity") }   // choose_base
        : { next: "unsupported" };

    case "choose_base":
      return { next: nextSpineStepAfter("choose_base") }; // track

    case "track":
      if (ctx.selectedTrack === "copy") {
        // Copy-track: project_name side-trail (spine:false, joinTarget:"characters").
        return { next: "project_name" };
      } else if (ctx.selectedTrack === "adapt") {
        // Adapt-track: skip project_name (spine:false) → characters.
        // Also signals host to call setCharactersSubStage("prefill") post-advance.
        return {
          next: nextSpineStepAfter("track"),  // characters
          setCharactersSubStage: "prefill",
        };
      } else {
        // Invariant violation: selectedTrack is null here, but
        // makeFlowStepComponent(trackOptions).onCommit always calls setSelectedTrack
        // before invoking onComplete. A null at this point means something went wrong
        // upstream. Log the violation and default to the copy path (project_name) —
        // copy is the safer default because it does NOT skip a step. Do NOT silently
        // route as adapt (which skips project_name and could confuse the user).
        console.error(
          "[advance] invariant violation: selectedTrack is null at track step. " +
          "trackOptions.onCommit must set selectedTrack before calling onComplete. " +
          "Defaulting to copy path (project_name) to avoid silent wrong-fork routing."
        );
        return { next: "project_name" };
      }

    case "project_name":
      // joinTarget is "characters"; advance there directly.
      // Also signals host to call setCharactersSubStage("prefill") post-advance.
      return { next: "characters", setCharactersSubStage: "prefill" };

    case "characters":
      return { next: nextSpineStepAfter("characters") }; // carve

    case "carve":
      return { next: nextSpineStepAfter("carve") }; // mechanisms

    case "mechanisms":
      // Spec 035 R4/R12: route into the off-spine seed-source fork — but only
      // when no valid choice is recorded yet. A remembered choice goes
      // straight to "touch" so back-and-forth over mechanisms doesn't re-ask.
      return ctx.touchSeedSource === null
        ? { next: "touch_seed_source" }
        : { next: "touch" };

    case "touch_seed_source":
      // joinTarget is "touch"; advance there directly (mirrors project_name).
      return { next: "touch" };

    case "touch":
      return { next: nextSpineStepAfter("touch") }; // help

    case "help":
      return { next: "done", navigate: "output" };

    // Terminals — if somehow called, stay put (host does not call advance for terminals).
    case "done":
      return { next: "done" };
    case "unsupported":
      return { next: "unsupported" };
  }
}
