// reducer — manifest-level step-completion side-effect dispatcher.
//
// T026 (P4b foundation). applyStepCompletion() is the SINGLE place that
// performs survey-level side effects when a step completes. It is keyed by
// step id and encapsulates the THREE inline side effects currently in SurveyView:
//
//   R1 — lock gate: fires lockDesktop() when the "mechanisms" step completes.
//   R2 — touch-layout build: runs buildTouchLayoutJson + setTouchLayoutJson at
//          the "touch" step, with the same Case-A/B and graceful degradation.
//   R3 — copy/adapt instantiation: routes Track 2 → instantiateFromExisting,
//          Track 1/default → instantiateFromBaseIfConfirmed at the "choose_base"
//          step (today: onInstantiate in StudioShell.tsx:240-253).
//   R5 — unknown step id is a no-op (no side effect for most question-steps).
//
// BOUNDARY COMPLIANCE: steps/ may NOT import from stores/, lib/, or components/
// (steps-layer depcruise rule). All store actions and lib helpers are therefore
// INJECTED via the ReducerDeps parameter rather than statically imported.
// The caller (SurveyView, T028) provides the deps when it calls applyStepCompletion.
//
// The ReducerDeps interface is defined locally here (not imported from stores/)
// so this file remains boundary-clean. It captures exactly the store actions
// and lib helpers the reducer needs — nothing more.

import type { IRPath, KeyboardIR, TouchAssignment, VirtualFS, SurveyPhaseResult } from "@keyboard-studio/contracts";
import type { BaseKeyboard, RemovalCapability } from "@keyboard-studio/contracts";
import type { MutateContext } from "../survey/types.ts";
// DesktopModifications is a type from the engine package (a workspace
// dependency, not an internal studio/src/ layer) — the steps-layer boundary
// forbids steps/ -> lib/stores/dashboard/components, not other packages.
import type { DesktopModifications } from "@keyboard-studio/engine";
import { applyMutatePatch } from "./mutateApply.ts";
import { repropagate } from "./repropagate.ts";
import { isMutateSeamEnabled } from "../flags/mutateFlag.ts";
import { questionRegistry } from "../survey/questions/registry.ts";

/**
 * The empty/no-op DesktopModifications — used as the TOUCH_STEP_ID case's
 * default when a caller's payload omits `mods` (defensive; every real caller
 * — AddTouchAdapter — always supplies it).
 */
const EMPTY_DESKTOP_MODIFICATIONS: DesktopModifications = { removals: [], placements: [] };

// ---------------------------------------------------------------------------
// Step ids that carry side effects (keyed constants — never inline strings)
// ---------------------------------------------------------------------------

/** Step id for the Mechanisms (physical assignment) step — fires lockDesktop() on complete. */
export const MECHANISMS_STEP_ID = "mechanisms" as const;

/** Step id for the Touch (Phase E) step — fires buildTouchLayoutJson on complete. */
export const TOUCH_STEP_ID = "touch" as const;

/**
 * Step id for the choose-base step — fires the copy/adapt instantiation on complete.
 * (Corresponds to today's "base" SurveyStage and the onInstantiate callback.)
 */
export const CHOOSE_BASE_STEP_ID = "choose_base" as const;

// ---------------------------------------------------------------------------
// Instantiation result — passed to the reducer when choose_base completes.
// Mirrors the shape the compile pipeline delivers via OnInstantiateCallback.
// ---------------------------------------------------------------------------

export interface InstantiateResult {
  base: BaseKeyboard;
  vfs: VirtualFS | null;
  ir: KeyboardIR | null;
  removalCapabilities?: Map<string, RemovalCapability>;
  /** Which authoring track the user chose. "adapt" = Track 2; anything else = Track 1. */
  track: string | null;
}

