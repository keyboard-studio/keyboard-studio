// progressDots — assemble the footer's whole-journey row (spec 057 §E/§G;
// FR-042, FR-049, FR-060…FR-063; US4/US6).
//
// THREE SOURCES, ONE ROW (data-model.md "ProgressDot"):
//
//   - completed  — one dot per completed QUESTION, from
//     `effectiveEntries(record.entries)` filtered to `payload.kind ===
//     "survey-answer"`, in record order. `effectiveEntries` already collapses
//     supersession chains, so "a revised question has exactly one dot" needs
//     no rule of its own (Q1/FR-042 resolved 2026-08-03).
//   - current    — the author's live position, from TRAVERSAL state, never
//     the record, so it stays accurate inside a step whose answers are not
//     yet recorded (FR-060). US6/T063.
//   - upcoming   — one dot per STAGE (manifest step) still ahead on this
//     author's path (FR-042's "upcoming stage" is stage-granularity, not
//     question-granularity — the manifest cannot know which individual
//     Phase A/B/F questions lie ahead inside a not-yet-reached battery step).
//
// DEPCRUISE BOUNDARY (why this does NOT import dashboard/manifestProjection.ts
// even though FR-049b is worded around it): `.dependency-cruiser.cjs`'s
// `decisions-layer` rule forbids `decisions/ -> dashboard/` outright — no
// exception for a read-only reference. `dashboard/manifestProjection.ts`
// itself contributes NOTHING beyond a 1:1 map over `steps/manifest.ts` (same
// order, `step.title` as `label`) — there is no derived ordering to duplicate
// by reading `ctx.manifest` (== the same `manifest` array) directly instead.
// "Read manifestProjection.ts, don't re-derive" and "don't import dashboard/
// from decisions/" both hold here: the caller (StudioFooter.tsx, which is
// NOT boundary-restricted) is free to import manifestProjection.ts/
// pathOverlay.ts if it ever needs the dashboard's own rendering of the spine;
// this module reads the same underlying `steps/manifest.ts` order through
// `ResolveContext.manifest` — the exact array manifestProjection.ts itself
// maps over, not a second ordering.
//
// WHAT "READ, DON'T RE-DERIVE" ACTUALLY MEANS HERE: the thing FR-049b forbids
// re-deriving is the FLOW MAP's graph-walking/layout logic (forks, joins,
// drill-downs, reserve nodes — buildStepGraph.ts's real complexity). Deciding
// "is this manifest STEP still ahead, and is it on this author's TRACK" is a
// much narrower question, and the answer already exists: `resolveLocation`
// (lib/resolveLocation.ts, spec 057 T011/T017 — ALREADY BUILT, not re-derived
// here) already encodes exactly "reached vs ahead" (`isReached`) and "this
// author's track" (`walkedByTrack`'s `skipped-by-track` reason). Calling it
// once per candidate step, rather than reimplementing either rule, is the
// same "one jump implementation" discipline jumpToLocation.ts documents for
// navigation — applied here to derive a row instead of to perform a jump.
//
// A LOAD-BEARING READING OF resolveLocation.ts: for ANY location that names a
// `step`, `refuse()` ALWAYS returns `kind:"degraded"` — never bare
// `kind:"unreachable"` (that variant is only reachable when `loc.step` is
// itself absent, which a bare-route location can't fail to resolve in the
// first place). So "beyond-gate" and "skipped-by-track" both surface here as
// `kind:"degraded"`, not `kind:"unreachable"` — see resolveLocation.test.ts's
// own fixtures, which assert `kind:"degraded"` for every named reason. Do not
// "fix" the `!== "reachable"` checks below to look for `kind:"unreachable"`;
// that variant is dead for a step-bearing location by the resolver's own
// construction, not by an oversight here.
//
// THE "CURRENT QUESTION" ARCHITECTURE GAP — NOW CLOSED (see lib/stepWalk.ts).
//
// As originally shipped, this module's finest granularity inside a
// not-yet-completed step was the STAGE, because nothing exposed "which question
// is SurveyRunner showing right now". The consequence the author hit: a stage
// with a dozen internal stops was one dot, and leaving it half-finished (a tab
// switch unmounts the step component) lost the position with no way back into
// the middle of it.
//
// The fix is a WITHIN-STEP WALK the owning component publishes — an ordered list
// of stops plus which one is current — arriving here as `input.stepWalks`. That
// is not the "second notion of position" FR-006 forbids: it is the SAME
// location model extended one level (route -> step -> position), with a single
// writer per step and nothing derived from the rendered tree (FR-062 holds).
// It reaches this module as an explicit input for the same reason
// `ctx.traversal` does — `decisions/` may not import `stores/`, and keeping the
// derivation a pure function of its inputs is what makes the row a unit-test
// matrix. StudioFooter.tsx is where the live store is read.
//
// `input.currentQuestion` predates this and is retained: it refines the STAGE
// dot for a step with no published walk (a deep-link arrival at a step whose
// runner has not published yet). A published walk supersedes it — the walk knows
// the whole row, not just the one stop a jump named.

