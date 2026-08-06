// outstandingWork — the ONE derivation of "what does this section still owe"
// (spec 061 FR-009…FR-016).
//
// WHY THERE IS EXACTLY ONE. Before this module the footer row and the top-bar
// nudge each answered "is there work left here" their own way: the row inferred
// it from whether a published within-step walk happened to survive, and the
// nudge inferred it from two hardcoded gallery counters. They disagreed, and
// both understated what was owed. FR-009 makes one derivation the contract and
// both surfaces its consumers, so a section cannot read complete in one place
// and unfinished in the other.
//
// PURE, AND THAT IS LOAD-BEARING TWICE OVER (FR-011, FR-016):
//   - `decisions/` may not import `stores/` (`.dependency-cruiser.cjs`'s
//     `decisions-layer` rule, with `tsPreCompilationDeps: true` so even a
//     type-only edge is blocked). `decisions/progressDots.ts` therefore cannot
//     reach this derivation through a store; it receives the result as an
//     INPUT, exactly the seam `stepWalks` already arrives on.
//   - FR-013's restored-draft case — an empty walk map with a blocked coverage
//     gate — is a two-line unit fixture here, where in a rendered tree it took
//     a whole shell mount. That is the difference that let D-8 happen.
// The React seam lives beside it in `hooks/useOutstandingWork.ts`, mirroring
// the `accountedForGate.ts` / `useAccountedForGate.ts` pair rather than forking
// a second composition idiom.
//
// CHARACTERS COME FROM THE COVERAGE GATE, NEVER FROM THE WALK (FR-012, FR-013).
// `InventoryCoverageGate` is sourced from the working copy
// (`hooks/useInventoryCoverageGate.ts` reads `phaseResults`, `touchLayoutJson`
// and `session.confirmedInventory` off `useWorkingCopyStore`), so it is already
// correct after a reload. Within-step walks are session-scoped and simply
// absent on a restored draft — which is precisely why an absent walk must never
// read as completeness here. A gallery's published character walk is skipped on
// purpose (see `unansweredRequiredStops`): counting it as well would
// double-count every uncovered letter.
//
// MARKS DEFER, THEY DO NOT DISCHARGE (FR-014, A3). This reads the RAW
// `InventoryCoverageGate`, not the mark-aware `accountedForGate` composed over
// it — so a character the author marked for later review still counts as owed
// here. Marking continues to relax only the gallery's own completion control.
// Its fail-closed `touchLayoutCorrupted` behaviour passes through untouched
// (FR-035): the gate reports the full touch inventory in that state, and this
// module reports whatever the gate says.

import type { Step } from "../steps/types.ts";
import { MECHANISMS_STEP_ID, TOUCH_STEP_ID } from "../steps/reducer.ts";
import type { Location } from "./location.ts";
import { positionTokenToChar, type StepWalkMap, type StepWalkPositions } from "./stepWalk.ts";
import type { InventoryCoverageGate } from "./unimplementedInventory.ts";

/** `Location.step`'s value type — see progressDots.ts's identical note on why
 * the step-id union is derived from `Location` rather than imported from the
 * store. */
type StepId = NonNullable<Location["step"]>;

/** What one section still owes. Produced only when the answer is non-zero. */
export interface OutstandingSection {
  /** A manifest step id. Never a character token, never a view mode (FR-033). */
  readonly stepId: string;
  /**
   * Required items still owed: uncovered inventory characters plus unanswered
   * required within-step stops. ALWAYS `> 0` — a section owing nothing is
   * absent from {@link OutstandingWork.sections}, never present with `0`
   * (FR-010), so a consumer can treat presence itself as the signal.
   */
  readonly count: number;
  /**
   * Names the STEP with no `question`, so arrival hands off to the section's
   * own in-page navigation rather than addressing a letter (FR-015, FR-033).
   */
  readonly location: Location;
  /** Localized section name, from the ONE label source shared with the row (FR-020). */
  readonly label: string;
}

/** The whole derivation's result — what both consumers read. */
export interface OutstandingWork {
  /**
   * Every section that owes something, in manifest order. Includes sections
   * AHEAD of the author as well as behind; consumers filter (the row asks about
   * one step at a time, the nudge uses {@link nudgeTarget}).
   */
  readonly sections: readonly OutstandingSection[];
  /** Lookup for the row. The same objects as {@link sections}. */
  readonly byStepId: ReadonlyMap<string, OutstandingSection>;
  /**
   * The manifest-EARLIEST section strictly behind the author that owes required
   * work, or `null` when nothing behind is owed — in which case the nudge is
   * absent, not empty (FR-018, FR-022).
   */
  readonly nudgeTarget: OutstandingSection | null;
}

/**
 * The pure derivation's parameter object. Named explicitly so a unit test can
 * construct FR-013's restored-draft case (`{ walks: {}, coverage: blocked }`)
 * directly, without a rendered tree.
 */
