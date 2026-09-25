// progressDots.test — the two-tier row derivation matrix (spec 057 T047,
// T065; spec 079 journey-strip-contract.md, T053).
//
// REWRITE NOTE (T053, per journey-strip-contract.md §10): the pre-079 version
// of this file asserted a FLAT row — one dot per record entry, active step or
// not, with no section/question distinction. That shape is no longer what
// `buildProgressDots` returns: a step the author is NOT currently in now
// collapses to exactly ONE section mark (journey-strip-contract.md §2), so
// every assertion that expected several individually-addressable dots for a
// non-active step (e.g. "one dot per survey-answer entry, in record order",
// "a revised question ... has exactly one dot", "editor-action entries never
// earn a dot", "the truncated record" case, "row growth" appending a second
// completed dot for a non-active step) has been REWRITTEN below to assert the
// collapsed section mark's `fill` state instead of counting individual dots.
// Nothing about WHICH steps are collapsed vs. expanded is new test surface —
// it is exactly journey-strip-contract.md §2's rule, applied to the same
// fixtures the old flat tests used.
//
// Uses the REAL `manifest` array (steps/manifest.ts) rather than a hand-rolled
// fixture graph — same precedent as before this rewrite.

import { describe, it, expect } from "vitest";
import type { DecisionEntry, DecisionRecord } from "@keyboard-studio/contracts";
import { PRE_IDENTITY_STEP_ID } from "@keyboard-studio/contracts";
import { manifest } from "../steps/manifest.ts";
import type { TraversalSnapshot } from "../stores/surveySessionStore.ts";
import type { ResolveContext } from "../lib/resolveLocation.ts";
import type { WorkItem } from "../steps/workToDo.ts";
import { buildProgressDots, type ProgressDot } from "./progressDots.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function traversal(partial: {
  activeStepId: string;
  history?: readonly string[];
  selectedTrack?: "copy" | "adapt" | null;
}): TraversalSnapshot {
  return {
    activeStepId: partial.activeStepId,
    history: partial.history ?? [],
    selectedTrack: partial.selectedTrack ?? null,
  } as unknown as TraversalSnapshot;
}

const REGISTRY = {
  il_language_english: {},
  il_language_autonym: {},
  pb_rtl_direction_confirm: {},
  some_optional_question: {},
};

function ctxWith(overrides: Partial<ResolveContext> = {}): ResolveContext {
  return {
    manifest,
    questionRegistry: REGISTRY,
    traversal: traversal({
      activeStepId: "characters",
      history: ["identity", "choose_base", "track"],
      selectedTrack: "adapt",
    }),
    hasProject: true,
    ...overrides,
  };
}

function answerEntry(
  entryId: string,
  stepId: string,
  questionId: string,
  supersedes: string | null = null,
): DecisionEntry {
  return {
    entryId,
    stepId,
    payload: { kind: "survey-answer", questionId, answerType: "text", value: "x" },
    provenance: { agency: "hand-set" },
    recordedAt: 1,
    supersedes,
  };
}

function editorEntry(entryId: string, stepId: string): DecisionEntry {
  return {
    entryId,
    stepId,
    payload: {
      kind: "editor-action",
      actionType: "gallery_edit",
      summary: { sample: [], sampleTruncated: false },
    },
    provenance: { agency: "hand-set" },
    recordedAt: 1,
    supersedes: null,
  };
}

function recordOf(entries: readonly DecisionEntry[]): DecisionRecord {
  return {
    format: "keyboard-studio.decision-record",
    version: 2,
    keyboardId: "test_kbd",
    entries: [...entries],
    truncated: null,
  };
}

function stubLabel(id: string): string {
  return `label:${id}`;
}

function completedIds(dots: readonly ProgressDot[]): string[] {
  return dots.filter((d) => d.kind === "completed").map((d) => d.id);
}

function upcomingIds(dots: readonly ProgressDot[]): string[] {
  return dots.filter((d) => d.kind === "upcoming").map((d) => d.id);
}

function currentDot(dots: readonly ProgressDot[]): ProgressDot | undefined {
  return dots.find((d) => d.kind === "current");
}

function sectionFor(dots: readonly ProgressDot[], stepId: string): ProgressDot | undefined {
  return dots.find((d) => d.tier === "section" && d.id === stepId);
}

