// The single key-budget determination (spec 052 FR-016, SC-008).
//
// The load-bearing property is the BOUNDARY, not the numbers: axis A7 is a
// projection of these three bands, and §7.2 decision rule 10 keys on A7 being
// "fully booked". If the projection stopped being total and bijective, rule 10
// would start (or stop) firing on keyboards it does not touch today — which is
// exactly what FR-016's "same result for every keyboard it produces today"
// forbids.

import { describe, expect, it } from "vitest";
import { makeTestIR } from "./fixtures";
import type { IRRule, KeyboardIR, SpareKeyAvailability } from "./index";
import {
  DEFAULT_BASELAYOUT,
  STOCK_BASE_LAYOUTS,
  keyBudgetToSpareKeyAvailability,
  measureKeyBudget,
  type KeyBudgetBand,
} from "./keyBudget";
import { KeyBudgetSchema } from "./schemas";

const STOCK_VKEYS = Object.keys(STOCK_BASE_LAYOUTS[DEFAULT_BASELAYOUT] ?? {});
const N = STOCK_VKEYS.length;

function rule(vkey: string, modifiers: string[], output: string): IRRule {
  return {
    nodeId: `r:${vkey}:${modifiers.join("+")}`,
    context: [{ kind: "vkey", name: vkey, modifiers }],
    output: [{ kind: "char", value: output }],
  };
}

/** An IR binding the first `count` stock keys in the given plane. */
function irBinding(planes: { shift?: number; altgr?: number; base?: number; ctrl?: number }): KeyboardIR {
  const rules: IRRule[] = [];
  for (let i = 0; i < (planes.base ?? 0); i++) rules.push(rule(STOCK_VKEYS[i] as string, [], "x"));
  for (let i = 0; i < (planes.shift ?? 0); i++) rules.push(rule(STOCK_VKEYS[i] as string, ["SHIFT"], "X"));
  for (let i = 0; i < (planes.altgr ?? 0); i++) rules.push(rule(STOCK_VKEYS[i] as string, ["RALT"], "y"));
  for (let i = 0; i < (planes.ctrl ?? 0); i++) rules.push(rule(STOCK_VKEYS[i] as string, ["CTRL"], "z"));
  return makeTestIR([{ nodeId: "g1", name: "main", usingKeys: true, rules }]);
}

describe("the pinned stock key table", () => {
  it("is non-empty and has a kbdus family", () => {
    expect(N).toBeGreaterThan(0);
    expect(STOCK_BASE_LAYOUTS[DEFAULT_BASELAYOUT]).toBeDefined();
  });
});

describe("keyBudgetToSpareKeyAvailability — the A7 projection (FR-016)", () => {
  const ALL_BANDS: KeyBudgetBand[] = ["many", "ralt-only", "fully-booked"];

  it("is TOTAL on the three bands", () => {
    for (const band of ALL_BANDS) {
      expect(keyBudgetToSpareKeyAvailability(band)).toBeDefined();
    }
  });

  it("is BIJECTIVE — three distinct bands map to three distinct A7 values", () => {
    const projected = ALL_BANDS.map(keyBudgetToSpareKeyAvailability);
    expect(new Set(projected).size).toBe(ALL_BANDS.length);
  });

  it("maps each band to its §7.1 prose display string verbatim", () => {
    const expected: Record<KeyBudgetBand, SpareKeyAvailability> = {
      many: "many",
      "ralt-only": "RAlt only",
      "fully-booked": "fully booked",
    };
    for (const band of ALL_BANDS) {
      expect(keyBudgetToSpareKeyAvailability(band)).toBe(expected[band]);
    }
  });

  it("rule 10's predicate fires on exactly one band — the boundary FR-016 preserves", () => {
    const firing = ALL_BANDS.filter((b) => keyBudgetToSpareKeyAvailability(b) === "fully booked");
    expect(firing).toEqual(["fully-booked"]);
  });

  it("the three §7.5 intermediate-band rows stay at 'RAlt only', so rule 10 stays dormant", () => {
    // sil_euro_latin, armenian_mnemonic_r, russian_mnemonic_r are supplied to
    // the self-consistency suite at the intermediate band. The projection is
    // what decides whether they cross rule 10's boundary; it does not.
    const intermediate = keyBudgetToSpareKeyAvailability("ralt-only");
    expect(intermediate).toBe("RAlt only");
    expect(intermediate).not.toBe("fully booked");
  });
});