import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
  effectiveEntries,
  PRE_IDENTITY_STEP_ID,
  type DecisionRecord,
} from "@keyboard-studio/contracts";
import {
  resolveLocation,
  type LocationResolution,
  type ResolveContext,
  type UnreachableReason,
} from "../lib/resolveLocation.ts";
import type { Location } from "../lib/location.ts";
import { positionTokenToChar } from "../lib/stepWalk.ts";
import type { StepWalkMap, StepWalkPositions } from "../lib/stepWalk.ts";
import type { OutstandingSection } from "../lib/outstandingWork.ts";
import { resolveMessage } from "../lib/i18nResolve.ts";
import { createLookupQuestionLabel } from "./lookupQuestionLabel.ts";

/** `Location.step`'s value type, without importing `ActiveStepId` from
 * `stores/surveySessionStore.ts` directly — that import edge is what the
 * `decisions-layer` depcruise rule blocks even for a type-only reference
 * (the rule's `tsPreCompilationDeps: true` option follows type imports too).
 * Deriving the type from the already-legal `Location` import (decisions/ ->
 * lib/ is allowed) gets the same type with no new edge. */
type StepId = NonNullable<Location["step"]>;

/** Reserved / out of scope for v1 (steps/manifest.ts's own comment). `help`'s
 * only legitimate advance is "done" (FORWARD_ONLY_GATE_NEXT in
 * surveySessionStore.ts), so `package` is never actually reachable — it must
 * never earn an "upcoming" dot promising a stage the walk will not visit. */
const PACKAGE_STEP_ID = "package";

/**
 * Questions that never earn a dot of their own, whatever their source (author's
 * call, 2026-08-04 — "every question except Confirm your language code").
 *
 * `il_language_code` asks the author to CONFIRM a subtag the language-name
 * answer already determined (IdentityLite seeds it from the resolved langtags
 * entry); it is a checkpoint on another decision rather than a decision of its
 * own, so a dot for it would offer navigation to a stop with nothing to revise
 * independently. Excluded here — the ONE place a dot is created — rather than in
 * each publisher, so the walk and the decision record cannot disagree about it.
 *
 * NOT an exclusion list for `notice`/acknowledgement screens: those record no
 * answer and appear in no walk as `done`, so they are already absent by
 * construction (spec 057 Q1's resolution) and must not be re-litigated here.
 */
const DOTLESS_QUESTION_IDS: ReadonlySet<string> = new Set([]);

// ---------------------------------------------------------------------------
// Dot data
// ---------------------------------------------------------------------------

export type ProgressDotKind = "completed" | "current" | "upcoming";

/** One mark in the footer's journey row (data-model.md "ProgressDot"). */
export interface ProgressDot {
  readonly kind: ProgressDotKind;
  /** The question id for `completed`/`current` (when question-accurate); the
   * step id for `upcoming`, and for `current` when only stage-accurate. */
  readonly id: string;
  readonly location: Location;
  /** Localized, never blank. */
  readonly label: string;
  /** Pre-resolved so a dot can render a refusal reason instead of a dead
   * control (FR-035 via FR-045) without a second `resolveLocation` call. */
  readonly resolution: LocationResolution;
  /**
   * How much required work this SECTION still owes — set only on a mark for a
   * section the author has already passed that owes something (spec 061 FR-006,
   * FR-008).
   *
   * Its PRESENCE is what distinguishes "outstanding behind" from "not yet
   * reached", both of which are `kind: "upcoming"` and render the same hollow
   * square (061 Q4 forbids a fourth shape, FR-031 keeps `ProgressDotKind` a
   * three-member union). The renderer therefore branches on a field it can see,
   * rather than guessing at the mark's position relative to the author — a guess
   * `resolution.reason` cannot support, since `resolveLocation` returns
   * `reachable` for a visited step whether it sits ahead or behind.
   */
  readonly outstandingCount?: number;
}

