// progressDots — assemble the footer's whole-journey row (spec 057 §E/§G;
// FR-042, FR-049, FR-060…FR-063; US4/US6; spec 079 journey-strip-contract.md).
//
// TWO TIERS, ONE ROW (journey-strip-contract.md §2):
//
//   - SECTION mark — one per manifest STEP, collapsed. Every step the row
//     covers gets exactly one, in manifest order, EXCEPT a step this
//     author's track skips (FR-049a: absent, never greyed) — that is the one
//     case a manifest step earns no mark at all.
//   - QUESTION mark — one per author-facing SCREEN (one `Next`), shown only
//     for the section the author is CURRENTLY in. Every other section stays
//     collapsed to its one section mark (§2, §4). A gallery's character walk
//     stays collapsed even while current (`collapsedWalkDot` — out of scope
//     for this feature, §1).
//
// FILL/SHAPE/RING/BADGE are independent axes carried by every mark (§3): this
// module derives `fill` ("full"/"partial"/"none") and `badge`
// (`WorkKind[]`, from `selectWorkToDo()`) alongside the pre-existing `kind`
// ("completed"/"current"/"upcoming"), which stays the SHAPE/ring discriminator
// (circle vs. square, ring vs. none) `ProgressDot.tsx` and every existing
// consumer (`data-progress-dot-kind`) already key on. `kind` is not replaced —
// `fill`/`tier`/`badge` are added ALONGSIDE it (contract §7's "keep `kind`
// with a `tier` field added" option).
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
// A LOAD-BEARING READING OF resolveLocation.ts: for ANY location that names a
// `step`, `refuse()` ALWAYS returns `kind:"degraded"` — never bare
// `kind:"unreachable"` (that variant is only reachable when `loc.step` is
// itself absent, which a bare-route location can't fail to resolve in the
// first place). So "beyond-gate" and "skipped-by-track" both surface here as
// `kind:"degraded"`, not `kind:"unreachable"` — see resolveLocation.test.ts's
// own fixtures, which assert `kind:"degraded"` for every named reason.
//
// WITHIN-STEP WALKS (lib/stepWalk.ts) remain the source of a flow's own
// per-question stops for the active step; a step with no published walk (a
// single-screen editor step, or a deep-link arrival before the runner
// mounts) falls back to `input.currentQuestion`/the stage dot exactly as
// before this feature.

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
import { resolveMessage } from "../lib/i18nResolve.ts";
import type { WorkItem, WorkKind } from "../steps/workToDo.ts";
import type { StepStatus } from "../steps/answerTypes.ts";
import { notAskedPassedMessage } from "../survey/notAskedStatusMessage.ts";
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
 */
const DOTLESS_QUESTION_IDS: ReadonlySet<string> = new Set([]);

// ---------------------------------------------------------------------------
// Dot data
// ---------------------------------------------------------------------------

export type ProgressDotKind = "completed" | "current" | "upcoming";

/** Which grain a mark represents (journey-strip-contract.md §2). */
export type MarkTier = "section" | "question";

/** "Has a response" (journey-strip-contract.md §3) — independent of `kind`. */
export type MarkFill = "full" | "partial" | "none";

/** One mark in the footer's journey row (data-model.md "ProgressDot", extended
 * by journey-strip-contract.md §3 for the two-tier strip). */
export interface ProgressDot {
  readonly kind: ProgressDotKind;
  /** §2: which grain this mark represents. */
  readonly tier: MarkTier;
  /** §3: independent "has a response" axis — drives the half-filled section glyph. */
  readonly fill: MarkFill;
  /** §3c: work waiting on this mark (or, for a collapsed section, somewhere inside it). */
  readonly badge?: readonly WorkKind[];
  /** FR-068: pre-resolved "passed — {reason}" text for a `not-asked` step's mark. */
  readonly passedReason?: string;
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
  /** Refines the STAGE dot of a step that has published no walk (see the
   * architecture note above). Absent means the current position is known only
   * at step granularity. */
  readonly currentQuestion?: string;
  /** Within-step stops per step id, from `stores/stepWalkStore.ts`. */
  readonly stepWalks?: StepWalkMap;
  /** Where the author is inside each step, keyed by step id (same store) —
   * ALSO the §5 jump target for an unbadged collapsed section. */
  readonly stepCursors?: Readonly<Record<string, string>>;
  /** Which screen (one `Next`) each decision-record entry was recorded on
   * (spec 079 `SurveyAnswerSnapshot.recordedScreenOf`, §4). An entry absent
   * from this map falls back to one mark for the rest of its step. */
  readonly recordedScreenOf?: Readonly<Record<string, string>>;
  /** `selectWorkToDo()`'s live output (spec 079 R-10) — drives §3c badges. */
  readonly workToDo?: Readonly<Record<string, WorkItem[]>>;
  /** Each step's current `StepStatus` (spec 079 `surveyAnswerStore`) — drives
   * FR-068's "passed — {reason}" statement for a `not-asked` step. */
  readonly stepStatuses?: Readonly<Record<string, StepStatus>>;
}

