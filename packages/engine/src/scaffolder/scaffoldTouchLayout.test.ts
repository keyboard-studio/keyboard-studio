import { describe, it, expect } from "vitest";
import { scaffoldTouchLayout, buildMinimalPhoneTouchLayout } from "./scaffoldTouchLayout.js";
import { emitTouchLayout } from "../codec/index.js";
import type {
  KeyboardIR,
  IRGroup,
  IRRule,
  TouchLayoutIR,
  Pattern,
} from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture builder helpers
// ---------------------------------------------------------------------------

let _nodeSeq = 0;
function freshId(prefix: string): string {
  return `${prefix}:${++_nodeSeq}`;
}

/** Build a minimal KeyboardIR with no groups and no touchLayout. */
function makeMinimalIR(overrides: Partial<KeyboardIR> = {}): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test_kb",
      name: "Test KB",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
    ...overrides,
  };
}

/** Build a simple IRRule for a single vkey with given modifiers and a char output. */
function makeCharRule(
  vkey: string,
  modifiers: string[],
  output: string,
): IRRule {
  return {
    nodeId: freshId("rule"),
    context: [{ kind: "vkey", name: vkey, modifiers }],
    output: [{ kind: "char", value: output }],
  };
}

/** Build a single non-readonly IRGroup containing the given rules. */
function makeGroup(rules: IRRule[]): IRGroup {
  return {
    nodeId: freshId("group"),
    name: "main",
    usingKeys: true,
    rules,
    readonly: false,
  };
}

/** Build a minimal Pattern with strategyId starting with "S-02". */
function makeS02Pattern(
  vkey: string,
  successorChar: string,
  nodeId: string,
): Pattern {
  // ownedNodes path: rule has deadkey context + char output, vkey in context.
  const ruleNodeId = nodeId;
  return {
    id: "test_s02_pattern",
    title: "Test deadkey",
    description: "Test deadkey pattern",
    category: "desktop",
    appliesTo: [],
    strategyId: "S-02",
    origin: "recognized",
    ownedNodes: [{ nodeId: ruleNodeId, kind: "rule" }],
    questions: [],
    kmnFragment: `+ [K_ACUTE] > deadkey(dk1)\n+ [dk1 ${vkey}] > '${successorChar}'`,
    tests: [],
    validatedForFamilies: [],
    sourceKeyboards: [],
    reviewedBy: "test",
    reviewDate: "2026-06-18",
  };
}

// ---------------------------------------------------------------------------
// Helper: get the phone platform + named layer
// ---------------------------------------------------------------------------