export interface ProgressDotsInput {
  readonly record: DecisionRecord;
  readonly ctx: ResolveContext;
  readonly i18n?: I18n;
  /** Defaults to the production `createLookupQuestionLabel(input.i18n)`; tests
   * inject a stub so they don't depend on which questions currently author an
   * `audit_label` (same seam lookupQuestionLabel.ts's own tests use). */
  readonly lookupQuestionLabel?: (questionId: string) => string | undefined;
  /** Refines the STAGE dot of a step that has published no walk (see the
   * architecture note above). Absent means the current position is known only
   * at step granularity. */
  readonly currentQuestion?: string;
  /**
   * Within-step stops per step id, from `stores/stepWalkStore.ts` (see
   * lib/stepWalk.ts). A step present here renders one dot PER STOP instead of a
   * single stage dot, and the decision-record dots for THOSE STOPS are suppressed
   * — the walk is authoritative for the questions it names, so a revisited step
   * does not get two dots for one question. Record entries for the same step that
   * the walk does NOT name are kept (see buildCompletedDots's `walkIdsByStep`).
   *
   * Absent (or a step with no entry) behaves exactly as before this field
   * existed: record-derived completed dots, one stage dot for the current
   * position, one stage dot per upcoming stage.
   */
  readonly stepWalks?: StepWalkMap;
  /** Where the author is inside each step, keyed by step id (same store). */
  readonly stepCursors?: Readonly<Record<string, string>>;
  /**
   * What each section still owes, from the ONE derivation
   * (`lib/outstandingWork.ts`, spec 061 FR-009). A section absent from this map
   * owes nothing — the derivation never emits a zero.
   *
   * Threaded by `components/StudioFooter.tsx` exactly as `stepWalks` is, and for
   * the same reason: the `decisions-layer` depcruise rule forbids
   * `decisions/ -> stores/` even for a type-only import, so this module cannot
   * read the derivation's store inputs itself. Absent behaves exactly as before
   * this field existed — a passed section then reads complete, because nothing
   * says otherwise.
   */
  readonly outstandingByStepId?: ReadonlyMap<string, OutstandingSection>;
}

// ---------------------------------------------------------------------------
// Stage labels — a closed-ish map from manifest step id to localized prose.
//
// Modeled on decisions/stageText.ts's `Record<ClosedUnion, msg descriptor>` +
// `resolveMessage` idiom (same directory, same purpose: one place a code
// becomes author-facing text). Keyed by plain `string` rather than
// `ActiveStepId` — narrowing to that closed union would need the same
// stores/-import this module deliberately avoids (see the StepId note
// above); the `stageLabel` fallback (the raw id) keeps an unmapped key
// non-fatal rather than narrowing at compile time.
//
// Message ids are new (`footer.stage.*`) — not previously named in tasks.md's
// T049 id list, but FR-048 ("ALL footer strings … go through the message
// catalog") leaves no other place for a stage's own name to come from:
// `steps/manifest.ts`'s `Step.title` is a bare English string, and this
// module cannot edit that file (out of ownership) even if it wanted to
// localize titles there instead.
// ---------------------------------------------------------------------------

const STAGE_LABEL_MESSAGE: Record<string, ReturnType<typeof msg>> = {
  identity: msg({ id: "footer.stage.identity", message: "Identity" }),
  choose_base: msg({ id: "footer.stage.chooseBase", message: "Choose base keyboard" }),
  track: msg({ id: "footer.stage.track", message: "Copy or adapt" }),
  project_name: msg({ id: "footer.stage.projectName", message: "Project name" }),
  characters: msg({ id: "footer.stage.characters", message: "Characters" }),
  marks: msg({ id: "footer.stage.marks", message: "Accents & marks" }),
  convenience: msg({ id: "footer.stage.convenience", message: "Convenience letters" }),
  carve: msg({ id: "footer.stage.carve", message: "Carve" }),
  mechanisms: msg({ id: "footer.stage.mechanisms", message: "Mechanisms" }),
  touch_seed_source: msg({ id: "footer.stage.touchSeedSource", message: "Touch seed" }),
  touch: msg({ id: "footer.stage.touch", message: "Touch layout" }),
  help: msg({ id: "footer.stage.help", message: "Help & credits" }),
};

/** A manifest step's localized name, falling back to the raw id (never
 * blank, never throws) for a step this map does not (yet) name.
 *
 * EXPORTED because FR-020 requires a section to be named identically in the
 * footer row and in the top-bar outstanding-work nudge, from ONE shared label
 * source. `hooks/useOutstandingWork.ts` injects this function into the pure
 * derivation, so the nudge's label and the row's label are the same call. */
export function stageLabel(stepId: string, i18n?: I18n): string {
  const descriptor = STAGE_LABEL_MESSAGE[stepId];
  return descriptor === undefined ? stepId : resolveMessage(i18n, descriptor);
}

