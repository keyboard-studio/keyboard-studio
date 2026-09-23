// scaffoldTouchLayout tests — rightalt / rightalt-shift layers and their toggle wiring.
// Split from the former single scaffoldTouchLayout.test.ts; shared builders live
// in ./scaffoldTouchLayoutHelpers.ts.

import { describe, it, expect } from "vitest";
import {
  scaffoldTouchLayout,
} from "../scaffoldTouchLayout.js";
import type {
  KeyboardIR,
} from "@keyboard-studio/contracts";
import {
  makeMinimalIR,
  makeCharRule,
  makeGroup,
  getLayer,
  assertNoDanglingNextlayer,
} from "./scaffoldTouchLayoutHelpers.js";

describe("scaffoldTouchLayout", () => {
  describe("rightalt layer", () => {
    it("IR with an RALT-modified key produces a rightalt layer", () => {
      const rule = makeCharRule("K_A", ["RALT"], "à");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      expect(getLayer(result, "rightalt")).toBeDefined();
    });

    it("rightalt layer carries the correct output for the RALT key", () => {
      const rule = makeCharRule("K_A", ["RALT"], "à");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const rightaltLayer = getLayer(result, "rightalt")!;
      const allKeys = rightaltLayer.rows.flatMap((r) => r.keys);
      const kaKey = allKeys.find((k) => k.id === "K_A");
      expect(kaKey).toBeDefined();
      expect(kaKey?.output).toBe("à");
    });

    it("IR without any RALT keys does NOT produce a rightalt layer", () => {
      const rules = [
        makeCharRule("K_A", [], "a"),
        makeCharRule("K_A", ["SHIFT"], "A"),
        makeCharRule("K_B", [], "b"),
      ];
      const ir = makeMinimalIR({ groups: [makeGroup(rules)] });

      const result = scaffoldTouchLayout(ir);
      expect(getLayer(result, "rightalt")).toBeUndefined();
    });

    it("RALT+SHIFT combination is mapped to a reachable rightalt-shift touch layer carrying the uppercase form", () => {
      const raltShiftRule = makeCharRule("K_A", ["RALT", "SHIFT"], "Ä");
      const ir = makeMinimalIR({ groups: [makeGroup([raltShiftRule])] });

      const result = scaffoldTouchLayout(ir);
      // No plain rightalt layer — the fixture has no RALT-only rule. This is
      // the hasRightAlt=false / hasRightAltShift=true graph-stranding case.
      expect(getLayer(result, "rightalt")).toBeUndefined();

      const rightaltShiftLayer = getLayer(result, "rightalt-shift");
      expect(rightaltShiftLayer).toBeDefined();
      const allKeys = rightaltShiftLayer!.rows.flatMap((r) => r.keys);
      const kaKey = allKeys.find((k) => k.id === "K_A");
      expect(kaKey).toBeDefined();
      expect(kaKey?.output).toBe("Ä");

      // REACHABILITY (not just layer/key presence): some emitted key across
      // ALL layers must actually have nextlayer === "rightalt-shift", or the
      // layer above is dead weight in the compiled keyboard.
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const allKeysAllLayers = phone.layers.flatMap((l) => l.rows.flatMap((r) => r.keys));
      const entryToRightAltShift = allKeysAllLayers.some((k) => k.nextlayer === "rightalt-shift");
      expect(entryToRightAltShift).toBe(true);

      // No stranding: every nextlayer targets an emitted layer, and every
      // emitted layer (including rightalt-shift) reaches "default".
      assertNoDanglingNextlayer(result);
    });

    it("rightalt layer every row has ≤10 keys", () => {
      const rule = makeCharRule("K_A", ["RALT"], "à");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const rightaltLayer = getLayer(result, "rightalt")!;
      for (let i = 0; i < rightaltLayer.rows.length; i++) {
        const row = rightaltLayer.rows[i]!;
        expect(
          row.keys.length,
          `rightalt row ${i} has ${row.keys.length} keys (max 10)`,
        ).toBeLessThanOrEqual(10);
      }
    });

    // -------------------------------------------------------------------------
    // BUG 1 fix: a generated rightalt layer must actually be reachable — a
    // dedicated toggle key (T_ks_rightalt_toggle) replaces the row-1 trailing
    // spacer on default/shift (nextlayer:"rightalt") and on rightalt itself
    // (nextlayer:"default"), ONLY when hasRightAlt is true; the no-rightalt case
    // keeps the plain spacer so the row-count tests (ASDF row spacer, above)
    // stay green.
    // -------------------------------------------------------------------------

    it("default layer row 1 trailing key is the rightalt toggle (sp:1, nextlayer:'rightalt') when hasRightAlt", () => {
      const rule = makeCharRule("K_A", ["RALT"], "à");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const row1 = defaultLayer.rows[1]!;
      const toggle = row1.keys.find((k) => k.id === "T_ks_rightalt_toggle");

      expect(toggle).toBeDefined();
      expect(toggle?.text).toBe("*RAlt*");
      expect(toggle?.sp).toBe(1);
      expect(toggle?.nextlayer).toBe("rightalt");
      expect(row1.keys).toHaveLength(10);
    });

    it("shift layer row 1 trailing key is also the rightalt toggle when hasRightAlt", () => {
      const rule = makeCharRule("K_A", ["RALT"], "à");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const shiftLayer = getLayer(result, "shift")!;
      const row1 = shiftLayer.rows[1]!;
      const toggle = row1.keys.find((k) => k.id === "T_ks_rightalt_toggle");

      expect(toggle).toBeDefined();
      expect(toggle?.sp).toBe(1);
      expect(toggle?.nextlayer).toBe("rightalt");
    });

    it("rightalt layer row 1 trailing key returns to default (sp:2, nextlayer:'default')", () => {
      const rule = makeCharRule("K_A", ["RALT"], "à");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const rightaltLayer = getLayer(result, "rightalt")!;
      const row1 = rightaltLayer.rows[1]!;
      const toggle = row1.keys.find((k) => k.id === "T_ks_rightalt_toggle");

      expect(toggle).toBeDefined();
      expect(toggle?.text).toBe("*RAlt*");
      expect(toggle?.sp).toBe(2);
      expect(toggle?.nextlayer).toBe("default");
      expect(row1.keys).toHaveLength(10);
    });

    it("rightalt toggle key is ABSENT (plain spacer instead) when there is no rightalt layer", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const row1 = defaultLayer.rows[1]!;

      expect(row1.keys.find((k) => k.id === "T_ks_rightalt_toggle")).toBeUndefined();
      expect(row1.keys.find((k) => k.id === "T_ks_sp_default")).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // rightalt-shift layer — RALT+SHIFT combinations (uppercase special letters)
  // ---------------------------------------------------------------------------

  describe("rightalt-shift layer", () => {
    it("IR with an RALT+SHIFT-modified key produces a rightalt-shift layer", () => {
      const rule = makeCharRule("K_A", ["RALT", "SHIFT"], "Ä");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      expect(getLayer(result, "rightalt-shift")).toBeDefined();
    });

    it("rightalt-shift layer carries the correct output for the RALT+SHIFT key", () => {
      const rule = makeCharRule("K_A", ["RALT", "SHIFT"], "Ä");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const rightaltShiftLayer = getLayer(result, "rightalt-shift")!;
      const allKeys = rightaltShiftLayer.rows.flatMap((r) => r.keys);
      const kaKey = allKeys.find((k) => k.id === "K_A");
      expect(kaKey).toBeDefined();
      expect(kaKey?.output).toBe("Ä");
    });

    it("IR without any RALT+SHIFT keys does NOT produce a rightalt-shift layer", () => {
      const rules = [
        makeCharRule("K_A", [], "a"),
        makeCharRule("K_A", ["SHIFT"], "A"),
        makeCharRule("K_A", ["RALT"], "à"),
        makeCharRule("K_B", [], "b"),
      ];
      const ir = makeMinimalIR({ groups: [makeGroup(rules)] });

      const result = scaffoldTouchLayout(ir);
      expect(getLayer(result, "rightalt-shift")).toBeUndefined();
    });

    it("rightalt-shift layer every row has ≤10 keys", () => {
      const rule = makeCharRule("K_A", ["RALT", "SHIFT"], "Ä");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const rightaltShiftLayer = getLayer(result, "rightalt-shift")!;
      for (let i = 0; i < rightaltShiftLayer.rows.length; i++) {
        const row = rightaltShiftLayer.rows[i]!;
        expect(
          row.keys.length,
          `rightalt-shift row ${i} has ${row.keys.length} keys (max 10)`,
        ).toBeLessThanOrEqual(10);
      }
    });

    // -------------------------------------------------------------------------
    // Toggle wiring: every layer must reach default within a bounded number of
    // hops. The *RAlt* toggle stays a strict default<->rightalt in/out pair;
    // rightalt-shift is reached from shift (*RAlt* toggle, only when
    // hasRightAltShift) and from rightalt (its own K_SHIFT key), and reaches back to
    // shift (*RAlt* toggle) and rightalt (its own K_SHIFT key) respectively.
    // -------------------------------------------------------------------------

    it("shift layer row 1 trailing key targets rightalt-shift (sp:1) when hasRightAltShift", () => {
      // Needs a plain RALT rule too (hasRightAlt) — the row-1 trailing spacer on
      // default/shift is only replaced by the *RAlt* toggle at all when an
      // rightalt layer will be generated (unchanged guard from the rightalt-only
      // case); RALT+SHIFT alone is not a realistic keyboard shape (an
      // uppercase-only rightalt key with no lowercase form).
      const rules = [
        makeCharRule("K_A", ["RALT"], "à"),
        makeCharRule("K_A", ["RALT", "SHIFT"], "Ä"),
      ];
      const ir = makeMinimalIR({ groups: [makeGroup(rules)] });

      const result = scaffoldTouchLayout(ir);
      const shiftLayer = getLayer(result, "shift")!;
      const row1 = shiftLayer.rows[1]!;
      const toggle = row1.keys.find((k) => k.id === "T_ks_rightalt_toggle");

      expect(toggle).toBeDefined();
      expect(toggle?.text).toBe("*RAlt*");
      expect(toggle?.sp).toBe(1);
      expect(toggle?.nextlayer).toBe("rightalt-shift");
      expect(row1.keys).toHaveLength(10);
    });

    it("rightalt-shift layer row 1 trailing key returns to shift (sp:2, nextlayer:'shift')", () => {
      const rule = makeCharRule("K_A", ["RALT", "SHIFT"], "Ä");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const rightaltShiftLayer = getLayer(result, "rightalt-shift")!;
      const row1 = rightaltShiftLayer.rows[1]!;
      const toggle = row1.keys.find((k) => k.id === "T_ks_rightalt_toggle");

      expect(toggle).toBeDefined();
      expect(toggle?.text).toBe("*RAlt*");
      expect(toggle?.sp).toBe(2);
      expect(toggle?.nextlayer).toBe("shift");
      expect(row1.keys).toHaveLength(10);
    });

    it("rightalt layer's K_SHIFT key targets rightalt-shift (sp:1) when hasRightAltShift", () => {
      const rules = [
        makeCharRule("K_A", ["RALT"], "à"),
        makeCharRule("K_A", ["RALT", "SHIFT"], "Ä"),
      ];
      const ir = makeMinimalIR({ groups: [makeGroup(rules)] });

      const result = scaffoldTouchLayout(ir);
      const rightaltLayer = getLayer(result, "rightalt")!;
      const row2 = rightaltLayer.rows[2]!;
      const shiftKey = row2.keys.find((k) => k.id === "K_SHIFT");

      expect(shiftKey).toBeDefined();
      expect(shiftKey?.sp).toBe(1);
      expect(shiftKey?.nextlayer).toBe("rightalt-shift");
    });

    it("rightalt-shift layer's K_SHIFT key returns to rightalt (sp:2, nextlayer:'rightalt') when rightalt also exists", () => {
      // Needs a plain RALT rule too (hasRightAlt) — see the dedicated
      // "no plain-RALT" test below for the hasRightAlt=false case, where this
      // key must NOT dangle on a non-emitted "rightalt".
      const rules = [
        makeCharRule("K_A", ["RALT"], "à"),
        makeCharRule("K_A", ["RALT", "SHIFT"], "Ä"),
      ];
      const ir = makeMinimalIR({ groups: [makeGroup(rules)] });

      const result = scaffoldTouchLayout(ir);
      const rightaltShiftLayer = getLayer(result, "rightalt-shift")!;
      const row2 = rightaltShiftLayer.rows[2]!;
      const shiftKey = row2.keys.find((k) => k.id === "K_SHIFT");

      expect(shiftKey).toBeDefined();
      expect(shiftKey?.sp).toBe(2);
      expect(shiftKey?.nextlayer).toBe("rightalt");

      assertNoDanglingNextlayer(result);
    });

    it("rightalt-shift layer's K_SHIFT key returns to default (sp:2, nextlayer:'default') when there is NO plain-rightalt layer", () => {
      // The graph-stranding bug case: RALT+SHIFT chars but NO plain-RALT
      // chars (e.g. uppercase-only special letters) — hasRightAlt=false,
      // hasRightAltShift=true. There is no rightalt layer to "return to", so this
      // key must release straight to "default" instead of dangling on a
      // non-emitted "rightalt".
      const rule = makeCharRule("K_A", ["RALT", "SHIFT"], "Ä");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      expect(getLayer(result, "rightalt")).toBeUndefined();

      const rightaltShiftLayer = getLayer(result, "rightalt-shift")!;
      const row2 = rightaltShiftLayer.rows[2]!;
      const shiftKey = row2.keys.find((k) => k.id === "K_SHIFT");

      expect(shiftKey).toBeDefined();
      expect(shiftKey?.sp).toBe(2);
      expect(shiftKey?.nextlayer).toBe("default");
    });

    it("rightalt layer's *RAlt* toggle is unchanged (sp:2, nextlayer:'default') when rightalt-shift also exists", () => {
      const rules = [
        makeCharRule("K_A", ["RALT"], "à"),
        makeCharRule("K_A", ["RALT", "SHIFT"], "Ä"),
      ];
      const ir = makeMinimalIR({ groups: [makeGroup(rules)] });

      const result = scaffoldTouchLayout(ir);
      const rightaltLayer = getLayer(result, "rightalt")!;
      const row1 = rightaltLayer.rows[1]!;
      const toggle = row1.keys.find((k) => k.id === "T_ks_rightalt_toggle");

      expect(toggle).toBeDefined();
      expect(toggle?.sp).toBe(2);
      expect(toggle?.nextlayer).toBe("default");
    });

    it("rightalt-shift toggle key is ABSENT when there is no rightalt-shift layer", () => {
      const rule = makeCharRule("K_A", ["RALT"], "à");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const shiftLayer = getLayer(result, "shift")!;
      const row1 = shiftLayer.rows[1]!;
      const toggle = row1.keys.find((k) => k.id === "T_ks_rightalt_toggle");

      expect(toggle).toBeDefined();
      expect(toggle?.nextlayer).toBe("rightalt");
      expect(getLayer(result, "rightalt-shift")).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Graph-stranding fix: hasRightAlt=false && hasRightAltShift=true. A keyboard
  // with RALT+SHIFT characters but NO plain-RALT characters (e.g. an
  // uppercase-only special letter) — the design bug this whole fix addresses
  // assumed a rightalt layer always exists when rightalt-shift does. It doesn't.
  // ---------------------------------------------------------------------------

  describe("hasRightAlt=false && hasRightAltShift=true (no plain-RALT rule)", () => {
    function makeNoPlainRightAltIR(): KeyboardIR {
      const rule = makeCharRule("K_A", ["RALT", "SHIFT"], "Ä");
      return makeMinimalIR({ groups: [makeGroup([rule])] });
    }

    it("rightalt layer is NOT emitted", () => {
      const result = scaffoldTouchLayout(makeNoPlainRightAltIR());
      expect(getLayer(result, "rightalt")).toBeUndefined();
      expect(getLayer(result, "rightalt-shift")).toBeDefined();
    });

    it("(a) the *RAlt* entry toggle IS emitted on default AND shift, targeting an emitted layer", () => {
      const result = scaffoldTouchLayout(makeNoPlainRightAltIR());
      const emittedLayerIds = new Set(
        result.platforms.find((p) => p.id === "phone")!.layers.map((l) => l.id),
      );

      const defaultLayer = getLayer(result, "default")!;
      const defaultToggle = defaultLayer.rows[1]!.keys.find(
        (k) => k.id === "T_ks_rightalt_toggle",
      );
      expect(defaultToggle).toBeDefined();
      expect(defaultToggle?.nextlayer).toBeDefined();
      expect(emittedLayerIds.has(defaultToggle!.nextlayer!)).toBe(true);
      expect(defaultToggle?.nextlayer).toBe("rightalt-shift");

      const shiftLayer = getLayer(result, "shift")!;
      const shiftToggle = shiftLayer.rows[1]!.keys.find(
        (k) => k.id === "T_ks_rightalt_toggle",
      );
      expect(shiftToggle).toBeDefined();
      expect(shiftToggle?.nextlayer).toBeDefined();
      expect(emittedLayerIds.has(shiftToggle!.nextlayer!)).toBe(true);
      expect(shiftToggle?.nextlayer).toBe("rightalt-shift");
    });

    it("(b) no key anywhere has a nextlayer pointing to a non-emitted layer", () => {
      const result = scaffoldTouchLayout(makeNoPlainRightAltIR());
      assertNoDanglingNextlayer(result);
    });

    it("(c) rightalt-shift reaches default", () => {
      const result = scaffoldTouchLayout(makeNoPlainRightAltIR());
      const rightaltShiftLayer = getLayer(result, "rightalt-shift")!;
      const row2 = rightaltShiftLayer.rows[2]!;
      const shiftKey = row2.keys.find((k) => k.id === "K_SHIFT");
      // Direct single-hop exit to default (no rightalt layer exists to route
      // through), plus the general reachability check below.
      expect(shiftKey?.nextlayer).toBe("default");
      assertNoDanglingNextlayer(result);
    });
  });

  // ---------------------------------------------------------------------------
  // deadkey → sk[]
  // ---------------------------------------------------------------------------
});
