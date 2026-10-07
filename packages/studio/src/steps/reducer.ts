// reducer — manifest-level step-completion side-effect dispatcher.
//
// T026 (P4b foundation). applyStepCompletion() is the SINGLE place that
// performs survey-level side effects when a step completes. It is keyed by
// step id and encapsulates the THREE inline side effects currently in SurveyView:
//
//   R1 — RETIRED (spec 090 T041): the lock gate re-homed to
//          lib/assignLoopCompletion.ts (applyPhysicalCompletionEffects).
//   R2 — RETIRED (spec 090 T042): the touch-layout build re-homed to
//          lib/assignLoopCompletion.ts (applyTouchCompletionEffects).
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
import type { IRPath, KeyboardIR, VirtualFS, SurveyPhaseResult } from "@keyboard-studio/contracts";
import type { BaseKeyboard, RemovalCapability, SurveyAnswer, HistoryEntryState } from "@keyboard-studio/contracts";
import type { ApplyContext, QuestionModule, WorkingCopyPatch } from "../survey/types.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import type { Decision, DecisionSet } from "../decisions/decisionTypes.ts";
import { answerProvenance } from "../decisions/answerProvenance.ts";
import type { SavedAnswer } from "./answerTypes.ts";

// ---------------------------------------------------------------------------
// Step ids that carry side effects (keyed constants — never inline strings)
// ---------------------------------------------------------------------------
// The constants live in the leaf module stepIds.ts (the galleries read
// them, and a gallery → reducer import would cycle through the question
// registry — spec 090 T042); re-exported here so existing imports of
// this module keep working.
export {
  MECHANISMS_STEP_ID,
  TOUCH_STEP_ID,
  CHOOSE_BASE_STEP_ID,
} from "./stepIds.ts";
import { CHOOSE_BASE_STEP_ID } from "./stepIds.ts";

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
// Injected dependencies (replacing direct lib/stores imports)
//
// All deps are functions — the caller injects concrete implementations.
// Tests inject mocks; SurveyView (T028) injects the real store actions + helpers.
// ---------------------------------------------------------------------------

export interface ReducerDeps {
  // --- Store actions (from workingCopyStore) ---
  // (lockDesktop retired at spec 090 T041, setTouchLayoutJson + clearStale
  // at T042: R1/R2 re-homed to lib/assignLoopCompletion.ts — D-090-38.)
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

  // --- Lib helpers ---
  // (buildTouchLayoutJson + resolveBaseTouchJson retired at spec 090
  // T042: the R2 build now composes them directly in
  // lib/assignLoopCompletion.ts — D-090-38.)

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
   * Write the merged IR back to the working copy via the OVERLAY-PRESERVING
   * store setter (`setWorkingIR`, NOT `setIR`). These are incremental patches to
   * the working IR and must preserve the carve-deletion overlay
   * (deletedNodeIds/deletedItemIds/undoStack). Called only when the mutate flag
   * is on AND a mutate request actually changed the IR.
   */
  setWorkingIR?: (ir: KeyboardIR) => void;

  // --- touch re-propagation (spec-014 US2, T024) ---
  // (getStaleSteps retired at spec 090 T041 with R1: re-propagation is
  // driven from lib/assignLoopCompletion.ts, which reads the closure
  // from the store directly — D-090-38.)

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
    // (No marks case: spec 090 T023 retired it. The marks-treatment
    // module's apply runs the mark guards from the decision value's
    // completion payload, and MarksStepHost mirrors the R10 migration
    // determination into the session.)

    // (No mechanisms case: spec 090 T041 retired R1. The physical-layout
    // decision records step-side in AddPhysicalAdapter, and the lock +
    // re-propagation effects re-homed to lib/assignLoopCompletion.ts,
    // fired by the adapter and by journey-runner's replay — D-090-38.)