// ---------------------------------------------------------------------------
// Stage labels
// ---------------------------------------------------------------------------

const STAGE_LABEL_MESSAGE: Record<string, ReturnType<typeof msg>> = {
  identity: msg({ id: "footer.stage.identity", message: "Identity" }),
  choose_base: msg({ id: "footer.stage.chooseBase", message: "Choose base keyboard" }),
  track: msg({ id: "footer.stage.track", message: "Copy or adapt" }),
  project_name: msg({ id: "footer.stage.projectName", message: "Project name" }),
  characters: msg({ id: "footer.stage.characters", message: "Characters" }),
  marks: msg({ id: "footer.stage.marks", message: "Accents & marks" }),
  punctuation: msg({ id: "footer.stage.punctuation", message: "Punctuation" }),
  invisibles: msg({ id: "footer.stage.invisibles", message: "Invisible characters" }),
  convenience: msg({ id: "footer.stage.convenience", message: "Convenience letters" }),
  carve: msg({ id: "footer.stage.carve", message: "Carve" }),
  mechanisms: msg({ id: "footer.stage.mechanisms", message: "Mechanisms" }),
  touch_seed_source: msg({ id: "footer.stage.touchSeedSource", message: "Touch seed" }),
  touch: msg({ id: "footer.stage.touch", message: "Touch layout" }),
  help: msg({ id: "footer.stage.help", message: "Help & credits" }),
};

/** A manifest step's localized name, falling back to the raw id (never
 * blank, never throws) for a step this map does not (yet) name. Exported —
 * `components/StepHost.tsx`'s FR-016 notice (T064) names affected steps
 * through the SAME map, so the notice and the strip can never disagree about
 * what a step is called. */
export function stageLabel(stepId: string, i18n?: I18n): string {
  const descriptor = STAGE_LABEL_MESSAGE[stepId];
  return descriptor === undefined ? stepId : resolveMessage(i18n, descriptor);
}

// ---------------------------------------------------------------------------
// Unreachable-reason prose — shared vocabulary with the trail's deep links.
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
 * becomes author-facing text, shared with the decision trail's deep links. */
export function unreachableReasonLabel(reason: UnreachableReason, i18n?: I18n): string {
  return resolveMessage(i18n, UNREACHABLE_REASON_MESSAGE[reason]);
}

// ---------------------------------------------------------------------------
// Screen-grouped record marks (journey-strip-contract.md §4).
//
// One mark per SCREEN, not per recorded answer: entries sharing a
// `recordedScreenOf` mapping collapse to one mark (Invisibles' one-Next-many-
// answers case). An entry with NO mapping (a pre-`screenId` draft, or a
// record predating this feature) falls into ONE shared "rest of the step"
// bucket per step — never one mark per unmapped entry (§4's documented
// degrade).
// ---------------------------------------------------------------------------

interface ScreenMarkSource {
  readonly screenId: string;
  /** The first entry's own question id — used as the JUMP target (a real,
   * registry-known question) even though the mark may represent several
   * entries sharing one screen. */
  readonly questionId: string;
  readonly entryIds: readonly string[];
}

/** Group a step's completed record entries by screen (§4). Order: first
 * appearance in record order, matching how the author actually answered. */
