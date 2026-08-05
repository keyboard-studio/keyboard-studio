// progressDots.test — the row derivation matrix (spec 057 T047, T065).
//
// Uses the REAL `manifest` array (steps/manifest.ts) rather than a hand-rolled
// fixture graph: test files are excluded from the depcruise `decisions-layer`
// boundary (`.dependency-cruiser.cjs`'s exclude pattern), and
// resolveLocation.test.ts already sets the precedent of importing it directly
// for the same reason — the fixture stays honest about real step ids/order
// without this file needing its own second manifest.

import { describe, it, expect } from "vitest";
import type { DecisionEntry, DecisionRecord } from "@keyboard-studio/contracts";
import { PRE_IDENTITY_STEP_ID } from "@keyboard-studio/contracts";
import { manifest } from "../steps/manifest.ts";
import type { TraversalSnapshot } from "../stores/surveySessionStore.ts";
import type { ResolveContext } from "../lib/resolveLocation.ts";
import { buildProgressDots, type ProgressDot } from "./progressDots.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A traversal snapshot carrying only what resolveLocation reads — same
 * narrowing idiom resolveLocation.test.ts's own `traversal()` helper uses. */
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

// ---------------------------------------------------------------------------
// Completed dots
// ---------------------------------------------------------------------------

describe("completed dots — from the decision record", () => {
  it("one dot per survey-answer entry, in record order", () => {
    const record = recordOf([
      answerEntry("e1", "identity", "il_language_english"),
      answerEntry("e2", "identity", "il_language_autonym"),
    ]);
    const dots = buildProgressDots({
      record,
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
    });
    expect(completedIds(dots)).toEqual(["il_language_english", "il_language_autonym"]);
  });

  it("a revised question — collapsed by effectiveEntries — has exactly one dot", () => {
    const record = recordOf([
      answerEntry("e1", "identity", "il_language_english"),
      // e2 supersedes e1: same question, revised once.
      answerEntry("e2", "identity", "il_language_english", "e1"),
    ]);
    const dots = buildProgressDots({
      record,
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
    });
    expect(completedIds(dots)).toEqual(["il_language_english"]);
  });

  it("PRE_IDENTITY_STEP_ID entries produce no dot — there is no step to jump to", () => {
    const record = recordOf([
      answerEntry("e1", PRE_IDENTITY_STEP_ID, "some_pre_identity_question"),
      answerEntry("e2", "identity", "il_language_english"),
    ]);
    const dots = buildProgressDots({
      record,
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
    });
    expect(completedIds(dots)).toEqual(["il_language_english"]);
  });

  it("editor-action and base-contribution entries never earn a completed dot of their own", () => {
    const record = recordOf([
      answerEntry("e1", "identity", "il_language_english"),
      editorEntry("e2", "carve"),
    ]);
    const dots = buildProgressDots({
      record,
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
    });
    expect(completedIds(dots)).toEqual(["il_language_english"]);
  });

  it("a truncated record yields dots only for the entries that survived — nothing fabricated", () => {
    // "Truncated" here means exactly what 053 FR-011 means: some entries are
    // simply absent from `entries`. There is no special-case code for this in
    // progressDots.ts — the derivation just iterates what's there, which IS
    // the guarantee (no dot is invented for a missing entry).
    const record = recordOf([answerEntry("e2", "identity", "il_language_autonym")]);
    const dots = buildProgressDots({
      record,
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
    });
    expect(completedIds(dots)).toEqual(["il_language_autonym"]);
  });

  it("label comes from the injected lookup, falling back to the raw id", () => {
    const record = recordOf([answerEntry("e1", "identity", "il_language_english")]);
    const dots = buildProgressDots({
      record,
      ctx: ctxWith(),
      lookupQuestionLabel: () => undefined,
    });
    expect(dots[0]?.label).toBe("il_language_english");
  });

  it("row growth: reaching an optional question appends its dot, nothing else changes", () => {
    const before = recordOf([answerEntry("e1", "identity", "il_language_english")]);
    const after = recordOf([
      answerEntry("e1", "identity", "il_language_english"),
      answerEntry("e2", "characters", "some_optional_question"),
    ]);
    const ctx = ctxWith();
    const beforeDots = buildProgressDots({ record: before, ctx, lookupQuestionLabel: stubLabel });
    const afterDots = buildProgressDots({ record: after, ctx, lookupQuestionLabel: stubLabel });
    expect(completedIds(beforeDots)).toEqual(["il_language_english"]);
    expect(completedIds(afterDots)).toEqual(["il_language_english", "some_optional_question"]);
  });
});

