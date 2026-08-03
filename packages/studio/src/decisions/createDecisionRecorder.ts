// createDecisionRecorder — compose the recording modules into the single
// `recordDecision` callback injected into `ReducerDeps` (specs/053 T019).
//
// This is the only place the three recorders meet, and the only place that knows
// how a step's captured source change is attributed to a decision. Keeping that
// judgement here — rather than inside `StudioShell`'s dep memo — means it can be
// tested without mounting the shell.
//
// ATTRIBUTION RULE (specs/055-legible-decision-trail FR-019/FR-019a)
//
// A step boundary yields ONE net source diff (snapshotSource.ts). That capture is
// attached to EVERY decision recorded at that boundary:
//
//   - an editor step: one aggregated entry, and the boundary diff is its change;
//   - a question step that resolved a single answer: same;
//   - a question step that resolved several answers: the SAME capture is
//     attached to each of those entries, and each one's `sharedWith` names its
//     co-decisions (their `entryId`s, never its own) — a joint statement of what
//     those decisions did together, not a claim that any one of them did it
//     alone.
//
// This is still exactly ONE comparison per boundary (FR-019a) — the capture
// itself is computed once, below; only the attach step fans it out.
//
// A single-decision boundary is unchanged from before this feature:
// `sharedWith` is absent, and the entry claims the change outright. An empty
// array would say "shared with nobody", which is a different and wrong
// statement, so the multi-vs-single branch below is not optional plumbing.

import type {
  BaseKeyboard,
  DecisionImpact,
  DiscoveryAxisVector,
  KeyboardIR,
  MechanismAssignment,
  RemovalCapability,
  SurveyPhaseResult,
} from "@keyboard-studio/contracts";
import { useDecisionLogStore } from "./decisionLogStore.ts";
import { recordSurveyAnswers, type ProposalLookup } from "./recordSurveyAnswers.ts";
import { recordEditorStep, type DeletionCounts } from "./recordEditorStep.ts";
import {
  recordBaseContribution,
  type InstantiatedMode,
} from "./recordBaseContribution.ts";
import type { SourceSnapshotter } from "./snapshotSource.ts";

export interface DecisionRecorderDeps {
  /** Boundary source-capture, built by `createSourceSnapshotter`. */
  snapshotter: SourceSnapshotter;
  /** Cumulative carve deletion sizes from the working-copy store. */
  getDeletionCounts: () => DeletionCounts;
  /** Ids of the carved-away nodes/items, for the bounded sample. */
  getDeletedIds: () => readonly string[];
  /**
   * The store's phase-C physical mechanism assignments — see
   * `RecordEditorStepDeps.getMechanismAssignments` (recordEditorStep.ts) for
   * why this must stay `selectDesktopAssignments(phaseResults)` and never a
   * forked filter.
   */
  getMechanismAssignments: () => readonly MechanismAssignment[];
  /** The base IR the working copy was instantiated from, or `null`. */
  getBaseIr: () => KeyboardIR | null;
  /** Ids of the carved-away rule/store nodes, for the carve projection. */
  getDeletedNodeIds: () => ReadonlySet<string>;
  /** Ids of the carved-away store-slot items, for the carve projection. */
  getDeletedItemIds: () => ReadonlySet<string>;
  /**
   * The keyboard identity, once known. Read on every completion so pre-identity
   * entries get stamped the moment an identity exists (FR-004) without any step
   * having to announce it.
   */
  getKeyboardId: () => string | null;
  /**
   * The chosen base keyboard, or `null` before instantiation — feeds
   * `recordBaseContribution` at `choose_base` completion only (specs/055
   * FR-030..FR-035, research D-11).
   */
  getBaseKeyboard: () => BaseKeyboard | null;
  /** Axes the studio has derived onto the working copy so far. */
  getIrAxes: () => Partial<DiscoveryAxisVector>;
  /** `null` before instantiation; one of the two literals once instantiated. */
  getInstantiationMode: () => InstantiatedMode | null;
  /**
   * Same map `CarveGallery` reads to build its own rail — see
   * `RecordBaseContributionDeps.getRemovalCapabilities` (recordBaseContribution.ts)
   * for why a starting count must be read against this rather than defaulted.
   */
  getRemovalCapabilities: () => Map<string, RemovalCapability>;
  /** Optional per-question proposal register — see recordSurveyAnswers.ts. */
  resolveProposal?: ProposalLookup;
}