// ---------------------------------------------------------------------------
// Unreachable-reason prose — shared vocabulary with the trail's deep links
// (tasks.md T040: "trail.jump.label" + one "trail.jump.unreachable.*" id per
// UnreachableReason, "shared by the trail and the footer's upcoming dots").
// T040 had not landed when this module was written (Phase 5/US3 is a
// different agent's concurrent work); the ids below are chosen to MATCH that
// convention on the expectation they converge, rather than invent a
// second naming scheme decisions/DecisionEntryRow.tsx would have to
// reconcile with later. If T040 lands with different ids, the two
// independently-authored `msg()` calls simply add two catalog entries for
// the same concept — not a build break.
// ---------------------------------------------------------------------------

const UNREACHABLE_REASON_MESSAGE: Record<UnreachableReason, ReturnType<typeof msg>> = {
  "step-not-in-build": msg({
    id: "trail.jump.unreachable.stepNotInBuild",
    message: "This step is not part of this build.",
  }),
  "question-not-in-build": msg({
    id: "trail.jump.unreachable.questionNotInBuild",
    message: "This question is not part of this build.",
  }),
  "skipped-by-track": msg({
    id: "trail.jump.unreachable.skippedByTrack",
    message: "Your track skips this step.",
  }),
  "beyond-gate": msg({
    id: "trail.jump.unreachable.beyondGate",
    message: "Not yet reached — finish the steps before it first.",
  }),
  "no-project": msg({
    id: "trail.jump.unreachable.noProject",
    message: "No project is open yet.",
  }),
};

/** Localized prose for an `UnreachableReason` — the ONE place a reason code
 * becomes author-facing text, shared (by naming convention, see above) with
 * the decision trail's deep links. */
export function unreachableReasonLabel(reason: UnreachableReason, i18n?: I18n): string {
  return resolveMessage(i18n, UNREACHABLE_REASON_MESSAGE[reason]);
}

// ---------------------------------------------------------------------------
// Completed dots — from the decision record (FR-042 "Completed question").
// ---------------------------------------------------------------------------

function buildCompletedDots(
  record: DecisionRecord,
  ctx: ResolveContext,
  lookupQuestionLabel: (questionId: string) => string | undefined,
  /**
   * Per step, the stop ids its published walk already covers. Those entries are
   * skipped here so a revisited step does not show two dots for one question —
   * but only THOSE, not the step wholesale.
   *
   * Per-question and not per-step because a stage can be walked by more than one
   * flow in sequence: the `characters` stage runs PhaseA's prefill confirmations
   * and then PhaseB, and the second runner's walk replaces the first's in the
   * store. Suppressing the whole step would have made PhaseA's dots VANISH once
   * PhaseB published — dots disappearing as the author moves forward, which is
   * the opposite of what the row is for. The union keeps them: the walk owns the
   * questions it knows about (it has live `done` state for them, which the record
   * cannot have until the step completes), and the record covers the rest.
   */
  walkIdsByStep: ReadonlyMap<string, ReadonlySet<string>>,
): ProgressDot[] {
  const dots: ProgressDot[] = [];
  for (const entry of effectiveEntries(record.entries)) {
    // `notice` nodes and pure-acknowledgement screens record NOTHING, so they
    // are excluded here by construction — no exclusion list, exactly Q1's
    // resolution. Editor-action / base-contribution entries likewise never
    // produce a dot of their own (data-model.md's "Upcoming dots" note) —
    // stages appear only via the upcoming projection below, never as a
    // completed-stage class that does not exist in the taxonomy.
    if (entry.payload.kind !== "survey-answer") continue;
    // A pre-identity entry has no step to jump to (PRE_IDENTITY_STEP_ID is a
    // placeholder, not a manifest id — pathOverlay.ts excludes it from the
    // walked-path overlay for the identical reason).
    if (entry.stepId === PRE_IDENTITY_STEP_ID) continue;

    const questionId = entry.payload.questionId;
    if (DOTLESS_QUESTION_IDS.has(questionId)) continue;
    if (walkIdsByStep.get(entry.stepId)?.has(questionId) === true) continue;
    const location: Location = {
      route: "survey",
      step: entry.stepId as StepId,
      question: questionId,
    };
    dots.push({
      kind: "completed",
      id: questionId,
      location,
      label: lookupQuestionLabel(questionId) ?? questionId,
      resolution: resolveLocation(location, ctx),
    });
  }
  return dots;
}

// ---------------------------------------------------------------------------
// The current dot — from TRAVERSAL state, never the record (FR-060, US6).
// ---------------------------------------------------------------------------