// ---------------------------------------------------------------------------
// Touch-completion result — passed to the reducer when the touch step completes.
// ---------------------------------------------------------------------------

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
   * step's adapter (AddTouchAdapter) via deriveDesktopModifications so this
   * reducer (steps/) never imports lib/ or stores/ directly. Optional so
   * existing/mocked callers that don't care about the replay can omit it —
   * the reducer defaults to the empty (no-op) modifications.
   */
  mods?: DesktopModifications;
  /**
   * The author's raw touch_seed_source fork choice (spec 035 FR-006), or null
   * if the fork was never recorded (defensive — the R11 Entity-5 default is
   * applied inside the injected buildTouchLayoutJson dep, not here). Optional
   * for the same reason as `mods`.
   */
  seedSource?: "import-adapt" | "reseed-from-desktop" | null;
}

// ---------------------------------------------------------------------------
// Injected dependencies (replacing direct lib/stores imports)
//
// All deps are functions — the caller injects concrete implementations.
// Tests inject mocks; SurveyView (T028) injects the real store actions + helpers.
// ---------------------------------------------------------------------------

export interface ReducerDeps {
  // --- Store actions (from workingCopyStore) ---
  /** Lock the desktop layout after Mechanisms completion (R1). */
  lockDesktop: () => void;
  /** Persist the serialized touch layout JSON at Phase E completion (R2). */
  setTouchLayoutJson: (json: string | null) => void;
  /**
   * Clear a step's stale marker (removes it as a re-opened root and recomputes
   * the staleness closure). Called at Touch completion (R2) so re-completing
   * the touch step clears the re-review flag a prior Mechanisms edit set on it.
   */
  clearStale: (stepId: string) => void;
  /** Track 1 instantiation — copy from base, new identity. */
  instantiateFromBase: (
    base: BaseKeyboard,
    opts: { vfs: VirtualFS; ir: KeyboardIR; removalCapabilities?: Map<string, RemovalCapability> },
  ) => void;
  /** Track 2 instantiation — adapt existing keyboard, identity preserved. */
  instantiateFromExisting: (
    base: BaseKeyboard,
    opts: { vfs: VirtualFS; ir: KeyboardIR; removalCapabilities?: Map<string, RemovalCapability> },
  ) => void;
  /**
   * Clear the recorded touch_seed_source fork choice (spec 035 R12: a genuine
   * base re-instantiation invalidates it). Injected as a surveySessionStore
   * action so this reducer.ts (steps/) does not import stores/ directly, and
   * so workingCopyStore does not need to import surveySessionStore (which
   * would create a circular dependency with surveySessionStore's own
   * setTouchSeedSource reaching into workingCopyStore to clear touchDraft).
   * Optional so tests that don't care about the fork can omit it.
   */
  setTouchSeedSource?: (v: "import-adapt" | "reseed-from-desktop" | null) => void;

  // --- Lib helpers (from lib/buildTouchLayoutJson + lib/resolveBaseTouchJson) ---
  /**
   * Derive (and, per the spec 035 R11 emission matrix, decide whether to
   * emit) the .keyman-touch-layout JSON string from a base IR + assignments.
   * Two derivation paths: Case A (generate from scratch, replaying `mods`)
   * and Case B (faithful edit onto the shipped layout, replaying `mods`
   * first). Returns { json, warnings }; json is null when the R11 matrix says
   * "don't emit" OR the emit pipeline failed — the reducer treats both
   * identically (omit the stored layout).
   *
   * THIS is the one call site (injected from StudioShell.tsx, which may
   * import lib/touchEmission.ts) that applies the R11 matrix for the output
   * path — this reducer (steps/) may not import lib/ directly, so the
   * gating logic lives inside the injected implementation, not here.
   */
  buildTouchLayoutJson: (
    baseIr: KeyboardIR,
    assignments: ReadonlyArray<TouchAssignment>,
    opts: {
      /** Present ⇒ the base ships a shipped touch layout to adapt (Case B candidate). */
      baseTouchJson?: string;
      /** Desktop modifications to replay onto the seed (spec 035 R3). */
      mods: DesktopModifications;
      /** Raw fork choice — may be null; the dep resolves the R11 default. */
      seedSource: "import-adapt" | "reseed-from-desktop" | null;
    },
  ) => { json: string | null; warnings: string[] };

