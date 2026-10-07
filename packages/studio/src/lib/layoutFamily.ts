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
//      English); (b) `likelyHostLayouts(bcp47[])` when the question is
//      unanswered; (c) the five reference hosts when no signal exists.
//
// T011 owns the reference data (`packages/studio/src/lib/referenceHostLayouts.ts`:
// `likelyHostLayouts`, the versioned region→layout table, the rich host maps).
// This module consumes that resolver directly — it never reimplements the
// table. `setLikelyHostDeps` remains as a test seam overriding the default.

import { useMemo } from "react";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { peekDecision, useDecisionStore } from "../stores/decisionStore.ts";
import type { StepAnswers, StepId } from "../steps/answerTypes.ts";
// T011's reference module — consumed, never reimplemented.
import {
  HOST_LAYOUTS,
  REFERENCE_HOST_IDS,
  likelyHostLayouts as t011LikelyHostLayouts,
} from "./referenceHostLayouts.ts";
import type { HostLayoutId, LayoutFamilyAnswer } from "./referenceHostLayouts.ts";
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
 * Minimal host-layout reference. T011's richer HostLayout type must be
 * assignable to this shape (id + label); the resolution order only needs
 * identity and an author-facing label.
 */
export interface HostLayoutRef {
  /** Stable id — T011's referenceHostLayouts.ts owns the canonical ids. */
  id: string;
  /** Author-facing label, e.g. "UK English". */
  label: string;
}

/**
 * The five FR-023 reference hosts in canonical order (ruling A3). Labels come
 * from T011's HOST_LAYOUTS — this module owns no host data of its own.
 */
export const REFERENCE_HOSTS: readonly HostLayoutRef[] = REFERENCE_HOST_IDS.map((id) => ({
  id,
  label: HOST_LAYOUTS[id].label,
}));

/**
 * T011's contract: `packages/studio/src/lib/referenceHostLayouts.ts`.
 * Injected only by tests; production resolves through T011's module directly.
 */
export interface LikelyHostDeps {
  /** T011: resolves bcp47 tags through the versioned region→layout mapping. */
  likelyHostLayouts: (bcp47: string[]) => HostLayoutRef[];
  /** T011: the full reference-host records; defaults to REFERENCE_HOSTS. */
  referenceHosts?: readonly HostLayoutRef[];
  /**
   * Maps a layout_family answer through T011's versioned table, refining
   * coarse answers by bcp47 region (qwerty + en-GB → UK English).
   */
  layoutFamilyHosts?: (answer: LayoutFamilyValue, bcp47: string[]) => HostLayoutRef[];
}

function toRefs(ids: readonly HostLayoutId[]): HostLayoutRef[] {
  return ids.map((id) => ({ id, label: HOST_LAYOUTS[id].label }));
}

let likelyHostDepsOverride: LikelyHostDeps | undefined;

/**
 * Override the T011-backed default resolution — primarily a test seam.
 * Production code resolves through T011's module directly.
 */
export function setLikelyHostDeps(deps: LikelyHostDeps | undefined): void {
  likelyHostDepsOverride = deps;
}

export type LikelyHostSource = "layout-family" | "bcp47" | "default";

export interface LikelyHostResolution {
  hosts: HostLayoutRef[];
  source: LikelyHostSource;
}

/**
 * FR-023 resolution order. Never returns empty: the fallthrough always yields
 * the five reference hosts.
 *
 * Without injected deps this delegates the order to T011's
 * `likelyHostLayouts(bcp47, layoutFamilyAnswer)`, which implements the full
 * order (answer → bcp47 → default); the source is derived from which inputs
 * T011 could have consumed. With injected deps (tests) the three steps run
 * explicitly against the stub.
 */
export function resolveLikelyHostLayouts(opts: {
  layoutFamily: LayoutFamilyValue | undefined;
  bcp47: string[];
  deps?: LikelyHostDeps;
  /**
   * Reference host id of the layout the author picked on the layout step, when
   * the pick IS one of the five reference hosts: the exact answer, ahead of
   * any family or language-tag inference (spec 076 A4).
   */
  pickedHost?: HostLayoutId | undefined;
}): LikelyHostResolution {
  if (opts.pickedHost !== undefined) {
    return { hosts: toRefs([opts.pickedHost]), source: "layout-family" };
  }
  const deps = opts.deps ?? likelyHostDepsOverride;
  if (deps === undefined) return resolveWithT011(opts.layoutFamily, opts.bcp47);

  const reference = deps.referenceHosts ?? REFERENCE_HOSTS;

  // (a) The author's answer is primary — via T011's versioned table.
  if (opts.layoutFamily !== undefined && deps.layoutFamilyHosts !== undefined) {
    const hosts = deps.layoutFamilyHosts(opts.layoutFamily, opts.bcp47);
    if (hosts.length > 0) return { hosts: [...hosts], source: "layout-family" };
    // A table miss falls through to bcp47 inference — never to silence.
  }

  // (b) Language-tag inference when the question is unanswered (or the table missed).
  if (deps.likelyHostLayouts !== undefined) {
    const hosts = deps.likelyHostLayouts(opts.bcp47);
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
): LikelyHostResolution {
  const hosts = toRefs(t011LikelyHostLayouts(bcp47, layoutFamily));
  const source: LikelyHostSource =
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
export function useLikelyHostLayouts(bcp47: string | undefined): LikelyHostResolution {
  const layoutFamily = useLayoutFamilyAnswer();
  const pick = usePickedWindowsLayout();
  const pickedHost = pick?.host;
  return useMemo(
    () =>
      resolveLikelyHostLayouts({
        layoutFamily,
        bcp47: bcp47 === undefined ? [] : [bcp47],
        pickedHost,
      }),
    [layoutFamily, pickedHost, bcp47],
  );
}
