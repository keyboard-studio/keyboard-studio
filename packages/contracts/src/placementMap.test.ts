// see spec.md §7.6 — PlacementMap contract type (D-INT-1, 2026-06-15).
// Strict tsconfig applies (exactOptionalPropertyTypes + noUncheckedIndexedAccess).

import { describe, it, expect } from "vitest";
import type {
  PlacementMap,
  PlacementEntry,
  PlacementCandidate,
} from "./placementMap";
import { makePlacementMap, topCandidate, collisions } from "./placementMap";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const candidateCorpus: PlacementCandidate = {
  vkey: "K_E",
  modifiers: ["RALT"],
  mechanism: "direct",
  priorSource: "corpus",
  priorCount: 5,
  confidence: 0.92,
};

const candidatePhonetic: PlacementCandidate = {
  vkey: "K_E",
  modifiers: ["SHIFT"],
  mechanism: "deadkey",
  priorSource: "phonetic",
  priorCount: 0,
  confidence: 0.45,
};

const entryEAcute: PlacementEntry = {
  codepoint: "U+00E9",
  candidates: [candidateCorpus, candidatePhonetic],
};

const entryEGrave: PlacementEntry = {
  codepoint: "U+00E8",
  candidates: [
    { ...candidateCorpus, vkey: "K_A", modifiers: [], confidence: 0.8 },
  ],
};

const minimalMap: PlacementMap = {
  entries: [entryEAcute],
};

// ---------------------------------------------------------------------------
// makePlacementMap() — factory + stripUndefined
// ---------------------------------------------------------------------------

describe("makePlacementMap()", () => {
  it("round-trips a minimal map without optional fields", () => {
    const result = makePlacementMap({ entries: [] });
    expect(result.entries).toEqual([]);
    expect("bcp47Context" in result).toBe(false);
    expect("baseLayoutFamily" in result).toBe(false);
    expect("pinnedPriorsVersion" in result).toBe(false);
  });

  it("includes optional fields when provided", () => {
    const result = makePlacementMap({
      entries: [],
      bcp47Context: "fr-Latn-CI",
      baseLayoutFamily: "QWERTY",
      pinnedPriorsVersion: "1.0.0",
    });
    expect(result.bcp47Context).toBe("fr-Latn-CI");
    expect(result.baseLayoutFamily).toBe("QWERTY");
    expect(result.pinnedPriorsVersion).toBe("1.0.0");
  });

  it("strips undefined optional fields (exactOptionalPropertyTypes safety)", () => {
    const init: PlacementMap = {
      entries: [],
      bcp47Context: undefined as unknown as string,
    };
    const result = makePlacementMap(init);
    expect("bcp47Context" in result).toBe(false);
  });

  it("preserves entries array content unchanged", () => {
    const result = makePlacementMap({ entries: [entryEAcute] });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toEqual(entryEAcute);
  });
});

// ---------------------------------------------------------------------------
// PlacementMechanism and PriorSource union members
// ---------------------------------------------------------------------------

describe("PlacementMechanism union", () => {
  const mechanisms: PlacementCandidate["mechanism"][] = [
    "direct",
    "deadkey",
    "store-index",
    "opaque",
  ];

  it("accepts all four mechanism values", () => {
    for (const mechanism of mechanisms) {
      const c: PlacementCandidate = {
        ...candidateCorpus,
        mechanism,
      };
      expect(c.mechanism).toBe(mechanism);
    }
  });
});

describe("PriorSource union", () => {
  const sources: PlacementCandidate["priorSource"][] = [
    "corpus",
    "unicode-decomp",
    "confusable",
    "phonetic",
    "manual",
  ];

  it("accepts all five prior-source values", () => {
    for (const priorSource of sources) {
      const c: PlacementCandidate = { ...candidateCorpus, priorSource };
      expect(c.priorSource).toBe(priorSource);
    }
  });
});

// ---------------------------------------------------------------------------
// Candidate ordering invariant
// ---------------------------------------------------------------------------

