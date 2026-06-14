import { describe, it, expect } from "vitest";
import { producedGlyphs } from "./producedGlyphs.js";
import { makeTestIR, charItems } from "@keyboard-studio/contracts/fixtures";
import type { IRGroup, IRRule, IRStore } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGroup(rules: IRRule[], name = "main", usingKeys = true): IRGroup {
  return { nodeId: `group#${name}`, name, usingKeys, readonly: false, rules };
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
// 1. Simple char output
// ---------------------------------------------------------------------------

describe("producedGlyphs — direct char output", () => {
  it("single rule '+ [K_A] > á' contains NFC 'á'", () => {
    const ir = makeTestIR([
      makeGroup([makeRule([{ kind: "char", value: "á" }])]),
    ]);
    const result = producedGlyphs(ir);
    // á (U+00E1) is already NFC
    expect(result).toContain("á");
  });

  it("two consecutive char elements [a, U+0301] run-merge to NFC 'é' (U+00E9) — not separate 'a' + combining", () => {
    // NFC run-merge fix: consecutive {kind:"char"} elements are accumulated into a
    // run buffer, joined, then NFC-normalized on flush. So ["e", U+0301] -> "é"
    // -> NFC -> "é" (U+00E9).
    const ir = makeTestIR([
      makeGroup([
        makeRule([{ kind: "char", value: "e" }, { kind: "char", value: "́" }]),
      ]),
    ]);
    const result = producedGlyphs(ir);
    // After run-merge: "e" + U+0301 -> NFC -> "é"
    expect(result).toContain("é");
    // The individual raw codepoints must NOT appear when part of a merged run
    expect(result).not.toContain("e");
    expect(result).not.toContain("́");

    // Verify: a single char element whose value is the NFD string also normalizes.
    // "é" is NFD; normalize("NFC") -> "é"
    const irSingle = makeTestIR([
      makeGroup([makeRule([{ kind: "char", value: "é" }])]),
    ]);
    const resultSingle = producedGlyphs(irSingle);
    expect(resultSingle).toContain("é");
  });

  it("multiple distinct outputs produce a deduplicated set", () => {
    const ir = makeTestIR([
      makeGroup([
        makeRule([{ kind: "char", value: "é" }]),
        makeRule([{ kind: "char", value: "é" }]), // duplicate
        makeRule([{ kind: "char", value: "ñ" }]),
      ]),
    ]);
    const result = producedGlyphs(ir);
    expect(result.filter((c) => c === "é")).toHaveLength(1);
    expect(result.filter((c) => c === "ñ")).toHaveLength(1);
  });

  it("output is sorted by ascending codepoint (deterministic)", () => {
    const ir = makeTestIR([
      makeGroup([
        makeRule([{ kind: "char", value: "ñ" }]), // U+00F1
        makeRule([{ kind: "char", value: "é" }]), // U+00E9
        makeRule([{ kind: "char", value: "à" }]), // U+00E0
      ]),
    ]);
    const result = producedGlyphs(ir);
    const codes = result.map((c) => c.codePointAt(0) ?? 0);
    for (let i = 1; i < codes.length; i++) {
      expect(codes[i]).toBeGreaterThanOrEqual(codes[i - 1] as number);
    }
    // Specific order: à < é < ñ
    const relevant = result.filter((c) => "àéñ".includes(c));
    expect(relevant).toEqual(["à", "é", "ñ"]);
  });
});

// ---------------------------------------------------------------------------
// 2. index(store, n) output
// ---------------------------------------------------------------------------

describe("producedGlyphs — index(store, n) output", () => {
  it("index output pulls all chars from the referenced store", () => {
    const outStore = makeStore("S_out", "áéíóú");
    const ir = makeTestIR(
      [makeGroup([makeRule([{ kind: "index", storeRef: "S_out", offset: 2 }])])],
      [outStore],
    );
    const result = producedGlyphs(ir);
    for (const ch of "áéíóú") {
      expect(result).toContain(ch);
    }
  });

  it("missing store referenced by index is skipped without throwing", () => {
    const ir = makeTestIR([
      makeGroup([makeRule([{ kind: "index", storeRef: "S_missing", offset: 2 }])]),
    ]);
    expect(() => producedGlyphs(ir)).not.toThrow();
    // Nothing collected from the missing store
    expect(producedGlyphs(ir)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. outs(store) output
// ---------------------------------------------------------------------------

describe("producedGlyphs — outs(store) output", () => {
  it("outs output expands all char items in the store", () => {
    const banner = makeStore("S_banner", "hello");
    const ir = makeTestIR(
      [makeGroup([makeRule([{ kind: "outs", storeRef: "S_banner" }])])],
      [banner],
    );
    const result = producedGlyphs(ir);
    for (const ch of new Set("hello")) {
      expect(result).toContain(ch);
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
    const result = producedGlyphs(ir);
    expect(result).toContain("x");
    expect(result).toContain("y");
    // Non-char items must NOT appear
    expect(result).not.toContain("K_A");
    expect(result).not.toContain("foo");
  });
});

// ---------------------------------------------------------------------------
// 4. Deadkey composition outputs
// ---------------------------------------------------------------------------

describe("producedGlyphs — deadkey composition outputs", () => {
  it("deadkey fan-out output (index) includes accented forms from output store", () => {
    // Simulate: dk(acute) + any(bases) > index(accented, 2)
    // The accented store holds the accented forms the keyboard emits.
    const accentedStore = makeStore("S_accented", "àèìòù");
    const ir = makeTestIR(
      [
        makeGroup([
          // Trigger rule: + [K_GRAVE] > deadkey(0x01) -- deadkey token, no glyph
          makeRule([{ kind: "deadkey", id: 1 }]),
          // Fan-out rule: index output (accented forms)
          makeRule([{ kind: "index", storeRef: "S_accented", offset: 2 }]),
          // Escape rule: + [K_GRAVE] > 'è' direct char output
          makeRule([{ kind: "char", value: "è" }]),
        ]),
      ],
      [accentedStore],
    );
    const result = producedGlyphs(ir);
    // Accented forms from store are included
    for (const ch of "àèìòù") {
      expect(result).toContain(ch);
    }
    // Escape char also included
    expect(result).toContain("è");
  });

  it("deadkey markers themselves are NOT in the output set", () => {
    const ir = makeTestIR([
      makeGroup([
        // Rule that only emits a deadkey marker
        makeRule([{ kind: "deadkey", id: 42 }]),
      ]),
    ]);
    const result = producedGlyphs(ir);
    // Nothing collected -- deadkey markers are state, not glyphs
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Exclusions
// ---------------------------------------------------------------------------

describe("producedGlyphs — exclusions", () => {
  it("control chars U+0000–U+001F are excluded", () => {
    const ir = makeTestIR([
      makeGroup([
        makeRule([{ kind: "char", value: "\x00" }]), // NUL
        makeRule([{ kind: "char", value: "\x09" }]), // TAB
        makeRule([{ kind: "char", value: "\x1f" }]), // US
        makeRule([{ kind: "char", value: "A" }]),    // kept
      ]),
    ]);
    const result = producedGlyphs(ir);
    expect(result).not.toContain("\x00");
    expect(result).not.toContain("\x09");
    expect(result).not.toContain("\x1f");
    expect(result).toContain("A");
  });

  it("DEL U+007F is excluded", () => {
    const ir = makeTestIR([
      makeGroup([makeRule([{ kind: "char", value: "\x7f" }])]),
    ]);
    expect(producedGlyphs(ir)).not.toContain("\x7f");
  });

  it("space U+0020 is excluded by default", () => {
    const ir = makeTestIR([
      makeGroup([makeRule([{ kind: "char", value: " " }])]),
    ]);
    expect(producedGlyphs(ir)).not.toContain(" ");
  });

  it("space U+0020 is included when includeSpace: true", () => {
    const ir = makeTestIR([
      makeGroup([makeRule([{ kind: "char", value: " " }])]),
    ]);
    expect(producedGlyphs(ir, { includeSpace: true })).toContain(" ");
  });

  it("beep tokens are excluded", () => {
    const ir = makeTestIR([
      makeGroup([makeRule([{ kind: "beep" }])]),
    ]);
    expect(producedGlyphs(ir)).toHaveLength(0);
  });

  it("raw output tokens are excluded (opaque)", () => {
    const ir = makeTestIR([
      makeGroup([makeRule([{ kind: "raw", text: "someRawText" }])]),
    ]);
    expect(producedGlyphs(ir)).toHaveLength(0);
  });

  it("combining marks (e.g. U+0301) are kept — they are legitimate inventory members", () => {
    const ir = makeTestIR([
      makeGroup([makeRule([{ kind: "char", value: "́" }])]),
    ]);
    const result = producedGlyphs(ir);
    expect(result).toContain("́");
  });

  it("non-ASCII letters (Cyrillic, Arabic) are kept", () => {
    const ir = makeTestIR([
      makeGroup([
        makeRule([{ kind: "char", value: "д" }]), // Cyrillic
        makeRule([{ kind: "char", value: "ع" }]), // Arabic
      ]),
    ]);
    const result = producedGlyphs(ir);
    expect(result).toContain("д");
    expect(result).toContain("ع");
  });
});

// ---------------------------------------------------------------------------
// 6. Determinism + distinctness
// ---------------------------------------------------------------------------

describe("producedGlyphs — determinism and distinctness", () => {
  it("returns the same array on repeated calls with same IR", () => {
    const ir = makeTestIR([
      makeGroup([
        makeRule([{ kind: "char", value: "ñ" }]),
        makeRule([{ kind: "char", value: "é" }]),
      ]),
    ]);
    const r1 = producedGlyphs(ir);
    const r2 = producedGlyphs(ir);
    expect(r1).toEqual(r2);
  });

  it("each glyph appears exactly once (distinctness)", () => {
    const ir = makeTestIR([
      makeGroup([
        makeRule([{ kind: "char", value: "à" }]),
        makeRule([{ kind: "char", value: "à" }]),
        makeRule([{ kind: "char", value: "à" }]),
      ]),
    ]);
    const result = producedGlyphs(ir);
    const seen = new Set(result);
    expect(result.length).toBe(seen.size);
    expect(result.filter((c) => c === "à")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 7. Empty / partial IR resilience
// ---------------------------------------------------------------------------

describe("producedGlyphs — empty and partial IR", () => {
  it("empty IR returns empty array", () => {
    const ir = makeTestIR([]);
    expect(producedGlyphs(ir)).toEqual([]);
  });

  it("IR with no rules returns empty array", () => {
    const ir = makeTestIR([makeGroup([])]);
    expect(producedGlyphs(ir)).toEqual([]);
  });

  it("rules with only vkey context and no char output return empty", () => {
    // Rules that only have deadkey or beep output
    const ir = makeTestIR([
      makeGroup([
        makeRule([{ kind: "beep" }]),
        makeRule([{ kind: "deadkey", id: 5 }]),
      ]),
    ]);
    expect(producedGlyphs(ir)).toHaveLength(0);
  });
});