// ---------------------------------------------------------------------------
// Section marks — one per manifest step, collapsed unless it's the active one
// (journey-strip-contract.md §2, §4)
// ---------------------------------------------------------------------------

describe("section marks — one per non-active manifest step", () => {
  it("a non-active step's record entries collapse to ONE full section mark", () => {
    const record = recordOf([
      answerEntry("e1", "identity", "il_language_english"),
      answerEntry("e2", "identity", "il_language_autonym"),
    ]);
    const dots = buildProgressDots({ record, ctx: ctxWith(), lookupQuestionLabel: stubLabel });
    const identitySections = dots.filter((d) => d.location.step === "identity");
    expect(identitySections).toHaveLength(1);
    expect(identitySections[0]).toMatchObject({ tier: "section", fill: "full", kind: "completed" });
  });

  it("a revised question — collapsed by effectiveEntries upstream — still yields one mark", () => {
    const record = recordOf([
      answerEntry("e1", "identity", "il_language_english"),
      answerEntry("e2", "identity", "il_language_english", "e1"),
    ]);
    const dots = buildProgressDots({ record, ctx: ctxWith(), lookupQuestionLabel: stubLabel });
    expect(dots.filter((d) => d.location.step === "identity")).toHaveLength(1);
  });

  it("PRE_IDENTITY_STEP_ID entries contribute nothing — there is no step to jump to", () => {
    const record = recordOf([
      answerEntry("e1", PRE_IDENTITY_STEP_ID, "some_pre_identity_question"),
      answerEntry("e2", "identity", "il_language_english"),
    ]);
    const dots = buildProgressDots({ record, ctx: ctxWith(), lookupQuestionLabel: stubLabel });
    expect(dots.some((d) => d.location.step === PRE_IDENTITY_STEP_ID)).toBe(false);
    expect(sectionFor(dots, "identity")).toMatchObject({ fill: "full" });
  });

  it("editor-action entries never earn a mark of their own — the section reflects survey answers only", () => {
    const record = recordOf([
      answerEntry("e1", "identity", "il_language_english"),
      editorEntry("e2", "carve"),
    ]);
    const dots = buildProgressDots({ record, ctx: ctxWith(), lookupQuestionLabel: stubLabel });
    // "carve" is ahead of "characters" (the fixture's active step) with no
    // survey-answer entries of its own: it still gets ONE section mark (every
    // manifest step does, §2), but as an upcoming stage, not as "completed
    // because an editor-action happened there".
    expect(sectionFor(dots, "carve")).toMatchObject({ kind: "upcoming", fill: "none" });
  });

  it("a truncated record yields a section mark only for the step that survived", () => {
    const record = recordOf([answerEntry("e2", "identity", "il_language_autonym")]);
    const dots = buildProgressDots({ record, ctx: ctxWith(), lookupQuestionLabel: stubLabel });
    expect(sectionFor(dots, "identity")).toMatchObject({ fill: "full" });
  });

  it("a section mark's label is always the STAGE label, from the injected lookup's fallback chain", () => {
    const record = recordOf([answerEntry("e1", "identity", "il_language_english")]);
    const dots = buildProgressDots({ record, ctx: ctxWith(), lookupQuestionLabel: () => undefined });
    // stageLabel's own English fallback for "identity" when no i18n is given.
    expect(sectionFor(dots, "identity")?.label).toBe("Identity");
  });

  it("no section or question mark's label is ever a raw answer id (§4)", () => {
    const record = recordOf([answerEntry("e1", "identity", "il_language_english")]);
    const dots = buildProgressDots({ record, ctx: ctxWith(), lookupQuestionLabel: () => undefined });
    expect(dots.some((d) => d.label === "il_language_english")).toBe(false);
  });

  it("every manifest step up to and including 'help' earns exactly one mark on this author's path", () => {
    const dots = buildProgressDots({ record: recordOf([]), ctx: ctxWith(), lookupQuestionLabel: stubLabel });
    // "adapt" skips project_name (FR-049a) — every OTHER on-path step has a mark.
    const onPathIds = manifest
      .filter((s) => s.id !== "project_name" && s.id !== "package")
      .map((s) => s.id);
    for (const id of onPathIds) {
      expect(dots.some((d) => d.id === id || d.location.step === id)).toBe(true);
    }
    expect(dots.some((d) => d.id === "project_name")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Upcoming dots — path-scoping, growth, tail re-projection (unchanged
// semantics, now expressed as section marks)
// ---------------------------------------------------------------------------

describe("upcoming section marks — the projected remaining path", () => {
  it("nothing off-path: the adapt track never shows project_name, greyed out or otherwise", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith({
        traversal: traversal({ activeStepId: "track", history: ["identity", "choose_base"], selectedTrack: "adapt" }),
      }),
      lookupQuestionLabel: stubLabel,
    });
    expect(dots.some((d) => d.id === "project_name")).toBe(false);
  });

  it("row growth: project_name appears the instant the track resolves to copy", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith({
        traversal: traversal({ activeStepId: "track", history: ["identity", "choose_base"], selectedTrack: "copy" }),
      }),
      lookupQuestionLabel: stubLabel,
    });
    expect(dots.some((d) => d.id === "project_name")).toBe(true);
  });

  it("the reserved `package` step never earns a mark", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith({
        traversal: traversal({
          activeStepId: "help",
          history: manifest.map((s) => s.id).slice(0, manifest.findIndex((s) => s.id === "help")),
          selectedTrack: "adapt",
        }),
      }),
      lookupQuestionLabel: stubLabel,
    });
    expect(dots.some((d) => d.id === "package")).toBe(false);
  });

  it("upcoming sections are in manifest order and carry a beyond-gate resolution", () => {
    const dots = buildProgressDots({ record: recordOf([]), ctx: ctxWith(), lookupQuestionLabel: stubLabel });
    const upcoming = dots.filter((d) => d.kind === "upcoming");
    expect(upcoming.length).toBeGreaterThan(0);
    for (const dot of upcoming) {
      expect(dot.resolution).toMatchObject({ kind: "degraded", reason: "beyond-gate" });
      expect(dot.fill).toBe("none");
    }
    expect(upcoming[0]?.id).toBe("marks");
  });

  it("tail re-projection: a bypassed off-spine fork drops out once the current position passes it", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith({
        traversal: traversal({
          activeStepId: "touch",
          history: ["identity", "choose_base", "track", "characters", "marks", "convenience", "carve", "mechanisms"],
          selectedTrack: "adapt",
        }),
      }),
      lookupQuestionLabel: stubLabel,
    });
    expect(dots.some((d) => d.id === "touch_seed_source")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The current dot (US6, T063) — unchanged fallback for a step with no screens
// ---------------------------------------------------------------------------

describe("the current dot", () => {
  it("is stage-accurate by default when the active step publishes no screens", () => {
    const dots = buildProgressDots({ record: recordOf([]), ctx: ctxWith(), lookupQuestionLabel: stubLabel });
    const current = currentDot(dots);
    expect(current).toBeDefined();
    expect(current?.id).toBe("characters");
    expect(current?.location).toEqual({ route: "survey", step: "characters" });
  });

  it("is question-accurate when a pending jump named a question (FR-060)", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
      currentQuestion: "il_language_english",
    });
    const current = currentDot(dots);
    expect(current?.id).toBe("il_language_english");
    expect(current?.label).toBe("label:il_language_english");
  });

  it("is absent once the walk reaches a terminal state", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith({ traversal: traversal({ activeStepId: "done" }) }),
      lookupQuestionLabel: stubLabel,
    });
    expect(dots.some((d) => d.kind === "current")).toBe(false);
  });

  it("resolves reachable — the author IS at the current position by construction", () => {
    const dots = buildProgressDots({ record: recordOf([]), ctx: ctxWith(), lookupQuestionLabel: stubLabel });
    expect(currentDot(dots)?.resolution.kind).toBe("reachable");
  });
});

