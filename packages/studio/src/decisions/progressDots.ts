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
// THE "CURRENT QUESTION" ARCHITECTURE GAP: FR-062 wants the current marker
// "read from the location model, never re-derived from the rendered
// component tree" — but no shared store today exposes "which question is
// SurveyRunner showing right now" inside a multi-question manifest step
// (grep confirms it: no `currentQuestionId`/`activeQuestionId` store slot
// exists). Inventing one would be exactly the "second notion of position"
// FR-006 forbids, and building the real per-question wiring is well outside
// this phase's file ownership. The one PIECE of the location model that DOES
// name a specific question is `peekPendingJump()` (lib/jumpToLocation.ts) —
// the request a deep link parked before the runner honoured it. So: the
// current dot is question-accurate immediately after a deep-link arrival
// (exactly FR-060's stated case — "per-question accurate inside a step whose
// answers are not yet recorded"), and degrades to STAGE granularity for
// ordinary forward walking, where no question-level position is tracked
// anywhere to read. `currentQuestion` is accepted as an explicit input rather
// than read internally, so this module stays pure/fixture-testable the same
// way `resolveLocation` does — the caller (StudioFooter.tsx) is where
// `peekPendingJump()` gets called, exactly as jumpToLocation.ts's own
// `liveContext()` composes live stores at the call site rather than inside
// the pure resolver.

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
}

export interface ProgressDotsInput {
  readonly record: DecisionRecord;
  readonly ctx: ResolveContext;
  readonly i18n?: I18n;
  /** Defaults to the production `createLookupQuestionLabel(input.i18n)`; tests
   * inject a stub so they don't depend on which questions currently author an
   * `audit_label` (same seam lookupQuestionLabel.ts's own tests use). */
  readonly lookupQuestionLabel?: (questionId: string) => string | undefined;
  /** See the "CURRENT QUESTION ARCHITECTURE GAP" note above. Absent means the
   * current position is known only at step granularity. */
  readonly currentQuestion?: string;
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
 * blank, never throws) for a step this map does not (yet) name. */
function stageLabel(stepId: string, i18n?: I18n): string {
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
// Upcoming dots — one per STAGE still ahead on this author's path (FR-042
// "Upcoming stage", FR-049).
// ---------------------------------------------------------------------------

function buildUpcomingDots(ctx: ResolveContext, i18n: I18n | undefined): ProgressDot[] {
  const dots: ProgressDot[] = [];
  const steps = ctx.manifest;
  const currentIndex = steps.findIndex((s) => s.id === ctx.traversal.activeStepId);
  // A terminal `activeStepId` ("done"/"unsupported") is not in the manifest
  // at all — findIndex returns -1, which would make EVERY step "after"
  // position -1 under a naive `i > currentIndex` loop. Guard explicitly:
  // once the walk is over, nothing is still "ahead".
  if (currentIndex === -1) return dots;

  for (let i = currentIndex + 1; i < steps.length; i++) {
    const step = steps[i];
    if (step === undefined) continue;
    if (step.id === PACKAGE_STEP_ID) continue;

    const location: Location = { route: "survey", step: step.id as StepId };
    const resolution = resolveLocation(location, ctx);

    // Already visited (present in `history`, or somehow the live position) —
    // not "ahead" at all. This is what makes a jump BACK reappear the
    // stages between the landing point and where the author used to be:
    // `jumpToStep` truncates `history` (see its own docstring in
    // surveySessionStore.ts, FR-063), so a step that was "reachable" before
    // the jump goes back to "beyond-gate" afterward and re-enters this loop
    // — exactly T065's "dots ahead of the landing point are still present".
    if (resolution.kind === "reachable") continue;

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
    // fork's index is no longer `> currentIndex` and this loop never visits
    // it again (FR-049d).
    if (resolution.kind !== "degraded" || resolution.reason !== "beyond-gate") continue;

    dots.push({
      kind: "upcoming",
      id: step.id,
      location,
      label: stageLabel(step.id, i18n),
      resolution,
    });
  }
  return dots;
}

// ---------------------------------------------------------------------------
// Assemble the whole row, in journey order (FR-042).
// ---------------------------------------------------------------------------

export function buildProgressDots(input: ProgressDotsInput): readonly ProgressDot[] {
  const lookupQuestionLabel =
    input.lookupQuestionLabel ?? createLookupQuestionLabel(input.i18n);

  const completed = buildCompletedDots(input.record, input.ctx, lookupQuestionLabel);
  const current = buildCurrentDot(input.ctx, input.currentQuestion, lookupQuestionLabel, input.i18n);
  const upcoming = buildUpcomingDots(input.ctx, input.i18n);

  return current === null ? [...completed, ...upcoming] : [...completed, current, ...upcoming];
}

// Re-export so StudioFooter.tsx and its tests need only this module for the
// resolver vocabulary they consume (ProgressDot carries a LocationResolution;
// callers checking `resolution.reason` want the same type without a second
// import from lib/resolveLocation.ts).
export type { LocationResolution, ResolveContext, UnreachableReason };
