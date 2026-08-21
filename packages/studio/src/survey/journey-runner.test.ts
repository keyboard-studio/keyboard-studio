// journey-runner.test.ts — spec 032 FR-011/SC-001/SC-004.
//
// Imports all four journey fixtures, runs replayJourney() on each, and
// asserts their expected_outcomes. Runs via `pnpm --filter @keyboard-studio/studio
// test` (and therefore `pnpm test`), per FR-011.

import { describe, it, expect, afterEach } from "vitest";
import { parseJourneyFixture } from "./journeyFixture.ts";
import { replayJourney } from "./journey-runner.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

import bafutRaw from "../../../../content/journeys/bafut-end-to-end.yaml?raw";
import bjCreeWoodsRaw from "../../../../content/journeys/bj-cree-woods-track2.yaml?raw";
import minimalDefaultsRaw from "../../../../content/journeys/minimal-defaults.yaml?raw";
import backtrackRaw from "../../../../content/journeys/backtrack-journey.yaml?raw";

afterEach(() => {
  useWorkingCopyStore.getState().reset();
});

describe("journeyFixture parsing", () => {
  it("parses all four fixtures without throwing, with unique journey_ids", () => {
    const fixtures = [bafutRaw, bjCreeWoodsRaw, minimalDefaultsRaw, backtrackRaw].map(
      parseJourneyFixture,
    );
    const ids = fixtures.map((f) => f.journey_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects a malformed fixture loudly", () => {
    expect(() => parseJourneyFixture("journey_id: only-a-string\n")).toThrow(/journeyFixture/);
    expect(() => parseJourneyFixture("not: yaml: [obj\n")).toThrow();
  });
});

describe("replayJourney — bafut-end-to-end (US1, T012)", () => {
  it("replays the full copy-track spine and matches expected_outcomes", async () => {
    const fixture = parseJourneyFixture(bafutRaw);
    const result = await replayJourney(fixture);

    expect(result.errors).toBeUndefined();
    expect(result.assertionsPassed).toBe(true);
    expect(result.exercisedStepIds).toContain("identity");
    expect(result.exercisedStepIds).toContain("choose_base");
    expect(result.exercisedStepIds).toContain("track");
    expect(result.exercisedStepIds).toContain("project_name");
    expect(result.exercisedStepIds).toContain("characters");
    expect(result.exercisedStepIds).toContain("carve");
    expect(result.exercisedStepIds).toContain("mechanisms");
    expect(result.exercisedStepIds).toContain("touch");
    expect(result.exercisedStepIds).toContain("help");
    expect(result.exercisedStepIds.at(-1)).toBe("help");
    expect(result.exercisedEdges.at(-1)).toBe("help->done");
  });
});

describe("replayJourney — bj-cree-woods-track2 (US1, T012)", () => {
  it("replays the Track 2 adapt spine through the syllabic Phase B branch", async () => {
    const fixture = parseJourneyFixture(bjCreeWoodsRaw);
    const result = await replayJourney(fixture);

    expect(result.errors).toBeUndefined();
    expect(result.assertionsPassed).toBe(true);
    // Adapt track skips project_name (spine:false CYOA fork).
    expect(result.exercisedStepIds).not.toContain("project_name");
    expect(result.exercisedStepIds).toContain("carve");
    expect(result.exercisedEdges.at(-1)).toBe("help->done");
  });
});

describe("replayJourney — minimal-defaults (US1, T012)", () => {
  it("reaches done with only the required questions answered", async () => {
    const fixture = parseJourneyFixture(minimalDefaultsRaw);
    const result = await replayJourney(fixture);

    expect(result.errors).toBeUndefined();
    expect(result.assertionsPassed).toBe(true);
    expect(result.exercisedStepIds).not.toContain("project_name");
    expect(result.exercisedEdges.at(-1)).toBe("help->done");
  });
});

describe("replayJourney — backtrack-journey (US1/T007, SC-003)", () => {
  it("re-routes 'characters' from qwerty to azerty and clears staleness", async () => {
    const fixture = parseJourneyFixture(backtrackRaw);
    const result = await replayJourney(fixture);

    expect(result.errors).toBeUndefined();
    expect(result.assertionsPassed).toBe(true);
    // The forward walk visits "characters" once; the backtrack re-derives it
    // in place rather than re-walking the whole spine a second time (see
    // content/journeys/backtrack-journey.yaml's header note).
    expect(result.exercisedStepIds.filter((id) => id === "characters")).toHaveLength(1);
  });

  it("halts with a routing error when the backtrack targets an unsupported revisit", async () => {
    const fixture = parseJourneyFixture(backtrackRaw);
    fixture.journey_id = "backtrack-journey-unsupported-revisit-probe";
    fixture.backtrack_events = [
      { revisit_step: "characters", new_answer: { questionId: "pb_char_count", value: "large" } },
    ];
    const result = await replayJourney(fixture);

    expect(result.assertionsPassed).toBe(false);
    expect(result.errors?.[0]).toMatch(/not supported by this harness/);
  });
});

describe("SC-004 — no regression in existing SurveyRunner routing primitives", () => {
  it("re-exports evalCondition/resolveNext/advanceThrough unchanged from SurveyRunner.tsx", async () => {
    const runnerModule = await import("./journey-runner.ts");
    const surveyRunnerModule = await import("./SurveyRunner.tsx");
    expect(runnerModule.evalCondition).toBe(surveyRunnerModule.evalCondition);
    expect(runnerModule.resolveNext).toBe(surveyRunnerModule.resolveNext);
    expect(runnerModule.advanceThrough).toBe(surveyRunnerModule.advanceThrough);
  });
});