// ---------------------------------------------------------------------------
// Within-step walks — the ACTIVE step expands into one question mark per stop
// ---------------------------------------------------------------------------

describe("within-step walk dots — the active section's question marks", () => {
  it("renders one QUESTION mark per stop for the active step, not a single section mark", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
      stepWalks: {
        characters: [
          { id: "il_language_english", done: true },
          { id: "il_language_autonym", done: true },
          { id: "some_optional_question", done: false },
        ],
      },
      stepCursors: { characters: "some_optional_question" },
    });
    const characterMarks = dots.filter((d) => d.location.step === "characters");
    expect(characterMarks.every((d) => d.tier === "question")).toBe(true);
    expect(completedIds(dots)).toEqual(
      expect.arrayContaining(["il_language_english", "il_language_autonym"]),
    );
    expect(currentDot(dots)?.id).toBe("some_optional_question");
    // No section mark for "characters" while it's expanded.
    expect(dots.some((d) => d.tier === "section" && d.id === "characters")).toBe(false);
  });

  it("an unanswered stop inside the ACTIVE (reached) step is reachable, unlike an upcoming section", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
      stepWalks: {
        characters: [
          { id: "il_language_english", done: false },
          { id: "il_language_autonym", done: true },
        ],
      },
      stepCursors: { characters: "il_language_autonym" },
    });
    const unanswered = dots.find((d) => d.id === "il_language_english");
    expect(unanswered?.kind).toBe("upcoming");
    expect(unanswered?.tier).toBe("question");
    expect(unanswered?.resolution.kind).toBe("reachable");
    const section = sectionFor(dots, "marks");
    expect(section?.resolution).toMatchObject({ kind: "degraded", reason: "beyond-gate" });
  });

  it("a walk stop and a record entry for the same question do not double up", () => {
    const record = recordOf([answerEntry("e1", "characters", "il_language_english")]);
    const dots = buildProgressDots({
      record,
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
      stepWalks: { characters: [{ id: "il_language_english", done: true }] },
      stepCursors: { characters: "il_language_english" },
    });
    expect(dots.filter((d) => d.id === "il_language_english")).toHaveLength(1);
  });

  it("collapses a character walk to ONE section mark for the gallery, even while active", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith({
        traversal: traversal({
          activeStepId: "mechanisms",
          history: ["identity", "choose_base", "track", "characters", "marks", "convenience", "carve"],
          selectedTrack: "adapt",
        }),
        stepPositions: { mechanisms: ["u00e1", "u00e9", "u00ed"] },
      }),
      lookupQuestionLabel: stubLabel,
      stepWalks: {
        mechanisms: [
          { id: "u00e1", label: "á (U+00E1)", done: true },
          { id: "u00e9", label: "é (U+00E9)", done: false },
          { id: "u00ed", label: "í (U+00ED)", done: false },
        ],
      },
      stepCursors: { mechanisms: "u00e9" },
    });
    const mechanismsDots = dots.filter((d) => d.location.step === "mechanisms");
    expect(mechanismsDots).toHaveLength(1);
    expect(mechanismsDots[0]).toMatchObject({ tier: "section", id: "mechanisms", label: "Mechanisms" });
    expect(mechanismsDots[0]?.location.question).toBeUndefined();
    expect(currentDot(dots)?.id).toBe("mechanisms");
  });

  it("keeps a step's record dots for questions its CURRENT walk does not name", () => {
    const record = recordOf([
      answerEntry("e1", "characters", "il_language_autonym"),
      answerEntry("e2", "characters", "il_language_english"),
    ]);
    const dots = buildProgressDots({
      record,
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
      stepWalks: { characters: [{ id: "il_language_english", done: true }] },
      stepCursors: { characters: "il_language_english" },
    });
    // The record-derived screen has no `recordedScreenOf` mapping, so its id
    // is the step's fallback bucket key, not the raw question id (§4) — find
    // it by its JUMP target (`location.question`, still the real question)
    // instead of by `id`.
    const autonymMark = dots.find((d) => d.location.step === "characters" && d.location.question === "il_language_autonym");
    expect(autonymMark).toBeDefined();
    expect(dots.filter((d) => d.id === "il_language_english")).toHaveLength(1);
    const characterMarks = dots.filter((d) => d.location.step === "characters");
    expect(characterMarks.findIndex((d) => d === autonymMark)).toBeLessThan(
      characterMarks.findIndex((d) => d.id === "il_language_english"),
    );
  });

  it("a cursor stored for a step the author is NOT in marks no dot current", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
      stepWalks: { identity: [{ id: "il_language_english", done: true }] },
      stepCursors: { identity: "il_language_english" },
    });
    expect(dots.filter((d) => d.kind === "current")).toHaveLength(1);
    expect(currentDot(dots)?.id).toBe("characters");
  });

  it("keeps a record dot whose step is not in this build, so its reason still surfaces", () => {
    const record = recordOf([answerEntry("e1", "retired_step", "il_language_english")]);
    const dots = buildProgressDots({ record, ctx: ctxWith(), lookupQuestionLabel: stubLabel });
    const orphan = dots.find((d) => d.location.step === "retired_step");
    expect(orphan).toBeDefined();
    expect(orphan?.resolution).toMatchObject({ reason: "step-not-in-build" });
  });
});