describe("measureKeyBudget — bands (relocated verbatim from the facet classifier)", () => {
  it("many: the SHIFT plane is less than half bound", () => {
    const budget = measureKeyBudget(irBinding({ shift: Math.floor(N / 2) - 1 }));
    expect(budget?.band).toBe("many");
  });

  it("ralt-only: SHIFT is at least half bound, AltGr is not", () => {
    const budget = measureKeyBudget(irBinding({ shift: N, altgr: 1 }));
    expect(budget?.band).toBe("ralt-only");
  });

  it("fully-booked: both planes are at least half bound", () => {
    const budget = measureKeyBudget(irBinding({ shift: N, altgr: N }));
    expect(budget?.band).toBe("fully-booked");
  });

  it("the base (unshifted) plane carries no budget — it is excluded", () => {
    // Every stock key bound in the base plane and nothing else: still `many`,
    // because the base plane is always occupied on desktop.
    const budget = measureKeyBudget(irBinding({ base: N }));
    expect(budget?.band).toBe("many");
    expect(budget?.planes.shiftBound).toBe(0);
  });

  it("reserved Ctrl/Alt chords are excluded — they are not placement slots", () => {
    const budget = measureKeyBudget(irBinding({ ctrl: N }));
    expect(budget?.band).toBe("many");
    expect(budget?.planes.shiftBound).toBe(0);
    expect(budget?.planes.altgrBound).toBe(0);
  });

  it("distinct keys are counted per plane — a key bound twice counts once", () => {
    const vkey = STOCK_VKEYS[0] as string;
    const ir = makeTestIR([
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        rules: [rule(vkey, ["SHIFT"], "A"), { ...rule(vkey, ["SHIFT"], "B"), nodeId: "r2" }],
      },
    ]);
    expect(measureKeyBudget(ir)?.planes.shiftBound).toBe(1);
  });
});

describe("measureKeyBudget — honesty over a false 'many'", () => {
  it("a base binding NO stock physical key yields null, never a band", () => {
    const ir = makeTestIR([{ nodeId: "g1", name: "main", usingKeys: true, rules: [] }]);
    expect(measureKeyBudget(ir)).toBeNull();
  });

  it("an IR with no groups at all yields null", () => {
    expect(measureKeyBudget(makeTestIR([]))).toBeNull();
  });

  it("a base binding only NON-stock keys yields null", () => {
    const ir = makeTestIR([
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        rules: [rule("K_F13", [], "q")],
      },
    ]);
    expect(measureKeyBudget(ir)).toBeNull();
  });

  it("a reserved-chord-only base is measured (it HAS a physical surface) and is `many`", () => {
    // The distinction that keeps null meaning "nothing to measure" rather than
    // "nothing bound": a Ctrl-chord base has a physical-key surface, so it gets
    // an honest measurement rather than falling through.
    const budget = measureKeyBudget(irBinding({ ctrl: 1 }));
    expect(budget).not.toBeNull();
    expect(budget?.band).toBe("many");
  });
});

describe("measureKeyBudget — spareKeys", () => {
  const CASES = [
    { name: "empty shift+altgr", planes: { base: N } },
    { name: "half-bound shift", planes: { shift: Math.floor(N / 2) } },
    { name: "saturated shift", planes: { shift: N, altgr: 1 } },
    { name: "saturated both", planes: { shift: N, altgr: N } },
    { name: "one key", planes: { shift: 1 } },
  ];

  it("is never negative, for any binding shape", () => {
    for (const testCase of CASES) {
      const budget = measureKeyBudget(irBinding(testCase.planes));
      expect(budget?.spareKeys, testCase.name).toBeGreaterThanOrEqual(0);
    }
  });

  it("is exactly 0 when the budget is fully booked", () => {
    expect(measureKeyBudget(irBinding({ shift: N, altgr: N }))?.spareKeys).toBe(0);
  });

  it("counts only the planes the band says are still available", () => {
    // SHIFT saturated, AltGr untouched → the whole AltGr plane is the budget.
    const budget = measureKeyBudget(irBinding({ shift: N }));
    expect(budget?.band).toBe("ralt-only");
    expect(budget?.spareKeys).toBe(N);
  });

  it("every emitted budget validates against its runtime schema", () => {
    for (const testCase of CASES) {
      const budget = measureKeyBudget(irBinding(testCase.planes));
      expect(() => KeyBudgetSchema.parse(budget), testCase.name).not.toThrow();
    }
  });
});

describe("measureKeyBudget — determinism", () => {
  it("identical IRs yield deep-equal budgets", () => {
    expect(measureKeyBudget(irBinding({ shift: 5, altgr: 3 }))).toEqual(
      measureKeyBudget(irBinding({ shift: 5, altgr: 3 })),
    );
  });
});
