// resolveLocation — can this Location be honoured, and if not, why?
//
// Spec 057 FR-012/FR-013/FR-014. Navigating to a location is a SINGLE
// operation: the author arrives, or is refused with a stated reason. There is
// no partial arrival, and no silent approximation — a jump that quietly landed
// somewhere near the target is the failure mode this function exists to make
// impossible.
//
// Pure by contract: it reads no store and touches no browser API. Every input
// arrives in `ResolveContext`, which is what makes the resolution table a unit
// test matrix rather than a DOM test (contract §4).

import type { Step } from "../steps/types.ts";
import type { ActiveStepId, TraversalSnapshot } from "../stores/surveySessionStore.ts";
import type { Location } from "./location.ts";

/**
 * The closed set of reasons a location can be refused. Each member exists
 * because a spec Edge Case or FR names it — this is not an open enum, and a
 * new member is a spec change, not an implementation detail.
 */
export type UnreachableReason =
  /** The step is not in this build's manifest (a renamed step in a restored draft). */
  | "step-not-in-build"
  /** The question is not in this build's registry (a retired question). */
  | "question-not-in-build"
  /** The step exists, but the active track does not walk it (project_name on adapt). */
  | "skipped-by-track"
  /** The step is ahead of the author's reached position, behind a lock or gate. */
  | "beyond-gate"
  /** No working copy is instantiated, so no wizard location exists. */
  | "no-project";

export type LocationResolution =
  | { readonly kind: "reachable"; readonly location: Location }
  | {
      readonly kind: "unreachable";
      readonly location: Location;
      readonly reason: UnreachableReason;
    }
  | {
      readonly kind: "degraded";
      readonly requested: Location;
      readonly to: Location;
      readonly reason: UnreachableReason;
    };

/**
 * Which questions exist in this build. A narrow view of the real
 * `questionRegistry` — the resolver needs membership only, and taking the
 * whole registry type would drag the survey layer into every test fixture.
 */
export type QuestionRegistryView = Readonly<Record<string, unknown>>;

export interface ResolveContext {
  readonly manifest: readonly Step[];
  readonly questionRegistry: QuestionRegistryView;
  readonly traversal: TraversalSnapshot;
  /** Whether a working copy exists at all. */
  readonly hasProject: boolean;
  /**
   * Addressable WITHIN-STEP stops per step id, from the walks components
   * publish into `stores/stepWalkStore.ts` (see lib/stepWalk.ts's header).
   *
   * Why this is a second membership source alongside `questionRegistry` rather
   * than an extension of it: the registry holds FLOW QUESTIONS — pure
   * descriptor modules with prompts and answer types. A gallery stage's stops
   * are characters, which are not questions and have no registry entry to add.
   * A location naming one is still perfectly addressable, so membership is
   * "in the registry OR in this step's published walk"; a position in neither
   * is `question-not-in-build`, exactly as before.
   *
   * Optional: absent (or a step with no published walk) behaves precisely as it
   * did before this field existed — registry membership alone.
   */
  readonly stepPositions?: Readonly<Record<string, readonly string[]>>;
}

/** The route that owns the wizard. Only this route can carry a step. */
const WIZARD_ROUTE = "survey";

/**
 * Steps the active track walks. `project_name` is the one off-spine step whose
 * membership depends on the track: the copy track walks it, the adapt track
 * skips it (steps/manifest.ts's track-routing docstring). Everything else on
 * the manifest is track-independent, so this is a single named exception
 * rather than a second traversal model.
 */
function walkedByTrack(stepId: string, traversal: TraversalSnapshot): boolean {
  if (stepId !== "project_name") return true;
  return traversal.selectedTrack === "copy";
}

