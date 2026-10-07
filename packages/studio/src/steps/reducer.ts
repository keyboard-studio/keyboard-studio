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

import { devLog } from "@keyboard-studio/contracts/dev-log";
import type { IRPath, KeyboardIR, TouchAssignment, VirtualFS, SurveyPhaseResult, PlacementWorklist } from "@keyboard-studio/contracts";
import type { BaseKeyboard, RemovalCapability, SurveyAnswer, HistoryEntryState } from "@keyboard-studio/contracts";
import type { ApplyContext, WorkingCopyPatch } from "../survey/types.ts";
// DesktopModifications is a type from the engine package (a workspace
// dependency, not an internal studio/src/ layer) — the steps-layer boundary
// forbids steps/ -> lib/stores/dashboard/components, not other packages.
import type { DesktopModifications, OutputForm } from "@keyboard-studio/engine";
import { applyMarkGuards, detectBaseMarkMechanism } from "@keyboard-studio/engine";
import { repropagate } from "./repropagate.ts";
import { isMutateSeamEnabled } from "../flags/mutateFlag.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import type { Decision, DecisionSet } from "../decisions/decisionTypes.ts";
import { answerProvenance } from "../decisions/answerProvenance.ts";
import type { SavedAnswer } from "./answerTypes.ts";

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
 * Step id for the marks series (spec 071) — applies the generated mark guards
 * (blocking swallow rules + stepwise backspace-unwrap stores) to the working
 * IR and records the R10 migration-need flag on complete.
 */
export const MARKS_STEP_ID = "marks" as const;

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
  /**
   * F1 fix: set by StudioShell's doCommit when the caller has ALREADY
   * resolved the rebase-confirm question synchronously (BaseResolutionAdapter
   * .onConfirm's confirmRebaseTo call — see editors/adapters/panelAdapters.tsx)
   * before this step-completion result was even produced. When true, the
   * Track 1/default branch below passes `{ skipConfirm: true }` through to
   * `instantiateFromBaseIfConfirmed` so the SAME confirm dialog does not fire
   * a second time for one user click. Absent/false preserves the original
   * behavior (the dep runs its own confirmRebaseIfEdited check) for callers
   * with no upstream synchronous confirm of their own.
   */
  skipRebaseConfirm?: boolean;
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
// Marks-series completion payload (spec 071) — the SurveyPhaseResult the
// series step reports, extended with the chosen output form (studio-local
// payload extension, like TouchCompleteResult; the locked contract types are
// untouched).
// ---------------------------------------------------------------------------