    // (No touch case: spec 090 T042 retired R2. The touch-layout
    // decision records step-side in AddTouchAdapter, and the build +
    // stale-clear effects re-homed to lib/assignLoopCompletion.ts,
    // fired by the adapter and by journey-runner's replay — D-090-38.)

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
// per-module gate) and hands the returned patch to the injected sink. A
// second pass runs composed applies whose own question went unanswered
// when the completion recorded one of their `requires` inputs (A6).
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
 * Pass 1: for each answer whose module declares `apply`: build the
 * ApplyContext (the live IR is re-read per answer, so a later apply in the
 * same completion sees an earlier apply's IR write), call `apply`, verify
 * every returned channel against the authorization table, and hand the
 * patch to the injected sink. An unauthorized channel throws
 * {@link ApplyChannelError} before the sink is called — no partial
 * patch (A3).
 *
 * Pass 2: a composed apply (A6) whose own question went unanswered — a
 * survey result carries no entry for an unanswered question — still runs
 * when this completion recorded one of its declared `requires` inputs.
 * See the pass-2 note at the loop below.
 *
 * A no-op when the host injected no patch sink.
 */
export function applyDecisionEffects(
  result: SurveyPhaseResult,
  deps: ReducerDeps,
): void {
  if (deps.applyWorkingCopyPatch === undefined) return;
  const sink = deps.applyWorkingCopyPatch;
  const decisions: DecisionSet = deps.getDecisions?.() ?? {};

  /** Run one module's apply through the authorization check into the sink. */
  const runApply = (
    questionId: string,
    mod: QuestionModule,
    value: string | string[] | undefined,
  ): void => {
    const apply = mod.apply;
    if (apply === undefined) return;
    const writes = mod.writes ?? [];
    const ctx: ApplyContext = {
      ir: deps.getWorkingIR?.() ?? null,
      writes,
      decisions,
      currentHistoryEntryState: deps.getHistoryEntryState?.() ?? null,
    };
    const patch = apply(value, ctx);
    if (!assertPatchChannelsAuthorized(questionId, mod, patch)) return;
    sink(patch, writes);
  };

  // Pass 1 — per-answer dispatch, in answer order (A8).
  const ran = new Set<string>();
  for (const answer of result.answers) {
    const mod = questionRegistry[answer.questionId];
    if (mod === undefined || mod.apply === undefined) continue;
    ran.add(answer.questionId);
    runApply(answer.questionId, mod, answer.value as string | string[] | undefined);
  }

  // Pass 2 — input-triggered dispatch for composed applies (A6). A survey
  // result omits UNANSWERED questions entirely, so a module whose question
  // the author legitimately left blank never appears in `result.answers`
  // and pass 1 cannot reach it — yet its apply may be a composed effect
  // whose inputs are OTHER decisions this completion just recorded. The
  // case that forced this: il_copyright_holder is optional and terminal,
  // blank means "holder = author" (spec 064 D1), and its apply is the sole
  // owner of the attribution channel; with per-answer dispatch only, the
  // attribution never landed and the Output screen blocked every download
  // (CI, PR #1974). So: a module that declares `apply`, was not answered,
  // and names a `requires` decision this completion recorded also runs —
  // with `undefined` as its value, composing from ctx.decisions like any
  // composed apply. Registry order keeps the pass deterministic; modules
  // already run in pass 1 are not re-run, and a module whose inputs this
  // completion did not touch does not fire.
  const recordedIds = new Set<string>();
  for (const answer of result.answers) {
    const mod = questionRegistry[answer.questionId];
    if (mod === undefined) continue;
    for (const id of mod.provides ?? []) recordedIds.add(id);
  }
  if (recordedIds.size > 0) {
    for (const [questionId, mod] of Object.entries(questionRegistry)) {
      if (mod.apply === undefined || ran.has(questionId)) continue;
      const requires = mod.requires ?? [];
      if (requires.length === 0) continue;
      if (!requires.some((id) => recordedIds.has(id))) continue;
      runApply(questionId, mod, undefined);
    }
  }
}
