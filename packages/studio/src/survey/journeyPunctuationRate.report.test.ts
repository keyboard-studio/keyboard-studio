// journeyPunctuationRate — SC-008 (spec 075): the empty-punctuation-inventory
// rate across the journey corpus, REPORT ONLY. Prints the measured rate and
// never asserts a threshold; the spec sets the threshold after this first run
// and records the baseline on its SC-008 line.
//
// What is measured: after replaying each content/journeys/*.yaml fixture
// through journey-runner.ts, whether the session's confirmed inventory holds
// zero punctuation characters. The runner completes the punctuation step as a
// no-op advance (see journey-runner.ts's module header), so today this
// baseline reflects the HARNESS — a journey can only reach a non-empty
// punctuation inventory through a Phase B answer that carries punctuation —
// not the seeding the real step performs. Raising harness fidelity is the
// lever that moves this number; the report is here so that lever is measured.

import { describe, expect, it, afterEach } from "vitest";
import { glyphCategory } from "@keyboard-studio/engine";
import { parseJourneyFixture } from "./journeyFixture.ts";
import { replayJourney } from "./journey-runner.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { usePhaseBDraftStore, resetPhaseBDraftDecisions } from "../stores/phaseBDraftStore.ts";

import bafutRaw from "../../../../content/journeys/bafut-end-to-end.yaml?raw";
import bjCreeWoodsRaw from "../../../../content/journeys/bj-cree-woods-track2.yaml?raw";
import minimalDefaultsRaw from "../../../../content/journeys/minimal-defaults.yaml?raw";
import backtrackRaw from "../../../../content/journeys/backtrack-journey.yaml?raw";

const RAW_FIXTURES = [bafutRaw, bjCreeWoodsRaw, minimalDefaultsRaw, backtrackRaw];

afterEach(() => {
  useWorkingCopyStore.getState().reset();
  usePhaseBDraftStore.getState().reset();
  resetPhaseBDraftDecisions();
});

describe("SC-008 — empty-punctuation-inventory rate across the journey corpus (report only)", () => {
  it("replays every journey and prints the rate without asserting a threshold", async () => {
    const perJourney: { id: string; punctuationCount: number; ok: boolean }[] = [];
    for (const raw of RAW_FIXTURES) {
      const fixture = parseJourneyFixture(raw);
      const result = await replayJourney(fixture);
      const inventory = useWorkingCopyStore.getState().session.confirmedInventory;
      const punctuationCount = inventory.filter((c) => glyphCategory(c) === "punctuation").length;
      perJourney.push({ id: fixture.journey_id, punctuationCount, ok: result.assertionsPassed });
      useWorkingCopyStore.getState().reset();
    }

    const empty = perJourney.filter((j) => j.punctuationCount === 0).length;
    const total = perJourney.length;
    for (const j of perJourney) {
      console.log(`[INFO] ${j.id}: ${j.punctuationCount} punctuation character(s) confirmed${j.ok ? "" : " (replay assertions failed)"}`);
    }
    console.log(`[OK] empty-punctuation-inventory rate: ${empty}/${total}`);

    // Report-only: the only assertion is that the corpus was actually measured.
    expect(total).toBeGreaterThan(0);
    expect(perJourney.every((j) => j.ok)).toBe(true);
  });
});