function buildCurrentDot(
  ctx: ResolveContext,
  currentQuestion: string | undefined,
  lookupQuestionLabel: (questionId: string) => string | undefined,
  i18n: I18n | undefined,
): ProgressDot | null {
  const stepId = ctx.traversal.activeStepId;
  // "done" / "unsupported" are terminal states, not manifest steps — once the
  // walk is over there is no "current stage" left to mark.
  if (stepId === "done" || stepId === "unsupported") return null;

  const location: Location =
    currentQuestion !== undefined
      ? { route: "survey", step: stepId, question: currentQuestion }
      : { route: "survey", step: stepId };

  const label =
    (currentQuestion !== undefined ? lookupQuestionLabel(currentQuestion) : undefined) ??
    stageLabel(stepId, i18n);

  return {
    kind: "current",
    id: currentQuestion ?? stepId,
    location,
    label,
    // Always "reachable" by construction: the author IS at `activeStepId`
    // right now (isReached's first disjunct), and a currentQuestion only
    // ever arrives here via a jump `resolveLocation` already approved.
    resolution: resolveLocation(location, ctx),
  };
}

// ---------------------------------------------------------------------------
// Upcoming stage dot — one per STAGE still ahead on this author's path (FR-042
// "Upcoming stage", FR-049).
// ---------------------------------------------------------------------------

/**
 * The upcoming dot for `step`, or `null` when this stage is not "ahead on this
 * author's path". `stepIndex`/`currentIndex` are manifest positions; a terminal
 * `activeStepId` arrives as `currentIndex === -1`, for which nothing is ahead.
 */
function aheadStageDot(
  step: { readonly id: string },
  stepIndex: number,
  currentIndex: number,
  ctx: ResolveContext,
  i18n: I18n | undefined,
): ProgressDot | null {
  // A terminal `activeStepId` ("done"/"unsupported") is not in the manifest at
  // all — findIndex returns -1, which would make EVERY step "after" position
  // -1 under a naive `stepIndex > currentIndex` test. Guard explicitly: once
  // the walk is over, nothing is still "ahead".
  if (currentIndex === -1) return null;
  if (stepIndex <= currentIndex) return null;
  // Reserved / out of scope for v1 — never promise a stage the walk will not
  // visit (see PACKAGE_STEP_ID).
  if (step.id === PACKAGE_STEP_ID) return null;

  const location: Location = { route: "survey", step: step.id as StepId };
  const resolution = resolveLocation(location, ctx);

  // A stage AHEAD of the current position that the author has nonetheless
  // already been to — they jumped back behind it. It resolves `reachable`
  // (surveySessionStore's `visited` high-water mark, not the truncated
  // back-stack), so it is jumpable, and it is rendered `completed` because
  // that is what it is: finished work sitting ahead of where they are
  // standing. FR-063's "dots ahead of the landing point are still present"
  // is satisfied by KEEPING this dot rather than, as before, by the stage
  // falling back to `beyond-gate` and reappearing as `upcoming` — which
  // presented the author's own finished stages as unvisited and, worse,
  // refused every click on them.
  if (resolution.kind === "reachable") {
    return {
      kind: "completed",
      id: step.id,
      location,
      label: stageLabel(step.id, i18n),
      resolution,
    };
  }

  // Every OTHER outcome for a step-bearing location is `kind:"degraded"`
  // (see the module header's load-bearing-reading note — `resolveLocation`
  // never returns bare `kind:"unreachable"` when `loc.step` is set).
  // `skipped-by-track` means this stage is not on this author's path AT
  // ALL (FR-049a: absent, never a greyed-out placeholder) — this is also
  // what makes the row GROW: `walkedByTrack` reads `traversal.selectedTrack`
  // live, so `project_name` flips from excluded to included the instant the
  // track question resolves to "copy", with no extra code here (FR-049c).
  // It is likewise what makes the row SHRINK AT THE TAIL: once the current
  // position's manifest index passes an off-spine fork that was never
  // walked (e.g. `touch_seed_source` bypassed straight to `touch`), that
  // fork's index is no longer `> currentIndex` and this branch is never
  // reached for it again (FR-049d).
  if (resolution.kind !== "degraded" || resolution.reason !== "beyond-gate") return null;

  return {
    kind: "upcoming",
    id: step.id,
    location,
    label: stageLabel(step.id, i18n),
    resolution,
  };
}