describe("PlacementEntry — ranked ordering invariant", () => {
  it("candidates[0] is highest-confidence (best-first ordering)", () => {
    // The fixture already satisfies this: candidateCorpus(0.92) before candidatePhonetic(0.45)
    const top = entryEAcute.candidates[0];
    const second = entryEAcute.candidates[1];
    if (top === undefined || second === undefined) {
      throw new Error("fixture must have two candidates");
    }
    expect(top.confidence).toBeGreaterThan(second.confidence);
  });

  it("priorCount is 0 for non-corpus sources", () => {
    expect(candidatePhonetic.priorSource).not.toBe("corpus");
    expect(candidatePhonetic.priorCount).toBe(0);
  });

  it("corpus candidate has priorCount ≥ 1", () => {
    expect(candidateCorpus.priorSource).toBe("corpus");
    expect(candidateCorpus.priorCount).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// topCandidate()
// ---------------------------------------------------------------------------

describe("topCandidate()", () => {
  it("returns the first candidate for a non-empty entry", () => {
    const top = topCandidate(entryEAcute);
    expect(top).toEqual(candidateCorpus);
  });

  it("returns undefined for an entry with no candidates", () => {
    const empty: PlacementEntry = { codepoint: "U+0041", candidates: [] };
    expect(topCandidate(empty)).toBeUndefined();
  });

  it("returns the sole candidate for a single-candidate entry", () => {
    const top = topCandidate(entryEGrave);
    expect(top?.vkey).toBe("K_A");
  });
});

// ---------------------------------------------------------------------------
// collisions()
// ---------------------------------------------------------------------------

describe("collisions()", () => {
  it("returns [] when no two top candidates share the same key slot", () => {
    const map: PlacementMap = { entries: [entryEAcute, entryEGrave] };
    // entryEAcute top: K_E+RALT, entryEGrave top: K_A+[] — no collision
    expect(collisions(map)).toEqual([]);
  });

  it("detects a collision when two entries propose the same vkey+modifiers", () => {
    const candidateA: PlacementCandidate = {
      vkey: "K_E",
      modifiers: ["RALT"],
      mechanism: "direct",
      priorSource: "corpus",
      priorCount: 3,
      confidence: 0.78,
    };
    const candidateB: PlacementCandidate = {
      ...candidateA,
      confidence: 0.74,
    };
    const entryA: PlacementEntry = { codepoint: "U+00E8", candidates: [candidateA] };
    const entryB: PlacementEntry = { codepoint: "U+00EA", candidates: [candidateB] };
    const map: PlacementMap = { entries: [entryA, entryB] };

    const groups = collisions(map);
    expect(groups).toHaveLength(1);
    const group = groups[0];
    if (group === undefined) throw new Error("expected one collision group");
    expect(group).toHaveLength(2);
    expect(group.map((e) => e.codepoint)).toContain("U+00E8");
    expect(group.map((e) => e.codepoint)).toContain("U+00EA");
  });

  it("treats modifier order as irrelevant (sorted before comparison)", () => {
    const c1: PlacementCandidate = {
      vkey: "K_E",
      modifiers: ["SHIFT", "RALT"],
      mechanism: "direct",
      priorSource: "corpus",
      priorCount: 2,
      confidence: 0.7,
    };
    const c2: PlacementCandidate = {
      ...c1,
      modifiers: ["RALT", "SHIFT"], // same modifiers, different order
      confidence: 0.68,
    };
    const e1: PlacementEntry = { codepoint: "U+1E03", candidates: [c1] };
    const e2: PlacementEntry = { codepoint: "U+1E0B", candidates: [c2] };
    const map: PlacementMap = { entries: [e1, e2] };

    const groups = collisions(map);
    expect(groups).toHaveLength(1);
  });

  it("skips entries with no candidates", () => {
    const empty: PlacementEntry = { codepoint: "U+0041", candidates: [] };
    const map: PlacementMap = { entries: [empty, entryEAcute] };
    expect(collisions(map)).toEqual([]);
  });

  it("returns [] for an empty map", () => {
    expect(collisions({ entries: [] })).toEqual([]);
  });

  it("groups three-way collisions into one group", () => {
    const sameSlot: PlacementCandidate = {
      vkey: "K_X",
      modifiers: [],
      mechanism: "direct",
      priorSource: "phonetic",
      priorCount: 0,
      confidence: 0.5,
    };
    const entries: PlacementEntry[] = [
      { codepoint: "U+0041", candidates: [sameSlot] },
      { codepoint: "U+0042", candidates: [sameSlot] },
      { codepoint: "U+0043", candidates: [sameSlot] },
    ];
    const groups = collisions({ entries });
    expect(groups).toHaveLength(1);
    const group = groups[0];
    if (group === undefined) throw new Error("expected one group");
    expect(group).toHaveLength(3);
  });

  it("returns multiple independent collision groups when present", () => {
    const slotX: PlacementCandidate = {
      vkey: "K_X",
      modifiers: [],
      mechanism: "direct",
      priorSource: "phonetic",
      priorCount: 0,
      confidence: 0.5,
    };
    const slotY: PlacementCandidate = { ...slotX, vkey: "K_Y" };
    const entries: PlacementEntry[] = [
      { codepoint: "U+0041", candidates: [slotX] },
      { codepoint: "U+0042", candidates: [slotX] }, // collides with A on K_X
      { codepoint: "U+0043", candidates: [slotY] },
      { codepoint: "U+0044", candidates: [slotY] }, // collides with C on K_Y
    ];
    const groups = collisions({ entries });
    expect(groups).toHaveLength(2);
  });

  it("uses the top candidate (candidates[0]) for collision comparison", () => {
    // Second candidates both land on K_Z but top candidates differ — no collision
    const topA: PlacementCandidate = {
      vkey: "K_A",
      modifiers: [],
      mechanism: "direct",
      priorSource: "corpus",
      priorCount: 3,
      confidence: 0.9,
    };
    const topB: PlacementCandidate = { ...topA, vkey: "K_B" };
    const secondBoth: PlacementCandidate = {
      vkey: "K_Z",
      modifiers: [],
      mechanism: "direct",
      priorSource: "phonetic",
      priorCount: 0,
      confidence: 0.3,
    };
    const e1: PlacementEntry = { codepoint: "U+0041", candidates: [topA, secondBoth] };
    const e2: PlacementEntry = { codepoint: "U+0042", candidates: [topB, secondBoth] };
    expect(collisions({ entries: [e1, e2] })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Map-level context fields
// ---------------------------------------------------------------------------

describe("PlacementMap — map-level context fields", () => {
  it("bcp47Context is optional and absent when not supplied", () => {
    const map = makePlacementMap({ entries: [] });
    expect("bcp47Context" in map).toBe(false);
  });

  it("baseLayoutFamily is optional and absent when not supplied", () => {
    const map = makePlacementMap({ entries: [] });
    expect("baseLayoutFamily" in map).toBe(false);
  });

  it("pinnedPriorsVersion is optional and absent when not supplied", () => {
    const map = makePlacementMap({ entries: [] });
    expect("pinnedPriorsVersion" in map).toBe(false);
  });

  it("stores all three optional fields when supplied", () => {
    const map = makePlacementMap({
      entries: [],
      bcp47Context: "ha-Latn-NG",
      baseLayoutFamily: "QWERTY",
      pinnedPriorsVersion: "2.1.0",
    });
    expect(map.bcp47Context).toBe("ha-Latn-NG");
    expect(map.baseLayoutFamily).toBe("QWERTY");
    expect(map.pinnedPriorsVersion).toBe("2.1.0");
  });

  it("entries carries full candidate data unchanged", () => {
    const result = makePlacementMap(minimalMap);
    const entry = result.entries[0];
    if (entry === undefined) throw new Error("expected one entry");
    expect(entry.codepoint).toBe("U+00E9");
    const top = entry.candidates[0];
    if (top === undefined) throw new Error("expected top candidate");
    expect(top.vkey).toBe("K_E");
    expect(top.modifiers).toEqual(["RALT"]);
    expect(top.mechanism).toBe("direct");
    expect(top.priorSource).toBe("corpus");
    expect(top.priorCount).toBe(5);
    expect(top.confidence).toBe(0.92);
  });
});
