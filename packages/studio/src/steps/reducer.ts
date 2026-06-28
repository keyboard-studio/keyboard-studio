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

import type { IRPath, KeyboardIR, TouchAssignment, VirtualFS } from "@keyboard-studio/contracts";
import type { BaseKeyboard, RemovalCapability } from "@keyboard-studio/contracts";
import type { MutateContext } from "../survey/types.ts";
import { applyMutatePatch } from "./mutateApply.ts";
import { repropagate } from "./repropagate.ts";
import { isMutateSeamEnabled } from "../flags/mutateFlag.ts";

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

  // --- Lib helpers (from lib/buildTouchLayoutJson + lib/resolveBaseTouchJson) ---
  /**
   * Derive the .keyman-touch-layout JSON string from a base IR + assignments.
   * Two paths: Case A (generate from scratch) and Case B (faithful edit onto
   * shipped layout). Returns { json, warnings }; json is null on error.
   */
  buildTouchLayoutJson: (
    baseIr: KeyboardIR,
    assignments: ReadonlyArray<TouchAssignment>,
    baseTouchJson?: string,
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
        });
      }
      break;
    }

    // R2 — touch-layout build: mirrors StudioShell.tsx handlePhaseEComplete (lines 380-410).
    // Same Case-A/B logic and graceful degradation on error.
    case TOUCH_STEP_ID: {
      const payload = result as Partial<TouchCompleteResult>;
      const assignments = payload.assignments ?? [];
      const baseIr = payload.baseIr ?? null;
      const baseVfs = payload.baseVfs ?? null;

      if (assignments.length === 0 || baseIr === null) {
        // No real assignments — clear the stored touch layout (KMW uses its native default).
        deps.setTouchLayoutJson(null);
      } else {
        try {
          // Case B: base ships a touch layout → apply faithfully onto raw JSON copy.
          // Case A: no shipped touch layout → IR-based generate-from-scratch path.
          const baseTouchJson = deps.resolveBaseTouchJson(baseVfs);
          const { json, warnings } = deps.buildTouchLayoutJson(baseIr, assignments, baseTouchJson);
          if (warnings.length > 0) {
            console.error("[applyStepCompletion:touch] buildTouchLayoutJson warnings:", warnings);
          }
          // json is null when the emit pipeline threw — omit rather than injecting null/empty.
          deps.setTouchLayoutJson(json);
        } catch (err) {
          console.error("[applyStepCompletion:touch] buildTouchLayoutJson threw unexpectedly:", err);
          // Per spec, the transition proceeds regardless of build failure.
          // Graceful degradation: no touch layout → KMW falls back to shipped file or its default.
          deps.setTouchLayoutJson(null);
        }
      }
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
      const removalCapabilities = payload.removalCapabilities;

      if (track === "adapt") {
        // Track 2: preserve existing keyboard identity.
        if (ir === null || vfs === null) {
          console.warn("[applyStepCompletion:choose_base] Track 2 skipped: no parsed IR (mock engine?)");
          break;
        }
        deps.instantiateFromExisting(base, {
          vfs,
          ir,
          ...(removalCapabilities !== undefined ? { removalCapabilities } : {}),
        });
      } else {
        // Track 1 (or null/default): new keyboard from base, with rebase guard.
        deps.instantiateFromBaseIfConfirmed(base, {
          vfs,
          ir,
          ...(removalCapabilities !== undefined ? { removalCapabilities } : {}),
        });
      }
      break;
    }

    // R5 — unknown step id is a no-op (most question-steps have no side effect).
    default:
      break;
  }
}
