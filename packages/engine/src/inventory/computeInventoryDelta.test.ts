import { describe, it, expect } from "vitest";
import { computeInventoryDelta } from "./computeInventoryDelta.js";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { IRGroup, IRRule, InventoryChar, RawKmnFragment } from "@keyboard-studio/contracts";

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

// `inBaseOutput` is deliberately seeded `false` here regardless of which
// bucket the char will land in — the point of the fixture is that the
// function must overwrite this flag to match the bucket, not pass it through.
function char(value: string, method?: InventoryChar["method"]): InventoryChar {
  return method === undefined
    ? { char: value, inBaseOutput: false }
    : { char: value, inBaseOutput: false, method };
}

function opaqueFragment(overrides: Partial<RawKmnFragment> = {}): RawKmnFragment {
  return {
    nodeId: `frag#${Math.random().toString(36).slice(2)}`,
    origin: "imported",
    sourceText: "if(&x = 1) c 'y'",
    reason: "opaque test fragment",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Partition correctness (missing / covered / inBaseOutput / method)
// ---------------------------------------------------------------------------

describe("computeInventoryDelta — partition correctness", () => {
  it("empty needed -> empty missing+covered, coverageComplete true", () => {
    const ir = makeTestIR([makeGroup([makeRule([{ kind: "char", value: "a" }])])]);
    const result = computeInventoryDelta([], ir);
    expect(result.missing).toEqual([]);
    expect(result.covered).toEqual([]);
    expect(result.coverageComplete).toBe(true);
  });

  it("base is a superset -> all covered, missing empty", () => {
    const ir = makeTestIR([
      makeGroup([
        makeRule([{ kind: "char", value: "a" }]),
        makeRule([{ kind: "char", value: "b" }]),
        makeRule([{ kind: "char", value: "c" }]),
      ]),
    ]);
    const needed = [char("a"), char("b")];
    const result = computeInventoryDelta(needed, ir);
    expect(result.missing).toEqual([]);
    expect(result.covered).toEqual(needed.map((c) => ({ ...c, inBaseOutput: true })));
  });

  it("NFD-vs-NFC mismatch: needed precomposed, base emits it -> covered, not missing", () => {
    // Base emits "é" as two run-merging char elements (NFD-style): e + U+0301.
    const ir = makeTestIR([
      makeGroup([
        makeRule([{ kind: "char", value: "e" }, { kind: "char", value: "́" }]),
      ]),
    ]);
    // Needed carries the precomposed NFC form.
    const needed = [char("é")]; // é precomposed
    const result = computeInventoryDelta(needed, ir);
    expect(result.covered).toEqual(needed.map((c) => ({ ...c, inBaseOutput: true })));
    expect(result.missing).toEqual([]);
  });

  it("stamps inBaseOutput to match the bucket, overwriting whatever the input carried", () => {
    const ir = makeTestIR([makeGroup([makeRule([{ kind: "char", value: "a" }])])]);
    // "a" will land in `covered` but is seeded `inBaseOutput: false` (wrong).
    // "z" will land in `missing` but is seeded `inBaseOutput: true` (wrong).
    const needed: InventoryChar[] = [
      { char: "a", inBaseOutput: false },
      { char: "z", inBaseOutput: true },
    ];
    const result = computeInventoryDelta(needed, ir);
    expect(result.covered).toEqual([{ char: "a", inBaseOutput: true }]);
    expect(result.missing).toEqual([{ char: "z", inBaseOutput: false }]);
    for (const item of result.covered) {
      expect(item.inBaseOutput).toBe(true);
    }
    for (const item of result.missing) {
      expect(item.inBaseOutput).toBe(false);
    }
  });

  it("purity: does not mutate the input items", () => {
    const ir = makeTestIR([makeGroup([makeRule([{ kind: "char", value: "a" }])])]);
    const needed: InventoryChar[] = [
      { char: "a", inBaseOutput: false },
      { char: "z", inBaseOutput: false },
    ];
    const snapshot = needed.map((c) => ({ ...c }));
    computeInventoryDelta(needed, ir);
    expect(needed).toEqual(snapshot);
  });

  it("per-char method tag is preserved on returned chars (both missing and covered, fresh copies)", () => {
    const ir = makeTestIR([makeGroup([makeRule([{ kind: "char", value: "a" }])])]);
    const needed = [
      char("a", "linguist"),
      char("z", "text-sample"),
      char("q", "picker"),
      char("m"), // no method
    ];
    const result = computeInventoryDelta(needed, ir);
    const covered = result.covered.find((c) => c.char === "a");
    const missingZ = result.missing.find((c) => c.char === "z");
    const missingQ = result.missing.find((c) => c.char === "q");
    const missingM = result.missing.find((c) => c.char === "m");

    expect(covered?.method).toBe("linguist");
    expect(missingZ?.method).toBe("text-sample");
    expect(missingQ?.method).toBe("picker");
    expect(missingM?.method).toBeUndefined();

    // Returned items are fresh copies, not the same object references.
    expect(covered).not.toBe(needed[0]);
    expect(missingZ).not.toBe(needed[1]);
  });

  it("missing ∪ covered == needed and missing ∩ covered == ∅ (exhaustive + disjoint partition)", () => {
    const ir = makeTestIR([
      makeGroup([
        makeRule([{ kind: "char", value: "a" }]),
        makeRule([{ kind: "char", value: "c" }]),
      ]),
    ]);
    const needed = [char("a"), char("b"), char("c"), char("d")];
    const result = computeInventoryDelta(needed, ir);

    const union = new Set([...result.missing, ...result.covered].map((c) => c.char));
    const neededChars = new Set(needed.map((c) => c.char));
    expect(union).toEqual(neededChars);

    const missingSet = new Set(result.missing.map((c) => c.char));
    const coveredSet = new Set(result.covered.map((c) => c.char));
    for (const ch of missingSet) {
      expect(coveredSet.has(ch)).toBe(false);
    }
    expect(result.missing.length + result.covered.length).toBe(needed.length);
  });
});

// ---------------------------------------------------------------------------
// 2. coverageComplete (opaque RawKmnFragment accounting)
// ---------------------------------------------------------------------------

describe("computeInventoryDelta — coverageComplete", () => {
  it("opaque-fragment base lacking producedOutput -> coverageComplete false", () => {
    const ir = makeTestIR(
      [makeGroup([makeRule([{ kind: "char", value: "a" }])])],
      [],
      [opaqueFragment()], // producedOutput absent
    );
    const result = computeInventoryDelta([char("a")], ir);
    expect(result.coverageComplete).toBe(false);
  });

  it("opaque fragment WITH a non-empty producedOutput does not break coverageComplete", () => {
    const ir = makeTestIR(
      [makeGroup([makeRule([{ kind: "char", value: "a" }])])],
      [],
      [opaqueFragment({ producedOutput: [{ kind: "char", value: "z" }] })],
    );
    const result = computeInventoryDelta([char("a")], ir);
    expect(result.coverageComplete).toBe(true);
  });

  it("two opaque fragments, one accounted (has producedOutput) and one unaccounted (lacks it) -> coverageComplete false", () => {
    const ir = makeTestIR(
      [makeGroup([makeRule([{ kind: "char", value: "a" }])])],
      [],
      [
        opaqueFragment({ producedOutput: [{ kind: "char", value: "z" }] }), // accounted
        opaqueFragment(), // unaccounted — producedOutput absent
      ],
    );
    const result = computeInventoryDelta([char("a")], ir);
    expect(result.coverageComplete).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Options
// ---------------------------------------------------------------------------

describe("computeInventoryDelta — options", () => {
  it("includeSpace option threads through to producedGlyphs", () => {
    const ir = makeTestIR([makeGroup([makeRule([{ kind: "char", value: " " }])])]);
    const needed = [char(" ")];

    const withoutSpace = computeInventoryDelta(needed, ir);
    expect(withoutSpace.missing).toEqual(needed);
    expect(withoutSpace.covered).toEqual([]);

    const withSpace = computeInventoryDelta(needed, ir, { includeSpace: true });
    expect(withSpace.covered).toEqual(needed.map((c) => ({ ...c, inBaseOutput: true })));
    expect(withSpace.missing).toEqual([]);
  });
});
