import { describe, it, expect } from "vitest";
import {
  scaffoldTouchLayout,
  scaffoldTouchLayoutWithDiagnostics,
  buildMinimalPhoneTouchLayout,
} from "./scaffoldTouchLayout.js";
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

    // -------------------------------------------------------------------------
    // Defect 4 fix: US_KEYCAPS must not fabricate a letter for a layer the
    // base never assigned on a vkey it DID otherwise assign.
    // -------------------------------------------------------------------------

    it("a vkey the base assigns ONLY on shift gets a blank (not fabricated) default-layer key — the base never assigned this physical key's default form", () => {
      const rule = makeCharRule("K_A", ["SHIFT"], "A");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const kaKey = allKeys.find((k) => k.id === "K_A")!;

      // No fabricated 'a' fallback text/output — the base assigned this
      // physical key (on shift), so absence on default means "not defined
      // here", not "invent a US keycap".
      expect(kaKey.text).toBeUndefined();
      expect(kaKey.output).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Defect 3 fix: multi-char output (digraph / base+combining-mark sequence)
  // must survive intact, not get truncated to the first char element.
  // ---------------------------------------------------------------------------

  describe("multi-char output preservation (defect 3 fix)", () => {
    it("a rule with two consecutive kind:char output elements produces the full concatenated string on its touch key", () => {
      const rule: IRRule = {
        nodeId: freshId("rule"),
        context: [{ kind: "vkey", name: "K_N", modifiers: [] }],
        output: [
          { kind: "char", value: "n" },
          { kind: "char", value: "y" },
        ],
      };
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const nKey = allKeys.find((k) => k.id === "K_N");

      expect(nKey?.text).toBe("ny");
      expect(nKey?.output).toBe("ny");
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

    // -------------------------------------------------------------------------
    // BUG 1 fix: a generated altgr layer must actually be reachable — a
    // dedicated toggle key (T_ks_altgr_toggle) replaces the row-1 trailing
    // spacer on default/shift (nextlayer:"altgr") and on altgr itself
    // (nextlayer:"default"), ONLY when hasAltgr is true; the no-altgr case
    // keeps the plain spacer so the row-count tests (ASDF row spacer, above)
    // stay green.
    // -------------------------------------------------------------------------

    it("default layer row 1 trailing key is the altgr toggle (sp:1, nextlayer:'altgr') when hasAltgr", () => {
      const rule = makeCharRule("K_A", ["RALT"], "à");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const row1 = defaultLayer.rows[1]!;
      const toggle = row1.keys.find((k) => k.id === "T_ks_altgr_toggle");

      expect(toggle).toBeDefined();
      expect(toggle?.text).toBe("*RAlt*");
      expect(toggle?.sp).toBe(1);
      expect(toggle?.nextlayer).toBe("altgr");
      expect(row1.keys).toHaveLength(10);
    });

    it("shift layer row 1 trailing key is also the altgr toggle when hasAltgr", () => {
      const rule = makeCharRule("K_A", ["RALT"], "à");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const shiftLayer = getLayer(result, "shift")!;
      const row1 = shiftLayer.rows[1]!;
      const toggle = row1.keys.find((k) => k.id === "T_ks_altgr_toggle");

      expect(toggle).toBeDefined();
      expect(toggle?.sp).toBe(1);
      expect(toggle?.nextlayer).toBe("altgr");
    });

    it("altgr layer row 1 trailing key returns to default (sp:2, nextlayer:'default')", () => {
      const rule = makeCharRule("K_A", ["RALT"], "à");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const altgrLayer = getLayer(result, "altgr")!;
      const row1 = altgrLayer.rows[1]!;
      const toggle = row1.keys.find((k) => k.id === "T_ks_altgr_toggle");

      expect(toggle).toBeDefined();
      expect(toggle?.text).toBe("*RAlt*");
      expect(toggle?.sp).toBe(2);
      expect(toggle?.nextlayer).toBe("default");
      expect(row1.keys).toHaveLength(10);
    });

    it("altgr toggle key is ABSENT (plain spacer instead) when there is no altgr layer", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const row1 = defaultLayer.rows[1]!;

      expect(row1.keys.find((k) => k.id === "T_ks_altgr_toggle")).toBeUndefined();
      expect(row1.keys.find((k) => k.id === "T_ks_sp_default")).toBeDefined();
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
  // Defect 1 fix: trigger/continuation split (canonical store()+dk()+index()
  // S-02 shape) — a "body" rule with context [deadkey, any(baseStore)] and
  // output [index(outStore, offset)] has NO vkey of its own and NO direct
  // char output, so the old single-rule-only logic rejected it outright and
  // produced empty sk[]. Regression-locks that the fix resolves the index
  // output against the referenced store and attaches the decorated form to
  // the vkey that actually produces the base letter.
  // ---------------------------------------------------------------------------

  describe("deadkey → sk[] (trigger/continuation split — defect 1 fix)", () => {
    it("a body rule with context [deadkey, any(baseStore)] and output [index(outStore, offset)] yields non-empty sk[] on the base letter's own key", () => {
      const baseVkey = "K_E";
      const baseChar = "e";
      const accentedChar = "è";

      const baseStoreNodeId = freshId("store");
      const outStoreNodeId = freshId("store");
      const bodyRuleNodeId = freshId("rule");

      // The desktop rule that actually produces the base letter 'e' on K_E —
      // this is what the fix's charToVkey reverse-lookup resolves against.
      const baseLetterRule = makeCharRule(baseVkey, [], baseChar);

      // The canonical S-02 "body"/continuation rule: no vkey, no direct char
      // output — context is [dk, any(baseStore)], output is index(outStore).
      const bodyRule: IRRule = {
        nodeId: bodyRuleNodeId,
        context: [
          { kind: "deadkey", id: 1 },
          { kind: "any", storeRef: "s_grave_base" },
        ],
        output: [{ kind: "index", storeRef: "s_grave_out", offset: 2 }],
      };

      const pattern: Pattern = {
        id: "test_s02_split_pattern",
        title: "Split-shape deadkey",
        description: "Canonical trigger/continuation S-02 pattern",
        category: "desktop",
        appliesTo: [],
        strategyId: "S-02",
        origin: "recognized",
        ownedNodes: [{ nodeId: bodyRuleNodeId, kind: "rule" }],
        questions: [],
        kmnFragment:
          "+ [K_GRAVE] > dk(grave)\ndk(grave) + any(s_grave_base) > index(s_grave_out, 2)",
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "test",
        reviewDate: "2026-06-18",
      };

      const ir = makeMinimalIR({
        groups: [makeGroup([baseLetterRule, bodyRule])],
        stores: [
          {
            nodeId: baseStoreNodeId,
            name: "s_grave_base",
            items: [{ kind: "char", value: baseChar }],
            isSystem: false,
          },
          {
            nodeId: outStoreNodeId,
            name: "s_grave_out",
            items: [{ kind: "char", value: accentedChar }],
            isSystem: false,
          },
        ],
        recognizedPatterns: [pattern],
      });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === baseVkey);

      expect(targetKey).toBeDefined();
      expect(targetKey?.sk).toBeDefined();
      expect(targetKey?.sk?.length).toBeGreaterThan(0);
      expect(targetKey?.sk?.map((s) => s.text)).toContain(accentedChar);
    });
  });

  // ---------------------------------------------------------------------------
  // QC follow-up: the kmnFragment-regex "last resort" fallback in
  // buildDeadkeySuccessors — the branch that runs ONLY when a recognized S-02
  // pattern's ownedNodes is empty (or its owned rules match neither the
  // collapsed nor the trigger/continuation shape) — had no regression test.
  // This drives that exact branch: ownedNodes is empty, so the ownedNodes scan
  // never sets matchedFromOwnedNodes, forcing the kmnFragment text scan to run.
  // The fallback resolves the triggering vkey from the "key-name" question's
  // resolved answer (`q.default`) — NOT the unresolved `{{slotId}}` placeholder
  // text still present in kmnFragment — so the successor lands on the real key.
  // ---------------------------------------------------------------------------

  describe("deadkey → sk[] (kmnFragment-regex last-resort fallback)", () => {
    it("a S-02 pattern with empty ownedNodes yields sk[] on the resolved trigger vkey via the kmnFragment text scan", () => {
      const vkey = "K_E";
      const successorChar = "é";

      const pattern: Pattern = {
        id: "test_s02_fallback_pattern",
        title: "Fallback-shape deadkey",
        description: "No ownedNodes — must fall back to the kmnFragment text scan",
        category: "desktop",
        appliesTo: [],
        strategyId: "S-02",
        origin: "recognized",
        ownedNodes: [],
        questions: [
          {
            id: "triggerKey",
            prompt: "Virtual key that triggers the deadkey state",
            answerType: "key-name",
            default: vkey,
          },
        ],
        // Collapsed single-rule shape: the triggerKey vkey directly outputs a
        // quoted char literal — the shape this fallback's regex scan expects.
        kmnFragment: `+ [{{triggerKey}}] > '${successorChar}'`,
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "test",
        reviewDate: "2026-07-28",
      };

      const ir = makeMinimalIR({ recognizedPatterns: [pattern] });
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey);

      expect(targetKey).toBeDefined();
      expect(targetKey?.sk).toBeDefined();
      expect(targetKey?.sk?.map((s) => s.text)).toContain(successorChar);
    });
  });

  // ---------------------------------------------------------------------------
  // Defect 2 fix: characters produced on a vkey outside the compact
  // skeleton's 26 letter slots (e.g. K_QUOTE, K_BKQUOTE) must never be
  // silently dropped — they are spilled onto the sk[] of the nearest
  // occupied slot key, or (with no known physical neighbor) onto the space
  // bar's "extras" longpress menu.
  // ---------------------------------------------------------------------------

  describe("overflow spilling for non-slot vkeys (defect 2 fix)", () => {
    it("a character produced on a non-QWERTY-slot vkey (K_QUOTE) is not dropped — it lands on the nearest slot key's (K_L) sk[]", () => {
      const overflowChar = "ʼ"; // MODIFIER LETTER APOSTROPHE (saltillo)
      const rule = makeCharRule("K_QUOTE", [], overflowChar);
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);

      // Never dropped: the character appears somewhere in the default layer.
      const foundOnAnyKey = allKeys.some((k) => k.sk?.some((s) => s.text === overflowChar));
      expect(foundOnAnyKey).toBe(true);

      // Placed on the documented nearest-neighbor slot (K_L).
      const klKey = allKeys.find((k) => k.id === "K_L");
      expect(klKey?.sk?.some((s) => s.text === overflowChar)).toBe(true);
    });

    it("a character produced on a vkey with no known physical neighbor lands on the space bar's extras sk[] rather than being dropped", () => {
      const overflowChar = "ʔ"; // LATIN LETTER GLOTTAL STOP
      const rule = makeCharRule("K_oE2", [], overflowChar);
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const funcRow = defaultLayer.rows[3]!;
      const spaceKey = funcRow.keys.find((k) => k.id === "K_SPACE");

      expect(spaceKey?.sk?.some((s) => s.text === overflowChar)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // BUG 2 fix: an unplaced overflow character (no OVERFLOW_NEAREST_SLOT
  // neighbor) is classified before falling back to the space bar's "extras"
  // grouping — a combining mark routes to the sk[] of the vkey producing the
  // base letter it decorates, and a punctuation/symbol char routes to the
  // numeric layer, instead of both being dumped onto the space bar.
  // ---------------------------------------------------------------------------

  describe("overflow classification — marks and punctuation route off the space bar (BUG 2 fix)", () => {
    it("an unplaced combining mark attaches as a longpress option under its typical base letter's key (static fallback table), not the space bar", () => {
      const mark = "́"; // COMBINING ACUTE ACCENT — MARK_FALLBACK_VKEY maps this to K_E
      const rule = makeCharRule("K_oMark1", [], mark);
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const { layout, unplacedChars } = scaffoldTouchLayoutWithDiagnostics(ir);
      const defaultLayer = layout.platforms
        .find((p) => p.id === "phone")!
        .layers.find((l) => l.id === "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);

      const keKey = allKeys.find((k) => k.id === "K_E");
      expect(keKey?.sk?.some((s) => s.text === mark)).toBe(true);

      const funcRow = defaultLayer.rows[3]!;
      const spaceKey = funcRow.keys.find((k) => k.id === "K_SPACE");
      expect(spaceKey?.sk?.some((s) => s.text === mark) ?? false).toBe(false);
      expect(unplacedChars).not.toContain(mark);
    });

    it("an unplaced combining mark resolves via an already-known composed form in the IR (resolveDiacriticBaseVkey), not just the static fallback", () => {
      // K_QUOTE already produces the composed form "é" (base 'e' + this exact
      // mark) somewhere in the IR; the mark itself is produced, unplaced, on
      // a vkey with no compact slot and no OVERFLOW_NEAREST_SLOT neighbor.
      // resolveDiacriticBaseVkey must find "é" via decomposeGrapheme, take
      // its base 'e', and resolve K_E (the vkey that actually produces 'e')
      // — NOT K_QUOTE (which produces the composed form, not the bare 'e').
      const mark = "́"; // COMBINING ACUTE ACCENT
      const rules = [
        makeCharRule("K_E", [], "e"),
        makeCharRule("K_QUOTE", [], "é"),
        makeCharRule("K_oMark2", [], mark),
      ];
      const ir = makeMinimalIR({ groups: [makeGroup(rules)] });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);

      const keKey = allKeys.find((k) => k.id === "K_E");
      expect(keKey?.sk?.some((s) => s.text === mark)).toBe(true);
    });

    it("an unplaced punctuation character routes to the numeric layer's nearest literal key, not the space bar", () => {
      const punct = ";"; // NUMERIC_NEAREST_SLOT maps this to the "_" key
      const rule = makeCharRule("K_oPunct1", [], punct);
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const numericLayer = getLayer(result, "numeric")!;
      const allNumKeys = numericLayer.rows.flatMap((r) => r.keys);
      const underscoreKey = allNumKeys.find((k) => k.id === "U_005F");
      expect(underscoreKey?.sk?.some((s) => s.text === punct)).toBe(true);

      const defaultLayer = getLayer(result, "default")!;
      const funcRow = defaultLayer.rows[3]!;
      const spaceKey = funcRow.keys.find((k) => k.id === "K_SPACE");
      expect(spaceKey?.sk?.some((s) => s.text === punct) ?? false).toBe(false);
    });

    it("an unplaced punctuation char already rendered by the numeric layer's own literal keys needs no further placement (not spilled to the space bar)", () => {
      const punct = "#"; // already one of the numeric layer's hardcoded literals
      const rule = makeCharRule("K_oPunct2", [], punct);
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const { layout, unplacedChars } = scaffoldTouchLayoutWithDiagnostics(ir);
      expect(unplacedChars).not.toContain(punct);

      const defaultLayer = layout.platforms
        .find((p) => p.id === "phone")!
        .layers.find((l) => l.id === "default")!;
      const funcRow = defaultLayer.rows[3]!;
      const spaceKey = funcRow.keys.find((k) => k.id === "K_SPACE");
      expect(spaceKey?.sk?.some((s) => s.text === punct) ?? false).toBe(false);
    });

    it("a mark with no resolvable base (no IR composed form, absent from the static fallback table) still lands on the space bar's extras, tagged distinctly in unplacedChars", () => {
      const mark = "̥"; // COMBINING RING BELOW — absent from MARK_FALLBACK_VKEY
      const rule = makeCharRule("K_oMark3", [], mark);
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const { layout, unplacedChars } = scaffoldTouchLayoutWithDiagnostics(ir);
      const defaultLayer = layout.platforms
        .find((p) => p.id === "phone")!
        .layers.find((l) => l.id === "default")!;
      const funcRow = defaultLayer.rows[3]!;
      const spaceKey = funcRow.keys.find((k) => k.id === "K_SPACE");

      expect(spaceKey?.sk?.some((s) => s.text === mark)).toBe(true);
      expect(
        unplacedChars.some((u) => u.includes(mark) && u.includes("no resolvable base letter")),
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // BUG 3 fix: relatedness validation lives INSIDE addSuccessor, so both the
  // accurate owned-rule (store-pair) path and the kmnFragment-regex fallback
  // path reject a candidate successor that isn't actually a diacritic
  // variant of the vkey's own base letter (ASCII digits, Unicode No-category
  // fractions, and stray punctuation are rejected outright).
  // ---------------------------------------------------------------------------

  describe("addSuccessor relatedness validation (BUG 3 fix)", () => {
    it("K_E-style regression: digits/fraction/punctuation are rejected from sk[] via the accurate store-pair path, while a genuine case-variant of the vkey's own base letter (schwa/Schwa) survives", () => {
      const baseVkey = "K_E";
      const baseChar = "ə"; // this keyboard's K_E key itself produces schwa
      const bodyRuleNodeId = freshId("rule");
      const baseLetterRule = makeCharRule(baseVkey, [], baseChar);
      const bodyRule: IRRule = {
        nodeId: bodyRuleNodeId,
        context: [
          { kind: "deadkey", id: 1 } as never,
          { kind: "any", storeRef: "s_garbled_base" },
        ],
        output: [{ kind: "index", storeRef: "s_garbled_out", offset: 2 }],
      };

      const pattern: Pattern = {
        id: "test_s02_garbled",
        title: "Garbled deadkey (K_E regression)",
        description: "Reproduces the reported K_E sk = ə,Ə,3,#,¾ garbling",
        category: "desktop",
        appliesTo: [],
        strategyId: "S-02",
        origin: "recognized",
        ownedNodes: [{ nodeId: bodyRuleNodeId, kind: "rule" }],
        questions: [],
        kmnFragment: "+ [K_TILDE] > dk(x)\ndk(x) + any(s_garbled_base) > index(s_garbled_out, 2)",
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "test",
        reviewDate: "2026-07-28",
      };

      const ir = makeMinimalIR({
        groups: [makeGroup([baseLetterRule, bodyRule])],
        stores: [
          {
            nodeId: freshId("store"),
            name: "s_garbled_base",
            items: [
              { kind: "char", value: baseChar },
              { kind: "char", value: baseChar },
              { kind: "char", value: baseChar },
              { kind: "char", value: baseChar },
            ],
            isSystem: false,
          },
          {
            nodeId: freshId("store"),
            name: "s_garbled_out",
            items: [
              { kind: "char", value: "Ə" },
              { kind: "char", value: "3" },
              { kind: "char", value: "#" },
              { kind: "char", value: "¾" },
            ],
            isSystem: false,
          },
        ],
        recognizedPatterns: [pattern],
      });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const keKey = allKeys.find((k) => k.id === baseVkey)!;

      const skTexts = keKey.sk?.map((s) => s.text) ?? [];
      expect(skTexts).toContain("Ə");
      expect(skTexts).not.toContain("3");
      expect(skTexts).not.toContain("#");
      expect(skTexts).not.toContain("¾");
    });

    it("K_E-style regression via the kmnFragment fallback path: digits/fraction/punctuation leaking from an unrelated line are rejected", () => {
      const vkey = "K_E";

      const pattern: Pattern = {
        id: "test_s02_fallback_garbled",
        title: "Fallback-shape garbled deadkey",
        description: "No ownedNodes — exercises the kmnFragment-regex fallback",
        category: "desktop",
        appliesTo: [],
        strategyId: "S-02",
        origin: "recognized",
        ownedNodes: [],
        questions: [
          {
            id: "triggerKey",
            prompt: "Virtual key that triggers the deadkey state",
            answerType: "key-name",
            default: vkey,
          },
        ],
        // The real successor line for this slot, plus an UNRELATED line
        // (a different vkey's rule) that happens to mention the same
        // placeholder text on its OUTPUT side — under the old
        // "match anywhere in the line" scan this line contaminated the
        // slot's successors with '3'/'#'/'¾'; the fix requires the
        // placeholder to appear on the CONTEXT side (left of the first '>').
        kmnFragment:
          "+ [{{triggerKey}}] > 'ə'\n" + "+ [K_9] > '3' '#' '¾' {{triggerKey}}",
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "test",
        reviewDate: "2026-07-28",
      };

      const ir = makeMinimalIR({ recognizedPatterns: [pattern] });
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey)!;

      const skTexts = targetKey.sk?.map((s) => s.text) ?? [];
      expect(skTexts).toContain("ə");
      expect(skTexts).not.toContain("3");
      expect(skTexts).not.toContain("#");
      expect(skTexts).not.toContain("¾");
    });

    it("kmnFragment fallback: a contaminating line whose placeholder text appears only on the OUTPUT side (not the context side) is not scanned for this slot", () => {
      const vkey = "K_E";

      const pattern: Pattern = {
        id: "test_s02_context_side_only",
        title: "Context-side-only fallback isolation",
        description: "Proves the {{slotId}} match is required on the context side, not anywhere in the line",
        category: "desktop",
        appliesTo: [],
        strategyId: "S-02",
        origin: "recognized",
        ownedNodes: [],
        questions: [
          {
            id: "triggerKey",
            prompt: "Virtual key that triggers the deadkey state",
            answerType: "key-name",
            default: vkey,
          },
        ],
        // Line 2's context ("+ [K_9]") never mentions the slot placeholder —
        // it only appears on the OUTPUT side, alongside an unrelated letter
        // ('q'). Category validation alone would not catch this (a bare
        // letter passes when the base char is unknown), so this exercises
        // the context-side-only line-scan fix specifically.
        kmnFragment:
          "+ [{{triggerKey}}] > 'ə'\n" + "+ [K_9] > 'q' {{triggerKey}}",
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "test",
        reviewDate: "2026-07-28",
      };

      const ir = makeMinimalIR({ recognizedPatterns: [pattern] });
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey)!;

      const skTexts = targetKey.sk?.map((s) => s.text) ?? [];
      expect(skTexts).toContain("ə");
      expect(skTexts).not.toContain("q");
    });
  });

  // ---------------------------------------------------------------------------
  // BUG 3 FINISH — the relatedness filter that already guarded the deadkey-
  // successor path (addSuccessor / isValidSuccessorChar, above) is now also
  // applied to collectOverflowEntries' OVERFLOW_NEAREST_SLOT routing: a
  // number-row vkey (K_1..K_0, and its shift/AltGr symbol variants) must
  // never spill onto a top-row letter's sk[] — only the numeric/symbol layer
  // — even though OVERFLOW_NEAREST_SLOT lists a physical letter neighbor for
  // it. Also covers the QC follow-ups: no-silent-drops diagnostics for a
  // rejected deadkey successor, and Unicode (non-ASCII) digit rejection.
  // ---------------------------------------------------------------------------

  describe("overflow-path digit/symbol routing (BUG 3 finish)", () => {
    it("K_E regression via the overflow path: holding 'e' no longer shows the K_3 key's 3/#/¾ on its sk[]", () => {
      const rules = [
        makeCharRule("K_E", [], "e"),
        makeCharRule("K_3", [], "3"),
        makeCharRule("K_3", ["SHIFT"], "#"),
        makeCharRule("K_3", ["RALT"], "¾"),
      ];
      const ir = makeMinimalIR({ groups: [makeGroup(rules)] });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const keKey = allKeys.find((k) => k.id === "K_E")!;

      const skTexts = keKey.sk?.map((s) => s.text) ?? [];
      expect(skTexts).not.toContain("3");
      expect(skTexts).not.toContain("#");
      expect(skTexts).not.toContain("¾");
    });

    it("a number-row char (shift variant '!' from K_1) routes to the numeric layer's nearest literal key, not onto its physical letter neighbor's (K_Q) sk[]", () => {
      const rules = [
        makeCharRule("K_1", [], "1"),
        makeCharRule("K_1", ["SHIFT"], "!"),
      ];
      const ir = makeMinimalIR({ groups: [makeGroup(rules)] });

      const result = scaffoldTouchLayout(ir);

      const defaultLayer = getLayer(result, "default")!;
      const qKey = defaultLayer.rows.flatMap((r) => r.keys).find((k) => k.id === "K_Q");
      expect(qKey?.sk?.some((s) => s.text === "!") ?? false).toBe(false);

      const numericLayer = getLayer(result, "numeric")!;
      const oneKey = numericLayer.rows.flatMap((r) => r.keys).find((k) => k.text === "1");
      expect(oneKey?.sk?.some((s) => s.text === "!")).toBe(true);
    });

    it("[QC P1] a rejected deadkey-successor candidate is surfaced in unplacedChars (tagged 'rejected from <vkey> longpress'), not silently dropped", () => {
      const baseVkey = "K_E";
      const baseChar = "ə";
      const bodyRuleNodeId = freshId("rule");
      const baseLetterRule = makeCharRule(baseVkey, [], baseChar);
      const bodyRule: IRRule = {
        nodeId: bodyRuleNodeId,
        context: [
          { kind: "deadkey", id: 1 } as never,
          { kind: "any", storeRef: "s_garbled_base2" },
        ],
        output: [{ kind: "index", storeRef: "s_garbled_out2", offset: 2 }],
      };

      const pattern: Pattern = {
        id: "test_s02_garbled_diagnostics",
        title: "Garbled deadkey (rejection diagnostics)",
        description: "Same garbling regression, checked via the diagnostics channel",
        category: "desktop",
        appliesTo: [],
        strategyId: "S-02",
        origin: "recognized",
        ownedNodes: [{ nodeId: bodyRuleNodeId, kind: "rule" }],
        questions: [],
        kmnFragment: "+ [K_TILDE] > dk(x)\ndk(x) + any(s_garbled_base2) > index(s_garbled_out2, 2)",
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "test",
        reviewDate: "2026-07-28",
      };

      const ir = makeMinimalIR({
        groups: [makeGroup([baseLetterRule, bodyRule])],
        stores: [
          {
            nodeId: freshId("store"),
            name: "s_garbled_base2",
            items: [{ kind: "char", value: baseChar }],
            isSystem: false,
          },
          {
            nodeId: freshId("store"),
            name: "s_garbled_out2",
            items: [{ kind: "char", value: "3" }],
            isSystem: false,
          },
        ],
        recognizedPatterns: [pattern],
      });

      const { layout, unplacedChars } = scaffoldTouchLayoutWithDiagnostics(ir);
      const defaultLayer = layout.platforms
        .find((p) => p.id === "phone")!
        .layers.find((l) => l.id === "default")!;
      const keKey = defaultLayer.rows.flatMap((r) => r.keys).find((k) => k.id === baseVkey)!;

      expect(keKey.sk?.some((s) => s.text === "3") ?? false).toBe(false);
      expect(
        unplacedChars.some((u) => u.includes("3") && u.includes(`rejected from ${baseVkey} longpress`)),
      ).toBe(true);
    });

    it("[QC P2] a non-ASCII (Unicode) decimal digit is rejected from a letter's sk[], not just ASCII 0-9", () => {
      const baseVkey = "K_E";
      const baseChar = "ə";
      const nonAsciiDigit = "٣"; // ARABIC-INDIC DIGIT THREE (U+0663), category Nd
      const bodyRuleNodeId = freshId("rule");
      const baseLetterRule = makeCharRule(baseVkey, [], baseChar);
      const bodyRule: IRRule = {
        nodeId: bodyRuleNodeId,
        context: [
          { kind: "deadkey", id: 1 } as never,
          { kind: "any", storeRef: "s_nonascii_base" },
        ],
        output: [{ kind: "index", storeRef: "s_nonascii_out", offset: 2 }],
      };

      const pattern: Pattern = {
        id: "test_s02_nonascii_digit",
        title: "Non-ASCII digit successor",
        description: "A Unicode decimal digit outside ASCII must still be rejected",
        category: "desktop",
        appliesTo: [],
        strategyId: "S-02",
        origin: "recognized",
        ownedNodes: [{ nodeId: bodyRuleNodeId, kind: "rule" }],
        questions: [],
        kmnFragment: "+ [K_TILDE] > dk(y)\ndk(y) + any(s_nonascii_base) > index(s_nonascii_out, 2)",
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "test",
        reviewDate: "2026-07-28",
      };

      const ir = makeMinimalIR({
        groups: [makeGroup([baseLetterRule, bodyRule])],
        stores: [
          {
            nodeId: freshId("store"),
            name: "s_nonascii_base",
            items: [{ kind: "char", value: baseChar }],
            isSystem: false,
          },
          {
            nodeId: freshId("store"),
            name: "s_nonascii_out",
            items: [{ kind: "char", value: nonAsciiDigit }],
            isSystem: false,
          },
        ],
        recognizedPatterns: [pattern],
      });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const keKey = defaultLayer.rows.flatMap((r) => r.keys).find((k) => k.id === baseVkey)!;

      const skTexts = keKey.sk?.map((s) => s.text) ?? [];
      expect(skTexts).not.toContain(nonAsciiDigit);
    });
  });

  // ---------------------------------------------------------------------------
  // P1 fix: unplaced/spilled overflow characters must be surfaced as
  // structured data (not console-only) so a UI caller (the studio's live
  // reseed preview) can render an advisory note. scaffoldTouchLayout's own
  // signature is unchanged (still returns a bare TouchLayoutIR); the new
  // sibling scaffoldTouchLayoutWithDiagnostics exposes `unplacedChars`.
  // ---------------------------------------------------------------------------

  describe("scaffoldTouchLayoutWithDiagnostics — unplacedChars structured data", () => {
    it("returns the same layout as scaffoldTouchLayout for an IR with no overflow", () => {
      const ir = makeMinimalIR();
      const plain = scaffoldTouchLayout(ir);
      const { layout, unplacedChars } = scaffoldTouchLayoutWithDiagnostics(ir);

      expect(layout).toEqual(plain);
      expect(unplacedChars).toEqual([]);
    });

    it("unplacedChars contains a character spilled onto the space bar's extras sk[] (no known physical neighbor)", () => {
      const overflowChar = "ʔ"; // LATIN LETTER GLOTTAL STOP — same fixture as the defect 2 regression above
      const rule = makeCharRule("K_oE2", [], overflowChar);
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const { unplacedChars } = scaffoldTouchLayoutWithDiagnostics(ir);

      expect(unplacedChars).toContain(overflowChar);
    });

    it("unplacedChars is empty for a character routed to a nearest-neighbor slot (not the extras grouping)", () => {
      const overflowChar = "ʼ"; // MODIFIER LETTER APOSTROPHE — routes to K_L, not extras
      const rule = makeCharRule("K_QUOTE", [], overflowChar);
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const { unplacedChars } = scaffoldTouchLayoutWithDiagnostics(ir);

      expect(unplacedChars).toEqual([]);
    });

    it("unplacedChars is populated when a phone platform is synthesized onto an existing non-phone touchLayout", () => {
      const overflowChar = "ʔ";
      const rule = makeCharRule("K_oE2", [], overflowChar);
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "tablet",
            layers: [{ id: "default", rows: [{ keys: [{ nodeId: freshId("key"), id: "K_A" }] }] }],
          },
        ],
        nodeIds: [],
      };
      const ir = makeMinimalIR({ groups: [makeGroup([rule])], touchLayout: existingTouchLayout });

      const { unplacedChars } = scaffoldTouchLayoutWithDiagnostics(ir);

      expect(unplacedChars).toContain(overflowChar);
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
