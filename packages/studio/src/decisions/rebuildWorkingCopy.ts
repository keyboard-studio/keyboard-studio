// rebuildWorkingCopy — the live rebuild wiring (spec 093 T009, FR-001/
// FR-002/FR-003). The StepHost/StudioShell seam: after a completion has
// recorded its decisions (088's writer) and run their incremental applies
// (089's runner), a decision change recalculates its downstream closure
// under the provenance rule and the working copy is REBUILT by replaying
// the decision set over the starting point from the checkpoint before
// the first changed decision. The rebuilt state — the IR **and the
// overlay channels folded from the accumulator** (I-1), not the IR alone —
// is installed over the incremental result, so the working copy the
// author sees is the derived one. The rebuild is a write only: no timer,
// no validation pass (validation still runs once in the existing D3
// cycle over the rebuilt copy).
//
// The core (`rebuildWorkingCopy`) is deps-injected and store-free, like
// the engine modules it composes; `rebuildWorkingCopyFromStores` is the
// live entry the host injects (mirroring liveExtraction's split). The
// checkpoint trail is module state beside the engine (FR-003: in-memory
// only, never persisted), reseeded whenever the starting point's IR
// reference changes (a new instantiation derives a fresh base IR object,
// so a reference change is exactly "a different starting point").
//
// Derived-provenance recompute note: the recalculation rule's
// `recomputeValue` seam stays uninjected here — a derived/default record
// whose module declares neither `extract` nor `lookupDefault` is kept
// as-is by the rule (never overwritten, never dropped), the same
// no-clobber fallback `repropagate` used for values it could not
// recompute. Editor-owned derivation functions can be injected later
// without changing this wiring's shape.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { QuestionModule } from "../survey/types.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import { useDecisionStore, getDecisionSnapshot } from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import type { Decision, DecisionId, DecisionSet } from "./decisionTypes.ts";
import type { ExtractContext } from "./extractContext.ts";
import { buildLiveExtractContext } from "./liveExtraction.ts";
import { filterGated, orderDecisions } from "./orderDecisions.ts";
import { recalculate, type RecalculateResult } from "./recalculate.ts";
import {
  seedTrail,
  replayFromCheckpoint,
  type CheckpointTrail,
} from "./replayCheckpoints.ts";
import {
  providerFromModules,
  type ReplayState,
} from "./replayKeyboard.ts";

/**
 * The derived order of decision ids: the registry's modules in
 * `orderByDependencies` order, each contributing its `provides` in
 * declared order — the order replay folds and recalculation visits.
 */
export function decisionOrderFor(
  modules: readonly QuestionModule[],
): DecisionId[] {
  return orderDecisions(modules).flatMap((m) => m.provides ?? []);
}

export interface RebuildDeps {
  /** All modules, any order — ordering is derived here. */
  modules: readonly QuestionModule[];
  /** The starting-point bundle re-extraction reads. */
  extractContext: ExtractContext;
  /** The bundle's source name for re-extracted records. */
  source?: string;
}

export interface RebuildRequest {
  /** The decision set AFTER the change (changed records already recorded). */
  decisions: DecisionSet;
  /** The decisions that changed. */
  changed: ReadonlySet<DecisionId>;
  /** The starting point IR the replay folds over (the store's `baseIr`). */
  startingPointIR: KeyboardIR;
  /** The session's checkpoint trail for the current starting point. */
  trail: CheckpointTrail;
  /**
   * Forwarded to the recalculation pass (spec 093 T017): visit every
   * record, not just the closure of `changed`. Set only by the
   * starting-point-change entry, together with a freshly seeded trail —
   * the resume set then covers the whole order and the replay is a full
   * replay from checkpoint 0.
   */
  visitAll?: boolean;
}

export interface RebuildOutcome {
  /** The recalculation pass's full result (lists for notices/reporting). */
  recalculated: RecalculateResult;
  /**
   * Records recalculation changed (reference-diffed against the input
   * set) — the caller writes exactly these back; the author's own
   * changed records are already in the store and are not re-written.
   */
  recordsToWrite: Decision[];
  /** The rebuilt state to install as the working copy. */
  state: ReplayState;
  /** The now-current checkpoint trail (store beside the engine). */
  trail: CheckpointTrail;
  /** Order index the replay resumed from (0 = full replay). */
  replayedFromIndex: number;
}

/**
 * Recalculate the closure of `changed`, then replay from the checkpoint
 * before the earliest decision whose apply the recalculation could have
 * affected (the changed ids plus every recomputed / inactivated /
 * reactivated id — gate flips outside the `requires` closure can sit
 * anywhere in the order, so they join the resume set).
 */