function groupEntriesByScreen(
  stepId: string,
  entries: readonly { entryId: string; questionId: string }[],
  recordedScreenOf: Readonly<Record<string, string>>,
): ScreenMarkSource[] {
  const byScreen = new Map<string, ScreenMarkSource>();
  const order: string[] = [];
  const FALLBACK_KEY = `__unmapped__:${stepId}`;
  for (const entry of entries) {
    const screenId = recordedScreenOf[entry.entryId] ?? FALLBACK_KEY;
    const existing = byScreen.get(screenId);
    if (existing === undefined) {
      byScreen.set(screenId, { screenId, questionId: entry.questionId, entryIds: [entry.entryId] });
      order.push(screenId);
    } else {
      byScreen.set(screenId, { ...existing, entryIds: [...existing.entryIds, entry.entryId] });
    }
  }
  return order.map((id) => byScreen.get(id)!);
}

function screenMarkLabel(
  source: ScreenMarkSource,
  stepId: string,
  lookupQuestionLabel: (questionId: string) => string | undefined,
  i18n: I18n | undefined,
): string {
  // §4: the screen or stage's catalog label — NEVER the raw id. A synthetic
  // multi-answer screen id resolves nothing in the flow-question registry, so
  // this falls through to the first entry's own question label, and finally
  // to the stage's name — closing the exact gap the old `?? questionId`
  // fallback left open for a multi-answer screen.
  return (
    lookupQuestionLabel(source.screenId) ??
    lookupQuestionLabel(source.questionId) ??
    stageLabel(stepId, i18n)
  );
}

// ---------------------------------------------------------------------------
// Within-step walk classification (unchanged from pre-079 — see header).
// ---------------------------------------------------------------------------

function isCharacterWalk(positions: StepWalkPositions): boolean {
  return positions.length > 0 && positions.every((p) => positionTokenToChar(p.id) !== null);
}

/** Every kind of "screen-shaped" unit inside a step, before it becomes a mark. */
interface StepScreen {
  readonly id: string;
  readonly location: Location;
  readonly label: string;
  readonly done: boolean;
  readonly isCursor: boolean;
}

/**
 * The step's screens — from its record entries (grouped by screen) and any
 * published (non-character) walk stops — in the order the author reached
 * them (record first, then the live walk, matching pre-079's ordering
 * rationale for a stage walked by two flows in sequence).
 */
function stepScreens(
  stepId: string,
  entries: readonly { entryId: string; questionId: string }[],
  recordedScreenOf: Readonly<Record<string, string>>,
  walkPositions: StepWalkPositions | undefined,
  cursorId: string | undefined,
  lookupQuestionLabel: (questionId: string) => string | undefined,
  i18n: I18n | undefined,
): StepScreen[] {
  const walkIds = new Set((walkPositions ?? []).map((p) => p.id));
  const groups = groupEntriesByScreen(
    stepId,
    entries.filter((e) => !walkIds.has(e.questionId) && !DOTLESS_QUESTION_IDS.has(e.questionId)),
    recordedScreenOf,
  );
  const screens: StepScreen[] = groups.map((source) => ({
    id: source.screenId,
    location: { route: "survey", step: stepId as StepId, question: source.questionId },
    label: screenMarkLabel(source, stepId, lookupQuestionLabel, i18n),
    done: true, // a record entry IS a settled answer.
    isCursor: source.screenId === cursorId,
  }));

  const positions = (walkPositions ?? []).filter((p) => !DOTLESS_QUESTION_IDS.has(p.id));
  for (const position of positions) {
    screens.push({
      id: position.id,
      location: { route: "survey", step: stepId as StepId, question: position.id },
      // A flow question deliberately publishes no label of its own — see
      // StepWalkPosition.label for why the precedence lives here.
      label: position.label ?? lookupQuestionLabel(position.id) ?? stageLabel(stepId, i18n),
      done: position.done,
      isCursor: position.id === cursorId,
    });
  }
  return screens;
}

/**
 * The single dot a character walk contributes (author's call, 2026-08-05;
 * unchanged by this feature — §1 non-goal). A gallery is ONE stop in the
 * journey; each gallery has its own in-page navigation to the character it
 * needs.
 */
