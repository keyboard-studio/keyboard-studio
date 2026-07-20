import { describe, it, expect } from "vitest";
import { buildProducedSet } from "./producedSet.js";
import { makeTestIR, charItems } from "../fixtures/keyboard-ir.js";
import type { IRGroup, IRRule, IRStore, RawKmnFragment } from "../keyboard-ir.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGroup(rules: IRRule[], name = "main"): IRGroup {
  return { nodeId: `group#${name}`, name, usingKeys: true, readonly: false, rules };
}

function makeRule(output: IRRule["output"]): IRRule {
  return {
    nodeId: `rule#${Math.random().toString(36).slice(2)}`,
    context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
    output,
  };
}

function makeStore(name: string, chars: string): IRStore {
  return {
    nodeId: `store#${name}`,
    name,
    items: charItems(chars),
    isSystem: false,
  };
}

// ---------------------------------------------------------------------------
// 1. Run-merge NFC fix — the key regression case
// ---------------------------------------------------------------------------

describe("buildProducedSet — run-merge NFC fix", () => {
  it("two consecutive char elements [e, U+0301] → set contains NFC 'é' (U+00E9), NOT 'e' + combining", () => {
    // This is the bug that producedGlyphs had before the fix.
    const ir = makeTestIR([
      makeGroup([
        makeRule([
          { kind: "char", value: "e" },
          { kind: "char", value: "́" }, // combining acute
        ]),
      ]),
    ]);
    const result = buildProducedSet(ir);
    // Correct: NFC of "e" + U+0301 = "é"
    expect(result.has("é")).toBe(true);
    // The individual codepoints should NOT appear alone when part of a NFC sequence
    // (the flush produces "é", not "e" and combining)
    expect(result.has("e")).toBe(false);
    expect(result.has("́")).toBe(false);
  });

  it("two consecutive char elements [a, U+0300] → set contains NFC 'à' (U+00E0)", () => {
    const ir = makeTestIR([
      makeGroup([
        makeRule([
          { kind: "char", value: "a" },
          { kind: "char", value: "̀" }, // combining grave
        ]),
      ]),
    ]);
    const result = buildProducedSet(ir);
    expect(result.has("à")).toBe(true);
    expect(result.has("a")).toBe(false);
    expect(result.has("̀")).toBe(false);
  });

  it("standalone combining mark in its own rule is added as-is (not merged with nothing)", () => {
    const ir = makeTestIR([
      makeGroup([
        makeRule([{ kind: "char", value: "́" }]), // standalone combining acute
      ]),
    ]);
    const result = buildProducedSet(ir);
    // A lone combining mark NFC-normalizes to itself
    expect(result.has("́")).toBe(true);
  });

  it("three-char run [a, U+0301, n] → 'á' and 'n' (a+combining flushes to á; n appended later)", () => {
    // "a" + U+0301 + "n" in one run → join = "án" → NFC = "á" + "n"
    const ir = makeTestIR([
      makeGroup([
        makeRule([
          { kind: "char", value: "a" },
          { kind: "char", value: "́" },
          { kind: "char", value: "n" },
        ]),
      ]),
    ]);
    const result = buildProducedSet(ir);
    expect(result.has("á")).toBe(true);
    expect(result.has("n")).toBe(true);
  });

  it("run interrupted by deadkey flushes correctly: [a, U+0301] deadkey [b] → 'á' and 'b'", () => {
    const ir = makeTestIR([
      makeGroup([
        makeRule([
          { kind: "char", value: "a" },
          { kind: "char", value: "́" },
          { kind: "deadkey", id: 1 },
          { kind: "char", value: "b" },
        ]),
      ]),
    ]);
    const result = buildProducedSet(ir);
    expect(result.has("á")).toBe(true);
    expect(result.has("b")).toBe(true);
    expect(result.has("a")).toBe(false);
    expect(result.has("́")).toBe(false);
  });

  it("single char element: 'á' (already NFC) → set contains 'á'", () => {
    const ir = makeTestIR([
      makeGroup([makeRule([{ kind: "char", value: "á" }])]),
    ]);
    const result = buildProducedSet(ir);
    expect(result.has("á")).toBe(true);
  });

  it("single NFD string value in one char element → NFC-normalized", () => {
    // "á" as a single char element value (not split across elements)
    const ir = makeTestIR([
      makeGroup([makeRule([{ kind: "char", value: "á" }])]),
    ]);
    const result = buildProducedSet(ir);
    expect(result.has("á")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. index(store, n) and outs(store) expansion
// ---------------------------------------------------------------------------

describe("buildProducedSet — store expansion", () => {
  it("index output pulls all chars from the referenced store", () => {
    const outStore = makeStore("S_out", "áéíóú");
    const ir = makeTestIR(
      [makeGroup([makeRule([{ kind: "index", storeRef: "S_out", offset: 2 }])])],
      [outStore],
    );
    const result = buildProducedSet(ir);
    for (const ch of "áéíóú") {
      expect(result.has(ch)).toBe(true);
    }
  });

  it("outs output expands all char items in the store", () => {
    const banner = makeStore("S_banner", "hello");
    const ir = makeTestIR(
      [makeGroup([makeRule([{ kind: "outs", storeRef: "S_banner" }])])],
      [banner],
    );
    const result = buildProducedSet(ir);
    for (const ch of new Set("hello")) {
      expect(result.has(ch)).toBe(true);
    }
  });

  it("outs store with mixed items: only char items contribute", () => {
    const store: IRStore = {
      nodeId: "store#mixed",
      name: "S_mixed",
      items: [
        { kind: "char", value: "x" },
        { kind: "vkey", name: "K_A" },
        { kind: "deadkey", id: 1 },
        { kind: "char", value: "y" },
        { kind: "any" },
        { kind: "raw", text: "foo" },
      ],
      isSystem: false,
    };
    const ir = makeTestIR(
      [makeGroup([makeRule([{ kind: "outs", storeRef: "S_mixed" }])])],
      [store],
    );
    const result = buildProducedSet(ir);
    expect(result.has("x")).toBe(true);
    expect(result.has("y")).toBe(true);
    expect(result.has("K_A")).toBe(false);
    expect(result.has("foo")).toBe(false);
  });

  it("missing store referenced by index is skipped without throwing", () => {
    const ir = makeTestIR([
      makeGroup([makeRule([{ kind: "index", storeRef: "S_missing", offset: 2 }])]),
    ]);
    expect(() => buildProducedSet(ir)).not.toThrow();
    expect(buildProducedSet(ir).size).toBe(0);
  });

  it("store items are NFC-normalized individually (no cross-item run merging)", () => {
    // Store has two items: "a" and U+0301. Each is treated independently.
    // "a".normalize("NFC") = "a"; "́".normalize("NFC") = "́"
    // They are NOT merged across items.
    const store: IRStore = {
      nodeId: "store#decomp",
      name: "S_decomp",
      items: [
        { kind: "char", value: "a" },
        { kind: "char", value: "́" },
      ],
      isSystem: false,
    };
    const ir = makeTestIR(
      [makeGroup([makeRule([{ kind: "outs", storeRef: "S_decomp" }])])],
      [store],
    );
    const result = buildProducedSet(ir);
    // Store items are individual — no cross-item NFC merge
    expect(result.has("a")).toBe(true);
    expect(result.has("́")).toBe(true);
    // "é" should NOT appear (no run merge across store items)
    expect(result.has("é")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Deadkey exclusion
// ---------------------------------------------------------------------------

describe("buildProducedSet — deadkey exclusion", () => {
  it("deadkey markers are NOT in the output set", () => {
    const ir = makeTestIR([
      makeGroup([makeRule([{ kind: "deadkey", id: 42 }])]),
    ]);
    expect(buildProducedSet(ir).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Control char and space filtering
// ---------------------------------------------------------------------------

describe("buildProducedSet — control and space filtering", () => {
  it("control chars U+0000–U+001F are excluded", () => {
    const ir = makeTestIR([
      makeGroup([
        makeRule([{ kind: "char", value: "\x00" }]),
        makeRule([{ kind: "char", value: "\x09" }]),
        makeRule([{ kind: "char", value: "\x1f" }]),
        makeRule([{ kind: "char", value: "A" }]),
      ]),
    ]);
    const result = buildProducedSet(ir);
    expect(result.has("\x00")).toBe(false);
    expect(result.has("\x09")).toBe(false);
    expect(result.has("\x1f")).toBe(false);
    expect(result.has("A")).toBe(true);
  });

  it("DEL U+007F is excluded", () => {
    const ir = makeTestIR([
      makeGroup([makeRule([{ kind: "char", value: "\x7f" }])]),
    ]);
    expect(buildProducedSet(ir).has("\x7f")).toBe(false);
  });

  it("space U+0020 is excluded by default", () => {
    const ir = makeTestIR([
      makeGroup([makeRule([{ kind: "char", value: " " }])]),
    ]);
    expect(buildProducedSet(ir).has(" ")).toBe(false);
  });

  it("space U+0020 is included when includeSpace: true", () => {
    const ir = makeTestIR([
      makeGroup([makeRule([{ kind: "char", value: " " }])]),
    ]);
    expect(buildProducedSet(ir, { includeSpace: true }).has(" ")).toBe(true);
  });

  it("beep tokens produce no entries", () => {
    const ir = makeTestIR([
      makeGroup([makeRule([{ kind: "beep" }])]),
    ]);
    expect(buildProducedSet(ir).size).toBe(0);
  });

  it("raw output tokens produce no entries (opaque)", () => {
    const ir = makeTestIR([
      makeGroup([makeRule([{ kind: "raw", text: "someRawText" }])]),
    ]);
    expect(buildProducedSet(ir).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Determinism
// ---------------------------------------------------------------------------

describe("buildProducedSet — determinism", () => {
  it("same set contents on repeated calls", () => {
    const ir = makeTestIR([
      makeGroup([
        makeRule([{ kind: "char", value: "ñ" }]),
        makeRule([{ kind: "char", value: "é" }]),
      ]),
    ]);
    const r1 = buildProducedSet(ir);
    const r2 = buildProducedSet(ir);
    expect([...r1].sort()).toEqual([...r2].sort());
  });

  it("each glyph appears exactly once (Set deduplication)", () => {
    const ir = makeTestIR([
      makeGroup([
        makeRule([{ kind: "char", value: "à" }]),
        makeRule([{ kind: "char", value: "à" }]),
        makeRule([{ kind: "char", value: "à" }]),
      ]),
    ]);
    const result = buildProducedSet(ir);
    expect(result.size).toBe(1);
    expect(result.has("à")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Empty / partial IR resilience
// ---------------------------------------------------------------------------

describe("buildProducedSet — empty and partial IR", () => {
  it("empty IR returns empty set", () => {
    expect(buildProducedSet(makeTestIR([])).size).toBe(0);
  });

  it("IR with no rules returns empty set", () => {
    expect(buildProducedSet(makeTestIR([makeGroup([])])).size).toBe(0);
  });

  it("rules with only deadkey or beep output return empty set", () => {
    const ir = makeTestIR([
      makeGroup([
        makeRule([{ kind: "beep" }]),
        makeRule([{ kind: "deadkey", id: 5 }]),
      ]),
    ]);
    expect(buildProducedSet(ir).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Opaque fragment producedOutput
// ---------------------------------------------------------------------------

function makeFragment(
  producedOutput?: RawKmnFragment["producedOutput"],
  sourceText = "if(opt = '') + [K_A] > index(C_efc,3)",
): RawKmnFragment {
  const frag: RawKmnFragment = {
    nodeId: "raw#1",
    origin: "imported",
    sourceText,
    reason: "if-option-store",
  };
  if (producedOutput !== undefined) frag.producedOutput = producedOutput;
  return frag;
}

describe("buildProducedSet — opaque fragment producedOutput", () => {
  it("index() ref in a fragment resolves against a typed store (bj_cree_woods regression shape)", () => {
    const ir = makeTestIR(
      [makeGroup([])],
      [makeStore("C_efc", "ᐌᐐᐔ")],
      [makeFragment([{ kind: "index", storeRef: "C_efc", offset: 3 }])],
    );
    const result = buildProducedSet(ir);
    expect(result.has("ᐌ")).toBe(true);
    expect(result.has("ᐐ")).toBe(true);
    expect(result.has("ᐔ")).toBe(true);
  });

  it("SMP char element lands in the set as a single astral entry", () => {
    const ir = makeTestIR(
      [makeGroup([])],
      [],
      [makeFragment([{ kind: "char", value: "\u{10D24}" }])],
    );
    const result = buildProducedSet(ir);
    expect(result.has("\u{10D24}")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("consecutive char elements in a fragment run-merge to NFC", () => {
    const ir = makeTestIR(
      [makeGroup([])],
      [],
      [
        makeFragment([
          { kind: "char", value: "e" },
          { kind: "char", value: "́" },
        ]),
      ],
    );
    const result = buildProducedSet(ir);
    expect(result.has("é")).toBe(true);
    expect(result.has("e")).toBe(false);
    expect(result.has("́")).toBe(false);
  });

  it("index() against a missing store does not throw and adds nothing", () => {
    const ir = makeTestIR(
      [makeGroup([])],
      [],
      [makeFragment([{ kind: "index", storeRef: "no_such_store", offset: 1 }])],
    );
    expect(buildProducedSet(ir).size).toBe(0);
  });

  it("fragment without producedOutput is skipped (prior behavior preserved)", () => {
    const irWithout = makeTestIR(
      [makeGroup([makeRule([{ kind: "char", value: "a" }])])],
      [],
      [makeFragment(undefined)],
    );
    const irNoFrag = makeTestIR([
      makeGroup([makeRule([{ kind: "char", value: "a" }])]),
    ]);
    expect([...buildProducedSet(irWithout)].sort()).toEqual(
      [...buildProducedSet(irNoFrag)].sort(),
    );
  });

  it("a raw element between chars breaks the run (no cross-raw NFC merge)", () => {
    const ir = makeTestIR(
      [makeGroup([])],
      [],
      [
        makeFragment([
          { kind: "char", value: "e" },
          { kind: "raw", text: "set(opt='x')" },
          { kind: "char", value: "́" },
        ]),
      ],
    );
    const result = buildProducedSet(ir);
    expect(result.has("e")).toBe(true);
    expect(result.has("́")).toBe(true);
    expect(result.has("é")).toBe(false);
  });

  it("outs() element in a fragment expands the referenced store", () => {
    const ir = makeTestIR(
      [makeGroup([])],
      [makeStore("vowels", "aei")],
      [makeFragment([{ kind: "outs", storeRef: "vowels" }])],
    );
    const result = buildProducedSet(ir);
    expect(result.has("a")).toBe(true);
    expect(result.has("e")).toBe(true);
    expect(result.has("i")).toBe(true);
  });

  it("space filtering applies to fragment content (excluded by default, includeSpace retains)", () => {
    const ir = makeTestIR(
      [makeGroup([])],
      [],
      [makeFragment([{ kind: "char", value: " " }])],
    );
    expect(buildProducedSet(ir).has(" ")).toBe(false);
    expect(buildProducedSet(ir, { includeSpace: true }).has(" ")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Range-store interior inheritance (spec 042, FR-011 / contract C13)
// ---------------------------------------------------------------------------

describe("buildProducedSet — range-store interior (spec 042)", () => {
  it("a store whose items are the full U+0904..U+0914 interior contributes all 17 codepoints via index()", () => {
    // The engine codec (parseStoreItems) expands `store(rng) U+0904 .. U+0914`
    // to these 17 char items; this test fixes the consumer contract: given the
    // expanded items, buildProducedSet inherits the whole interior with NO
    // change to its own source. (Contracts is the dependency root and cannot
    // import the engine parser, so the expanded store is constructed directly.)
    const rangeChars = Array.from({ length: 17 }, (_, k) => String.fromCodePoint(0x0904 + k)).join("");
    const rng = makeStore("rng", rangeChars);
    const ir = makeTestIR(
      [makeGroup([makeRule([{ kind: "index", storeRef: "rng", offset: 1 }])])],
      [rng],
    );
    const result = buildProducedSet(ir);
    for (let k = 0; k < 17; k++) {
      expect(result.has(String.fromCodePoint(0x0904 + k))).toBe(true);
    }
  });
});
