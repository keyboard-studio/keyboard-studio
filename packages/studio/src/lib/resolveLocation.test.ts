// resolveLocation.test — the resolution matrix (spec 057 T016).
//
// One case per `UnreachableReason`, each `degraded` case asserting that its
// `to` itself resolves `reachable` against the same ctx (FR-014), plus
// referential transparency.

import { describe, it, expect } from "vitest";
import { manifest } from "../steps/manifest.ts";
import type { TraversalSnapshot } from "../stores/surveySessionStore.ts";
import type { Location } from "./location.ts";
import { resolveLocation, type ResolveContext } from "./resolveLocation.ts";

/**
 * A traversal snapshot carrying only what the resolver reads. The real type
 * has many more slots; the cast keeps the fixtures to the three fields that
 * are load-bearing here rather than restating a shape the store owns.
 */
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

const REGISTRY = { il_language_english: {}, pb_rtl_direction_confirm: {} };

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

/** Every `degraded` result must name a `to` that is itself reachable. */
function expectDegradeLandsSomewhereValid(
  result: ReturnType<typeof resolveLocation>,
  ctx: ResolveContext,
): void {
  expect(result.kind).toBe("degraded");
  if (result.kind !== "degraded") return;
  expect(resolveLocation(result.to, ctx).kind).toBe("reachable");
}

describe("reachable", () => {
  it("a bare route is always reachable — tabs are not gated by the walk", () => {
    const ctx = ctxWith();
    for (const route of ["welcome", "survey", "preview", "output", "trail", "profile"] as const) {
      expect(resolveLocation({ route }, ctx)).toEqual({
        kind: "reachable",
        location: { route },
      });
    }
  });

  it("a step the author is standing on is reachable", () => {
    const ctx = ctxWith();
    expect(resolveLocation({ route: "survey", step: "characters" }, ctx).kind).toBe("reachable");
  });

  it("a step the author already walked is reachable", () => {
    const ctx = ctxWith();
    expect(resolveLocation({ route: "survey", step: "choose_base" }, ctx).kind).toBe("reachable");
  });

  it("a question in this build, on a reached step, is reachable", () => {
    const ctx = ctxWith();
    expect(
      resolveLocation(
        { route: "survey", step: "identity", question: "il_language_english" },
        ctx,
      ).kind,
    ).toBe("reachable");
  });
});

describe("one case per UnreachableReason", () => {
  it("step-not-in-build — a renamed step in a restored draft", () => {
    const ctx = ctxWith();
    const loc: Location = { route: "survey", step: "phase_b" as never };
    const result = resolveLocation(loc, ctx);
    expect(result).toMatchObject({ kind: "degraded", reason: "step-not-in-build" });
    expectDegradeLandsSomewhereValid(result, ctx);
  });

  it("question-not-in-build — a retired question on a reached step", () => {
    const ctx = ctxWith();
    const loc: Location = { route: "survey", step: "identity", question: "il_retired" };
    const result = resolveLocation(loc, ctx);
    expect(result).toMatchObject({ kind: "degraded", reason: "question-not-in-build" });
    expectDegradeLandsSomewhereValid(result, ctx);
    // FR-014's "nearest valid ancestor" is the STEP here, not the bare route:
    // dropping `question` already yields something reachable.
    if (result.kind === "degraded") {
      expect(result.to).toEqual({ route: "survey", step: "identity" });
    }
  });

  it("skipped-by-track — project_name is not walked on the adapt track", () => {
    const ctx = ctxWith();
    const loc: Location = { route: "survey", step: "project_name" };
    const result = resolveLocation(loc, ctx);
    expect(result).toMatchObject({ kind: "degraded", reason: "skipped-by-track" });
    expectDegradeLandsSomewhereValid(result, ctx);
  });

  it("beyond-gate — a step ahead of the author's reached position", () => {
    const ctx = ctxWith();
    const loc: Location = { route: "survey", step: "touch" };
    const result = resolveLocation(loc, ctx);
    expect(result).toMatchObject({ kind: "degraded", reason: "beyond-gate" });
    expectDegradeLandsSomewhereValid(result, ctx);
  });

  it("no-project — a wizard location with no working copy instantiated", () => {
    const ctx = ctxWith({ hasProject: false });
    const loc: Location = { route: "survey", step: "characters" };
    const result = resolveLocation(loc, ctx);
    expect(result).toMatchObject({ kind: "degraded", reason: "no-project" });
    expectDegradeLandsSomewhereValid(result, ctx);
  });
});

describe("reason precedence", () => {
  it("a step on the copy-track fork IS reachable once that track is chosen", () => {
    const ctx = ctxWith({
      traversal: traversal({
        activeStepId: "project_name",
        history: ["identity", "choose_base", "track"],
        selectedTrack: "copy",
      }),
    });
    expect(resolveLocation({ route: "survey", step: "project_name" }, ctx).kind).toBe("reachable");
  });

  it("a step carried on a non-wizard route is a no-project refusal, not a step lookup", () => {
    const ctx = ctxWith();
    const result = resolveLocation({ route: "trail", step: "characters" }, ctx);
    expect(result).toMatchObject({ kind: "degraded", reason: "no-project" });
    if (result.kind === "degraded") {
      expect(result.to).toEqual({ route: "trail" });
    }
  });

  it("an unreached step outranks its unknown question — the step is the first failure", () => {
    const ctx = ctxWith();
    const result = resolveLocation(
      { route: "survey", step: "touch", question: "does_not_exist" },
      ctx,
    );
    expect(result).toMatchObject({ kind: "degraded", reason: "beyond-gate" });
  });
});

describe("purity", () => {
  it("is referentially transparent — the same (loc, ctx) always yields the same result", () => {
    const ctx = ctxWith();
    const loc: Location = { route: "survey", step: "touch" };
    expect(resolveLocation(loc, ctx)).toEqual(resolveLocation(loc, ctx));
  });

  it("mutates neither its arguments nor any shared state", () => {
    const ctx = ctxWith();
    const loc: Location = { route: "survey", step: "characters" };
    const ctxBefore = JSON.stringify({
      traversal: ctx.traversal,
      hasProject: ctx.hasProject,
    });
    resolveLocation(loc, ctx);
    expect(loc).toEqual({ route: "survey", step: "characters" });
    expect(JSON.stringify({ traversal: ctx.traversal, hasProject: ctx.hasProject })).toBe(
      ctxBefore,
    );
  });
});