  /**
   * Resolve the base keyboard's shipped .keyman-touch-layout JSON string from
   * a VFS. Returns undefined when vfs is null or the file is absent/binary.
   */
  resolveBaseTouchJson: (vfs: VirtualFS | null) => string | undefined;

  /**
   * Track 1 instantiation helper that guards against rebase without user
   * confirmation (confirmRebaseIfEdited). Returns true when instantiation
   * proceeded, false when skipped.
   */
  instantiateFromBaseIfConfirmed: (
    base: BaseKeyboard,
    opts: { vfs: VirtualFS | null; ir: KeyboardIR | null; removalCapabilities?: Map<string, RemovalCapability> },
  ) => boolean;

  // --- mutate seam (spec-014 T014) ---
  /**
   * Read the current working-copy carve IR, or null when not yet instantiated.
   * Injected (steps/ may not import stores/). Used as the `base` for the
   * path-scoped `mutate()` patch merge.
   */
  getWorkingIR?: () => KeyboardIR | null;
  /**
   * Write the merged IR back to the working copy via the OVERLAY-PRESERVING
   * store setter (`setWorkingIR`, NOT `setIR`). These are incremental patches to
   * the working IR and must preserve the carve-deletion overlay
   * (deletedNodeIds/deletedItemIds/undoStack). Called only when the mutate flag
   * is on AND a mutate request actually changed the IR.
   */
  setWorkingIR?: (ir: KeyboardIR) => void;

