// layoutFamily — T025 (spec 076 FR-023, amendment A3.1).
//
// The existing `layout_family` survey question ("Which physical keyboard
// layout does your community use?") promoted from the reserve registry into
// the main flow. This module owns two things:
//
//   1. The legacy answer's storage: the survey answer store (durable via the
//      draft autosave, editable — answering again overwrites, never
//      ask-once). The canonical slot is step "layout", answer
//      "layout_family". (The layout PICK itself is the `windows-layout`
//      decision since spec 090 T011 — see the readers below.)
//   2. The FR-023 likely-host resolution ORDER: (a) the author's layout_family
//      answer, refined by bcp47 region where coarse (qwerty + en-GB → UK
//      English); (b) `likelyBaseLayouts(bcp47[])` when the question is
//      unanswered; (c) the five reference hosts when no signal exists.
//
// T011 owns the reference data (`packages/studio/src/lib/referenceBaseLayouts.ts`:
// `likelyBaseLayouts`, the versioned region→layout table, the rich host maps).
// This module consumes that resolver directly — it never reimplements the
// table. `setLikelyBaseDeps` remains as a test seam overriding the default.

import { useMemo } from "react";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { peekDecision, useDecisionStore } from "../stores/decisionStore.ts";
import type { StepAnswers, StepId } from "../steps/answerTypes.ts";
// T011's reference module — consumed, never reimplemented.
import {
  BASE_LAYOUTS,
  REFERENCE_BASE_IDS,
  likelyBaseLayouts as t011LikelyBaseLayouts,
} from "./referenceBaseLayouts.ts";
import type { BaseLayoutId, LayoutFamilyAnswer } from "./referenceBaseLayouts.ts";
import { windowsLayoutById } from "./windowsLayouts.ts";
import type { WindowsLayout } from "./windowsLayouts.ts";

/** The four values the existing layout_family question offers (unchanged). */
export type LayoutFamilyValue = LayoutFamilyAnswer;

export function isLayoutFamilyValue(v: unknown): v is LayoutFamilyValue {
  return v === "qwerty" || v === "qwertz" || v === "azerty" || v === "non-roman";
}

/** Canonical survey-answer-store slot for the surfaced question. */
export const LAYOUT_FAMILY_STEP_ID = "layout";
export const LAYOUT_FAMILY_ANSWER_ID = "layout_family";

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

/**
 * The community-layout step's pick (spec 090 T011): since the gallery
 * migration the picked Windows layout's catalog id ("basic_kbdfr") lives in
 * the `windows-layout` DECISION (survey/questions/gallery/windowsLayout.ts),
 * recorded by the gallery host — the `host_layout` survey answer is retired
 * and `savePickedWindowsLayout` is deleted. The pick is the richer signal
 * (it names an exact layout, from which family and reference host derive),
 * so it wins; a stored legacy `layout_family` answer keeps working when no
 * pick exists.
 */
function readLegacyFamily(steps: Record<StepId, StepAnswers>): LayoutFamilyValue | undefined {
  const raw = firstString(steps[LAYOUT_FAMILY_STEP_ID]?.answers[LAYOUT_FAMILY_ANSWER_ID]?.value);
  return isLayoutFamilyValue(raw) ? raw : undefined;
}

function pickFamily(pick: WindowsLayout | undefined): LayoutFamilyValue | undefined {
  return pick !== undefined && pick.family !== "other" ? pick.family : undefined;
}

/** The picked layout's catalog id from a decision value, if well-formed. */
function pickedLayoutId(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const layoutId = (value as { layoutId?: unknown }).layoutId;
  return typeof layoutId === "string" ? layoutId : undefined;
}

/** The Windows layout the author picked on the layout step, if any. */
export function getPickedWindowsLayout(): WindowsLayout | undefined {
  return windowsLayoutById(pickedLayoutId(peekDecision("windows-layout")?.value));
}