export interface OutstandingWorkInputs {
  /** Read, never forked or partially inlined (FR-012). */
  readonly coverage: InventoryCoverageGate;
  /** `steps/manifest.ts` — for order and membership. */
  readonly manifest: readonly Step[];
  /** May be EMPTY: an absent walk never reads as completeness (FR-013). */
  readonly walks: StepWalkMap;
  /** For the behind/ahead split. A terminal id ("done") is a valid input. */
  readonly activeStepId: string;
  /** The monotonic high-water mark — what makes "behind" mean "actually walked". */
  readonly visited: readonly string[];
  /** Injected, so this module has no i18n dependency of its own. */
  readonly label: (stepId: string) => string;
}

/**
 * Uncovered inventory characters this section owns, from the coverage gate.
 *
 * The desktop/touch split is the gate's own (`blockedOnDesktop` is always in
 * scope; `blockedOnTouch` only once a touch layout has been authored this
 * session), and the step ids are the canonical constants rather than literals
 * repeated here.
 */
function uncoveredCharacterCount(stepId: string, coverage: InventoryCoverageGate): number {
  if (stepId === MECHANISMS_STEP_ID) {
    return coverage.blockedOnDesktop ? coverage.unimplementedDesktop.length : 0;
  }
  if (stepId === TOUCH_STEP_ID) {
    return coverage.blockedOnTouch ? coverage.unimplementedTouch.length : 0;
  }
  return 0;
}

/**
 * Unanswered REQUIRED stops in a section's published walk.
 *
 * Two exclusions, both deliberate:
 *   - `required !== true` — an optional question the author left blank is not
 *     outstanding work (FR-007). Absent means not required (see
 *     `StepWalkPosition.required`), so a publisher that declares nothing
 *     contributes nothing.
 *   - a stop whose id decodes as a character token — those are a gallery's
 *     letters, counted above from the coverage gate, which is both
 *     reload-correct and the single coverage predicate (FR-012/FR-013).
 *     Recognising them by the codec rather than by a list of gallery step ids
 *     is the same classification `progressDots.ts`'s `isCharacterWalk` uses,
 *     and it means a new gallery is handled on the day it publishes a walk.
 */
function unansweredRequiredStops(positions: StepWalkPositions | undefined): number {
  if (positions === undefined) return 0;
  let count = 0;
  for (const position of positions) {
    if (position.required !== true) continue;
    if (position.done) continue;
    if (positionTokenToChar(position.id) !== null) continue;
    count += 1;
  }
  return count;
}

/**
 * What every section still owes, and which one the nudge should name.
 *
 * TOTAL: an empty `walks`, an empty `visited`, and a terminal `activeStepId`
 * are all valid inputs that return without throwing.
 */
export function outstandingWork(inputs: OutstandingWorkInputs): OutstandingWork {
  const { coverage, manifest, walks, activeStepId, visited, label } = inputs;

  // A terminal `activeStepId` ("done" / "unsupported") is not in the manifest,
  // so `findIndex` returns -1. That is not "everything is ahead" — the walk is
  // over, so every section the author actually visited is behind them. Guarding
  // explicitly here rather than letting `i < -1` silently exclude everything is
  // what lets the nudge keep working on the Output screen, which is exactly
  // where an author with an unplaced letter now ends up (FR-028).
  const activeIndex = manifest.findIndex((step) => step.id === activeStepId);
  const walkIsOver = activeIndex === -1;
  const visitedSet = new Set(visited);

  const sections: OutstandingSection[] = [];
  const byStepId = new Map<string, OutstandingSection>();
  let nudgeTarget: OutstandingSection | null = null;

  for (let i = 0; i < manifest.length; i++) {
    const step = manifest[i];
    if (step === undefined) continue;

    const count =
      uncoveredCharacterCount(step.id, coverage) + unansweredRequiredStops(walks[step.id]);
    // FR-010: absent, never present with `0`.
    if (count === 0) continue;

    const section: OutstandingSection = {
      stepId: step.id,
      count,
      location: { route: "survey", step: step.id as StepId },
      label: label(step.id),
    };
    sections.push(section);
    byStepId.set(step.id, section);

    // FR-018: the section the author is standing in, and anything ahead, are
    // never named — the author is already there and it carries its own in-page
    // indicators. `visited` is the second half of the test: a section that owes
    // work but was never walked is not work the author has passed by, so
    // naming it would send them forward through a gate.
    // First match wins, and the loop is in manifest order, so this is the
    // manifest-EARLIEST owed section (FR-005/FR-017, SC-005).
    if (nudgeTarget !== null) continue;
    const behind = walkIsOver || i < activeIndex;
    if (behind && visitedSet.has(step.id)) nudgeTarget = section;
  }

  return { sections, byStepId, nudgeTarget };
}
