/**
 * Tests for the D7 bounded-enumeration corpus generator (corpus.ts).
 *
 * Covers:
 *   - corpusSpec shape (vkeyCount, modifierSets = the 6 D7 sets, deadkeyDepth = 3)
 *   - inputCount == corpus.length
 *   - corpus size matches the documented formula
 *   - empty-vkey IR returns empty corpus
 *   - each corpus entry is a KeyChord[]
 */

import { describe, it, expect } from "vitest";
import { generateCorpus, D7_MODIFIER_SETS, D7_DEADKEY_DEPTH } from "./corpus.js";
import type { KeyboardIR } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal KeyboardIR with the given vkey names in one typed group. */
function makeIR(vkeys: string[]): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test",
      name: "Test",
      bcp47: ["und"],
      copyright: "(c)",
      version: "1.0",
      targets: ["any"],
      storeDirectives: [],
    },
    stores: [],
    groups: [
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: vkeys.map((vkey, i) => ({
          nodeId: `r${i}`,
          context: [{ kind: "vkey" as const, name: vkey, modifiers: [] }],
          output: [{ kind: "char" as const, value: "a" }],
        })),
      },
    ],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

// ---------------------------------------------------------------------------
// D7 constants
// ---------------------------------------------------------------------------

describe("D7 constants", () => {
  it("has exactly 6 modifier sets", () => {
    expect(D7_MODIFIER_SETS).toHaveLength(6);
  });

  it("first modifier set is the empty (unshifted) set", () => {
    expect(D7_MODIFIER_SETS[0]).toEqual([]);
  });

  it("includes SHIFT, CTRL, ALT, SHIFT+CTRL, RALT sets", () => {
    const flat = D7_MODIFIER_SETS.map((s) => s.join("+"));
    expect(flat).toContain("SHIFT");
    expect(flat).toContain("CTRL");
    expect(flat).toContain("ALT");
    expect(flat).toContain("SHIFT+CTRL");
    expect(flat).toContain("RALT");
  });

  it("deadkey depth constant is 3", () => {
    expect(D7_DEADKEY_DEPTH).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// corpusSpec shape
// ---------------------------------------------------------------------------

describe("generateCorpus — corpusSpec shape", () => {
  it("reports correct vkeyCount from the IR", () => {
    const ir = makeIR(["K_A", "K_B", "K_C"]);
    const { corpusSpec } = generateCorpus(ir);
    expect(corpusSpec.vkeyCount).toBe(3);
  });

  it("modifierSets in corpusSpec matches the D7_MODIFIER_SETS constant exactly", () => {
    const ir = makeIR(["K_A"]);
    const { corpusSpec } = generateCorpus(ir);
    expect(corpusSpec.modifierSets).toEqual(D7_MODIFIER_SETS);
    expect(corpusSpec.modifierSets).toHaveLength(6);
  });

  it("deadkeyDepth in corpusSpec is 3", () => {
    const ir = makeIR(["K_A"]);
    const { corpusSpec } = generateCorpus(ir);
    expect(corpusSpec.deadkeyDepth).toBe(3);
  });

  it("corpusSpec shape satisfies the RoundTripDiff.corpusSpec contract", () => {
    const ir = makeIR(["K_A", "K_B"]);
    const { corpusSpec } = generateCorpus(ir);
    // Required fields per contracts/keyboard-ir.ts RoundTripDiff.corpusSpec
    expect(typeof corpusSpec.vkeyCount).toBe("number");
    expect(Array.isArray(corpusSpec.modifierSets)).toBe(true);
    expect(typeof corpusSpec.deadkeyDepth).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// inputCount / corpus.length invariant
// ---------------------------------------------------------------------------

describe("generateCorpus — inputCount == corpus.length", () => {
  it("inputCount equals corpus.length for a 2-vkey IR", () => {
    const ir = makeIR(["K_A", "K_B"]);
    const { corpus, inputCount } = generateCorpus(ir);
    expect(inputCount).toBe(corpus.length);
  });

  it("inputCount equals corpus.length for a single-vkey IR", () => {
    const ir = makeIR(["K_A"]);
    const { corpus, inputCount } = generateCorpus(ir);
    expect(inputCount).toBe(corpus.length);
  });
});

// ---------------------------------------------------------------------------
// Empty-vkey IR
// ---------------------------------------------------------------------------

describe("generateCorpus — empty IR (no vkeys)", () => {
  it("returns empty corpus when IR has no typed groups", () => {
    // IR with no groups at all
    const ir = makeIR([]);
    const { corpus, inputCount } = generateCorpus(ir);
    expect(corpus).toHaveLength(0);
    expect(inputCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Corpus size formula
// ---------------------------------------------------------------------------

describe("generateCorpus — size formula", () => {
  /**
   * Formula from corpus.ts docstring:
   *   singleKeys = vkeyCount × modifierSetCount            (depth-0 sequences)
   *   depth-d sequences: singleKeys × vkeyCount^d          (d deadkey prefixes + 1 final)
   *   total = sum_{d=0}^{deadkeyDepth} singleKeys × vkeyCount^d
   *
   * For V vkeys, M=6 modifiers, depth=3:
   *   depth-0: V×M
   *   depth-1: V×M × V    (each depth-0 prefixed by one unshifted dk)
   *   depth-2: V×M × V²
   *   depth-3: not included (loop stops at depth < D7_DEADKEY_DEPTH before
   *            extending prefixes, per the code logic)
   *
   * Reading the actual loop: it pushes prefix+final for depth 1..D7_DEADKEY_DEPTH (3),
   * and the depth-0 single chords are pushed unconditionally. Prefix batch starts
   * as V single-dk chords (no modifiers). After d iterations the batch has V^d entries.
   * So total = V×M + V×M×V + V×M×V² + V×M×V³ = V×M×(1 + V + V² + V³).
   */
  it("single vkey: total = 1×6×(1+1+1+1) = 24", () => {
    const ir = makeIR(["K_A"]);
    const { inputCount } = generateCorpus(ir);
    // V=1, M=6: 1×6×(1+1+1+1) = 24
    expect(inputCount).toBe(24);
  });

  it("two vkeys: total = 2×6×(1+2+4+8) = 180", () => {
    const ir = makeIR(["K_A", "K_B"]);
    const { inputCount } = generateCorpus(ir);
    // V=2, M=6: 2×6×(1+2+4+8) = 12×15 = 180
    expect(inputCount).toBe(180);
  });
});

// ---------------------------------------------------------------------------
// Corpus entry shape
// ---------------------------------------------------------------------------

describe("generateCorpus — corpus entry shape", () => {
  it("each corpus entry is a non-empty KeyChord array", () => {
    const ir = makeIR(["K_A"]);
    const { corpus } = generateCorpus(ir);
    for (const entry of corpus) {
      expect(Array.isArray(entry)).toBe(true);
      expect(entry.length).toBeGreaterThan(0);
      for (const chord of entry) {
        expect(typeof chord.vkey).toBe("string");
        expect(Array.isArray(chord.modifiers)).toBe(true);
      }
    }
  });

  it("depth-0 entries are single-chord arrays", () => {
    const ir = makeIR(["K_A"]);
    // First 6 entries (1 vkey × 6 modifier sets) are the depth-0 single chords
    const { corpus } = generateCorpus(ir);
    const singleChords = corpus.slice(0, 6);
    for (const entry of singleChords) {
      expect(entry).toHaveLength(1);
    }
  });

  it("depth-1 prefix entries have length 2", () => {
    const ir = makeIR(["K_A"]);
    // V=1, M=6: depth-0 = 6 entries; depth-1 entries start at index 6
    const { corpus } = generateCorpus(ir);
    const depth1 = corpus.slice(6, 12);
    for (const entry of depth1) {
      expect(entry).toHaveLength(2);
    }
  });
});