export interface MarksCompleteResult extends SurveyPhaseResult {
  marksWorklist?: PlacementWorklist;
  /** The S4 whole-keyboard decision ("ready-made" | "base-plus-mark"). */
  marksOutputForm?: OutputForm;
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
   * base re-instantiation invalidates it). Spec 088: the choice is the
   * `touch-seed-source` decision now — the host's implementation removes the
   * record from the decision store AND clears the working copy's touch draft
   * (research D-06: the side effect rides with the decision's writers).
   * Injected so this reducer.ts (steps/) does not import stores/ directly.
   * Optional so tests that don't care about the fork can omit it.
   */
  clearTouchSeedChoice?: () => void;

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
   * proceeded, false when skipped. The third (optional) `options` param lets
   * a caller that has ALREADY resolved the confirm question synchronously
   * (F1 fix — see InstantiateResult.skipRebaseConfirm above) skip the dep's
   * own internal confirm, so the same dialog cannot fire twice for one click.
   */
  instantiateFromBaseIfConfirmed: (
    base: BaseKeyboard,
    opts: { vfs: VirtualFS | null; ir: KeyboardIR | null; removalCapabilities?: Map<string, RemovalCapability> },
    options?: { skipConfirm?: boolean },
  ) => boolean;

  // --- mutate seam (spec-014 T014) ---
  /**
   * Read the current working-copy carve IR, or null when not yet instantiated.
   * Injected (steps/ may not import stores/). Used as the `base` for the
   * path-scoped `mutate()` patch merge.
   */
  getWorkingIR?: () => KeyboardIR | null;
  /**
   * Record the spec-046 R10 consequence: the designer picked the
   * base-plus-mark output form while adapting a base whose own content uses
   * ready-made forms — converting that existing content is a follow-on
   * migration need, recorded here and not acted on. Optional (session-flag
   * setter injected by the host).
   */
  setMarksMigrationNeeded?: (needed: boolean) => void;
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

  // --- decision audit (spec 053 FR-001/FR-002, research D-02) ---
  /**
   * Record the decisions a completed step represents.
   *
   * INJECTED, not imported, for the same boundary reason as every dep above:
   * `steps/` may not import `stores/`, `lib/`, or `components/`, and the
   * recorder needs all three. The injected implementation (StudioShell) composes
   * `recordSurveyAnswers` + `recordEditorStep` + the source snapshot over the
   * decision log.
   *
   * Optional, and a no-op when absent. That is load-bearing for FR-006: a session
   * run with this dep omitted must produce a byte-identical keyboard, so
   * recording has to be something the pipeline can be missing entirely rather
   * than something it merely skips internally.
   */
  recordDecision?: (event: { stepId: string; result: unknown }) => void;
  /**
   * spec 079 R-04: record one screen's answers at its Next, inside a step.
   * Injected (like `recordDecision`) so the reducer layer never reaches into
   * decisions/ or stores/; StepHost hands it to the step through
   * lib/questionRecorder.ts.
   */
  recordQuestionAnswers?: (
    stepId: string,
    screenId: string,
    answers: readonly SurveyAnswer[],
  ) => void;

  // --- decision apply (spec 089 FR-001/FR-002, contracts/apply-contract.md) ---
  /**
   * The checked working-copy patch sink (A4). INJECTED for the boundary
   * reason (StudioShell composes it from the working-copy store's setters):
   * it performs the `ir` channel's checked merge BEFORE any overlay channel
   * is written, so a containment failure applies nothing (no partial
   * patch). Optional, and a no-op when absent — the same load-bearing
   * optionality as the deps above.
   */
  applyWorkingCopyPatch?: (patch: WorkingCopyPatch, writes: readonly IRPath[]) => void;
  /** Read the live decision set — the `decisions` an apply composes from. */
  getDecisions?: () => DecisionSet;
  /** Read the working copy's current HISTORY-entry state (apply context). */
  getHistoryEntryState?: () => HistoryEntryState | null;

  // --- decision store (spec 088 FR-003, contract C-2) ---
  /**
   * Write decision records into the live decision store. INJECTED for the
   * same boundary reason as every dep above (`steps/` may not import
   * `stores/`): StudioShell points this at `useDecisionStore.recordAll`.
   * Optional, and a no-op when absent — the same load-bearing optionality
   * as `recordDecision` (a session run without it must produce a
   * byte-identical keyboard).
   */
  writeDecisionRecords?: (records: readonly Decision[]) => void;
  /** Read the live decision set (for a record's `inputs` snapshot). */
  readDecisionSet?: () => DecisionSet;
  /** Read one saved answer (for its pre-fill proposal, research D-05). */
  getSavedAnswer?: (stepId: string, questionId: string) => SavedAnswer | undefined;
  /** The starting-point keyboard's id, named as an extracted record's `source`. */
  getBaseKeyboardId?: () => string | undefined;
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
  switch (stepId) {
    // Spec 071 — marks-series completion: apply the generated mark guards
    // (blocking swallow group + stepwise backspace-unwrap stores) to the
    // working IR, and record the R10 migration-need flag when base-plus-mark
    // was chosen over a ready-made-form base. All engine-pure; no raw .kmn.
    case MARKS_STEP_ID: {
      // `result` may genuinely be absent (a step completed with nothing to
      // report, e.g. spec 032's journey-corpus harness driving a step the
      // real UI would auto-skip) — read through optional chaining rather
      // than destructuring/property-accessing an `undefined` cast directly.
      // CHOOSE_BASE_STEP_ID below shares this same "result may be absent"
      // reasoning, though its RESPONSE differs (warns before skipping,
      // since a missing base there is a foreseen caller error rather than
      // an expected no-op) — the two cases guard for the same reason, not
      // in the same way.
      const payload = result as Partial<MarksCompleteResult> | undefined;
      const worklist = payload?.marksWorklist;
      if (worklist === undefined) break;
      const ir = deps.getWorkingIR?.() ?? null;
      if (ir === null) break;
      const outputForm = payload?.marksOutputForm ?? "base-plus-mark";
      if (outputForm === "base-plus-mark" && detectBaseMarkMechanism(ir) === "precomposed") {
        deps.setMarksMigrationNeeded?.(true);
      }
      const guarded = applyMarkGuards(ir, worklist, outputForm);
      if (guarded.ir !== ir) {
        deps.setWorkingIR?.(guarded.ir);
      }
      break;
    }

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

    // R2 — touch-layout build: mirrors StudioShell.tsx handlePhaseEComplete.
    // Spec 035 R11: the reducer no longer gates the build on "assignments is
    // empty" — that decision (the R11 emission matrix) now lives inside the
    // injected deps.buildTouchLayoutJson (constructed in StudioShell.tsx,
    // which may import lib/touchEmission.ts; this reducer may not). The one
    // gate this reducer still owns is baseIr === null (nothing to build from).
    case TOUCH_STEP_ID: {
      // Same "result may genuinely be absent" reasoning as MARKS_STEP_ID
      // above — destructuring an `undefined` cast directly throws.
      const payload = (result as Partial<TouchCompleteResult> | undefined) ?? {};
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
            devLog.error("[applyStepCompletion:touch] buildTouchLayoutJson warnings:", warnings);
          }
          // json is null when the R11 matrix said "don't emit" OR the emit
          // pipeline threw — omit rather than injecting null/empty either way.
          deps.setTouchLayoutJson(json);
        } catch (err) {
          devLog.error("[applyStepCompletion:touch] buildTouchLayoutJson threw unexpectedly:", err);
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
      const payload = result as Partial<InstantiateResult> | undefined;
      // Guard: result must carry a base keyboard. Without it, instantiation
      // cannot proceed. Checking `payload` itself first (not just
      // `payload?.base`) narrows it for every read below.
      if (payload === undefined || payload.base === undefined) {
        devLog.warn("[applyStepCompletion:choose_base] no base in result — skipping instantiation");
        break;
      }
      const base = payload.base;

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
        //
        // spec 034 T005 / TI-2: under the REAL engine a codec-clean base always
        // yields a parsed IR + VFS, so this null guard is UNREACHABLE in
        // production — it fires only under the mock engine (which returns null
        // ir/vfs). Treat a null here as a genuine failure, not a benign skip:
        // adapt cannot proceed without a parsed IR, and silently doing nothing
        // would strand the author with no working copy and no signal. Logging at
        // error level (not warn) makes the no-op non-silent; we still `break`
        // rather than throw so the mock-engine dev/test path degrades without
        // crashing the survey.
        if (ir === null || vfs === null) {
          devLog.error(
            "[applyStepCompletion:choose_base] Track 2 (adapt) cannot instantiate: no parsed IR/VFS. " +
            "This is unreachable under the real engine (codec-clean base always parses); " +
            "it indicates the mock engine or a base the codec could not parse.",
          );
          break;
        }
        deps.instantiateFromExisting(base, { ...opts, vfs, ir });
        // spec 035 R12: a genuine (re-)instantiation invalidates any previously
        // recorded touch_seed_source choice — the fork must be re-asked.
        deps.clearTouchSeedChoice?.();
      } else {
        // Track 1 (or null/default): new keyboard from base, with rebase guard.
        // instantiateFromBaseIfConfirmed no-ops (returns false) on a redundant
        // re-fire or a user-cancelled rebase confirm — only clear the fork
        // choice when instantiation actually proceeded.
        //
        // F1 fix: only pass the third `options` argument when the caller has
        // set skipRebaseConfirm — omitting it entirely (rather than always
        // passing `{ skipConfirm: false }`) keeps this call's arity identical
        // to the pre-fix signature for every caller that never sets the flag
        // (all existing reducer.test.ts fixtures), so this change is additive.
        const instantiated = payload.skipRebaseConfirm
          ? deps.instantiateFromBaseIfConfirmed(base, opts, { skipConfirm: true })
          : deps.instantiateFromBaseIfConfirmed(base, opts);
        if (instantiated) {
          deps.clearTouchSeedChoice?.();
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
// recordStepCompletion — the decision-audit seam (spec 053, research D-02).
//
// Separate from applyStepCompletion on purpose, and this is the one place the
// implementation departs from the letter of the plan, so it is worth stating why.
//
// D-02 puts recording on applyStepCompletion because that is described as "called
// every time a step completes". It no longer is: StepHost gates it on
// STEPS_WITH_APPLY_COMPLETION (six steps), and choose_base fires it from an async
// instantiation callback instead. Hanging the audit there would silently miss
// every question step — identity, track, project_name, sequences, convenience —
// which is most of FR-001's subject matter.
//
// So recording gets its own entry point, called unconditionally from the host's
// generic completion path. D-02's actual requirements are preserved intact: the
// recorder is an INJECTED dep (this file still imports nothing from stores/, lib/,
// or components/), and no step component or gallery learns that auditing exists —
// the host passes the same opaque `result` it already has, and `reducerDeps`
// carries the behaviour.
// ---------------------------------------------------------------------------

/**
 * Report a completed step to the decision audit.
 *
 * A pure hand-off: no side effect of its own, and a no-op when no recorder is
 * injected. Called for EVERY completed step, including steps with no reducer
 * side effects — the effect table gates side effects, not auditing.
 */
export function recordStepCompletion(
  stepId: string,
  result: unknown,
  deps: ReducerDeps,
): void {
  deps.recordDecision?.({ stepId, result });
}

/**
 * Spec 088 FR-003 (contract C-2): write one decision record per provided
 * decision for every survey-question answer in a completed step.
 *
 * Called once per completion from `StepHost.handleComplete`, in the same
 * block as `recordPhase` / `applyDecisionEffects` — no other call site
 * writes question answers into the decision store. For each answer the
 * module is looked up in `questionRegistry` (the same lookup
 * `applyDecisionEffects` performs); an answer with no registry entry
 * writes nothing (C-2.2). Each id in `module.provides` gets one record
 * carrying the answer's value (broadcast — research §1b: the split rule is
 * the module's own, and every live module provides exactly one id),
 * `step` = the completing step, `inputs` = the store's current values for
 * the module's `requires`, and provenance per research D-05 (derived from
 * the saved answer's proposal via `answerProvenance`).
 *
 * Synchronous; no timer, no async work, no validation pass (C-2.5, D3
 * untouched). A no-op when the host injected no decision-store dep.
 */
export function recordAnswersAsDecisions(
  result: SurveyPhaseResult,
  stepId: string,
  deps: ReducerDeps,
): void {
  if (deps.writeDecisionRecords === undefined) return;
  const current: DecisionSet = deps.readDecisionSet?.() ?? {};
  const records: Decision[] = [];
  for (const answer of result.answers) {
    const mod = questionRegistry[answer.questionId];
    if (mod === undefined || mod.provides === undefined || mod.provides.length === 0) continue;
    const saved = deps.getSavedAnswer?.(stepId, answer.questionId);
    const mapped = answerProvenance(answer.value, saved?.proposal, deps.getBaseKeyboardId?.());
    let inputs: Decision["inputs"];
    if (mod.requires !== undefined && mod.requires.length > 0) {
      const snapshot: NonNullable<Decision["inputs"]> = {};
      for (const required of mod.requires) {
        const record = current[required];
        if (record !== undefined) snapshot[required] = record.value;
      }
      if (Object.keys(snapshot).length > 0) inputs = snapshot;
    }
    for (const id of mod.provides) {
      records.push({
        id,
        value: answer.value,
        provenance: mapped.provenance,
        ...(mapped.source !== undefined && { source: mapped.source }),
        ...(mapped.offered !== undefined && { offered: mapped.offered }),
        ...(inputs !== undefined && { inputs }),
        step: stepId,
      });
    }
  }
  if (records.length > 0) deps.writeDecisionRecords(records);
}

// ---------------------------------------------------------------------------
// applyDecisionEffects — the decision-apply runner (spec 089 FR-001/FR-002,
// contracts/apply-contract.md). The successor to routeAnswersThroughMutate:
// where that routed answers through the flag-gated `mutate()` seam, this
// runs each answered module's `apply()` UNCONDITIONALLY (A1 — no flag, no
// per-module gate) and hands the returned patch to the injected sink.
//
// Called from StepHost.handleComplete AFTER recordAnswersAsDecisions (A6:
// the completion's decisions are recorded first, so ctx.decisions includes
// them). Modules without `apply` are skipped. Synchronous; no timer (A8).
// ---------------------------------------------------------------------------

// The A3 channel authorization (ApplyChannelError + the table + the
// check) lives in steps/applyAuthorization.ts — a leaf module — so the
// gallery host can share it without importing this registry-coupled file
// (spec 090 T012; see that module's header). Re-exported here for the
// importers that learned it from the runner (089's tests included).
export { ApplyChannelError, assertPatchChannelsAuthorized } from "./applyAuthorization.ts";
import { assertPatchChannelsAuthorized } from "./applyAuthorization.ts";

/**
 * Run the decision effects of a completed step's answers.
 *
 * For each answer whose module declares `apply`: build the ApplyContext
 * (the live IR is re-read per answer, so a later apply in the same
 * completion sees an earlier apply's IR write), call `apply`, verify every
 * returned channel against the authorization table, and hand the patch to
 * the injected sink. An unauthorized channel throws {@link ApplyChannelError}
 * before the sink is called — no partial patch (A3).
 *
 * A no-op when the host injected no patch sink.
 */
export function applyDecisionEffects(
  result: SurveyPhaseResult,
  deps: ReducerDeps,
): void {
  if (deps.applyWorkingCopyPatch === undefined) return;
  const decisions: DecisionSet = deps.getDecisions?.() ?? {};
  for (const answer of result.answers) {
    const mod = questionRegistry[answer.questionId];
    if (mod === undefined || mod.apply === undefined) continue;
    const writes = mod.writes ?? [];
    const ctx: ApplyContext = {
      ir: deps.getWorkingIR?.() ?? null,
      writes,
      decisions,
      currentHistoryEntryState: deps.getHistoryEntryState?.() ?? null,
    };
    const patch = mod.apply(answer.value as string | string[] | undefined, ctx);
    if (!assertPatchChannelsAuthorized(answer.questionId, mod, patch)) continue;
    deps.applyWorkingCopyPatch(patch, writes);
  }
}