// ---------------------------------------------------------------------------
// Behind-position stage dot — one per section the author has PASSED (spec 061
// FR-002, FR-006; closes D-1/D-2).
//
// THE BRANCH THAT CALLS THIS ALREADY EXISTED AND HAD NOTHING TO CALL. The
// stage-dot fallback below guards on "this step contributed nothing finer"
// (`!isActiveStep && stepRecordDots.length === 0 && walkDotCount === 0`) and
// then called `aheadStageDot`, which returns `null` for anything at or behind
// the author (`if (stepIndex <= currentIndex) return null`). So a section that
// records no survey answer and publishes no walk — `choose_base`, `marks`,
// `convenience`, `carve`, `touch_seed_source`, five of the eleven — had NO
// representation once passed, and the row read as a much shorter journey than
// the author had actually walked. That is D-1/D-2 exactly.
//
// FR-003 IS SATISFIED BY THE RESOLVER, not by a second membership rule here. A
// section the author's path BYPASSED must be absent, never a greyed-out
// placeholder, and `resolveLocation` already answers that in both of its shapes:
// an off-track step (`project_name` on the adapt track) resolves
// `skipped-by-track`, and an off-spine fork the author hopped over
// (`touch_seed_source`) is not in `visited`, so it resolves `beyond-gate`.
// Requiring `reachable` therefore emits a mark for exactly the sections that
// were walked.
// ---------------------------------------------------------------------------

/**
 * The mark for `step` when it sits at or behind the author's position, or
 * `null` when it does not belong in the row.
 *
 * `outstanding` is this section's entry from the one derivation
 * (`lib/outstandingWork.ts`), or `undefined` when it owes nothing. Owing
 * nothing reads `completed`; owing something keeps the EXISTING hollow shape
 * (`kind: "upcoming"`, 061 Q4/FR-031 — no fourth member, no fourth
 * `data-progress-dot-kind` value) and carries `outstandingCount`, which is what
 * gives it an accessible name distinct from a not-yet-reached mark (FR-008).
 */
function behindStageDot(
  step: { readonly id: string },
  stepIndex: number,
  currentIndex: number,
  ctx: ResolveContext,
  i18n: I18n | undefined,
  outstanding: OutstandingSection | undefined,
): ProgressDot | null {
  // A terminal `activeStepId` ("done"/"unsupported") arrives as -1. The walk is
  // over, so nothing is ahead and every visited section is behind — the guard is
  // "not ahead", not "index < currentIndex", or the whole row would vanish the
  // moment the author reached Output.
  if (currentIndex !== -1 && stepIndex > currentIndex) return null;
  // Reserved / out of scope for v1 — never earns a mark in either direction
  // (see PACKAGE_STEP_ID).
  if (step.id === PACKAGE_STEP_ID) return null;

  const location: Location = { route: "survey", step: step.id as StepId };
  const resolution = resolveLocation(location, ctx);
  // Not walked, or not on this author's track — absent, never a placeholder
  // (FR-003 / 057 FR-049a/d). See the block comment above for why the resolver
  // is the whole test.
  if (resolution.kind !== "reachable") return null;

  const label = stageLabel(step.id, i18n);
  if (outstanding === undefined) {
    return { kind: "completed", id: step.id, location, label, resolution };
  }
  return {
    kind: "upcoming",
    id: step.id,
    location,
    label,
    resolution,
    outstandingCount: outstanding.count,
  };
}

// ---------------------------------------------------------------------------
// Within-step dots — one per STOP in a published walk (see lib/stepWalk.ts).
//
// Kinds inside a step, and why they are these three and not a fourth class:
//   current   — the walk's own cursor, on the ACTIVE step only. A cursor stored
//               for a step the author is not in describes where they WOULD land,
//               not where they are; marking it "current" would put two "you are
//               here" markers in one row.
//   completed — a settled stop (answered / assigned), from `position.done`.
//               The decision record cannot answer this inside an unfinished
//               step: answers are recorded at step completion (spec 053's
//               capture boundary, deliberately untouched), which is precisely
//               why the walk carries `done` itself.
//   upcoming  — an unsettled stop. NOTE its resolution is `reachable`, unlike an
//               upcoming STAGE's `beyond-gate`: the step is already reached, so
//               its stops are all addressable and activating one jumps. "Not yet
//               answered" and "not yet reached" render identically (FR-046's
//               hollow square) because to the author they mean the same thing —
//               there is nothing there yet.
// ---------------------------------------------------------------------------

/**
 * Whether this walk is a CHARACTER walk (a gallery's inventory) rather than a
 * flow's questions.
 *
 * `positionTokenToChar` is the existing "cheap recognition" of a character
 * stop — lib/stepWalk.ts documents that a flow question id and a character
 * token deliberately share the same slot and that this codec is how they are
 * told apart. Classifying here rather than keeping a list of gallery step ids
 * means a new gallery gets the right treatment on the day it publishes a walk,
 * with nothing to remember to add.
 *
 * Requires EVERY stop to decode: a mixed walk is not a shape any publisher
 * emits today, and collapsing one would silently swallow real questions.
 */