function collapsedWalkDot(
  stepId: string,
  positions: StepWalkPositions,
  isActiveStep: boolean,
  ctx: ResolveContext,
  i18n: I18n | undefined,
  workToDo: readonly WorkItem[] | undefined,
): ProgressDot {
  const location: Location = { route: "survey", step: stepId as StepId };
  const allDone = positions.every((p) => p.done);
  const kind: ProgressDotKind = isActiveStep ? "current" : allDone ? "completed" : "upcoming";
  const badge = workToDo !== undefined && workToDo.length > 0 ? workToDo.map((i) => i.kind) : undefined;
  return {
    kind,
    tier: "section",
    fill: allDone ? "full" : positions.some((p) => p.done) ? "partial" : "none",
    ...(badge !== undefined ? { badge } : {}),
    id: stepId,
    location,
    label: stageLabel(stepId, i18n),
    resolution: resolveLocation(location, ctx),
  };
}

// ---------------------------------------------------------------------------
// The active step's expansion — one question mark per screen (§2).
// ---------------------------------------------------------------------------

function buildActiveStepMarks(
  stepId: string,
  screens: readonly StepScreen[],
  ctx: ResolveContext,
  workToDo: readonly WorkItem[] | undefined,
): { marks: ProgressDot[]; markedCurrent: boolean } {
  let markedCurrent = false;
  const marks = screens.map((screen) => {
    const kind: ProgressDotKind = screen.isCursor ? "current" : screen.done ? "completed" : "upcoming";
    if (kind === "current") markedCurrent = true;
    const badge = badgeForScreen(screen.id, workToDo);
    return {
      kind,
      tier: "question" as const,
      fill: screen.done ? ("full" as const) : ("none" as const),
      ...(badge !== undefined ? { badge } : {}),
      id: screen.id,
      location: screen.location,
      label: screen.label,
      resolution: resolveLocation(screen.location, ctx),
    };
  });
  return { marks, markedCurrent };
}

function badgeForScreen(
  screenId: string,
  workToDo: readonly WorkItem[] | undefined,
): readonly WorkKind[] | undefined {
  if (workToDo === undefined) return undefined;
  const kinds = workToDo
    .filter((item) => item.kind === "reproposed" && item.screenId === screenId)
    .map((item) => item.kind);
  return kinds.length > 0 ? kinds : undefined;
}

// ---------------------------------------------------------------------------
// A non-active step's ONE section mark (§2, §3b, §4).
// ---------------------------------------------------------------------------

function aggregateFill(screens: readonly StepScreen[]): MarkFill {
  if (screens.length === 0) return "none";
  const doneCount = screens.filter((s) => s.done).length;
  if (doneCount === screens.length) return "full";
  if (doneCount === 0) return "none";
  return "partial";
}

/** Earliest (record/walk order) screen with work to do, for the §5 badged-
 * collapsed-section jump exception. `undefined` when no item names a screen
 * (e.g. an "unassigned" mechanisms/touch count) — the bare step remains the
 * target, which is already "the gallery" for those two steps. */
function earliestWorkScreenId(items: readonly WorkItem[]): string | undefined {
  for (const item of items) {
    if (item.kind === "reproposed") return item.screenId;
  }
  return undefined;
}