/** Reactive read of the picked layout (undefined until the author confirms one). */
export function usePickedWindowsLayout(): WindowsLayout | undefined {
  return useDecisionStore((s) =>
    windowsLayoutById(pickedLayoutId(s.decisions["windows-layout"]?.value)),
  );
}

/** The stored layout_family answer, if the author has given one. */
export function getLayoutFamilyAnswer(): LayoutFamilyValue | undefined {
  return (
    pickFamily(getPickedWindowsLayout()) ??
    readLegacyFamily(useSurveyAnswerStore.getState().steps)
  );
}

/** Reactive read of the stored answer for components. */
export function useLayoutFamilyAnswer(): LayoutFamilyValue | undefined {
  const steps = useSurveyAnswerStore((s) => s.steps);
  const picked = usePickedWindowsLayout();
  return useMemo(
    () => pickFamily(picked) ?? readLegacyFamily(steps),
    [picked, steps],
  );
}

/**
 * Persist the answer. Answering again overwrites — the question stays editable
 * wherever it is surfaced (the carve gallery now; the closed-keyboard card
 * later). `undefined` clears back to unanswered (bcp47 inference resumes);
 * the radio UI offers no clear affordance, so clearing is programmatic-only
 * for now.
 */
export function saveLayoutFamilyAnswer(value: LayoutFamilyValue | undefined, screenId = "layout"): void {
  // "select": one of a fixed set of labeled options (contracts AnswerType).
  // origin "confirmed": the author answered directly, not a proposal.
  useSurveyAnswerStore.getState().saveAnswer(LAYOUT_FAMILY_STEP_ID, LAYOUT_FAMILY_ANSWER_ID, {
    value: value ?? "",
    answerType: "select",
    origin: "confirmed",
    stage: "draft",
    evidenceKey: null,
    screenId,
  });
}

// ---------------------------------------------------------------------------
// Likely-host resolution (FR-023)
// ---------------------------------------------------------------------------

/**
 * Minimal host-layout reference. T011's richer BaseLayout type must be
 * assignable to this shape (id + label); the resolution order only needs
 * identity and an author-facing label.
 */
export interface BaseLayoutRef {
  /** Stable id — T011's referenceBaseLayouts.ts owns the canonical ids. */
  id: string;
  /** Author-facing label, e.g. "UK English". */
  label: string;
}

/**
 * The five FR-023 reference hosts in canonical order (ruling A3). Labels come
 * from T011's BASE_LAYOUTS — this module owns no host data of its own.
 */
export const REFERENCE_BASES: readonly BaseLayoutRef[] = REFERENCE_BASE_IDS.map((id) => ({
  id,
  label: BASE_LAYOUTS[id].label,
}));

/**
 * T011's contract: `packages/studio/src/lib/referenceBaseLayouts.ts`.
 * Injected only by tests; production resolves through T011's module directly.
 */
export interface LikelyBaseDeps {
  /** T011: resolves bcp47 tags through the versioned region→layout mapping. */
  likelyBaseLayouts: (bcp47: string[]) => BaseLayoutRef[];
  /** T011: the full reference-host records; defaults to REFERENCE_BASES. */
  referenceBases?: readonly BaseLayoutRef[];
  /**
   * Maps a layout_family answer through T011's versioned table, refining
   * coarse answers by bcp47 region (qwerty + en-GB → UK English).
   */
  layoutFamilyBases?: (answer: LayoutFamilyValue, bcp47: string[]) => BaseLayoutRef[];
}

function toRefs(ids: readonly BaseLayoutId[]): BaseLayoutRef[] {
  return ids.map((id) => ({ id, label: BASE_LAYOUTS[id].label }));
}

let likelyBaseDepsOverride: LikelyBaseDeps | undefined;

/**
 * Override the T011-backed default resolution — primarily a test seam.
 * Production code resolves through T011's module directly.
 */