function isCharacterWalk(positions: StepWalkPositions): boolean {
  return positions.length > 0 && positions.every((p) => positionTokenToChar(p.id) !== null);
}

/**
 * The single dot a character walk contributes (author's call, 2026-08-05).
 *
 * A gallery is ONE stop in the journey, not one per letter. The row's job is
 * "where am I in the whole build", and a thirty-character inventory rendering
 * as thirty dots drowns the eight or nine stages around it. The per-letter
 * addressing this replaces is not lost to the author — each gallery has its own
 * in-page navigation to the character it needs, which is the affordance the
 * dots were duplicating.
 *
 * `location` names the STEP with no `question`, so activating it lands on the
 * gallery and lets that in-page navigation take over. Kind mirrors the walk:
 * the author is either standing in it, finished with every character, or
 * has not settled it yet.
 *
 * `outstanding` closes D-3 (spec 061). A gallery left with uncovered letters
 * renders a hollow mark sitting BEHIND the author that was, until this field,
 * visually AND nominally identical to a stage not yet reached. Carrying the
 * count here — on the same terms as `behindStageDot` — is what lets the
 * renderer name the two apart (FR-008) without a fourth shape.
 */
function collapsedWalkDot(
  stepId: string,
  positions: StepWalkPositions,
  isActiveStep: boolean,
  ctx: ResolveContext,
  i18n: I18n | undefined,
  outstanding: OutstandingSection | undefined,
): ProgressDot {
  const location: Location = { route: "survey", step: stepId as StepId };
  const kind: ProgressDotKind = isActiveStep
    ? "current"
    : positions.every((p) => p.done)
      ? "completed"
      : "upcoming";
  return {
    kind,
    id: stepId,
    location,
    label: stageLabel(stepId, i18n),
    resolution: resolveLocation(location, ctx),
    // Only on a mark the author has already passed: the current-position mark
    // has its own "you are here" name, and the section's own in-page indicators
    // are what report its remaining work while they are standing in it.
    ...(!isActiveStep && outstanding !== undefined
      ? { outstandingCount: outstanding.count }
      : {}),
  };
}

function buildWalkDots(
  stepId: string,
  positions: StepWalkPositions,
  cursorId: string | undefined,
  isActiveStep: boolean,
  ctx: ResolveContext,
  lookupQuestionLabel: (questionId: string) => string | undefined,
  i18n: I18n | undefined,
  outstanding: OutstandingSection | undefined,
): ProgressDot[] {
  if (isCharacterWalk(positions)) {
    return [collapsedWalkDot(stepId, positions, isActiveStep, ctx, i18n, outstanding)];
  }
  const shown = positions.filter((position) => !DOTLESS_QUESTION_IDS.has(position.id));
  return shown.map((position) => {
    const location: Location = {
      route: "survey",
      step: stepId as StepId,
      question: position.id,
    };
    const kind: ProgressDotKind =
      isActiveStep && position.id === cursorId
        ? "current"
        : position.done
          ? "completed"
          : "upcoming";
    return {
      kind,
      id: position.id,
      location,
      // A flow question deliberately publishes no label — see
      // StepWalkPosition.label for why this precedence lives here.
      label: position.label ?? lookupQuestionLabel(position.id) ?? position.id,
      resolution: resolveLocation(location, ctx),
    };
  });
}

// ---------------------------------------------------------------------------
// Assemble the whole row, in journey order (FR-042).
//
// ONE PASS OVER THE MANIFEST, which is what makes "journey order" true rather
// than approximately true. The pre-walk implementation concatenated three
// independently-ordered lists (record order, then the current dot, then
// manifest-ordered look-ahead); that read correctly only because a stage
// contributed at most one dot and the record happened to be appended in walked
// order. With a stage now able to contribute a dozen dots, and with FR-063
// keeping record dots for stages the author has since jumped back BEHIND, the
// three lists would interleave wrongly — e.g. `help`'s recorded answers ahead
// of `mechanisms`' character stops. Iterating the manifest and asking each step
// what it contributes makes the order structural.
//
// Record entries whose `stepId` is not in this build's manifest cannot be placed
// in that order at all. They are appended at the tail rather than dropped: a
// renamed step in a restored draft must still surface FR-013's stated reason on
// activation ("This step is not part of this build."), and a broken reference's
// exact position in the row is not load-bearing.
// ---------------------------------------------------------------------------