export function rebuildWorkingCopy(
  deps: RebuildDeps,
  request: RebuildRequest,
): RebuildOutcome {
  const providerFor = providerFromModules(deps.modules);
  const order = decisionOrderFor(deps.modules);

  // Gate evaluation over the post-change set, derived from conditional
  // routing exactly as the live runner derives it (filterGated over the
  // derived order, evaluated against the set as it stands).
  const activeModules = new Set(
    filterGated(orderDecisions(deps.modules), request.decisions),
  );
  const isActive = (id: DecisionId): boolean => {
    const mod = providerFor(id);
    return mod === undefined || activeModules.has(mod);
  };

  const recalculated = recalculate(
    {
      providerFor,
      modules: deps.modules,
      extractContext: deps.extractContext,
      ...(deps.source !== undefined ? { source: deps.source } : {}),
      isActive,
    },
    {
      decisions: request.decisions,
      changed: request.changed,
      order,
      ...(request.visitAll === true ? { visitAll: true } : {}),
    },
  );

  const recordsToWrite: Decision[] = [];
  for (const [id, record] of Object.entries(recalculated.decisions)) {
    if (record !== undefined && record !== request.decisions[id as DecisionId]) {
      recordsToWrite.push(record);
    }
  }

  const replayChanged = new Set<DecisionId>([
    ...request.changed,
    ...recalculated.recomputed,
    ...recalculated.inactivated,
    ...recalculated.reactivated,
  ]);
  const { outcome, trail } = replayFromCheckpoint(providerFor, request.trail, {
    decisions: recalculated.decisions,
    order,
    changed: replayChanged,
    startingPointIR: request.startingPointIR,
  });

  return {
    recalculated,
    recordsToWrite,
    state: outcome.state,
    trail,
    replayedFromIndex: outcome.checkpoints[0]?.orderIndex ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Live wiring
// ---------------------------------------------------------------------------

let sessionTrail: CheckpointTrail | null = null;
let sessionTrailBase: KeyboardIR | null = null;

/** Drop the session's checkpoint trail (start-over / tests). */
export function resetRebuildTrail(): void {
  sessionTrail = null;
  sessionTrailBase = null;
}

/**
 * Install a rebuilt state as the working copy: the IR replaces the
 * working IR through the overlay-preserving write (the edit overlays
 * are separate layers, not part of the fold), and each overlay channel
 * the accumulator carries replaces its store slot whole — the same
 * channel order as the 089 patch sink. A channel the replay never
 * folded (no decision wrote it) leaves the store's slot untouched, so
 * instantiation-seeded state (a Track 2 identity, the identity seed)
 * survives until a decision actually writes the channel. The carve
 * slice follows the same rule: it installs only when the replay folded
 * a carved-layout value (owned delta, D-090-24).
 */
function installRebuiltState(state: ReplayState): void {
  const wc = useWorkingCopyStore.getState();
  wc.setWorkingIR(state.ir);
  const { overlay } = state;
  if (overlay.identity !== undefined) wc.setIdentity(overlay.identity);
  if (overlay.attribution !== undefined) wc.setAttribution(overlay.attribution);
  if (overlay.helpDocs !== undefined) wc.setHelpDocs(overlay.helpDocs);
  if (overlay.historyEntryState !== undefined) {
    wc.setHistoryEntryState(overlay.historyEntryState);
  }
  if (overlay.carve !== undefined) {
    // The carve slice installs wholesale — the persist-restore pattern
    // (the store's carve actions are per-item UI gestures; there is no
    // bulk action). Fresh Sets/Array so the store never aliases the
    // checkpoint trail's slice. `undoStack` is session state, not
    // decision state — the value cannot reconstruct it, and
    // `carveTouchKeepInert` has no value field (D-090-31); both are
    // left as they stand.
    useWorkingCopyStore.setState({
      deletedNodeIds: new Set(overlay.carve.deletedNodeIds),
      deletedItemIds: new Set(overlay.carve.deletedItemIds),
      disabledFamilyIds: new Set(overlay.carve.disabledFamilyIds),
      carveChars: new Set(overlay.carve.carveChars),
      carveDispositions: [...overlay.carve.carveDispositions],
      closedKeyboardCard: overlay.carve.closedKeyboardCard,
    });
  }
}

/**
 * The live entry (injected into StepHost's completion path via
 * `ReducerDeps.rebuildFromDecisions`): rebuild after a completion
 * recorded `changed` decisions. A no-op before a starting point exists
 * (no base instantiated — the incremental apply path alone carries
 * those completions, exactly as pre-093) and for an empty change set.
 * Synchronous; no timer.
 */
export function rebuildWorkingCopyFromStores(
  changed: readonly DecisionId[],
): RebuildOutcome | null {
  if (changed.length === 0) return null;
  const wc = useWorkingCopyStore.getState();
  if (wc.baseIr === null || wc.ir === null) return null;
  const startingPointIR = wc.baseIr;

  if (sessionTrail === null || sessionTrailBase !== startingPointIR) {
    sessionTrail = seedTrail(startingPointIR);
    sessionTrailBase = startingPointIR;
  }

  const ctx = buildLiveExtractContext();
  const source = ctx.catalog?.id ?? ctx.ir?.header.keyboardId ?? ctx.ir?.header.name;
  const outcome = rebuildWorkingCopy(
    {
      modules: Object.values(questionRegistry),
      extractContext: ctx,
      ...(source !== undefined ? { source } : {}),
    },
    {
      decisions: getDecisionSnapshot(),
      changed: new Set(changed),
      startingPointIR,
      trail: sessionTrail,
    },
  );
  sessionTrail = outcome.trail;

  if (outcome.recordsToWrite.length > 0) {
    useDecisionStore.getState().recordAll(outcome.recordsToWrite);
  }
  installRebuiltState(outcome.state);
  return outcome;
}