// ---------------------------------------------------------------------------
// Upcoming dots — path-scoping, growth, tail re-projection
// ---------------------------------------------------------------------------

describe("upcoming dots — the projected remaining path", () => {
  it("nothing off-path: the adapt track never shows project_name, greyed out or otherwise", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith({
        traversal: traversal({
          activeStepId: "track",
          history: ["identity", "choose_base"],
          selectedTrack: "adapt",
        }),
      }),
      lookupQuestionLabel: stubLabel,
    });
    expect(upcomingIds(dots)).not.toContain("project_name");
  });

  it("row growth: project_name appears the instant the track resolves to copy", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith({
        traversal: traversal({
          activeStepId: "track",
          history: ["identity", "choose_base"],
          selectedTrack: "copy",
        }),
      }),
      lookupQuestionLabel: stubLabel,
    });
    expect(upcomingIds(dots)).toContain("project_name");
  });

  it("the reserved `package` step never earns an upcoming dot", () => {
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
    expect(upcomingIds(dots)).not.toContain("package");
  });

  it("upcoming dots are in manifest order and carry a beyond-gate resolution", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
    });
    const upcoming = dots.filter((d) => d.kind === "upcoming");
    expect(upcoming.length).toBeGreaterThan(0);
    for (const dot of upcoming) {
      expect(dot.resolution).toMatchObject({ kind: "degraded", reason: "beyond-gate" });
    }
    // Manifest order, starting right after "characters" (the fixture's
    // current position): marks, convenience, carve, mechanisms, ...
    expect(upcoming[0]?.id).toBe("marks");
  });

  it("tail re-projection: a bypassed off-spine fork drops out once the current position passes it", () => {
    // touch_seed_source sits between mechanisms and touch. A walk that goes
    // straight from mechanisms to touch (bypassing the fork) should not keep
    // advertising it as upcoming once "touch" is current.
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
    expect(upcomingIds(dots)).not.toContain("touch_seed_source");
  });

  it("tail re-projection never removes a completed dot — only the not-yet-reached look-ahead changes", () => {
    const record = recordOf([
      answerEntry("e1", "identity", "il_language_english"),
      answerEntry("e2", "characters", "il_language_autonym"),
    ]);
    const dots = buildProgressDots({
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
    expect(completedIds(dots)).toEqual(["il_language_english", "il_language_autonym"]);
    expect(upcomingIds(dots)).not.toContain("touch_seed_source");
  });
});

// ---------------------------------------------------------------------------
// The current dot (US6, T063)
// ---------------------------------------------------------------------------

describe("the current dot", () => {
  it("is stage-accurate by default — no shared store exposes the live question", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
    });
    const current = dots.find((d) => d.kind === "current");
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
    const current = dots.find((d) => d.kind === "current");
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
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
    });
    const current = dots.find((d) => d.kind === "current");
    expect(current?.resolution.kind).toBe("reachable");
  });
});

// ---------------------------------------------------------------------------
// Within-step walks — one dot per QUESTION / CHARACTER inside a stage
//
// The defect: a stage with a dozen internal stops was a single dot, so there was
// no way back into the middle of it, and the current-position marker went no
// finer than the stage. See progressDots.ts's header ("THE CURRENT QUESTION
// ARCHITECTURE GAP — NOW CLOSED") and lib/stepWalk.ts.
// ---------------------------------------------------------------------------