/**
 * Has the author actually been here? A step is reached when it is where they
 * are now, or somewhere they have already walked. Anything else is ahead of
 * them — and the walk's own gates are what make it ahead, so honouring a jump
 * there would skip a lock the wizard enforces.
 *
 * `visited` is the load-bearing term, not `history` (defect, 2026-08-05).
 * `history` is a BACK-STACK: every backward primitive truncates it, so after a
 * jump back to an early step it no longer mentions the stages the author had
 * already finished — and this predicate then called their own completed work
 * "ahead of them", refusing every dot in the row's right-hand half. `visited`
 * is the monotonic high-water mark (see surveySessionStore.ts), which is what
 * "has the author actually been here" always meant. `history` is kept as a
 * disjunct so a snapshot that predates the slot still resolves.
 *
 * This does not widen what a jump may skip: a step absent from BOTH is one the
 * author never reached, and it is still refused as `beyond-gate`.
 */
function isReached(stepId: ActiveStepId, traversal: TraversalSnapshot): boolean {
  return (
    traversal.activeStepId === stepId ||
    traversal.visited?.includes(stepId) === true ||
    traversal.history.includes(stepId)
  );
}

/**
 * Is `positionId` an addressable stop inside `stepId` in this build?
 *
 * Two sources, checked in order (see `ResolveContext.stepPositions` for why
 * there are two): the flow-question registry, then the step's published
 * within-step walk. Nothing else — a position in neither is refused, which is
 * what keeps a retired question id in an old bookmark from silently resolving.
 */
function isAddressablePosition(
  positionId: string,
  stepId: string,
  ctx: ResolveContext,
): boolean {
  if (positionId in ctx.questionRegistry) return true;
  return ctx.stepPositions?.[stepId]?.includes(positionId) === true;
}

/**
 * The nearest valid ancestor of a location, per FR-014: drop `question`, then
 * drop `step`, then fall back to the route alone. Returns the first candidate
 * that itself resolves `reachable`, which is the guarantee a `degraded`
 * result's `to` carries (contract §4).
 */
function nearestReachableAncestor(loc: Location, ctx: ResolveContext): Location {
  const candidates: Location[] = [];
  if (loc.question !== undefined && loc.step !== undefined) {
    candidates.push({ route: loc.route, step: loc.step });
  }
  if (loc.step !== undefined) {
    candidates.push({ route: loc.route });
  }
  for (const candidate of candidates) {
    if (resolveLocation(candidate, ctx).kind === "reachable") return candidate;
  }
  // The route alone is always addressable — a tab with nothing selected in it
  // is a valid place to be, which is why the recursion terminates here rather
  // than admitting a "nowhere" outcome FR-012 has no case for.
  return { route: loc.route };
}

/** Build the degraded result for `reason`, or an `unreachable` one when the
 * requested location IS its own nearest ancestor (a bare route). */
function refuse(
  loc: Location,
  reason: UnreachableReason,
  ctx: ResolveContext,
): LocationResolution {
  if (loc.step === undefined) {
    return { kind: "unreachable", location: loc, reason };
  }
  return { kind: "degraded", requested: loc, to: nearestReachableAncestor(loc, ctx), reason };
}

/**
 * Resolve a location against this build and this author's walk.
 *
 * Referentially transparent: the same `(loc, ctx)` always yields the same
 * result.
 */
export function resolveLocation(loc: Location, ctx: ResolveContext): LocationResolution {
  // A location with no step addresses a whole tab. Tabs are always reachable —
  // the wizard's gates govern positions inside the walk, not which tab the
  // author may look at.
  if (loc.step === undefined) {
    return { kind: "reachable", location: loc };
  }

  // A step only means something inside the wizard, and only once there is a
  // project to be somewhere in.
  if (loc.route !== WIZARD_ROUTE || !ctx.hasProject) {
    return refuse(loc, "no-project", ctx);
  }

  const step = ctx.manifest.find((s) => s.id === loc.step);
  if (step === undefined) {
    return refuse(loc, "step-not-in-build", ctx);
  }
  if (!walkedByTrack(step.id, ctx.traversal)) {
    return refuse(loc, "skipped-by-track", ctx);
  }
  if (!isReached(loc.step, ctx.traversal)) {
    return refuse(loc, "beyond-gate", ctx);
  }

  if (loc.question !== undefined && !isAddressablePosition(loc.question, loc.step, ctx)) {
    return refuse(loc, "question-not-in-build", ctx);
  }

  return { kind: "reachable", location: loc };
}
