// workToDo — the pure "what's left to reconfirm or account for" aggregator
// (spec 079 R-10, data-model.md §6, US3 T049/T056).
//
// PURE: no store imports (depcruise `steps-layer` forbids steps/ importing
// stores/). Every fact this module needs — which answers are flagged and why,
// how many mechanisms/touch characters are unaccounted for, which `not-asked`
// steps now have a live gate that says `applies` — is derived elsewhere
// (hooks/useWorkToDo.ts assembles the input from the stores) and handed in
// already computed. That split is what lets `selectWorkToDo` be unit-tested
// with plain fixtures and reused, unchanged, by the journey-strip grouping
// (`decisions/progressDots.ts`, T062) and by each step's own
// `FlaggedAnswersList` (`components/FlaggedAnswersList.tsx`).
//
// selectWorkToDo() NEVER mutates and is NEVER persisted (data-model.md §6):
// every call re-derives the answer from the current stores.

import type { ReproposalReason, StepId } from "./answerTypes.ts";

/** One saved answer whose view is `reproposed`, or `proposed` on an
 * already-confirmed screen (spec 079 US3 item 4's flag rule). */
export interface FlaggedAnswerInput {
  readonly answerId: string;
  readonly screenId: string;
  readonly reason: ReproposalReason;
}

/** A `not-asked` step whose live gate now says the question applies (FR-067). */
export interface NotAskedGateInput {
  readonly reason: ReproposalReason;
  readonly gateApplies: boolean;
}

export interface WorkToDoInput {
  /** Per-step flagged answers, already resolved against the current evidence. */
  readonly flagged: Readonly<Record<StepId, readonly FlaggedAnswerInput[]>>;
  /** `AccountedForGate.unaccountedDesktop/unaccountedTouch` lengths. */
  readonly unaccounted: { readonly mechanisms: number; readonly touch: number };
  /** Steps currently recorded as `not-asked`, keyed by step id. */
  readonly notAsked: Readonly<Record<StepId, NotAskedGateInput>>;
}

export type WorkItem =
  | { kind: "reproposed"; stepId: StepId; screenId: string; answerId: string; reason: ReproposalReason }
  | { kind: "unassigned"; stepId: "mechanisms" | "touch"; count: number }
  | { kind: "now-applicable"; stepId: StepId; reason: ReproposalReason };

export type WorkKind = WorkItem["kind"];

const MECHANISMS_STEP_ID = "mechanisms";
const TOUCH_STEP_ID = "touch";

/**
 * Combine (a) reproposed/newly-relevant saved answers, (b) unaccounted
 * mechanism/touch counts, and (c) `not-asked` steps whose gate now applies,
 * into one per-step work-to-do map. A step absent from the flagged/notApplied
 * inputs and with nothing unaccounted gets no entry at all — never an empty
 * array — so callers can test "unaffected steps have none" with a plain
 * `in` / property-absence check.
 */
export function selectWorkToDo(input: WorkToDoInput): Record<StepId, WorkItem[]> {
  const out: Record<StepId, WorkItem[]> = {};

  for (const [stepId, items] of Object.entries(input.flagged)) {
    if (items.length === 0) continue;
    out[stepId] = items.map((item) => ({
      kind: "reproposed",
      stepId,
      screenId: item.screenId,
      answerId: item.answerId,
      reason: item.reason,
    }));
  }

  if (input.unaccounted.mechanisms > 0) {
    out[MECHANISMS_STEP_ID] = [
      ...(out[MECHANISMS_STEP_ID] ?? []),
      { kind: "unassigned", stepId: MECHANISMS_STEP_ID, count: input.unaccounted.mechanisms },
    ];
  }
  if (input.unaccounted.touch > 0) {
    out[TOUCH_STEP_ID] = [
      ...(out[TOUCH_STEP_ID] ?? []),
      { kind: "unassigned", stepId: TOUCH_STEP_ID, count: input.unaccounted.touch },
    ];
  }

  for (const [stepId, gate] of Object.entries(input.notAsked)) {
    if (!gate.gateApplies) continue;
    out[stepId] = [...(out[stepId] ?? []), { kind: "now-applicable", stepId, reason: gate.reason }];
  }

  return out;
}

/** A stable identity for one `WorkItem`, for delta comparison — never persisted. */
function workItemKey(item: WorkItem): string {
  switch (item.kind) {
    case "reproposed":
      return `reproposed:${item.stepId}:${item.screenId}:${item.answerId}`;
    case "unassigned":
      return `unassigned:${item.stepId}:${item.count}`;
    case "now-applicable":
      return `now-applicable:${item.stepId}`;
    default: {
      const _exhaustive: never = item;
      return _exhaustive;
    }
  }
}

/**
 * The `WorkItem`s present in `after` but not in `before` (spec 079 FR-016,
 * R-13). Pure — the FR-016 notice's "compute before and after the commit"
 * requirement, without either snapshot needing to be a store read itself
 * (both are `selectWorkToDo()`/`useWorkToDo()` outputs handed in already
 * computed, per this module's own header).
 */
export function diffWorkToDo(
  before: Readonly<Record<StepId, WorkItem[]>>,
  after: Readonly<Record<StepId, WorkItem[]>>,
): WorkItem[] {
  const beforeKeys = new Set<string>();
  for (const items of Object.values(before)) {
    for (const item of items) beforeKeys.add(workItemKey(item));
  }
  const delta: WorkItem[] = [];
  for (const items of Object.values(after)) {
    for (const item of items) {
      if (!beforeKeys.has(workItemKey(item))) delta.push(item);
    }
  }
  return delta;
}
