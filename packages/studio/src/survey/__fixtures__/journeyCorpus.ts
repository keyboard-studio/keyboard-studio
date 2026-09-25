// The journey corpus (spec 032): every content/journeys/*.yaml fixture, imported
// once for the suites that replay or measure it (journey-runner.test.ts,
// dashboard/journeyCoverage.report.test.ts). Add a new journey here and both
// pick it up.

import { parseJourneyFixture, type JourneyFixture } from "../journeyFixture.ts";

import bafutRaw from "../../../../../content/journeys/bafut-end-to-end.yaml?raw";
import bjCreeWoodsRaw from "../../../../../content/journeys/bj-cree-woods-track2.yaml?raw";
import minimalDefaultsRaw from "../../../../../content/journeys/minimal-defaults.yaml?raw";
import backtrackRaw from "../../../../../content/journeys/backtrack-journey.yaml?raw";

/** Raw YAML for each journey, keyed by file stem. */
export const JOURNEY_CORPUS_RAW = {
  "bafut-end-to-end": bafutRaw,
  "bj-cree-woods-track2": bjCreeWoodsRaw,
  "minimal-defaults": minimalDefaultsRaw,
  "backtrack-journey": backtrackRaw,
} as const satisfies Record<string, string>;

export type JourneyCorpusName = keyof typeof JOURNEY_CORPUS_RAW;

/**
 * Parse one journey. Returns a fresh object on every call, so a test may
 * mutate its copy (e.g. to probe an unsupported backtrack) without leaking
 * into another test.
 */
export function loadJourney(name: JourneyCorpusName): JourneyFixture {
  return parseJourneyFixture(JOURNEY_CORPUS_RAW[name]);
}

/** Parse the whole corpus, in declaration order. */
export function loadJourneyCorpus(): JourneyFixture[] {
  return (Object.keys(JOURNEY_CORPUS_RAW) as JourneyCorpusName[]).map(loadJourney);
}