describe("within-step walk dots", () => {
  it("renders one dot per stop instead of a single stage dot for the current step", () => {
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
    // The three stops, not one "Characters" dot.
    expect(completedIds(dots)).toEqual(["il_language_english", "il_language_autonym"]);
    expect(currentDot(dots)?.id).toBe("some_optional_question");
    expect(dots.some((d) => d.id === "characters")).toBe(false);
  });

  it("an unanswered stop inside a REACHED step is reachable, unlike an upcoming stage", () => {
    // Both render as the same hollow square (FR-046), but only one of them is a
    // live jump target — the step is already reached, so its stops are
    // addressable and activating one must not refuse.
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
    expect(unanswered?.resolution.kind).toBe("reachable");
    // …whereas a stage still ahead refuses, as it always did.
    const stage = dots.find((d) => d.id === "marks");
    expect(stage?.resolution).toMatchObject({ kind: "degraded", reason: "beyond-gate" });
  });

  it("a walk does not duplicate the same step's record dot for the same question", () => {
    // Answers are recorded at step completion, so a REVISITED step has both a
    // record entry and a live walk for the same question. Only one dot may result.
    const record = recordOf([
      answerEntry("e1", "characters", "il_language_english"),
      answerEntry("e2", "identity", "il_language_autonym"),
    ]);
    const dots = buildProgressDots({
      record,
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
      stepWalks: { characters: [{ id: "il_language_english", done: true }] },
      stepCursors: { characters: "il_language_english" },
    });
    expect(dots.filter((d) => d.id === "il_language_english")).toHaveLength(1);
    // The OTHER step's record dot is untouched — suppression is per question.
    expect(dots.some((d) => d.id === "il_language_autonym")).toBe(true);
  });

  it("keeps a step's record dots for questions its CURRENT walk does not name", () => {
    // A stage can be walked by two flows in sequence — `characters` runs PhaseA's
    // prefill confirmations and then PhaseB — and the second publish REPLACES the
    // first in the store. Suppressing per step would make the earlier flow's dots
    // vanish as the author moved forward. Suppression is per question, so they stay.
    const record = recordOf([
      answerEntry("e1", "characters", "il_language_autonym"),
      answerEntry("e2", "characters", "il_language_english"),
    ]);
    const dots = buildProgressDots({
      record,
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
      // Only the SECOND question is in the live walk.
      stepWalks: { characters: [{ id: "il_language_english", done: true }] },
      stepCursors: { characters: "il_language_english" },
    });
    expect(dots.filter((d) => d.id === "il_language_autonym")).toHaveLength(1);
    expect(dots.filter((d) => d.id === "il_language_english")).toHaveLength(1);
    // Record-then-walk: the earlier flow's question precedes the walk's stops.
    const ids = dots.map((d) => d.id);
    expect(ids.indexOf("il_language_autonym")).toBeLessThan(ids.indexOf("il_language_english"));
  });

  it("a cursor stored for a step the author is NOT in marks no dot current", () => {
    // Two "you are here" markers in one row would be worse than none. A stored
    // cursor for another step describes where a jump WOULD land, not position.
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

  it("falls back to the stage dot when the active step's walk names no reachable cursor", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
      stepWalks: { characters: [{ id: "il_language_english", done: true }] },
      // A cursor naming a stop that is not in the walk.
      stepCursors: { characters: "some_optional_question" },
    });
    expect(currentDot(dots)?.id).toBe("characters");
  });

  it("labels a character stop from the walk, and a question stop from the resolver", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith({
        traversal: traversal({
          activeStepId: "mechanisms",
          history: ["identity", "choose_base", "track", "characters", "marks", "convenience", "carve"],
          selectedTrack: "adapt",
        }),
        // A character has no questionRegistry entry; the walk is what makes it
        // addressable (see ResolveContext.stepPositions).
        stepPositions: { mechanisms: ["u00e1"], identity: ["il_language_english"] },
      }),
      lookupQuestionLabel: stubLabel,
      stepWalks: {
        mechanisms: [{ id: "u00e1", label: "á (U+00E1)", done: false }],
        identity: [{ id: "il_language_english", done: true }],
      },
      stepCursors: { mechanisms: "u00e1" },
    });
    expect(currentDot(dots)?.label).toBe("á (U+00E1)");
    expect(currentDot(dots)?.resolution.kind).toBe("reachable");
    expect(dots.find((d) => d.id === "il_language_english")?.label).toBe(
      "label:il_language_english",
    );
  });

  it("orders the row by manifest position, not by which source produced each dot", () => {
    // The pre-walk implementation concatenated record order, then the current
    // dot, then the look-ahead. With a stage contributing many dots that
    // interleaves wrongly — a later stage's recorded answers would sit ahead of
    // an earlier stage's character stops.
    const record = recordOf([
      // Recorded LAST but belongs to a LATER stage than the walk below.
      answerEntry("e1", "help", "some_optional_question"),
      answerEntry("e2", "identity", "il_language_english"),
    ]);
    const dots = buildProgressDots({
      record,
      ctx: ctxWith({
        traversal: traversal({
          activeStepId: "mechanisms",
          history: ["identity", "choose_base", "track", "characters", "marks", "convenience", "carve"],
          selectedTrack: "adapt",
        }),
        stepPositions: { mechanisms: ["u00e1"] },
      }),
      lookupQuestionLabel: stubLabel,
      stepWalks: { mechanisms: [{ id: "u00e1", label: "á", done: false }] },
      stepCursors: { mechanisms: "u00e1" },
    });
    const order = dots.map((d) => d.id);
    expect(order.indexOf("il_language_english")).toBeLessThan(order.indexOf("u00e1"));
    expect(order.indexOf("u00e1")).toBeLessThan(order.indexOf("some_optional_question"));
  });

  it("keeps a record dot whose step is not in this build, so its reason still surfaces", () => {
    // FR-013: a renamed step in a restored draft must be explainable on
    // activation, not silently dropped from the row.
    const record = recordOf([answerEntry("e1", "retired_step", "il_language_english")]);
    const dots = buildProgressDots({
      record,
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
    });
    const orphan = dots.find((d) => d.location.step === "retired_step");
    expect(orphan).toBeDefined();
    expect(orphan?.resolution).toMatchObject({ reason: "step-not-in-build" });
  });
});