// ---------------------------------------------------------------------------
// §4 screen grouping: an Invisibles-style multi-answer Next collapses to ONE
// question mark, and an entry with no recordedScreenOf mapping falls back to
// one mark per step.
// ---------------------------------------------------------------------------

describe("screen grouping (§4) — one mark per screen, not per recorded answer", () => {
  it("several entries sharing a recordedScreenOf mapping collapse to ONE question mark on the active step", () => {
    const record = recordOf([
      answerEntry("e1", "invisibles", "invisibles.u2068"),
      answerEntry("e2", "invisibles", "invisibles.u2069"),
      answerEntry("e3", "invisibles", "invisibles.u200e"),
    ]);
    const dots = buildProgressDots({
      record,
      ctx: ctxWith({ traversal: traversal({ activeStepId: "invisibles", history: [] }) }),
      lookupQuestionLabel: () => undefined,
      recordedScreenOf: { e1: "invisibles-next", e2: "invisibles-next", e3: "invisibles-next" },
    });
    const invisiblesMarks = dots.filter((d) => d.location.step === "invisibles");
    expect(invisiblesMarks).toHaveLength(1);
    expect(invisiblesMarks[0]?.tier).toBe("question");
    expect(invisiblesMarks[0]?.label).not.toMatch(/invisibles\.u2068/);
  });

  it("entries with NO recordedScreenOf mapping fall back to one mark for the step", () => {
    const record = recordOf([
      answerEntry("e1", "invisibles", "invisibles.u2068"),
      answerEntry("e2", "invisibles", "invisibles.u2069"),
    ]);
    const dots = buildProgressDots({
      record,
      ctx: ctxWith({ traversal: traversal({ activeStepId: "invisibles", history: [] }) }),
      lookupQuestionLabel: () => undefined,
      // No recordedScreenOf entry at all — the pre-`screenId` degrade path.
    });
    expect(dots.filter((d) => d.location.step === "invisibles")).toHaveLength(1);
  });

  it("a non-active step's grouped screens still collapse to one section mark, fully filled", () => {
    const record = recordOf([
      answerEntry("e1", "invisibles", "invisibles.u2068"),
      answerEntry("e2", "invisibles", "invisibles.u2069"),
    ]);
    const dots = buildProgressDots({
      record,
      ctx: ctxWith(),
      lookupQuestionLabel: () => undefined,
      recordedScreenOf: { e1: "invisibles-next", e2: "invisibles-next" },
    });
    expect(sectionFor(dots, "invisibles")).toMatchObject({ fill: "full" });
  });
});

