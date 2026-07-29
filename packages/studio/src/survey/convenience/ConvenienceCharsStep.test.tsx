import { describe, expect, it } from "vitest";
import { computeConvenienceGate } from "./ConvenienceCharsStep.tsx";

/** A base keyboard producing the whole of basic Latin, both cases. */
function fullLatinBase(): Set<string> {
  const s = new Set<string>();
  for (const c of "abcdefghijklmnopqrstuvwxyz") {
    s.add(c);
    s.add(c.toUpperCase());
  }
  return s;
}

const INSTANTIATED = { instantiated: true, hasSignal: true } as const;

describe("computeConvenienceGate", () => {
  it("asks when the base produces basic-Latin letters the orthography does not use", () => {
    const gate = computeConvenienceGate({
      ...INSTANTIATED,
      produced: fullLatinBase(),
      needed: new Set(["a", "b", "c"]),
    });
    expect(gate.skip).toBe(false);
    expect(gate.candidates.length).toBe(23);
  });

  it("skips when the orthography uses every basic-Latin letter", () => {
    const gate = computeConvenienceGate({
      ...INSTANTIATED,
      produced: fullLatinBase(),
      needed: new Set("abcdefghijklmnopqrstuvwxyz".split("")),
    });
    expect(gate).toEqual({ skip: true, candidates: [] });
  });

  it("skips for a base that produces no basic Latin at all", () => {
    const gate = computeConvenienceGate({
      ...INSTANTIATED,
      produced: new Set(["а", "б", "в"]),
      needed: new Set(["а"]),
    });
    expect(gate).toEqual({ skip: true, candidates: [] });
  });

  // The two "cannot ask" cases below MUST resolve to skip, never to a
  // render-nothing-and-wait state: a spine step that renders null without
  // completing is a dead end the author cannot navigate out of.

  it("skips — rather than offering all 26 — when no orthography is confirmed yet", () => {
    const gate = computeConvenienceGate({
      instantiated: true,
      hasSignal: false,
      produced: fullLatinBase(),
      needed: new Set(),
    });
    expect(gate).toEqual({ skip: true, candidates: [] });
  });

  it("skips when no working copy has been instantiated", () => {
    const gate = computeConvenienceGate({
      instantiated: false,
      hasSignal: true,
      produced: fullLatinBase(),
      needed: new Set(["a"]),
    });
    expect(gate).toEqual({ skip: true, candidates: [] });
  });

  it("offers each surplus letter once, as a case pair carrying both characters", () => {
    const gate = computeConvenienceGate({
      ...INSTANTIATED,
      produced: new Set(["q", "Q", "a", "A"]),
      needed: new Set(["a"]),
    });
    expect(gate.candidates).toEqual([{ primary: "q", chars: ["q", "Q"] }]);
  });
});