// ---------------------------------------------------------------------------
// il_language_code — the confirmation question now earns its own dot
// (author's call, 2026-08-05)
// ---------------------------------------------------------------------------

describe("il_language_code — the confirmation question, now earns a dot", () => {
  it("earns a dot from the decision record", () => {
    const record = recordOf([
      answerEntry("e1", "identity", "il_language_english"),
      answerEntry("e2", "identity", "il_language_code"),
    ]);
    const dots = buildProgressDots({
      record,
      ctx: ctxWith(),
      lookupQuestionLabel: stubLabel,
    });
    expect(completedIds(dots)).toEqual(["il_language_english", "il_language_code"]);
  });

  it("earns a dot from a published walk too — both sources", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith({
        traversal: traversal({ activeStepId: "identity", history: [] }),
      }),
      lookupQuestionLabel: stubLabel,
      stepWalks: {
        identity: [
          { id: "il_language_english", done: true },
          { id: "il_language_code", done: true },
        ],
      },
      stepCursors: { identity: "il_language_english" },
    });
    expect(dots.some((d) => d.id === "il_language_code")).toBe(true);
    expect(dots.some((d) => d.id === "il_language_english")).toBe(true);
  });

  it("shows il_language_code as current while the author is on it", () => {
    const dots = buildProgressDots({
      record: recordOf([]),
      ctx: ctxWith({
        traversal: traversal({ activeStepId: "identity", history: [] }),
      }),
      lookupQuestionLabel: stubLabel,
      stepWalks: {
        identity: [
          { id: "il_language_english", done: true },
          { id: "il_language_code", done: false },
        ],
      },
      stepCursors: { identity: "il_language_code" },
    });
    expect(currentDot(dots)?.id).toBe("il_language_code");
  });
});

// ---------------------------------------------------------------------------
// FR-063 / US6 scenario 3 — jumping back does not truncate progress
// ---------------------------------------------------------------------------

describe("jumping back (T065, FR-063)", () => {
  it("the marker moves, and the dots ahead of the landing point are still present", () => {
    const record = recordOf([
      answerEntry("e1", "identity", "il_language_english"),
      answerEntry("e2", "characters", "il_language_autonym"),
    ]);

    // Before the jump: the author is on "touch"; everything between
    // "characters" and "touch" is in history (already walked).
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
    expect(before.find((d) => d.kind === "current")?.id).toBe("touch");
    expect(upcomingIds(before)).not.toContain("marks");
    expect(upcomingIds(before)).not.toContain("carve");

    // jumpToStep truncates `history` back to before the landing point
    // (surveySessionStore.ts's own jumpToStep docstring) — simulated here by
    // constructing the POST-jump traversal directly, the same shape
    // jumpToLocation.ts would leave behind.
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

    // The marker moved back to "characters".
    expect(after.find((d) => d.kind === "current")?.id).toBe("characters");
    // The stages that used to be "reached" (behind the OLD position) are
    // ahead again — dots ahead of the landing point are still present.
    expect(upcomingIds(after)).toEqual(
      expect.arrayContaining(["marks", "convenience", "carve", "mechanisms"]),
    );
    // The completed QUESTION dots (from the record, never from history) are
    // untouched by the jump — this is what FR-063 actually protects.
    expect(completedIds(after)).toEqual(completedIds(before));
    expect(completedIds(after)).toEqual(["il_language_english", "il_language_autonym"]);
  });
});