// ---------------------------------------------------------------------------
// §3c badges — from selectWorkToDo() fixtures
// ---------------------------------------------------------------------------

describe("badges (§3c) — from selectWorkToDo() fixtures", () => {
  it("a reproposed item lands on the matching QUESTION mark when its step is active", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith({ traversal: traversal({ activeStepId: "marks", history: [] }) }),
      lookupQuestionLabel: stubLabel,
      stepWalks: { marks: [{ id: "ms_series_s1", done: true }, { id: "ms_series_s2", done: false }] },
      stepCursors: { marks: "ms_series_s2" },
      workToDo: {
        marks: [
          {
            kind: "reproposed",
            stepId: "marks",
            screenId: "ms_series_s1",
            answerId: "a1",
            reason: { code: "evidence-added", subject: "x", sourceStepId: "characters" },
          } satisfies WorkItem,
        ],
      },
    });
    const s1 = dots.find((d) => d.id === "ms_series_s1");
    expect(s1?.badge).toEqual(["reproposed"]);
    const s2 = dots.find((d) => d.id === "ms_series_s2");
    expect(s2?.badge).toBeUndefined();
  });

  it("a badge on a collapsed (non-active) section shows that SOME question inside has work", () => {
    const dots = buildProgressDots({
      record: recordOf([answerEntry("e1", "marks", "ms_series_s1")]),
      ctx: ctxWith(), // active step: characters
      lookupQuestionLabel: stubLabel,
      workToDo: {
        marks: [
          {
            kind: "reproposed",
            stepId: "marks",
            screenId: "ms_series_s1",
            answerId: "a1",
            reason: { code: "evidence-added", subject: "x", sourceStepId: "characters" },
          },
        ],
      },
    });
    expect(sectionFor(dots, "marks")?.badge).toEqual(["reproposed"]);
  });

  it("an unassigned-mechanisms badge lands on the collapsed gallery mark", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith({
        traversal: traversal({
          activeStepId: "carve",
          history: ["identity", "choose_base", "track", "characters", "marks", "convenience"],
          selectedTrack: "adapt",
        }),
        stepPositions: { mechanisms: ["u00e1"] },
      }),
      lookupQuestionLabel: stubLabel,
      stepWalks: { mechanisms: [{ id: "u00e1", done: false }] },
      workToDo: { mechanisms: [{ kind: "unassigned", stepId: "mechanisms", count: 3 }] },
    });
    const mechanisms = dots.find((d) => d.location.step === "mechanisms");
    expect(mechanisms?.badge).toEqual(["unassigned"]);
  });

  it("a now-applicable badge on a not-asked step carries the FR-068 passed reason too", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
      workToDo: { convenience: [{ kind: "now-applicable", stepId: "convenience", reason: { code: "now-applicable", subject: "convenience-no-surplus", sourceStepId: "convenience" } }] },
      stepStatuses: {
        convenience: {
          kind: "not-asked",
          reason: { code: "convenience-no-surplus" },
          evidenceKey: "k1",
        },
      },
    });
    const convenience = sectionFor(dots, "convenience");
    expect(convenience?.badge).toEqual(["now-applicable"]);
    expect(convenience?.passedReason).toMatch(/passed/);
  });
});