function getLayer(result: TouchLayoutIR, layerId: string) {
  const phone = result.platforms.find((p) => p.id === "phone")!;
  return phone.layers.find((l) => l.id === layerId);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("scaffoldTouchLayout", () => {
  describe("null / empty IR", () => {
    it("returns a TouchLayoutIR with at least one platform when IR has no groups and no touchLayout", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);

      expect(result).toBeDefined();
      expect(result.platforms).toBeDefined();
      expect(result.platforms.length).toBeGreaterThanOrEqual(1);
    });

    it("the generated platform has id 'phone'", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);

      const phone = result.platforms.find((p) => p.id === "phone");
      expect(phone).toBeDefined();
    });

    it("the phone platform has a default layer", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      expect(getLayer(result, "default")).toBeDefined();
    });

    it("the phone platform has a shift layer", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      expect(getLayer(result, "shift")).toBeDefined();
    });

    it("the phone platform has a numeric layer", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      expect(getLayer(result, "numeric")).toBeDefined();
    });

    it("the phone platform has exactly 3 layers (default + shift + numeric) when no RALT rules", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      expect(phone.layers.map((l) => l.id)).toEqual(["default", "shift", "numeric"]);
    });

    it("the phone platform has 4 rows in the default layer (3 char rows + 1 functional)", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      expect(defaultLayer.rows).toHaveLength(4);
    });

    it("does not mutate the input IR", () => {
      const ir = makeMinimalIR();
      const groupsBefore = ir.groups.length;
      const patternsBefore = ir.recognizedPatterns.length;

      scaffoldTouchLayout(ir);

      expect(ir.groups.length).toBe(groupsBefore);
      expect(ir.recognizedPatterns.length).toBe(patternsBefore);
      expect(ir.touchLayout).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // CRITICAL: ≤10 keys/row in every layer
  // ---------------------------------------------------------------------------

  describe("compact layout — ≤10 keys per row in every layer", () => {
    it("every row in every layer of the generated phone platform has ≤10 keys", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;

      for (const layer of phone.layers) {
        for (let i = 0; i < layer.rows.length; i++) {
          const row = layer.rows[i]!;
          expect(
            row.keys.length,
            `layer "${layer.id}" row ${i} has ${row.keys.length} keys (max 10)`,
          ).toBeLessThanOrEqual(10);
        }
      }
    });

    it("buildMinimalPhoneTouchLayout: every row in every layer has ≤10 keys", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;

      for (const layer of phone.layers) {
        for (let i = 0; i < layer.rows.length; i++) {
          const row = layer.rows[i]!;
          expect(
            row.keys.length,
            `layer "${layer.id}" row ${i} has ${row.keys.length} keys (max 10)`,
          ).toBeLessThanOrEqual(10);
        }
      }
    });

    it("default layer row 0 (QWERTY) has exactly 10 keys", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      expect(defaultLayer.rows[0]!.keys).toHaveLength(10);
    });

    it("default layer row 1 (ASDF) has exactly 10 keys (9 letters + spacer)", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      expect(defaultLayer.rows[1]!.keys).toHaveLength(10);
    });

    it("default layer row 2 (ZXCV) has exactly 10 keys", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      expect(defaultLayer.rows[2]!.keys).toHaveLength(10);
    });

    it("default layer row 3 (functional) has exactly 4 keys", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      expect(defaultLayer.rows[3]!.keys).toHaveLength(4);
    });

    it("numeric layer row 0 has exactly 10 keys", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;
      expect(numLayer.rows[0]!.keys).toHaveLength(10);
    });

    it("numeric layer row 1 has exactly 10 keys (9 symbols + spacer)", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;
      expect(numLayer.rows[1]!.keys).toHaveLength(10);
    });

    it("numeric layer row 2 has exactly 10 keys (leading spacer + 8 symbols + K_BKSP)", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;
      expect(numLayer.rows[2]!.keys).toHaveLength(10);
    });

    it("numeric layer row 3 (functional) has exactly 4 keys", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;
      expect(numLayer.rows[3]!.keys).toHaveLength(4);
    });
  });

  // ---------------------------------------------------------------------------
  // Layer switch wiring
  // ---------------------------------------------------------------------------

  describe("layer switch wiring", () => {
    it("default layer K_SHIFT has sp:1 and nextlayer:'shift'", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const funcRow = defaultLayer.rows[2]!;
      const shift = funcRow.keys.find((k) => k.id === "K_SHIFT");
      expect(shift).toBeDefined();
      expect(shift?.text).toBe("*Shift*");
      expect(shift?.sp).toBe(1);
      expect(shift?.nextlayer).toBe("shift");
    });

    it("shift layer K_SHIFT has sp:2 and nextlayer:'default'", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const shiftLayer = getLayer(result, "shift")!;
      const row2 = shiftLayer.rows[2]!;
      const shift = row2.keys.find((k) => k.id === "K_SHIFT");
      expect(shift).toBeDefined();
      expect(shift?.text).toBe("*Shift*");
      expect(shift?.sp).toBe(2);
      expect(shift?.nextlayer).toBe("default");
    });

    it("default layer K_NUMLOCK has nextlayer:'numeric'", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const funcRow = defaultLayer.rows[3]!;
      const numlock = funcRow.keys.find((k) => k.id === "K_NUMLOCK");
      expect(numlock).toBeDefined();
      expect(numlock?.text).toBe("*123*");
      expect(numlock?.sp).toBe(1);
      expect(numlock?.nextlayer).toBe("numeric");
    });

    it("shift layer K_NUMLOCK has nextlayer:'numeric'", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const shiftLayer = getLayer(result, "shift")!;
      const funcRow = shiftLayer.rows[3]!;
      const numlock = funcRow.keys.find((k) => k.id === "K_NUMLOCK");
      expect(numlock?.nextlayer).toBe("numeric");
    });

    it("numeric layer K_LOWER has nextlayer:'default' (abc switch)", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;
      const funcRow = numLayer.rows[3]!;
      const lower = funcRow.keys.find((k) => k.id === "K_LOWER");
      expect(lower).toBeDefined();
      expect(lower?.text).toBe("*abc*");
      expect(lower?.sp).toBe(1);
      expect(lower?.nextlayer).toBe("default");
    });

    it("K_SHIFT has no sk[] on default or shift layer", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;

      for (const layer of ["default", "shift"] as const) {
        const lyr = phone.layers.find((l) => l.id === layer)!;
        const row2 = lyr.rows[2]!;
        const shift = row2.keys.find((k) => k.id === "K_SHIFT");
        expect(shift?.sk, `K_SHIFT sk on layer ${layer}`).toBeUndefined();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Key text population (letter keys from keyMap)
  // ---------------------------------------------------------------------------

  describe("letter key text from keyMap", () => {
    it("default layer K_A uses keyboard mapping when present", () => {
      const rule = makeCharRule("K_A", [], "a");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const kaKey = allKeys.find((k) => k.id === "K_A");
      expect(kaKey).toBeDefined();
      expect(kaKey?.output).toBe("a");
      expect(kaKey?.text).toBe("a");
    });

    it("shift layer K_A uses shift keyMap mapping", () => {
      const rule = makeCharRule("K_A", ["SHIFT"], "A");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const shiftLayer = getLayer(result, "shift")!;
      const allKeys = shiftLayer.rows.flatMap((r) => r.keys);
      const kaKey = allKeys.find((k) => k.id === "K_A");
      expect(kaKey?.output).toBe("A");
    });

    it("default layer does not carry SHIFT-modified output", () => {
      const rule = makeCharRule("K_A", ["SHIFT"], "A");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const kaKey = allKeys.find((k) => k.id === "K_A");
      // The key uses the US fallback 'a', not the SHIFT-mapped 'A'.
      if (kaKey !== undefined) {
        expect(kaKey.output).not.toBe("A");
      }
    });

    it("US fallback keycap is used for unmapped letter keys in default layer (K_A → 'a')", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      expect(allKeys.find((k) => k.id === "K_A")?.text).toBe("a");
    });

    it("US fallback keycap for shift layer uses uppercase (K_A → 'A')", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const shiftLayer = getLayer(result, "shift")!;
      const allKeys = shiftLayer.rows.flatMap((r) => r.keys);
      expect(allKeys.find((k) => k.id === "K_A")?.text).toBe("A");
    });

    it("default layer row 0 Q key uses US fallback 'q' when unmapped", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      expect(allKeys.find((k) => k.id === "K_Q")?.text).toBe("q");
    });

    it("shift layer row 0 Q key uses US fallback 'Q' when unmapped", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const shiftLayer = getLayer(result, "shift")!;
      const allKeys = shiftLayer.rows.flatMap((r) => r.keys);
      expect(allKeys.find((k) => k.id === "K_Q")?.text).toBe("Q");
    });
  });

  // ---------------------------------------------------------------------------
  // Numeric layer literals (fixed, not from keyMap)
  // ---------------------------------------------------------------------------

  describe("numeric layer literal keys", () => {
    it("numeric row 0 contains literal digit keys 1–9 and 0", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;
      const row0Keys = numLayer.rows[0]!.keys;

      const texts = row0Keys.map((k) => k.text);
      expect(texts).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]);
    });

    it("numeric row 1 contains $ @ # % & _ = | \\ and a spacer", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;
      const row1Keys = numLayer.rows[1]!.keys;

      // First 9 are symbols, last is spacer (sp:10)
      const symbolTexts = row1Keys.slice(0, 9).map((k) => k.text);
      expect(symbolTexts).toEqual(["$", "@", "#", "%", "&", "_", "=", "|", "\\"]);
      const spacer = row1Keys[9]!;
      expect(spacer.sp).toBe(10);
    });

    it("numeric row 2 index 0 is leading spacer (sp:10, width:110) and K_LBRKT is at index 1 with text '['", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;
      const row2Keys = numLayer.rows[2]!.keys;
      // index 0: leading spacer that preserves the ~110px visual indent
      const leadSpacer = row2Keys[0]!;
      expect(leadSpacer.id).toBe("T_num_r2_lead_sp");
      expect(leadSpacer.sp).toBe(10);
      expect(leadSpacer.width).toBe(110);
      // index 1: K_LBRKT (no pad on the key itself)
      const lbrkt = row2Keys[1]!;
      expect(lbrkt.id).toBe("K_LBRKT");
      expect(lbrkt.text).toBe("[");
      expect(lbrkt.pad).toBeUndefined();
    });

    it("numeric row 2 last key is K_BKSP at keyIndex 9 with sp:1 and no width (matches default/shift/altgr)", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;
      const row2 = numLayer.rows[2]!;
      expect(row2.keys).toHaveLength(10);
      const lastKey = row2.keys[9]!;
      expect(lastKey.id).toBe("K_BKSP");
      expect(lastKey.text).toBe("*BkSp*");
      expect(lastKey.sp).toBe(1);
      expect(lastKey.width).toBeUndefined();
    });

    it("numeric row 3 contains K_LOWER, K_LOPT, K_SPACE, K_ENTER", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;
      const funcRow = numLayer.rows[3]!;
      const ids = funcRow.keys.map((k) => k.id);
      expect(ids).toContain("K_LOWER");
      expect(ids).toContain("K_LOPT");
      expect(ids).toContain("K_SPACE");
      expect(ids).toContain("K_ENTER");
    });

    // -----------------------------------------------------------------------
    // U_ id correctness and uniqueness (P0 fix verification)
    // -----------------------------------------------------------------------

    it("all literal-character keys in the numeric layer use U_ id form", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;

      // Collect all keys across all rows; exclude functional/spacer keys.
      const functionalIds = new Set([
        "K_LOWER", "K_NUMLOCK", "K_LOPT", "K_SPACE", "K_ENTER",
        "K_BKSP", "K_LBRKT", "K_RBRKT", "T_ks_sp_numeric", "T_num_r2_lead_sp",
      ]);

      for (const row of numLayer.rows) {
        for (const key of row.keys) {
          if (functionalIds.has(key.id)) continue;
          expect(
            key.id,
            `literal key with text "${key.text}" should use U_ id form`,
          ).toMatch(/^U_[0-9A-F]{4,5}$/);
        }
      }
    });

    it("all key ids in the numeric layer are unique", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;

      const allIds = numLayer.rows.flatMap((row) => row.keys.map((k) => k.id));
      const uniqueIds = new Set(allIds);
      expect(
        uniqueIds.size,
        `numeric layer has ${allIds.length} keys but only ${uniqueIds.size} unique ids — duplicates: ${
          allIds.filter((id, i) => allIds.indexOf(id) !== i).join(", ")
        }`,
      ).toBe(allIds.length);
    });

    it("pipe character key has id U_007C", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;
      const row1Keys = numLayer.rows[1]!.keys;
      const pipeKey = row1Keys.find((k) => k.text === "|");
      expect(pipeKey).toBeDefined();
      expect(pipeKey!.id).toBe("U_007C");
    });

    it("backslash character key has id U_005C", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;
      const row1Keys = numLayer.rows[1]!.keys;
      const bslashKey = row1Keys.find((k) => k.text === "\\");
      expect(bslashKey).toBeDefined();
      expect(bslashKey!.id).toBe("U_005C");
    });

    it("dollar sign key has id U_0024", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;
      const row1Keys = numLayer.rows[1]!.keys;
      const dollarKey = row1Keys.find((k) => k.text === "$");
      expect(dollarKey).toBeDefined();
      expect(dollarKey!.id).toBe("U_0024");
    });

    it("digit '1' key in row 0 has id U_0031", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;
      const row0Keys = numLayer.rows[0]!.keys;
      const oneKey = row0Keys.find((k) => k.text === "1");
      expect(oneKey).toBeDefined();
      expect(oneKey!.id).toBe("U_0031");
    });

    it("digit '0' key in row 0 has id U_0030", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;
      const row0Keys = numLayer.rows[0]!.keys;
      const zeroKey = row0Keys.find((k) => k.text === "0");
      expect(zeroKey).toBeDefined();
      expect(zeroKey!.id).toBe("U_0030");
    });

    it("numeric layer row 0 still has ≤10 keys after U_ conversion", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;
      expect(numLayer.rows[0]!.keys.length).toBeLessThanOrEqual(10);
    });

    it("numeric layer row 1 still has ≤10 keys after U_ conversion", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const numLayer = getLayer(result, "numeric")!;
      expect(numLayer.rows[1]!.keys.length).toBeLessThanOrEqual(10);
    });

    it("buildMinimalPhoneTouchLayout numeric layer has all-unique ids", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      const numLayer = phone.layers.find((l) => l.id === "numeric")!;

      const allIds = numLayer.rows.flatMap((row) => row.keys.map((k) => k.id));
      const uniqueIds = new Set(allIds);
      expect(
        uniqueIds.size,
        `buildMinimalPhoneTouchLayout numeric layer has duplicate ids: ${
          allIds.filter((id, i) => allIds.indexOf(id) !== i).join(", ")
        }`,
      ).toBe(allIds.length);
    });
  });

  // ---------------------------------------------------------------------------
  // Functional row: K_LOPT / K_SPACE / K_ENTER widths
  // ---------------------------------------------------------------------------

  describe("functional row key properties", () => {
    it("default layer K_LOPT has text:'*Menu*', sp:1, width:120", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const funcRow = defaultLayer.rows[3]!;
      const lopt = funcRow.keys.find((k) => k.id === "K_LOPT");
      expect(lopt?.text).toBe("*Menu*");
      expect(lopt?.sp).toBe(1);
      expect(lopt?.width).toBe(120);
    });

    it("default layer K_SPACE has text:'' and width:610", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const funcRow = defaultLayer.rows[3]!;
      const space = funcRow.keys.find((k) => k.id === "K_SPACE");
      expect(space?.text).toBe("");
      expect(space?.width).toBe(610);
    });

    it("default layer K_ENTER has text:'*Enter*', sp:1, width:150", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const funcRow = defaultLayer.rows[3]!;
      const enter = funcRow.keys.find((k) => k.id === "K_ENTER");
      expect(enter?.text).toBe("*Enter*");
      expect(enter?.sp).toBe(1);
      expect(enter?.width).toBe(150);
    });

    it("default layer K_NUMLOCK has text:'*123*', sp:1, width:150", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const funcRow = defaultLayer.rows[3]!;
      const numlock = funcRow.keys.find((k) => k.id === "K_NUMLOCK");
      expect(numlock?.text).toBe("*123*");
      expect(numlock?.sp).toBe(1);
      expect(numlock?.width).toBe(150);
    });
  });

  // ---------------------------------------------------------------------------
  // Row 1 spacer (ASDF row trailing spacer)
  // ---------------------------------------------------------------------------

  describe("ASDF row spacer", () => {
    it("default layer row 1 last key is a spacer with sp:10 and width:10", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const row1 = defaultLayer.rows[1]!;
      const lastKey = row1.keys[row1.keys.length - 1]!;
      expect(lastKey.sp).toBe(10);
      expect(lastKey.width).toBe(10);
    });

    it("shift layer row 1 spacer has id 'T_ks_sp_shift'", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const shiftLayer = getLayer(result, "shift")!;
      const row1 = shiftLayer.rows[1]!;
      const lastKey = row1.keys[row1.keys.length - 1]!;
      expect(lastKey.id).toBe("T_ks_sp_shift");
    });

    it("default layer row 1 spacer has id 'T_ks_sp_default'", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const row1 = defaultLayer.rows[1]!;
      const lastKey = row1.keys[row1.keys.length - 1]!;
      expect(lastKey.id).toBe("T_ks_sp_default");
    });

    it("default layer row 1 K_A has pad:50", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const row1 = defaultLayer.rows[1]!;
      const ka = row1.keys.find((k) => k.id === "K_A");
      expect(ka?.pad).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // altgr layer
  // ---------------------------------------------------------------------------

  describe("altgr layer", () => {
    it("IR with an RALT-modified key produces an altgr layer", () => {
      const rule = makeCharRule("K_A", ["RALT"], "à");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      expect(getLayer(result, "altgr")).toBeDefined();
    });

    it("altgr layer carries the correct output for the RALT key", () => {
      const rule = makeCharRule("K_A", ["RALT"], "à");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const altgrLayer = getLayer(result, "altgr")!;
      const allKeys = altgrLayer.rows.flatMap((r) => r.keys);
      const kaKey = allKeys.find((k) => k.id === "K_A");
      expect(kaKey).toBeDefined();
      expect(kaKey?.output).toBe("à");
    });

    it("IR without any RALT keys does NOT produce an altgr layer", () => {
      const rules = [
        makeCharRule("K_A", [], "a"),
        makeCharRule("K_A", ["SHIFT"], "A"),
        makeCharRule("K_B", [], "b"),
      ];
      const ir = makeMinimalIR({ groups: [makeGroup(rules)] });

      const result = scaffoldTouchLayout(ir);
      expect(getLayer(result, "altgr")).toBeUndefined();
    });

    it("RALT+SHIFT combination is NOT mapped to a top-level touch layer", () => {
      const raltShiftRule = makeCharRule("K_A", ["RALT", "SHIFT"], "Ä");
      const ir = makeMinimalIR({ groups: [makeGroup([raltShiftRule])] });

      const result = scaffoldTouchLayout(ir);
      expect(getLayer(result, "altgr")).toBeUndefined();
    });

    it("altgr layer every row has ≤10 keys", () => {
      const rule = makeCharRule("K_A", ["RALT"], "à");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const altgrLayer = getLayer(result, "altgr")!;
      for (let i = 0; i < altgrLayer.rows.length; i++) {
        const row = altgrLayer.rows[i]!;
        expect(
          row.keys.length,
          `altgr row ${i} has ${row.keys.length} keys (max 10)`,
        ).toBeLessThanOrEqual(10);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // deadkey → sk[]
  // ---------------------------------------------------------------------------

  describe("deadkey → sk[]", () => {
    it("recognized S-02 pattern causes relevant touch key to have non-empty sk[]", () => {
      const vkey = "K_E";
      const successorChar = "é";

      const ownedNodeId = freshId("rule");
      const deadkeyRule: IRRule = {
        nodeId: ownedNodeId,
        context: [
          { kind: "deadkey", name: "dk1" } as never,
          { kind: "vkey", name: vkey, modifiers: [] },
        ],
        output: [{ kind: "char", value: successorChar }],
      };

      const pattern = makeS02Pattern(vkey, successorChar, ownedNodeId);

      const ir = makeMinimalIR({
        groups: [makeGroup([deadkeyRule])],
        recognizedPatterns: [pattern],
      });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey);

      expect(targetKey).toBeDefined();
      expect(targetKey?.sk).toBeDefined();
      expect(targetKey?.sk?.length).toBeGreaterThan(0);
    });

    it("sk[] entries carry the correct successor character (text; U_-id form)", () => {
      const vkey = "K_E";
      const successorChar = "é";
      const ownedNodeId = freshId("rule");

      const deadkeyRule: IRRule = {
        nodeId: ownedNodeId,
        context: [
          { kind: "deadkey", name: "dk1" } as never,
          { kind: "vkey", name: vkey, modifiers: [] },
        ],
        output: [{ kind: "char", value: successorChar }],
      };

      const pattern = makeS02Pattern(vkey, successorChar, ownedNodeId);
      const ir = makeMinimalIR({
        groups: [makeGroup([deadkeyRule])],
        recognizedPatterns: [pattern],
      });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey)!;

      const skTexts = targetKey.sk!.map((s) => s.text);
      expect(skTexts).toContain(successorChar);
      // U_-id form: é = U+00E9 → "U_00E9"
      const skIds = targetKey.sk!.map((s) => s.id);
      expect(skIds.some((id) => /^U_[0-9A-F]{4,5}$/i.test(id))).toBe(true);
    });

    it("hint is NOT set on a S-02 key — dot comes from platform defaultHint", () => {
      const vkey = "K_A";
      const successorChar = "à";
      const ownedNodeId = freshId("rule");

      const deadkeyRule: IRRule = {
        nodeId: ownedNodeId,
        context: [
          { kind: "deadkey", name: "dk1" } as never,
          { kind: "vkey", name: vkey, modifiers: [] },
        ],
        output: [{ kind: "char", value: successorChar }],
      };

      const pattern = makeS02Pattern(vkey, successorChar, ownedNodeId);
      const ir = makeMinimalIR({
        groups: [makeGroup([deadkeyRule])],
        recognizedPatterns: [pattern],
      });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey)!;

      expect(targetKey.hint).toBeUndefined();
      expect(targetKey.sk).toBeDefined();
      expect(targetKey.sk!.length).toBeGreaterThan(0);
    });

    it("a pattern whose strategyId does NOT start with S-02 does not produce sk[]", () => {
      const vkey = "K_A";
      const pattern: Pattern = {
        id: "test_s01_pattern",
        title: "S-01 pattern",
        description: "S-01 does not generate sk[]",
        category: "desktop",
        appliesTo: [],
        strategyId: "S-01",
        origin: "recognized",
        ownedNodes: [],
        questions: [],
        kmnFragment: `+ [${vkey}] > 'a'`,
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "test",
        reviewDate: "2026-06-18",
      };

      const ir = makeMinimalIR({ recognizedPatterns: [pattern] });
      const result = scaffoldTouchLayout(ir);

      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const kaKey = allKeys.find((k) => k.id === vkey);

      if (kaKey !== undefined) {
        expect(kaKey.sk === undefined || kaKey.sk.length === 0).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Provenance tagging (spec-035 T021 / research R6)
  //
  // Case A (generate-from-scratch): keys built by buildLetterKey, and the
  // sk[] deadkey-augmentation entries it attaches, are projection output and
  // must carry provenance: "physical-suggested".
  //
  // Case B (existing ir.touchLayout carried through): a carried-through key
  // with no existing provenance is tagged "base-derived" per R6 (absent
  // provenance would otherwise deserialize as "hand-set" — the never-auto-
  // clobber state — which R6 explicitly rejects for carried keys); a
  // carried-through key that already has an explicit provenance (e.g.
  // author-set "hand-set") is left untouched. Only the NEW sk[] entries
  // added by the deadkey-augmentation pass are projection output and always
  // get tagged "physical-suggested".
  //
  // Wire-format check: emitTouchLayout must never write a literal
  // "provenance" property — the IR field, when present, is carried on the
  // non-standard "p" wire key (spec-014 FR-010), never as "provenance".
  // ---------------------------------------------------------------------------

  describe("provenance tagging (T021)", () => {
    it("Case A: a generated letter key (buildLetterKey) is tagged physical-suggested", () => {
      const rule = makeCharRule("K_A", [], "a");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const kaKey = allKeys.find((k) => k.id === "K_A");

      expect(kaKey?.provenance).toBe("physical-suggested");
    });

    it("Case A: a US-fallback letter key with no keyMap entry is still tagged physical-suggested", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const qKey = allKeys.find((k) => k.id === "K_Q");

      expect(qKey?.provenance).toBe("physical-suggested");
    });

    it("Case A: sk[] deadkey-augmentation entries attached by buildLetterKey are tagged physical-suggested", () => {
      const vkey = "K_E";
      const successorChar = "é";
      const ownedNodeId = freshId("rule");

      const deadkeyRule: IRRule = {
        nodeId: ownedNodeId,
        context: [
          { kind: "deadkey", name: "dk1" } as never,
          { kind: "vkey", name: vkey, modifiers: [] },
        ],
        output: [{ kind: "char", value: successorChar }],
      };
      const pattern = makeS02Pattern(vkey, successorChar, ownedNodeId);
      const ir = makeMinimalIR({
        groups: [makeGroup([deadkeyRule])],
        recognizedPatterns: [pattern],
      });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey)!;

      expect(targetKey.sk).toBeDefined();
      for (const sk of targetKey.sk!) {
        expect(sk.provenance).toBe("physical-suggested");
      }
    });

    it("Case B: a key carried through from an existing ir.touchLayout with no provenance is tagged base-derived", () => {
      const existingKey = {
        nodeId: freshId("key"),
        id: "K_A",
        text: "a",
        output: "a",
      };
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [
              {
                id: "default",
                rows: [{ keys: [existingKey] }],
              },
            ],
          },
        ],
        nodeIds: [],
      };

      const ir = makeMinimalIR({ touchLayout: existingTouchLayout });
      const result = scaffoldTouchLayout(ir);

      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const carried = defaultLayer.rows.flatMap((r) => r.keys).find((k) => k.id === "K_A");

      expect(carried?.provenance).toBe("base-derived");
    });

    it("Case B: a carried-through key with an explicit provenance (e.g. hand-set) is not overwritten", () => {
      const existingKey = {
        nodeId: freshId("key"),
        id: "K_A",
        text: "a",
        output: "a",
        provenance: "hand-set" as const,
      };
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [
              {
                id: "default",
                rows: [{ keys: [existingKey] }],
              },
            ],
          },
        ],
        nodeIds: [],
      };

      const ir = makeMinimalIR({ touchLayout: existingTouchLayout });
      const result = scaffoldTouchLayout(ir);

      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const carried = defaultLayer.rows.flatMap((r) => r.keys).find((k) => k.id === "K_A");

      expect(carried?.provenance).toBe("hand-set");
    });

    it("Case B: new sk[] deadkey-augmentation entries on a carried-through key are tagged physical-suggested, and the carried-through key itself is tagged base-derived", () => {
      const vkey = "K_E";
      const successorChar = "ê";
      const ownedNodeId = freshId("rule");

      const existingKey = {
        nodeId: freshId("key"),
        id: vkey,
        text: "e",
        output: "e",
      };
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [
              {
                id: "default",
                rows: [{ keys: [existingKey] }],
              },
            ],
          },
        ],
        nodeIds: [],
      };

      const deadkeyRule: IRRule = {
        nodeId: ownedNodeId,
        context: [
          { kind: "deadkey", name: "dk1" } as never,
          { kind: "vkey", name: vkey, modifiers: [] },
        ],
        output: [{ kind: "char", value: successorChar }],
      };
      const pattern = makeS02Pattern(vkey, successorChar, ownedNodeId);
      const ir = makeMinimalIR({
        groups: [makeGroup([deadkeyRule])],
        recognizedPatterns: [pattern],
        touchLayout: existingTouchLayout,
      });

      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const targetKey = defaultLayer.rows.flatMap((r) => r.keys).find((k) => k.id === vkey)!;

      expect(targetKey.provenance).toBe("base-derived");
      expect(targetKey.sk).toBeDefined();
      for (const sk of targetKey.sk!) {
        expect(sk.provenance).toBe("physical-suggested");
      }
    });

    it("Case B: a carried-through key whose sk[] already covers every deadkey successor gains no duplicate entry, and its existing sk[] keeps original content with carry-through tagging", () => {
      // Exercises the newSk.length === 0 branch of augmentExistingPhoneLayers:
      // the deadkey successor ("ê") is already present in the shipped sk[], so
      // the successor filter leaves nothing new to add and the key must come
      // back with exactly its original sk[] entries — no duplicate — while
      // still receiving the carry-through provenance normalization (untagged
      // entries -> base-derived, explicit hand-set preserved).
      const vkey = "K_E";
      const successorChar = "ê";
      const ownedNodeId = freshId("rule");

      const shippedSuccessorSk = {
        nodeId: freshId("key"),
        id: "U_00EA",
        text: successorChar,
      };
      const shippedHandSetSk = {
        nodeId: freshId("key"),
        id: "K_X",
        text: "x",
        provenance: "hand-set" as const,
      };
      const existingKey = {
        nodeId: freshId("key"),
        id: vkey,
        text: "e",
        output: "e",
        sk: [shippedSuccessorSk, shippedHandSetSk],
      };
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [
              {
                id: "default",
                rows: [{ keys: [existingKey] }],
              },
            ],
          },
        ],
        nodeIds: [],
      };

      const deadkeyRule: IRRule = {
        nodeId: ownedNodeId,
        context: [
          { kind: "deadkey", name: "dk1" } as never,
          { kind: "vkey", name: vkey, modifiers: [] },
        ],
        output: [{ kind: "char", value: successorChar }],
      };
      const pattern = makeS02Pattern(vkey, successorChar, ownedNodeId);
      const ir = makeMinimalIR({
        groups: [makeGroup([deadkeyRule])],
        recognizedPatterns: [pattern],
        touchLayout: existingTouchLayout,
      });

      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const targetKey = defaultLayer.rows.flatMap((r) => r.keys).find((k) => k.id === vkey)!;

      expect(targetKey.provenance).toBe("base-derived");
      // Exactly the two shipped entries — no duplicate for the already-covered successor.
      expect(targetKey.sk).toHaveLength(2);
      const successorEntry = targetKey.sk!.find((s) => s.text === successorChar)!;
      expect(successorEntry.id).toBe(shippedSuccessorSk.id);
      expect(successorEntry.nodeId).toBe(shippedSuccessorSk.nodeId);
      // Untagged shipped entry receives the carry-through normalization...
      expect(successorEntry.provenance).toBe("base-derived");
      // ...while an explicit hand-set entry is preserved untouched.
      const handSetEntry = targetKey.sk!.find((s) => s.text === "x")!;
      expect(handSetEntry.provenance).toBe("hand-set");
    });

    it("Case B: carried-through flick and multitap sub-keys with no existing provenance are tagged base-derived, and explicit tags are preserved", () => {
      const existingKey = {
        nodeId: freshId("key"),
        id: "K_A",
        text: "a",
        output: "a",
        flick: {
          n: { nodeId: freshId("key"), id: "K_A_flick_n", text: "n" },
          s: {
            nodeId: freshId("key"),
            id: "K_A_flick_s",
            text: "s",
            provenance: "hand-set" as const,
          },
        },
        multitap: [
          { nodeId: freshId("key"), id: "K_A_mt_0", text: "0" },
          {
            nodeId: freshId("key"),
            id: "K_A_mt_1",
            text: "1",
            provenance: "hand-set" as const,
          },
        ],
      };
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [
              {
                id: "default",
                rows: [{ keys: [existingKey] }],
              },
            ],
          },
        ],
        nodeIds: [],
      };

      const ir = makeMinimalIR({ touchLayout: existingTouchLayout });
      const result = scaffoldTouchLayout(ir);

      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const carried = defaultLayer.rows.flatMap((r) => r.keys).find((k) => k.id === "K_A")!;

      expect(carried.flick?.n?.provenance).toBe("base-derived");
      expect(carried.flick?.s?.provenance).toBe("hand-set");
      expect(carried.multitap?.[0]?.provenance).toBe("base-derived");
      expect(carried.multitap?.[1]?.provenance).toBe("hand-set");
    });

    it("Case B: a carried-through key in a non-default layer (e.g. shift) with no existing provenance is tagged base-derived", () => {
      const existingKey = {
        nodeId: freshId("key"),
        id: "K_A",
        text: "A",
        output: "A",
      };
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [
              { id: "default", rows: [{ keys: [] }] },
              { id: "shift", rows: [{ keys: [existingKey] }] },
            ],
          },
        ],
        nodeIds: [],
      };

      const ir = makeMinimalIR({ touchLayout: existingTouchLayout });
      const result = scaffoldTouchLayout(ir);

      const phone = result.platforms.find((p) => p.id === "phone")!;
      const shiftLayer = phone.layers.find((l) => l.id === "shift")!;
      const carried = shiftLayer.rows.flatMap((r) => r.keys).find((k) => k.id === "K_A");

      expect(carried?.provenance).toBe("base-derived");
    });

    it("emitted wire JSON contains no 'provenance' key anywhere", () => {
      const rule = makeCharRule("K_A", [], "a");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });
      const result = scaffoldTouchLayout(ir);

      const json = emitTouchLayout(result);

      expect(json).not.toContain("provenance");

      // Belt-and-braces structural check: walk the parsed JSON and confirm no
      // object anywhere carries a literal "provenance" property.
      const parsed: unknown = JSON.parse(json);
      function walk(value: unknown): void {
        if (Array.isArray(value)) {
          for (const v of value) walk(v);
          return;
        }
        if (value && typeof value === "object") {
          expect(Object.prototype.hasOwnProperty.call(value, "provenance")).toBe(false);
          for (const v of Object.values(value as Record<string, unknown>)) walk(v);
        }
      }
      walk(parsed);
    });
  });

  // ---------------------------------------------------------------------------
  // buildMinimalPhoneTouchLayout — canonical compact structure
  // ---------------------------------------------------------------------------

  describe("buildMinimalPhoneTouchLayout — compact 3-layer structure", () => {
    it("returns a 3-layer phone layout (default + shift + numeric)", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      expect(phone).toBeDefined();
      const ids = phone.layers.map((l) => l.id);
      expect(ids).toContain("default");
      expect(ids).toContain("shift");
      expect(ids).toContain("numeric");
    });

    it("default layer has 4 rows", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      expect(defaultLayer.rows).toHaveLength(4);
    });

    it("every row in every layer has ≤10 keys", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      for (const layer of phone.layers) {
        for (let i = 0; i < layer.rows.length; i++) {
          const row = layer.rows[i]!;
          expect(
            row.keys.length,
            `layer "${layer.id}" row ${i} has ${row.keys.length} keys`,
          ).toBeLessThanOrEqual(10);
        }
      }
    });

    it("default layer K_SHIFT (row 2) has sp:1 nextlayer:'shift'", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const row2 = defaultLayer.rows[2]!;
      const shift = row2.keys.find((k) => k.id === "K_SHIFT");
      expect(shift?.sp).toBe(1);
      expect(shift?.nextlayer).toBe("shift");
      expect(shift?.text).toBe("*Shift*");
    });

    it("shift layer K_SHIFT (row 2) has sp:2 nextlayer:'default'", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      const shiftLayer = phone.layers.find((l) => l.id === "shift")!;
      const row2 = shiftLayer.rows[2]!;
      const shift = row2.keys.find((k) => k.id === "K_SHIFT");
      expect(shift?.sp).toBe(2);
      expect(shift?.nextlayer).toBe("default");
    });

    it("K_LOPT has text:'*Menu*', K_ENTER has text:'*Enter*'", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const funcRow = defaultLayer.rows[3]!;

      const lopt = funcRow.keys.find((k) => k.id === "K_LOPT");
      const enter = funcRow.keys.find((k) => k.id === "K_ENTER");

      expect(lopt?.text).toBe("*Menu*");
      expect(enter?.text).toBe("*Enter*");
    });

    it("default layer uses lowercase US keycaps (K_A → 'a', K_Q → 'q')", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);

      expect(allKeys.find((k) => k.id === "K_A")?.text).toBe("a");
      expect(allKeys.find((k) => k.id === "K_Q")?.text).toBe("q");
    });

    it("shift layer uses uppercase US keycaps (K_A → 'A', K_Q → 'Q')", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      const shiftLayer = phone.layers.find((l) => l.id === "shift")!;
      const allKeys = shiftLayer.rows.flatMap((r) => r.keys);

      expect(allKeys.find((k) => k.id === "K_A")?.text).toBe("A");
      expect(allKeys.find((k) => k.id === "K_Q")?.text).toBe("Q");
    });
  });

  // ---------------------------------------------------------------------------
  // augments existing touchLayout (Case B)
  // ---------------------------------------------------------------------------

  describe("augments existing touchLayout", () => {
    it("when ir.touchLayout is already set, the function returns a TouchLayoutIR without throwing", () => {
      const existingPhoneLayer = {
        id: "default",
        rows: [
          {
            keys: [
              {
                nodeId: freshId("key"),
                id: "K_A",
                text: "a",
                output: "a",
              },
            ],
          },
        ],
      };

      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [existingPhoneLayer],
          },
        ],
        nodeIds: [],
      };

      const ir = makeMinimalIR({ touchLayout: existingTouchLayout });

      let result: TouchLayoutIR | undefined;
      expect(() => {
        result = scaffoldTouchLayout(ir);
      }).not.toThrow();

      expect(result).toBeDefined();
      expect(result!.platforms).toBeDefined();
    });

    it("when ir.touchLayout has a phone platform, that platform is preserved in the result", () => {
      const existingKey = {
        nodeId: freshId("key"),
        id: "K_A",
        text: "a",
        output: "a",
      };
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [
              {
                id: "default",
                rows: [{ keys: [existingKey] }],
              },
            ],
          },
        ],
        nodeIds: [],
      };

      const ir = makeMinimalIR({ touchLayout: existingTouchLayout });
      const result = scaffoldTouchLayout(ir);

      const phone = result.platforms.find((p) => p.id === "phone");
      expect(phone).toBeDefined();
    });

    it("when ir.touchLayout is set without a phone platform, a phone platform is added", () => {
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "tablet",
            layers: [
              {
                id: "default",
                rows: [{ keys: [{ nodeId: freshId("key"), id: "K_A" }] }],
              },
            ],
          },
        ],
        nodeIds: [],
      };

      const ir = makeMinimalIR({ touchLayout: existingTouchLayout });
      const result = scaffoldTouchLayout(ir);

      const phone = result.platforms.find((p) => p.id === "phone");
      expect(phone).toBeDefined();
      const tablet = result.platforms.find((p) => p.id === "tablet");
      expect(tablet).toBeDefined();
    });

    it("when ir.touchLayout is set with existing nodeIds, they are preserved in the result", () => {
      const existingNodeEntry: [string, import("@keyboard-studio/contracts").IRNodeRef] = [
        "phone:default:K_A",
        { nodeId: "existing_node_1", kind: "rule" },
      ];
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [
              {
                id: "default",
                rows: [{ keys: [{ nodeId: "existing_node_1", id: "K_A" }] }],
              },
            ],
          },
        ],
        nodeIds: [existingNodeEntry],
      };

      const ir = makeMinimalIR({ touchLayout: existingTouchLayout });
      const result = scaffoldTouchLayout(ir);

      expect(result.nodeIds).toContainEqual(existingNodeEntry);
    });

    it("augments sk[] from S-02 deadkey patterns into the existing phone platform's default layer", () => {
      const vkey = "K_E";
      const successorChar = "ê";
      const ownedNodeId = freshId("rule");

      const existingKey = {
        nodeId: freshId("key"),
        id: vkey,
        text: "e",
        output: "e",
      };
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [
              {
                id: "default",
                rows: [{ keys: [existingKey] }],
              },
            ],
          },
        ],
        nodeIds: [],
      };

      const deadkeyRule: IRRule = {
        nodeId: ownedNodeId,
        context: [
          { kind: "deadkey", name: "dk1" } as never,
          { kind: "vkey", name: vkey, modifiers: [] },
        ],
        output: [{ kind: "char", value: successorChar }],
      };

      const pattern = makeS02Pattern(vkey, successorChar, ownedNodeId);
      const ir = makeMinimalIR({
        groups: [makeGroup([deadkeyRule])],
        recognizedPatterns: [pattern],
        touchLayout: existingTouchLayout,
      });

      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey);

      expect(targetKey).toBeDefined();
      expect(targetKey?.sk).toBeDefined();
      expect(targetKey?.sk?.length).toBeGreaterThan(0);
      const skTexts = targetKey?.sk?.map((s) => s.text);
      expect(skTexts).toContain(successorChar);
    });
  });
});