function buildSectionMark(
  stepId: string,
  screens: readonly StepScreen[],
  index: number,
  currentIndex: number,
  ctx: ResolveContext,
  i18n: I18n | undefined,
  stepCursor: string | undefined,
  workToDo: readonly WorkItem[] | undefined,
  stepStatus: StepStatus | undefined,
): ProgressDot | null {
  const badge = workToDo !== undefined && workToDo.length > 0 ? workToDo.map((i) => i.kind) : undefined;
  const passedReason =
    stepStatus?.kind === "not-asked" ? notAskedPassedMessage(stepStatus.reason, i18n) : undefined;

  if (screens.length > 0) {
    const fill = aggregateFill(screens);
    const location = sectionJumpLocation(stepId, badge, workToDo, stepCursor);
    return {
      kind: fill === "none" ? "upcoming" : "completed",
      tier: "section",
      fill,
      ...(badge !== undefined ? { badge } : {}),
      ...(passedReason !== undefined ? { passedReason } : {}),
      id: stepId,
      location,
      label: stageLabel(stepId, i18n),
      resolution: resolveLocation(location, ctx),
    };
  }

  // No screens at all for this step: a `not-asked` step (FR-068), a pure
  // editor-action stage (choose_base, track, carve — no survey answers of
  // its own), or a step genuinely still ahead. One resolveLocation call on
  // the bare step tells us which: `reachable` (already visited — behind or
  // at the current position with nothing recorded), `beyond-gate` (ahead,
  // not yet reached), or `skipped-by-track`/other (this author's path never
  // includes it — FR-049a: absent, not a greyed placeholder).
  const bareLocation: Location = { route: "survey", step: stepId as StepId };
  const bareResolution = resolveLocation(bareLocation, ctx);

  if (bareResolution.kind === "reachable") {
    const location = sectionJumpLocation(stepId, badge, workToDo, stepCursor);
    return {
      kind: "completed",
      tier: "section",
      fill: "full",
      ...(badge !== undefined ? { badge } : {}),
      ...(passedReason !== undefined ? { passedReason } : {}),
      id: stepId,
      location,
      label: stageLabel(stepId, i18n),
      resolution: resolveLocation(location, ctx),
    };
  }

  if (bareResolution.kind === "degraded" && bareResolution.reason === "beyond-gate") {
    if (index <= currentIndex) {
      // Defensive: a "beyond-gate" bare step behind/at the current index
      // should not occur, but never claim "ahead" for a step that is not.
      return null;
    }
    if (stepId === PACKAGE_STEP_ID) return null;
    return {
      kind: "upcoming",
      tier: "section",
      fill: "none",
      ...(badge !== undefined ? { badge } : {}),
      ...(passedReason !== undefined ? { passedReason } : {}),
      id: stepId,
      location: bareLocation,
      label: stageLabel(stepId, i18n),
      resolution: bareResolution,
    };
  }

  // skipped-by-track / question-not-in-build / no-project: this author's
  // path never includes this step. Absent, per FR-049a.
  return null;
}

function sectionJumpLocation(
  stepId: string,
  badge: readonly WorkKind[] | undefined,
  workToDo: readonly WorkItem[] | undefined,
  stepCursor: string | undefined,
): Location {
  if (badge !== undefined && badge.length > 0 && workToDo !== undefined) {
    const earliest = earliestWorkScreenId(workToDo);
    if (earliest !== undefined) {
      return { route: "survey", step: stepId as StepId, question: earliest };
    }
    return { route: "survey", step: stepId as StepId };
  }
  return stepCursor !== undefined
    ? { route: "survey", step: stepId as StepId, question: stepCursor }
    : { route: "survey", step: stepId as StepId };
}

// ---------------------------------------------------------------------------
// The current dot when the active step publishes no screens at all — the
// pre-079 stage-granular fallback (US6), unchanged.
// ---------------------------------------------------------------------------

function buildCurrentDot(
  ctx: ResolveContext,
  currentQuestion: string | undefined,
  lookupQuestionLabel: (questionId: string) => string | undefined,
  i18n: I18n | undefined,
): ProgressDot | null {
  const stepId = ctx.traversal.activeStepId;
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
    tier: currentQuestion !== undefined ? "question" : "section",
    fill: "none",
    id: currentQuestion ?? stepId,
    location,
    label,
    resolution: resolveLocation(location, ctx),
  };
}

// ---------------------------------------------------------------------------
// Assemble the whole row, in journey order (FR-042, §2/§4).
// ---------------------------------------------------------------------------