// ---------------------------------------------------------------------------
// §5 jump rules — the collapsed-section EXCEPTION (badged -> earliest work
// item; unbadged -> the saved position). This is the exact computation
// `dot.location` carries into `jumpToLocation` — StudioFooter's own click/
// keyboard handling is identical for every mark regardless of badge (see
// components/ProgressDot.tsx), so pinning the LOCATION here is what actually
// proves §5, rather than re-testing generic button activation at the
// component layer.
// ---------------------------------------------------------------------------

describe("§5 jump target — badged collapsed section vs. unbadged", () => {
  it("an UNBADGED collapsed section jumps to the author's saved position, not the step bare", () => {
    const dots = buildProgressDots({
      record: recordOf([answerEntry("e1", "marks", "ms_series_s1")]),
      ctx: ctxWith(), // active step: characters; marks is behind it
      lookupQuestionLabel: stubLabel,
      stepCursors: { marks: "ms_series_s2" },
    });
    const marks = sectionFor(dots, "marks");
    expect(marks?.badge).toBeUndefined();
    expect(marks?.location).toEqual({ route: "survey", step: "marks", question: "ms_series_s2" });
  });

  it("an unbadged collapsed section with NO saved position jumps to the bare step", () => {
    const dots = buildProgressDots({
      record: recordOf([answerEntry("e1", "marks", "ms_series_s1")]),
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
      // No stepCursors entry for "marks" at all.
    });
    const marks = sectionFor(dots, "marks");
    expect(marks?.location).toEqual({ route: "survey", step: "marks" });
  });

  it("a BADGED collapsed section jumps to the EARLIEST work item's screen — NOT the saved position", () => {
    const dots = buildProgressDots({
      record: recordOf([
        answerEntry("e1", "marks", "ms_series_s1"),
        answerEntry("e2", "marks", "ms_series_s2"),
      ]),
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
      // The author's own saved position is s2 (further along than the flagged
      // s1) — §5 is explicit that a badge is a deliberate EXCEPTION to "jump
      // to the last position", precisely because the point of the badge is to
      // surface work the author has not seen yet.
      stepCursors: { marks: "ms_series_s2" },
      workToDo: {
        marks: [
          {
            kind: "reproposed",
            stepId: "marks",
            screenId: "ms_series_s1",
            answerId: "a1",
            reason: { code: "evidence-added", subject: "x", sourceStepId: "characters" },
          },
        ],
      },
    });
    const marks = sectionFor(dots, "marks");
    expect(marks?.badge).toEqual(["reproposed"]);
    expect(marks?.location).toEqual({ route: "survey", step: "marks", question: "ms_series_s1" });
  });

  it("a badge with no screen-bearing work item (unassigned mechanisms) still jumps to the gallery step", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith({
        traversal: traversal({
          activeStepId: "carve",
          history: ["identity", "choose_base", "track", "characters", "marks", "convenience"],
          selectedTrack: "adapt",
        }),
        stepPositions: { mechanisms: ["u00e1"] },
      }),
      lookupQuestionLabel: stubLabel,
      stepWalks: { mechanisms: [{ id: "u00e1", done: false }] },
      workToDo: { mechanisms: [{ kind: "unassigned", stepId: "mechanisms", count: 3 }] },
    });
    const mechanisms = dots.find((d) => d.location.step === "mechanisms");
    expect(mechanisms?.badge).toEqual(["unassigned"]);
    expect(mechanisms?.location).toEqual({ route: "survey", step: "mechanisms" });
  });

  it("a question mark's own jump target never changes because of its badge (§5 row 2)", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith({ traversal: traversal({ activeStepId: "marks", history: [] }) }),
      lookupQuestionLabel: stubLabel,
      stepWalks: { marks: [{ id: "ms_series_s1", done: true }, { id: "ms_series_s2", done: false }] },
      stepCursors: { marks: "ms_series_s2" },
      workToDo: {
        marks: [
          {
            kind: "reproposed",
            stepId: "marks",
            screenId: "ms_series_s1",
            answerId: "a1",
            reason: { code: "evidence-added", subject: "x", sourceStepId: "characters" },
          },
        ],
      },
    });
    const badged = dots.find((d) => d.id === "ms_series_s1");
    const unbadged = dots.find((d) => d.id === "ms_series_s2");
    expect(badged?.location).toEqual({ route: "survey", step: "marks", question: "ms_series_s1" });
    expect(unbadged?.location).toEqual({ route: "survey", step: "marks", question: "ms_series_s2" });
  });
});

