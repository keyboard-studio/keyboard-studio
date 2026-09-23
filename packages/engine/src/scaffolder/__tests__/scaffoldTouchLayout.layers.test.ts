// scaffoldTouchLayout tests — phone layer structure: empty IR, compact rows, layer switches, key text, numeric and functional rows, spacers.
// Split from the former single scaffoldTouchLayout.test.ts; shared builders live
// in ./scaffoldTouchLayoutHelpers.ts.

import { describe, it, expect } from "vitest";
import {
  scaffoldTouchLayout,
  buildMinimalPhoneTouchLayout,
} from "../scaffoldTouchLayout.js";
import type { IRRule } from "@keyboard-studio/contracts";
import {
  freshId,
  makeMinimalIR,
  makeCharRule,
  makeGroup,
  getLayer,
} from "./scaffoldTouchLayoutHelpers.js";

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

    it("numeric row 2 last key is K_BKSP at keyIndex 9 with sp:1 and no width (matches default/shift/rightalt)", () => {
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
  // rightalt layer
  // ---------------------------------------------------------------------------
});