export function setLikelyBaseDeps(deps: LikelyBaseDeps | undefined): void {
  likelyBaseDepsOverride = deps;
}

export type LikelyBaseSource = "layout-family" | "bcp47" | "default";

export interface LikelyBaseResolution {
  hosts: BaseLayoutRef[];
  source: LikelyBaseSource;
}

/**
 * FR-023 resolution order. Never returns empty: the fallthrough always yields
 * the five reference hosts.
 *
 * Without injected deps this delegates the order to T011's
 * `likelyBaseLayouts(bcp47, layoutFamilyAnswer)`, which implements the full
 * order (answer → bcp47 → default); the source is derived from which inputs
 * T011 could have consumed. With injected deps (tests) the three steps run
 * explicitly against the stub.
 */
export function resolveLikelyBaseLayouts(opts: {
  layoutFamily: LayoutFamilyValue | undefined;
  bcp47: string[];
  deps?: LikelyBaseDeps;
  /**
   * Reference host id of the layout the author picked on the layout step, when
   * the pick IS one of the five reference hosts: the exact answer, ahead of
   * any family or language-tag inference (spec 076 A4).
   */
  pickedBase?: BaseLayoutId | undefined;
}): LikelyBaseResolution {
  if (opts.pickedBase !== undefined) {
    return { hosts: toRefs([opts.pickedBase]), source: "layout-family" };
  }
  const deps = opts.deps ?? likelyBaseDepsOverride;
  if (deps === undefined) return resolveWithT011(opts.layoutFamily, opts.bcp47);

  const reference = deps.referenceBases ?? REFERENCE_BASES;

  // (a) The author's answer is primary — via T011's versioned table.
  if (opts.layoutFamily !== undefined && deps.layoutFamilyBases !== undefined) {
    const hosts = deps.layoutFamilyBases(opts.layoutFamily, opts.bcp47);
    if (hosts.length > 0) return { hosts: [...hosts], source: "layout-family" };
    // A table miss falls through to bcp47 inference — never to silence.
  }

  // (b) Language-tag inference when the question is unanswered (or the table missed).
  if (deps.likelyBaseLayouts !== undefined) {
    const hosts = deps.likelyBaseLayouts(opts.bcp47);
    if (hosts.length > 0) return { hosts: [...hosts], source: "bcp47" };
  }

  // (c) No signal: the five reference hosts.
  return { hosts: [...reference], source: "default" };
}

/**
 * Default path: T011 implements the whole FR-023 order. Provenance follows
 * which inputs T011's steps can consume: a discriminating answer
 * (qwerty/qwertz/azerty) is always consumed by its step 1; "non-roman"
 * discriminates among no host (T011's own documented fallthrough), so with
 * tags present the answer came from step 2, and with no tags at all from
 * step 3.
 */
function resolveWithT011(
  layoutFamily: LayoutFamilyValue | undefined,
  bcp47: string[],
): LikelyBaseResolution {
  const hosts = toRefs(t011LikelyBaseLayouts(bcp47, layoutFamily));
  const source: LikelyBaseSource =
    layoutFamily !== undefined && layoutFamily !== "non-roman"
      ? "layout-family"
      : bcp47.length > 0
        ? "bcp47"
        : "default";
  return { hosts, source };
}

/**
 * Reactive likely-host resolution for the carve gallery (and the future
 * closed-keyboard card): the stored layout_family answer is read first, per
 * the FR-023 order, through T011's resolver.
 */
export function useLikelyBaseLayouts(bcp47: string | undefined): LikelyBaseResolution {
  const layoutFamily = useLayoutFamilyAnswer();
  const pick = usePickedWindowsLayout();
  const pickedBase = pick?.host;
  return useMemo(
    () =>
      resolveLikelyBaseLayouts({
        layoutFamily,
        bcp47: bcp47 === undefined ? [] : [bcp47],
        pickedBase,
      }),
    [layoutFamily, pickedBase, bcp47],
  );
}