// ---------------------------------------------------------------------------
// FR-063 / US6 scenario 3 — jumping back does not truncate progress
// ---------------------------------------------------------------------------

describe("jumping back (T065, FR-063)", () => {
  it("the marker moves, and the sections ahead of the landing point are still present and full", () => {
    const record = recordOf([
      answerEntry("e1", "identity", "il_language_english"),
      answerEntry("e2", "characters", "il_language_autonym"),
    ]);

    const before = buildProgressDots({
      record,
      ctx: ctxWith({
        traversal: traversal({
          activeStepId: "touch",
          history: ["identity", "choose_base", "track", "characters", "marks", "convenience", "carve", "mechanisms"],
          selectedTrack: "adapt",
        }),
      }),
      lookupQuestionLabel: stubLabel,
    });
    expect(currentDot(before)?.id).toBe("touch");
    expect(sectionFor(before, "marks")).toMatchObject({ fill: "full" });

    const after = buildProgressDots({
      record,
      ctx: ctxWith({
        traversal: traversal({
          activeStepId: "characters",
          history: ["identity", "choose_base", "track"],
          selectedTrack: "adapt",
        }),
      }),
      lookupQuestionLabel: stubLabel,
    });

    expect(currentDot(after)?.location.step).toBe("characters");
    expect(upcomingIds(after)).toEqual(
      expect.arrayContaining(["marks", "convenience", "carve", "mechanisms"]),
    );
    // identity's own answer, recorded and behind the new position, is untouched.
    expect(sectionFor(after, "identity")).toMatchObject({ fill: "full" });
  });
});