  // --- touch re-propagation (spec-014 US2, T024) ---
  /**
   * Read the current staleness closure (the P4b `staleSteps` slice). Injected
   * (steps/ may not import stores/). Drives touch re-propagation on a physical
   * change; an empty closure short-circuits to a no-op (R5). Absent ⇒ no
   * re-propagation is attempted (P4b behavior).
   */
  getStaleSteps?: () => ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Mutate request — the payload a question step passes to route its answer
// through the `mutate()` write seam (spec-014 US1, FR-002/-005).
// ---------------------------------------------------------------------------

/**
 * A request to apply a single question module's `mutate()` to the working-copy
 * IR. Carried as the `result` payload of `applyStepCompletion` for in-scope
 * question steps. The reducer applies it via `mutateApply` ONLY when the global
 * mutate flag is on; flag-off leaves the P4b declared-only seam unchanged.
 */
export interface MutateRequest {
  /** Discriminator so the reducer recognizes a mutate-routed completion. */
  kind: "mutate";
  /** The module's `mutate()` implementation (pure patch producer). */
  mutate: (value: string | string[] | undefined, ctx: MutateContext) => Partial<KeyboardIR>;
  /** The answer value to apply. */
  value: string | string[] | undefined;
  /** The module's declared `writes` — the containment set for the patch (M3). */
  writes: readonly IRPath[];
}

function isMutateRequest(r: unknown): r is MutateRequest {
  return (
    typeof r === "object" &&
    r !== null &&
    (r as { kind?: unknown }).kind === "mutate" &&
    typeof (r as { mutate?: unknown }).mutate === "function"
  );
}

// ---------------------------------------------------------------------------
// applyStepCompletion — the public API
//
// Called by SurveyView (T028) every time a step completes. Keyed by stepId.
// Unknown step ids are a no-op (R5) — most question-steps pass through harmlessly.
// ---------------------------------------------------------------------------

/**
 * Apply the side effects for a completed step.
 *
 * @param stepId  The id of the step that just completed (from the manifest).
 * @param result  The opaque result payload from the step. Its shape is narrowed
 *                per step id inside the function.
 * @param deps    Injected store actions and lib helpers (avoids boundary violations).
 */
export function applyStepCompletion(
  stepId: string,
  result: unknown,
  deps: ReducerDeps,
): void {
  // --- mutate seam (spec-014 T014): route an in-scope question answer through
  // mutate() when the flag is on. Flag-off ⇒ no mutate() executes (F2/SC-008).
  if (isMutateRequest(result)) {
    if (!isMutateSeamEnabled()) return; // P4b declared-only seam — no IR write.
    const base = deps.getWorkingIR?.() ?? null;
    if (base === null) return; // no working copy yet — nothing to merge into.
    const ctx: MutateContext = { ir: base, writes: result.writes };
    // mutate() is pure; applyMutatePatch enforces containment (M3) and merges
    // path-scoped (M2). A throw here is intentional — the failure must surface
    // (M3), never be swallowed. The IR is left unchanged on rejection.
    const patch = result.mutate(result.value, ctx);
    const next = applyMutatePatch(base, patch, result.writes);
    deps.setWorkingIR?.(next);
    return;
  }

  switch (stepId) {
    // R1 — lock gate: fire lockDesktop() after Mechanisms completes.
    case MECHANISMS_STEP_ID: {
      deps.lockDesktop();
      // spec-014 US2 (T024): a physical step/lock completion triggers automatic
      // touch re-propagation, GATED on the mutate flag (flag-off ⇒ byte-identical
      // to P4b — no re-propagation runs). repropagate() itself short-circuits to
      // a no-op when the staleness closure is empty (R5). Deps are injected to
      // respect the steps-layer boundary (no stores/ import here).
      if (
        isMutateSeamEnabled() &&
        deps.getStaleSteps !== undefined &&
        deps.getWorkingIR !== undefined &&
        deps.setWorkingIR !== undefined
      ) {
        repropagate({
          staleSteps: deps.getStaleSteps(),
          getWorkingIR: deps.getWorkingIR,
          setWorkingIR: deps.setWorkingIR,
          // Issue #831 — persist the re-serialized side-car so the SHIPPED
          // `.keyman-touch-layout` reflects re-propagation, not just the preview.
          // `setTouchLayoutJson` is already a ReducerDep (R2 touch-step build).
          setTouchLayoutJson: deps.setTouchLayoutJson,
        });
      }
      break;
    }

    // R2 — touch-layout build: mirrors StudioShell.tsx handlePhaseEComplete.
    // Spec 035 R11: the reducer no longer gates the build on "assignments is
    // empty" — that decision (the R11 emission matrix) now lives inside the
    // injected deps.buildTouchLayoutJson (constructed in StudioShell.tsx,
    // which may import lib/touchEmission.ts; this reducer may not). The one
    // gate this reducer still owns is baseIr === null (nothing to build from).
    case TOUCH_STEP_ID: {
      const payload = result as Partial<TouchCompleteResult>;
      const {
        assignments = [],
        baseIr = null,
        baseVfs = null,
        mods = EMPTY_DESKTOP_MODIFICATIONS,
        seedSource = null,
      } = payload;

      if (baseIr === null) {
        // No working IR to derive from — clear the stored touch layout (KMW
        // uses its native default).
        deps.setTouchLayoutJson(null);
      } else {
        try {
          const baseTouchJson = deps.resolveBaseTouchJson(baseVfs);
          const { json, warnings } = deps.buildTouchLayoutJson(baseIr, assignments, {
            ...(baseTouchJson !== undefined ? { baseTouchJson } : {}),
            mods,
            seedSource,
          });
          if (warnings.length > 0) {
            console.error("[applyStepCompletion:touch] buildTouchLayoutJson warnings:", warnings);
          }
          // json is null when the R11 matrix said "don't emit" OR the emit
          // pipeline threw — omit rather than injecting null/empty either way.
          deps.setTouchLayoutJson(json);
        } catch (err) {
          console.error("[applyStepCompletion:touch] buildTouchLayoutJson threw unexpectedly:", err);
          // Per spec, the transition proceeds regardless of build failure.
          // Graceful degradation: no touch layout → KMW falls back to shipped file or its default.
          deps.setTouchLayoutJson(null);
        }
      }
      // Re-completing the touch step resolves whatever re-review flag was set
      // on it (e.g. by a Mechanisms edit after unlock — MechanismGallery marks
      // "touch" stale directly, since the production manifest gives "touch"
      // inputs: [] and a mechanisms→touch stale-propagation edge does not
      // exist). Clearing here, not on entry, means the flag survives until
      // the user has actually re-reviewed and re-completed the step.
      deps.clearStale(TOUCH_STEP_ID);
      break;
    }

    // R3 — copy/adapt instantiation: mirrors StudioShell.tsx onInstantiate (lines 240-253).
    // Routes Track 2 → instantiateFromExisting, Track 1/default → instantiateFromBaseIfConfirmed.
    case CHOOSE_BASE_STEP_ID: {
      const payload = result as Partial<InstantiateResult>;
      const base = payload.base;
      if (base === undefined) {
        // Guard: result must carry a base keyboard. Without it, instantiation cannot proceed.
        console.warn("[applyStepCompletion:choose_base] no base in result — skipping instantiation");
        break;
      }

      const track = payload.track ?? null;
      const vfs = payload.vfs ?? null;
      const ir = payload.ir ?? null;
      const opts = {
        vfs,
        ir,
        ...(payload.removalCapabilities !== undefined ? { removalCapabilities: payload.removalCapabilities } : {}),
      };

      if (track === "adapt") {
        // Track 2: preserve existing keyboard identity.
        if (ir === null || vfs === null) {
          console.warn("[applyStepCompletion:choose_base] Track 2 skipped: no parsed IR (mock engine?)");
          break;
        }
        deps.instantiateFromExisting(base, { ...opts, vfs, ir });
        // spec 035 R12: a genuine (re-)instantiation invalidates any previously
        // recorded touch_seed_source choice — the fork must be re-asked.
        deps.setTouchSeedSource?.(null);
      } else {
        // Track 1 (or null/default): new keyboard from base, with rebase guard.
        // instantiateFromBaseIfConfirmed no-ops (returns false) on a redundant
        // re-fire or a user-cancelled rebase confirm — only clear the fork
        // choice when instantiation actually proceeded.
        const instantiated = deps.instantiateFromBaseIfConfirmed(base, opts);
        if (instantiated) {
          deps.setTouchSeedSource?.(null);
        }
      }
      break;
    }

    // R5 — unknown step id is a no-op (most question-steps have no side effect).
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// routeAnswersThroughMutate — route in-scope question answers through mutate().
//
// Moved from StudioShell.tsx (was private) and exported here so StepHost can
// call it in the centralized completion path without duplicating the logic.
// Only question modules with both `mutate` and non-empty `writes` are routed
// (flag-gated via applyStepCompletion → isMutateSeamEnabled). Answer modules
// that are display-only or answer-store-only are skipped (no `mutate`/`writes`).
//
// spec-014 US1 (T014/T015): route each in-scope question answer through its
// module's `mutate()` write seam. The reducer gates execution on the global
// mutate flag (off ⇒ no-op, byte-identical to P4b), so this is safe to call
// unconditionally. A module without `mutate`/with empty `writes` is skipped.
// ---------------------------------------------------------------------------

export function routeAnswersThroughMutate(
  result: SurveyPhaseResult,
  deps: ReducerDeps,
): void {
  for (const answer of result.answers) {
    const mod = questionRegistry[answer.questionId];
    if (mod === undefined) continue;
    if (mod.mutate === undefined || (mod.writes ?? []).length === 0) continue;
    const value = answer.value as string | string[] | undefined;
    const req: MutateRequest = {
      kind: "mutate",
      mutate: mod.mutate,
      value,
      writes: mod.writes!,
    };
    applyStepCompletion(answer.questionId, req, deps);
  }
}