export function buildProgressDots(input: ProgressDotsInput): readonly ProgressDot[] {
  const lookupQuestionLabel =
    input.lookupQuestionLabel ?? createLookupQuestionLabel(input.i18n);

  const { ctx, i18n } = input;
  const walks = input.stepWalks ?? {};
  const cursors = input.stepCursors ?? {};
  const outstandingByStepId = input.outstandingByStepId;
  const activeStepId = ctx.traversal.activeStepId;

  // Which stops each step's walk already covers — see buildCompletedDots's
  // `walkIdsByStep` for why this is per question, not per step.
  const walkIdsByStep = new Map<string, ReadonlySet<string>>();
  for (const [stepId, positions] of Object.entries(walks)) {
    if (positions !== undefined && positions.length > 0) {
      walkIdsByStep.set(stepId, new Set(positions.map((p) => p.id)));
    }
  }

  // Record dots first, grouped by step but keeping RECORD order within a step —
  // that is the order the author answered them in, which no other source knows.
  const recordDots = buildCompletedDots(input.record, ctx, lookupQuestionLabel, walkIdsByStep);
  const byStep = new Map<string, ProgressDot[]>();
  for (const dot of recordDots) {
    const stepId = dot.location.step ?? "";
    const bucket = byStep.get(stepId);
    if (bucket === undefined) byStep.set(stepId, [dot]);
    else bucket.push(dot);
  }

  const currentIndex = ctx.manifest.findIndex((s) => s.id === activeStepId);
  const row: ProgressDot[] = [];

  for (let i = 0; i < ctx.manifest.length; i++) {
    const step = ctx.manifest[i];
    if (step === undefined) continue;
    const isActiveStep = step.id === activeStepId;

    // FR-063: a step's record dots are emitted whether or not it is still
    // "reached" — jumping back truncates `history`, not progress. They come
    // BEFORE this step's walk dots: when a stage is walked by two flows in
    // sequence (PhaseA then PhaseB inside `characters`), the record holds the
    // earlier flow's questions and the walk holds the later one's, so record-then-
    // walk is the order the author actually answered them in.
    const stepRecordDots = byStep.get(step.id) ?? [];
    row.push(...stepRecordDots);
    byStep.delete(step.id);

    const outstanding = outstandingByStepId?.get(step.id);

    const positions = walks[step.id];
    let markedCurrent = false;
    let walkDotCount = 0;
    if (positions !== undefined && positions.length > 0) {
      const walkDots = buildWalkDots(
        step.id,
        positions,
        cursors[step.id],
        isActiveStep,
        ctx,
        lookupQuestionLabel,
        i18n,
        outstanding,
      );
      row.push(...walkDots);
      walkDotCount = walkDots.length;
      markedCurrent = walkDots.some((d) => d.kind === "current");
    }

    // The stage-granular current dot, for an active step whose walk published
    // nothing (or published no cursor) — the pre-walk behaviour, unchanged.
    if (isActiveStep && !markedCurrent) {
      const currentDot = buildCurrentDot(ctx, input.currentQuestion, lookupQuestionLabel, i18n);
      if (currentDot !== null) row.push(currentDot);
    }

    // The stage dot is the FALLBACK granularity, so it is emitted only when
    // this step contributed nothing finer. Without that guard, a stage the
    // author has answered and then jumped behind carries both its recorded
    // question dots AND a stage dot — the "mix of empty and complete dots for
    // the same stage" the row was reported showing.
    //
    // Two directions, one branch (spec 061 FR-002). `aheadStageDot` answers for
    // a stage still in front of the author; `behindStageDot` answers for one
    // they have passed. Before 061 only the first existed, so a passed section
    // with nothing finer to show simply vanished from the row (D-1/D-2). The
    // two are mutually exclusive by their own index guards, so trying the
    // second only when the first declines is a lookup, not a precedence rule.
    if (!isActiveStep && stepRecordDots.length === 0 && walkDotCount === 0) {
      const stageDot =
        aheadStageDot(step, i, currentIndex, ctx, i18n) ??
        behindStageDot(step, i, currentIndex, ctx, i18n, outstanding);
      if (stageDot !== null) row.push(stageDot);
    }
  }

  // Steps not in this build's manifest (see the header note above).
  for (const leftover of byStep.values()) row.push(...leftover);

  return row;
}

// Re-export so StudioFooter.tsx and its tests need only this module for the
// resolver vocabulary they consume (ProgressDot carries a LocationResolution;
// callers checking `resolution.reason` want the same type without a second
// import from lib/resolveLocation.ts).
export type { LocationResolution, ResolveContext, UnreachableReason };
