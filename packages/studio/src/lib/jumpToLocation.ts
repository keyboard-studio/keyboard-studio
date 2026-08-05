// jumpToLocation — the ONE jump implementation (spec 057 FR-012, FR-045, FR-061).
//
// The decision trail's deep links and the footer's journey dots both call
// this. (The footer IS the breadcrumb per Q7, so there is no third caller.)
// Having one implementation is the requirement, not a tidiness preference:
// two would eventually disagree about which locations are reachable, and the
// author would learn that "the same jump" behaves differently depending on
// which surface they started from.
//
// FR-012: a jump ARRIVES or it REFUSES. It never partially arrives — the
// traversal target and the hash are set together, or neither is. That is why
// the resolve step runs to completion before anything is written.

import { formatLocation, locationsEqual, type Location } from "./location.ts";
import { navigateTo } from "./navigate.ts";
import { resolveLocation, type ResolveContext, type UnreachableReason } from "./resolveLocation.ts";
import { manifest } from "../steps/manifest.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import { snapshotTraversal, useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useStepWalkStore } from "../stores/stepWalkStore.ts";
import { stepPositionIds } from "./stepWalk.ts";

export interface JumpOptions {
  /** Remember where we came from so FR-034's "return" affordance has a target. */
  readonly returnTo?: Location;
}

export type JumpOutcome =
  | { readonly kind: "arrived"; readonly at: Location }
  | { readonly kind: "refused"; readonly reason: UnreachableReason }
  | { readonly kind: "degraded"; readonly at: Location; readonly reason: UnreachableReason };

// ---------------------------------------------------------------------------
// Pending jump slot.
//
// A jump can name a QUESTION inside a step, but the step's own runner decides
// which question it shows. Rather than give the survey a second notion of
// position (FR-006), the request is parked here and consumed by the runner on
// arrival — a hand-off, not a second source of truth. Module-level, so it
// survives the route unmount the jump itself causes, and dies with the JS
// context.
// ---------------------------------------------------------------------------

export interface PendingJump {
  /** The question the author asked for, if the jump named one. */
  readonly question?: string;
  /** Where to send them back to after a revision (FR-034). */
  readonly returnTo?: Location;
}

let pendingJump: PendingJump | null = null;

/**
 * Read the pending jump WITHOUT consuming it. For a surface that needs to know
 * a return target is available (e.g. to render "back to the decision trail")
 * while the author is still on the question.
 */
export function peekPendingJump(): PendingJump | null {
  return pendingJump;
}

/**
 * Read and clear the pending jump. Called by the step runner once it has
 * honoured the request, so a later arrival at the same step by ordinary
 * walking does not silently re-target a question.
 */
export function consumePendingJump(): PendingJump | null {
  const value = pendingJump;
  pendingJump = null;
  return value;
}

/** Drop any pending jump — start-over, and the "continue from here" choice. */
export function clearPendingJump(): void {
  pendingJump = null;
}

// ---------------------------------------------------------------------------
// Pending welcome-gate location (spec 057 FR-015, D-9).
//
// A first-time visitor opening a shared link is forced to the welcome screen,
// and the gate rewrites the address bar to `#welcome` to avoid a same-value
// hash soft-lock. That rewrite used to DISCARD the requested location. This
// slot holds it across the gate so leaving welcome can honour it.
//
// Kept here beside the pending jump because it is the same kind of thing — a
// navigation intent deferred until the app is ready to act on it — and
// because one module owning both means there is one place to look when a
// deferred navigation does not fire.
// ---------------------------------------------------------------------------

let pendingWelcomeLocation: Location | null = null;

/** Remember the location a first-time visitor asked for, before the gate rewrites it. */
export function setPendingWelcomeLocation(loc: Location): void {
  pendingWelcomeLocation = loc;
}

/** Read and clear the held location. Returns null when the visitor arrived with no deep link. */
export function consumePendingWelcomeLocation(): Location | null {
  const value = pendingWelcomeLocation;
  pendingWelcomeLocation = null;
  return value;
}

/**
 * The live resolution context. Composed here, where the stores are reachable,
 * so `resolveLocation` itself stays pure and unit-testable against fixtures.
 *
 * Exported because the decision trail needs the SAME context to pre-resolve
 * its rows' jump targets (FR-035: state the reason in place of a link, rather
 * than a link that fails on activation). `decisions/` may not import `stores/`,
 * so StudioShell composes it and passes it down — and it must be this
 * function, not a second one assembled there, or a row could disagree with the
 * jump it offers about whether that jump is possible.
 */
export function liveResolveContext(): ResolveContext {
  return {
    manifest,
    questionRegistry,
    traversal: snapshotTraversal(),
    hasProject: useWorkingCopyStore.getState().baseKeyboard !== null,
    // Within-step stops for the stages whose walks are not flow questions
    // (a gallery's characters). Without this a footer dot naming a character
    // would resolve `question-not-in-build` and refuse itself — see
    // ResolveContext.stepPositions.
    stepPositions: stepPositionIds(useStepWalkStore.getState().walks),
  };
}

/**
 * Navigate to a location, or refuse with a stated reason.
 *
 * @param loc  where the author asked to go
 * @param opts `returnTo` is retained for the caller's return affordance
 *             (FR-034); it is NOT consumed by this function.
 */
export function jumpToLocation(loc: Location, opts?: JumpOptions): JumpOutcome {
  const resolution = resolveLocation(loc, liveResolveContext());

  if (resolution.kind === "unreachable") {
    // Nothing is written: not the traversal target, not the hash. A refusal
    // leaves the author exactly where they were, with a reason to show them.
    return { kind: "refused", reason: resolution.reason };
  }

  const target = resolution.kind === "reachable" ? resolution.location : resolution.to;

  // Traversal first, then the hash. The hash change is what unmounts and
  // remounts the wizard, so the target has to be in the store before the
  // remount reads it — the ordering is load-bearing, not stylistic.
  if (target.step !== undefined) {
    useSurveySessionStore.getState().jumpToStep(target.step);
    // The WITHIN-STEP half of the same "target before remount" ordering. The
    // step's own runner/gallery reads this cursor as its arrival position (see
    // lib/stepWalk.ts), which is what makes a jump into the MIDDLE of a stage
    // land where it says it will — including when the stage is the one the
    // author is already on, where no remount happens at all and the pending-jump
    // hand-off below would never be consumed.
    if (target.question !== undefined) {
      useStepWalkStore.getState().setStepCursor(target.step, target.question);
    }
  }

  pendingJump =
    target.question !== undefined || opts?.returnTo !== undefined
      ? {
          ...(target.question !== undefined ? { question: target.question } : {}),
          ...(opts?.returnTo !== undefined ? { returnTo: opts.returnTo } : {}),
        }
      : null;

  // Same-value hash assignment fires no hashchange (the soft-lock the welcome
  // gate's replaceState works around), so a jump within the tab the author is
  // already on skips the navigate entirely rather than appearing to hang.
  const currentHash = typeof window !== "undefined" ? window.location.hash : "";
  if (currentHash !== formatLocation({ route: target.route })) {
    navigateTo({ route: target.route });
  }

  return resolution.kind === "reachable"
    ? { kind: "arrived", at: target }
    : { kind: "degraded", at: target, reason: resolution.reason };
}

/**
 * Whether a jump to `loc` would land the author exactly where they already
 * are. The current-position dot uses this to refuse to be a jump target to
 * itself (FR-061) without duplicating the resolver's rules.
 */
export function isCurrentLocation(loc: Location, current: Location): boolean {
  return locationsEqual(loc, current);
}
