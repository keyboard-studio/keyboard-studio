import { describe, expect, it } from "vitest";
import { candidateChars, surplusBasicLatinCandidates } from "./convenienceChars.js";

/** A base keyboard that produces the whole of basic Latin, both cases. */
function fullLatinBase(): Set<string> {
  const s = new Set<string>();
  for (const c of "abcdefghijklmnopqrstuvwxyz") {
    s.add(c);
    s.add(c.toUpperCase());
  }
  return s;
}

describe("surplusBasicLatinCandidates", () => {
  it("offers the letters the base produces that the orthography does not use", () => {
    // An orthography using only a..e leaves f..z surplus on a full-Latin base.
    const candidates = surplusBasicLatinCandidates({
      produced: fullLatinBase(),
      needed: new Set(["a", "b", "c", "d", "e"]),
    });
    expect(candidates.map((c) => c.primary).join("")).toBe("fghijklmnopqrstuvwxyz");
  });

  it("returns candidates in a..z order regardless of set iteration order", () => {
    const candidates = surplusBasicLatinCandidates({
      produced: new Set(["z", "m", "a", "Q"]),
      needed: new Set(["b"]),
    });
    expect(candidates.map((c) => c.primary)).toEqual(["a", "m", "q", "z"]);
  });

  it("folds a case pair into one choice carrying both characters", () => {
    const [candidate] = surplusBasicLatinCandidates({
      produced: new Set(["q", "Q"]),
      needed: new Set(["a"]),
    });
    expect(candidate).toEqual({ primary: "q", chars: ["q", "Q"] });
  });

  it("carries only the case that the base actually produces", () => {
    const upperOnly = surplusBasicLatinCandidates({
      produced: new Set(["Q"]),
      needed: new Set(["a"]),
    });
    expect(upperOnly).toEqual([{ primary: "q", chars: ["Q"] }]);

    const lowerOnly = surplusBasicLatinCandidates({
      produced: new Set(["q"]),
      needed: new Set(["a"]),
    });
    expect(lowerOnly).toEqual([{ primary: "q", chars: ["q"] }]);
  });

  it("skips a letter the base cannot produce — there is nothing to keep", () => {
    const candidates = surplusBasicLatinCandidates({
      produced: new Set(["q"]),
      needed: new Set(["a"]),
    });
    expect(candidates.map((c) => c.primary)).toEqual(["q"]);
  });

  it("suppresses a pair when EITHER case is needed", () => {
    // Lowercase needed.
    expect(surplusBasicLatinCandidates({
      produced: fullLatinBase(),
      needed: new Set(["q"]),
    }).map((c) => c.primary)).not.toContain("q");

    // Uppercase needed — the lowercase must not be offered for removal either,
    // or keeping "Q" while dropping "q" becomes reachable.
    expect(surplusBasicLatinCandidates({
      produced: fullLatinBase(),
      needed: new Set(["Q"]),
    }).map((c) => c.primary)).not.toContain("q");
  });

  it("offers nothing when the orthography uses all of a..z", () => {
    const needed = new Set("abcdefghijklmnopqrstuvwxyz".split(""));
    expect(surplusBasicLatinCandidates({ produced: fullLatinBase(), needed })).toEqual([]);
  });

  it("offers nothing for a base that produces no basic Latin at all", () => {
    // A Cyrillic base: its own surplus letters stay a pure carve decision.
    const produced = new Set(["а", "б", "в", "г", "д"]);
    expect(surplusBasicLatinCandidates({ produced, needed: new Set(["а"]) })).toEqual([]);
  });

  it("never offers digits, punctuation, or non-Latin characters", () => {
    const produced = new Set(["q", "5", ".", "@", "/", "é", "ɨ", "ß"]);
    const candidates = surplusBasicLatinCandidates({ produced, needed: new Set(["a"]) });
    expect(candidates.map((c) => c.primary)).toEqual(["q"]);
  });

  it("is unaffected by the locale's casing quirks — a Turkish alphabet suppresses i by needing it", () => {
    // tr uppercases "i" to "İ" (U+0130), outside basic Latin. Turkish needs
    // both "i" and "ı" outright, so the pair is suppressed by the needed-set
    // check before casing could matter.
    const candidates = surplusBasicLatinCandidates({
      produced: fullLatinBase(),
      needed: new Set(["i", "ı", "İ", "I"]),
    });
    expect(candidates.map((c) => c.primary)).not.toContain("i");
  });
});

describe("candidateChars", () => {
  it("flattens candidates to the flat retained list, lowercase before uppercase", () => {
    const candidates = surplusBasicLatinCandidates({
      produced: new Set(["q", "Q", "x", "X"]),
      needed: new Set(["a"]),
    });
    expect(candidateChars(candidates)).toEqual(["q", "Q", "x", "X"]);
  });

  it("is empty for an empty candidate list", () => {
    expect(candidateChars([])).toEqual([]);
  });
});
