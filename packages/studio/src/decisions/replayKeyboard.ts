// replayKeyboard — the pure replay engine (spec 093 FR-001, research §3,
// cross-spec analyze I-1).
//
// The working copy is `replay(starting point, apply(d1), …, apply(dn))`:
// every recorded decision's module `apply` runs in derived order over the
// starting point's IR, and the patches fold into one rebuilt state — the
// KeyboardIR **plus the overlay accumulator** carrying the four non-IR
// channels of 089's five-channel `WorkingCopyPatch` (`identity`,
// `attribution`, `helpDocs`, `historyEntryState`). An IR-only result could
// not satisfy FR-001/SC-003: identity and attribution land in the emitted
// source header, helpDocs in output files.
//
// Runner identity (I-4): the patch runner is `applyDecisionEffects` in
// steps/reducer.ts, but it is answer-shaped (it iterates step-completion
// answers) and store-coupled through injected deps, so replay cannot call
// it directly. Replay folds through the same two checked primitives the
// runner composes, with the same fail-fast behaviour:
//   - `assertPatchChannelsAuthorized` (steps/applyAuthorization.ts) — the
//     A3 channel authorization, checked for the whole patch before any
//     channel folds (an unauthorized channel throws, nothing folds);
//   - `applyMutatePatch` (steps/mutateApply.ts) — the A4 checked merge for
//     the `ir` channel (containment violations throw, IR unchanged).
// The remaining channels are whole-value replaces, exactly as the runner's
// sink applies them (last write wins, in derived order).
//
// Purity (research §3): the engine reads no store. `ApplyContext` for each
// apply is built from the fold so far — `ir` is the folded IR, and
// `currentHistoryEntryState` is the overlay's folded history-entry state,
// never a live store. `ctx.decisions` is the full input DecisionSet for
// every apply: an apply builds each channel's complete next value from
// `ctx.decisions` (089 contract), so composing from the final set is what
// makes a downstream change refresh the channels that read it.
//
// Inactive records (spec 093 scenario 6) are skipped: a gated-off decision
// contributes no apply, exactly as its question never runs in the live
// flow. Records with no provider in the caller's module set, or whose
// module declares no `apply`, likewise contribute nothing.

import type { IRPath, KeyboardIR } from "@keyboard-studio/contracts";
import type { ApplyContext, QuestionModule, WorkingCopyPatch } from "../survey/types.ts";
import { assertPatchChannelsAuthorized } from "../steps/applyAuthorization.ts";
import { applyMutatePatch } from "../steps/mutateApply.ts";
import type { DecisionId, DecisionSet } from "./decisionTypes.ts";
import { indexProviders } from "./orderDecisions.ts";

/**
 * The folded non-IR channel state (data-model.md, OverlayState): each
 * channel's last write in derived order, held beside the IR everywhere
 * the IR goes — checkpoints, rebuild results, the installed working copy.
 */
export type OverlayState = Omit<WorkingCopyPatch, "ir">;

/** The empty overlay: index 0 of every replay, before any `apply`. */
export function emptyOverlay(): OverlayState {
  return {};
}

/** The state a replay folds: an IR plus its overlay accumulator. */
export interface ReplayState {
  ir: KeyboardIR;
  overlay: OverlayState;
}

/** One checkpoint: the folded state after the first `orderIndex` decisions. */
export interface ReplayCheckpoint {
  /** The decision whose `apply` produced this state; null at index 0. */
  decisionId: DecisionId | null;
  /** Position in the derived order: state after this many decisions. */
  orderIndex: number;
  ir: KeyboardIR;
  overlay: OverlayState;
}

/** Resolve the providing module for a decision (the registry's one provider). */
export type DecisionProvider = (id: DecisionId) => QuestionModule | undefined;

/** Build a {@link DecisionProvider} from a module list (fail-fast on duplicates). */
export function providerFromModules(
  modules: readonly QuestionModule[],
): DecisionProvider {
  const index = indexProviders(modules);
  return (id) => index.get(id);
}

/**
 * Fold one patch into a replay state. The caller has already run the A3
 * authorization check for the patch as a whole; the `ir` channel folds
 * through the A4 checked merge and the overlay channels replace whole.
 * Returns a fresh state; the input state is never mutated (checkpoints
 * retain their references safely).
 */