export function buildProgressDots(input: ProgressDotsInput): readonly ProgressDot[] {
  const lookupQuestionLabel =
    input.lookupQuestionLabel ?? createLookupQuestionLabel(input.i18n);

  const { ctx, i18n } = input;
  const walks = input.stepWalks ?? {};
  const cursors = input.stepCursors ?? {};
  const recordedScreenOf = input.recordedScreenOf ?? {};
  const workToDo = input.workToDo ?? {};
  const stepStatuses = input.stepStatuses ?? {};
  const activeStepId = ctx.traversal.activeStepId;

  // Record entries per step, in record order (effectiveEntries collapses
  // supersession chains — Q1's resolution, unchanged).
  const entriesByStep = new Map<string, { entryId: string; questionId: string }[]>();
  const orphanSteps = new Set<string>();
  const manifestIds = new Set(ctx.manifest.map((s) => s.id));
  for (const entry of effectiveEntries(input.record.entries)) {
    if (entry.payload.kind !== "survey-answer") continue;
    if (entry.stepId === PRE_IDENTITY_STEP_ID) continue;
    const questionId = entry.payload.questionId;
    if (DOTLESS_QUESTION_IDS.has(questionId)) continue;
    const bucket = entriesByStep.get(entry.stepId);
    if (bucket === undefined) entriesByStep.set(entry.stepId, [{ entryId: entry.entryId, questionId }]);
    else bucket.push({ entryId: entry.entryId, questionId });
    if (!manifestIds.has(entry.stepId)) orphanSteps.add(entry.stepId);
  }

  const currentIndex = ctx.manifest.findIndex((s) => s.id === activeStepId);
  const row: ProgressDot[] = [];

  for (let i = 0; i < ctx.manifest.length; i++) {
    const step = ctx.manifest[i];
    if (step === undefined) continue;
    const isActiveStep = step.id === activeStepId;
    const entries = entriesByStep.get(step.id) ?? [];
    const positions = walks[step.id];
    const stepWorkToDo = workToDo[step.id];

    if (positions !== undefined && positions.length > 0 && isCharacterWalk(positions)) {
      row.push(collapsedWalkDot(step.id, positions, isActiveStep, ctx, i18n, stepWorkToDo));
      continue;
    }

    const screens = stepScreens(
      step.id,
      entries,
      recordedScreenOf,
      positions,
      cursors[step.id],
      lookupQuestionLabel,
      i18n,
    );

    if (isActiveStep) {
      if (screens.length === 0) {
        const currentDot = buildCurrentDot(ctx, input.currentQuestion, lookupQuestionLabel, i18n);
        if (currentDot !== null) row.push(currentDot);
        continue;
      }
      const { marks, markedCurrent } = buildActiveStepMarks(step.id, screens, ctx, stepWorkToDo);
      if (!markedCurrent && cursors[step.id] !== undefined) {
        // A cursor was recorded, but it names something none of this step's
        // screens matched (pre-079's "falls back to the stage dot when the
        // walk names no reachable cursor" case) — fall back to the
        // stage-granular dot rather than guessing which screen is current.
        row.push(...marks);
        const currentDot = buildCurrentDot(ctx, input.currentQuestion, lookupQuestionLabel, i18n);
        if (currentDot !== null) row.push(currentDot);
      } else if (!markedCurrent) {
        // No cursor was ever recorded for this step at all (a fully
        // record-derived active step — no walk publishes a cursor concept for
        // completed screens). Rather than adding a SECOND, stage-granular
        // "current" mark alongside the screen marks (the double-dot this
        // replaces), the LAST screen the author reached stands in as the
        // current position — exactly one "you are here" ring for the row,
        // on the screen most likely to be where the author actually is.
        const lastIndex = marks.length - 1;
        row.push(
          ...marks.map((mark, idx) =>
            idx === lastIndex ? { ...mark, kind: "current" as const } : mark,
          ),
        );
      } else {
        row.push(...marks);
      }
      continue;
    }

    const mark = buildSectionMark(
      step.id,
      screens,
      i,
      currentIndex,
      ctx,
      i18n,
      cursors[step.id],
      stepWorkToDo,
      stepStatuses[step.id],
    );
    if (mark !== null) row.push(mark);
  }

  // Steps not in this build's manifest (FR-013: a renamed step in a restored
  // draft must still surface a reason on activation) — one section mark per
  // orphan step, at the tail, position not load-bearing.
  for (const stepId of orphanSteps) {
    const entries = entriesByStep.get(stepId) ?? [];
    const firstQuestionId = entries[0]?.questionId;
    const location: Location = {
      route: "survey",
      step: stepId as StepId,
      ...(firstQuestionId !== undefined ? { question: firstQuestionId } : {}),
    };
    row.push({
      kind: "completed",
      tier: "section",
      fill: "full",
      id: stepId,
      location,
      label: stageLabel(stepId, i18n),
      resolution: resolveLocation(location, ctx),
    });
  }

  return row;
}

// Re-export so StudioFooter.tsx and its tests need only this module for the
// resolver vocabulary they consume.
export type { LocationResolution, ResolveContext, UnreachableReason };
export type { WorkKind } from "../steps/workToDo.ts";