/** Same shape guard the host uses on its generic completion path. */
function isSurveyPhaseResult(r: unknown): r is SurveyPhaseResult {
  return (
    typeof r === "object" &&
    r !== null &&
    Array.isArray((r as { answers?: unknown }).answers)
  );
}

/**
 * Build the `recordDecision` callback.
 *
 * Synchronous and non-throwing: it runs inside a step transition, so it must
 * never delay one and must never break one. The source capture it kicks off is
 * fire-and-forget — the entry is already recorded by the time the diff resolves,
 * and the diff is attached afterwards (see `attachImpact`'s write-once contract).
 */
export function createDecisionRecorder(
  deps: DecisionRecorderDeps,
): (event: { stepId: string; result: unknown }) => void {
  return ({ stepId, result }) => {
    const log = useDecisionLogStore.getState();

    // FR-004: carry the identity onto the record as soon as there is one. Entries
    // recorded before it are untouched apart from the record-level id.
    log.setKeyboardId(deps.getKeyboardId());

    // specs/055 FR-030..FR-035 (research D-11): the base baseline, recorded once
    // at `choose_base` completion. This fires here — not from a new event — because
    // `choose_base`'s instantiation runs inside `applyStepCompletion`, and StepHost
    // calls `recordStepCompletion` (which reaches this callback) AFTER that, so the
    // working copy already exists (Constitution Article IV: no new timer/event).
    // `recordBaseContribution` itself writes no entry when the store shows no
    // instantiated working copy yet — that null is not papered over here.
    //
    // This entry does not join `recordedIds` below: it is not a diff the
    // snapshotter's boundary capture describes (there is no "before" to compare
    // against — the working copy did not exist a moment ago), so it gets no
    // `DecisionImpact` attached.
    if (stepId === "choose_base") {
      recordBaseContribution({
        append: log.append,
        getBaseKeyboard: deps.getBaseKeyboard,
        getBaseIr: deps.getBaseIr,
        getIrAxes: deps.getIrAxes,
        getInstantiationMode: deps.getInstantiationMode,
        getRemovalCapabilities: deps.getRemovalCapabilities,
      });
    }

    const answerIds = isSurveyPhaseResult(result)
      ? recordSurveyAnswers(stepId, result, {
          append: log.append,
          ...(deps.resolveProposal !== undefined ? { resolveProposal: deps.resolveProposal } : {}),
        })
      : [];

    const editorId = recordEditorStep(stepId, result, {
      append: log.append,
      getDeletionCounts: deps.getDeletionCounts,
      getDeletedIds: deps.getDeletedIds,
      getMechanismAssignments: deps.getMechanismAssignments,
      getBaseIr: deps.getBaseIr,
      getDeletedNodeIds: deps.getDeletedNodeIds,
      getDeletedItemIds: deps.getDeletedItemIds,
    });

    // Every entry recorded at this boundary — a question step's answers, or an
    // editor step's single aggregated entry (never both: a step is one or the
    // other). This is the boundary's full co-decision set, collected BEFORE the
    // capture resolves so `sharedWith` can name every sibling once it lands.
    const recordedIds: string[] = editorId !== null ? [editorId] : answerIds;

    // Advance the source baseline on EVERY completion, whether or not anything
    // was recorded. Skipping non-recording steps would make the next diff span
    // two boundaries and attribute another step's change to this one.
    void deps.snapshotter
      .captureAtBoundary()
      .then((impact) => {
        if (impact === null || recordedIds.length === 0) return;
        const store = useDecisionLogStore.getState();
        // One capture, attached to every entry this boundary recorded. Only a
        // "captured" impact carries `sharedWith` (the contract's other two
        // states have no per-file data to share); it is added only when there
        // is more than one co-decision, and always excludes the entry's own id.
        for (const entryId of recordedIds) {
          const forEntry: DecisionImpact =
            impact.state === "captured" && recordedIds.length > 1
              ? { ...impact, sharedWith: recordedIds.filter((id) => id !== entryId) }
              : impact;
          store.attachImpact(entryId, forEntry);
        }
      })
      .catch(() => {
        // Capture is best-effort by design: the decision is already recorded, and
        // an entry with no captured change is a state the trail renders. Swallowed
        // rather than surfaced because there is nothing the author could do.
      });
  };
}