export function foldPatch(state: ReplayState, patch: WorkingCopyPatch, writes: readonly IRPath[]): ReplayState {
  const ir =
    patch.ir !== undefined ? applyMutatePatch(state.ir, patch.ir, writes) : state.ir;
  if (
    patch.identity === undefined &&
    patch.attribution === undefined &&
    patch.helpDocs === undefined &&
    patch.historyEntryState === undefined
  ) {
    return ir === state.ir ? state : { ir, overlay: state.overlay };
  }
  const overlay: OverlayState = { ...state.overlay };
  if (patch.identity !== undefined) overlay.identity = patch.identity;
  if (patch.attribution !== undefined) overlay.attribution = patch.attribution;
  if (patch.helpDocs !== undefined) overlay.helpDocs = patch.helpDocs;
  if (patch.historyEntryState !== undefined) overlay.historyEntryState = patch.historyEntryState;
  return { ir, overlay };
}

export interface ReplayRequest {
  /** The decision set to replay (the full set; applies compose from it). */
  decisions: DecisionSet;
  /** The derived order of decision ids (`orderByDependencies` over the registry). */
  order: readonly DecisionId[];
  /** Index into `order` to start from (0 = full replay). */
  fromIndex?: number;
  /** The folded state at `fromIndex` (required when `fromIndex > 0`). */
  fromState?: ReplayState;
  /** The starting point IR (required when `fromIndex` is 0 / absent). */
  startingPointIR?: KeyboardIR;
}

export interface ReplayOutcome {
  /** The rebuilt state after the last decision in `order`. */
  state: ReplayState;
  /**
   * Checkpoints for every index from the start index to the end of the
   * order, in ascending `orderIndex` order: element 0 is the state the
   * replay started from, element k the state after `order[startIndex + k]`
   * was folded. Concatenate with a prior trail (see replayCheckpoints.ts)
   * to maintain the full per-decision trail.
   */
  checkpoints: ReplayCheckpoint[];
  /** Decision ids whose module `apply` ran, in the order they ran. */
  applied: DecisionId[];
}

/**
 * Replay decisions over a starting point (full) or from a checkpoint
 * (incremental, FR-003): folds each active recorded decision's `apply` in
 * derived order and returns the rebuilt state plus the checkpoint trail
 * for the folded span.
 *
 * A module providing several decisions applies ONCE, at its first provided
 * id in the order, with that record's value — the writers broadcast one
 * answer value to every provided id (088 C-2), and the live runner calls
 * `apply` once per answer, not once per decision.
 */
export function replayKeyboard(
  providerFor: DecisionProvider,
  request: ReplayRequest,
): ReplayOutcome {
  const { decisions, order } = request;
  const fromIndex = request.fromIndex ?? 0;
  let state: ReplayState;
  if (fromIndex === 0) {
    if (request.startingPointIR === undefined) {
      throw new Error("replayKeyboard: startingPointIR is required for a full replay");
    }
    state = { ir: request.startingPointIR, overlay: emptyOverlay() };
  } else {
    if (request.fromState === undefined) {
      throw new Error("replayKeyboard: fromState is required when fromIndex > 0");
    }
    state = request.fromState;
  }

  const checkpoints: ReplayCheckpoint[] = [
    {
      decisionId: fromIndex === 0 ? null : (order[fromIndex - 1] ?? null),
      orderIndex: fromIndex,
      ir: state.ir,
      overlay: state.overlay,
    },
  ];
  const applied: DecisionId[] = [];
  const appliedModules = new Set<QuestionModule>();

  for (let i = fromIndex; i < order.length; i++) {
    const id = order[i]!;
    const record = decisions[id];
    if (record !== undefined && record.inactive !== true) {
      const mod = providerFor(id);
      if (mod !== undefined && mod.apply !== undefined && !appliedModules.has(mod)) {
        appliedModules.add(mod);
        // The value this module's apply receives: its first recorded
        // provided decision's value (the broadcast answer).
        let value: unknown;
        let hasRecord = false;
        for (const providedId of mod.provides ?? []) {
          const r = decisions[providedId];
          if (r !== undefined && r.inactive !== true) {
            value = r.value;
            hasRecord = true;
            break;
          }
        }
        if (hasRecord) {
          const writes = mod.writes ?? [];
          const ctx: ApplyContext = {
            ir: state.ir,
            writes,
            decisions,
            currentHistoryEntryState: state.overlay.historyEntryState ?? null,
          };
          const patch = mod.apply(value as string | string[] | undefined, ctx);
          // A3: the whole patch is authorized before any channel folds.
          if (assertPatchChannelsAuthorized(mod.definition.id, mod, patch)) {
            state = foldPatch(state, patch, writes);
          }
          for (const providedId of mod.provides ?? []) {
            if (decisions[providedId] !== undefined) applied.push(providedId);
          }
        }
      }
    }
    checkpoints.push({
      decisionId: id,
      orderIndex: i + 1,
      ir: state.ir,
      overlay: state.overlay,
    });
  }

  return { state, checkpoints, applied };
}
