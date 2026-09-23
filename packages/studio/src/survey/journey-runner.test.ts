// journey-runner.test.ts — spec 032 FR-011/SC-001/SC-004.
//
// Replays every journey in the shared corpus (__fixtures__/journeyCorpus.ts)
// once via describe.each and asserts its expected_outcomes. Runs via
// `pnpm --filter @keyboard-studio/studio test` (and therefore `pnpm test`), per FR-011.

import { describe, it, expect } from "vitest";
import { parseJourneyFixture } from "./journeyFixture.ts";
import { replayJourney } from "./journey-runner.ts";
import {
  JOURNEY_CORPUS_RAW,
  loadJourney,
  loadJourneyCorpus,
  type JourneyCorpusName,
} from "./__fixtures__/journeyCorpus.ts";

describe("journeyFixture parsing", () => {
  it("parses every corpus fixture without throwing, with unique journey_ids", () => {
    const ids = loadJourneyCorpus().map((f) => f.journey_id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects a malformed fixture loudly", () => {
    expect(() => parseJourneyFixture("journey_id: only-a-string\n")).toThrow(/journeyFixture/);
    expect(() => parseJourneyFixture("not: yaml: [obj\n")).toThrow();
  });
});

interface JourneyCase {
  name: JourneyCorpusName;
  summary: string;
  /** Steps the replay must visit. */
  visits?: readonly string[];
  /** Steps the replay must not visit. */
  skips?: readonly string[];
  /** Steps the replay visits exactly once. */
  visitsOnce?: readonly string[];
  /** The step the replay ends on. */
  lastStep?: string;
  /** The replay's last edge is help->done. */
  endsAtDone: boolean;
}

const JOURNEYS: readonly JourneyCase[] = [
  {
    name: "bafut-end-to-end",
    summary: "replays the full copy-track spine (US1, T012)",
    visits: [
      "identity",
      "choose_base",
      "track",
      "project_name",
      "characters",
      "carve",
      "mechanisms",
      "touch",
      "help",
    ],
    lastStep: "help",
    endsAtDone: true,
  },
  {
    name: "bj-cree-woods-track2",
    summary: "replays the Track 2 adapt spine through the syllabic Phase B branch (US1, T012)",
    // Adapt track skips project_name (spine:false CYOA fork).
    visits: ["carve"],
    skips: ["project_name"],
    endsAtDone: true,
  },
  {
    name: "minimal-defaults",
    summary: "reaches done with only the required questions answered (US1, T012)",
    skips: ["project_name"],
    endsAtDone: true,
  },
  {
    name: "backtrack-journey",
    summary: "re-routes 'characters' from qwerty to azerty and clears staleness (US1/T007, SC-003)",
    // The forward walk visits "characters" once; the backtrack re-derives it in
    // place rather than re-walking the whole spine (see the fixture's header note).
    visitsOnce: ["characters"],
    endsAtDone: false,
  },
];

it("every corpus journey has a replay case", () => {
  expect(JOURNEYS.map((j) => j.name).sort()).toEqual(Object.keys(JOURNEY_CORPUS_RAW).sort());
});

describe.each(JOURNEYS)("replayJourney — $name", (j) => {
  it(`${j.summary} and matches expected_outcomes`, async () => {
    const result = await replayJourney(loadJourney(j.name));

    expect(result.errors).toBeUndefined();
    expect(result.assertionsPassed).toBe(true);
    for (const id of j.visits ?? []) expect(result.exercisedStepIds).toContain(id);
    for (const id of j.skips ?? []) expect(result.exercisedStepIds).not.toContain(id);
    for (const id of j.visitsOnce ?? []) {
      expect(result.exercisedStepIds.filter((s) => s === id)).toHaveLength(1);
    }
    if (j.lastStep !== undefined) expect(result.exercisedStepIds.at(-1)).toBe(j.lastStep);
    if (j.endsAtDone) expect(result.exercisedEdges.at(-1)).toBe("help->done");
  });
});

describe("replayJourney — backtrack-journey unsupported revisit", () => {
  it("halts with a routing error when the backtrack targets an unsupported revisit", async () => {
    const fixture = loadJourney("backtrack-journey");
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
