// scaffoldTouchLayout tests — the tablet path (platformStyle:"tablet").
// Split from the former single scaffoldTouchLayout.test.ts; shared builders live
// in ./scaffoldTouchLayoutHelpers.ts.

import { describe, it, expect } from "vitest";
import {
  scaffoldTouchLayoutWithDiagnostics,
} from "./scaffoldTouchLayout.js";
import type {
  KeyboardIR,
  IRRule,
} from "@keyboard-studio/contracts";
import {
  makeMinimalIR,
  makeCharRule,
  makeGroup,
  makeS02Pattern,
  getLayer,
  findDanglingNextlayers,
} from "./__fixtures__/touchLayout.js";

// ---------------------------------------------------------------------------
// Tablet path (platformStyle:"tablet") — reseed-from-desktop tablet-style
// derivation. An ewondo-like fixture: base letters, RALT-modified special
// letters (rightalt), an RALT+SHIFT uppercase special (rightalt-shift), and an
// S-02 deadkey pattern (acute accent) so diacritics still attach as sk[]
// longpress under their base letter, same mechanism as the phone path.
// ---------------------------------------------------------------------------

describe("scaffoldTouchLayoutWithDiagnostics — tablet path (platformStyle:\"tablet\")", () => {
  function makeEwondoLikeIR(): KeyboardIR {
    const rules: IRRule[] = [
      makeCharRule("K_A", [], "a"),
      makeCharRule("K_A", ["SHIFT"], "A"),
      makeCharRule("K_E", [], "e"),
      makeCharRule("K_E", ["SHIFT"], "E"),
      makeCharRule("K_E", ["RALT"], "ə"),
      makeCharRule("K_O", [], "o"),
      makeCharRule("K_O", ["RALT"], "ɔ"),
      makeCharRule("K_N", [], "n"),
      makeCharRule("K_N", ["RALT"], "ŋ"),
      makeCharRule("K_N", ["RALT", "SHIFT"], "Ŋ"),
    ];

    const deadkeyRule: IRRule = {
      nodeId: "rule:deadkey_body",
      context: [
        { kind: "deadkey", id: 1 } as never,
        { kind: "any", storeRef: "s_base" },
      ],
      output: [{ kind: "index", storeRef: "s_out", offset: 2 }],
    };

    const pattern = makeS02Pattern("K_E", "é", "rule:deadkey_body");

    return makeMinimalIR({
      groups: [makeGroup([...rules, deadkeyRule])],
      stores: [
        { nodeId: "store:base", name: "s_base", items: [{ kind: "char", value: "e" }], isSystem: false },
        { nodeId: "store:out", name: "s_out", items: [{ kind: "char", value: "é" }], isSystem: false },
      ],
      recognizedPatterns: [pattern],
    });
  }

  it("emits platform id 'tablet' (not 'phone')", () => {
    const ir = makeEwondoLikeIR();
    const result = scaffoldTouchLayoutWithDiagnostics(ir, "tablet");

    expect(result.layout.platforms.map((p) => p.id)).toEqual(["tablet"]);
  });

  it("default layer row 1 is the digit row (1-0 + K_BKSP)", () => {
    const ir = makeEwondoLikeIR();
    const result = scaffoldTouchLayoutWithDiagnostics(ir, "tablet");
    const defaultLayer = getLayer(result.layout, "default", "tablet")!;
    const row1 = defaultLayer.rows[0]!;

    expect(row1.keys.slice(0, 10).map((k) => k.text)).toEqual([
      "1", "2", "3", "4", "5", "6", "7", "8", "9", "0",
    ]);
    expect(row1.keys[row1.keys.length - 1]!.id).toBe("K_BKSP");
  });

  it("the T_ks_specials key exists on row 3 and points to an emitted specials layer", () => {
    const ir = makeEwondoLikeIR();
    const result = scaffoldTouchLayoutWithDiagnostics(ir, "tablet");
    const defaultLayer = getLayer(result.layout, "default", "tablet")!;
    const row3 = defaultLayer.rows[2]!;
    const specialsKey = row3.keys.find((k) => k.id === "T_ks_specials");

    expect(specialsKey).toBeDefined();
    expect(specialsKey?.width).toBe(150);
    expect(specialsKey?.nextlayer).toBeDefined();

    const emittedLayerIds = new Set(
      result.layout.platforms.find((p) => p.id === "tablet")!.layers.map((l) => l.id),
    );
    expect(emittedLayerIds.has(specialsKey!.nextlayer!)).toBe(true);
    // Self-labeled from the target layer's own produced chars (not a generic
    // fallback label), per spec item 3.
    expect(specialsKey?.text).not.toBe("*Specials*");
    expect(specialsKey?.text?.length).toBeGreaterThan(0);
  });

  it("the shift layer's row 3 also carries T_ks_specials, symmetric with default", () => {
    const ir = makeEwondoLikeIR();
    const result = scaffoldTouchLayoutWithDiagnostics(ir, "tablet");
    const defaultLayer = getLayer(result.layout, "default", "tablet")!;
    const shiftLayer = getLayer(result.layout, "shift", "tablet")!;
    const defaultRow3 = defaultLayer.rows[2]!;
    const shiftRow3 = shiftLayer.rows[2]!;
    const shiftSpecialsKey = shiftRow3.keys.find((k) => k.id === "T_ks_specials");

    expect(shiftSpecialsKey).toBeDefined();
    expect(shiftSpecialsKey?.width).toBe(150);
    // Same nextlayer target logic (hasRightAlt ? "rightalt" : "rightalt-shift") as the
    // default layer's specials key — both hop directly to the same layer.
    const defaultSpecialsKey = defaultRow3.keys.find((k) => k.id === "T_ks_specials");
    expect(shiftSpecialsKey?.nextlayer).toBe(defaultSpecialsKey?.nextlayer);

    // Row lengths match between default and shift row 3 (no 11-vs-10 key
    // asymmetry).
    expect(shiftRow3.keys.length).toBe(defaultRow3.keys.length);

    // Still dangling-free with the shift layer's specials key wired in.
    expect(findDanglingNextlayers(result.layout, "tablet")).toEqual([]);
  });

  it("rightalt letter keys carry nextlayer:\"default\" (auto-return after a tap)", () => {
    const ir = makeEwondoLikeIR();
    const result = scaffoldTouchLayoutWithDiagnostics(ir, "tablet");
    const rightaltLayer = getLayer(result.layout, "rightalt", "tablet")!;
    const oKey = rightaltLayer.rows.flatMap((r) => r.keys).find((k) => k.id === "K_O");

    expect(oKey).toBeDefined();
    expect(oKey?.output).toBe("ɔ");
    expect(oKey?.nextlayer).toBe("default");
  });

  it("rightalt-shift letter keys also carry nextlayer:\"default\"", () => {
    const ir = makeEwondoLikeIR();
    const result = scaffoldTouchLayoutWithDiagnostics(ir, "tablet");
    const rightaltShiftLayer = getLayer(result.layout, "rightalt-shift", "tablet")!;
    const nKey = rightaltShiftLayer.rows.flatMap((r) => r.keys).find((k) => k.id === "K_N");

    expect(nKey).toBeDefined();
    expect(nKey?.output).toBe("Ŋ");
    expect(nKey?.nextlayer).toBe("default");
  });

  it("diacritics are long-press (sk[]) under their base letter on the default layer", () => {
    const ir = makeEwondoLikeIR();
    const result = scaffoldTouchLayoutWithDiagnostics(ir, "tablet");
    const defaultLayer = getLayer(result.layout, "default", "tablet")!;
    const eKey = defaultLayer.rows.flatMap((r) => r.keys).find((k) => k.id === "K_E");

    expect(eKey).toBeDefined();
    expect(eKey?.sk?.some((s) => s.text === "é")).toBe(true);
  });

  it("has no dangling nextlayer references and every layer reaches default", () => {
    const ir = makeEwondoLikeIR();
    const result = scaffoldTouchLayoutWithDiagnostics(ir, "tablet");
    expect(findDanglingNextlayers(result.layout, "tablet")).toEqual([]);
  });

  // Geometry parity — the tablet default/shift layers have 5 rows (number
  // row + 2 QWERTY letter rows + Z-row + functional). The rightalt/rightalt-shift
  // layers carry the SAME digit row as default/shift (shared via
  // buildTabletNumberRow/TABLET_NUMBER_ROW_DIGITS), column-identical in both
  // slot count and content, so the number row is stable across all four tablet
  // letter layers and toggling into RAlt neither drops the top row nor blanks it.
  describe("tablet rightalt/rightalt-shift geometry parity with default/shift", () => {
    it("default and shift layers have 5 rows", () => {
      const ir = makeEwondoLikeIR();
      const result = scaffoldTouchLayoutWithDiagnostics(ir, "tablet");
      const defaultLayer = getLayer(result.layout, "default", "tablet")!;
      const shiftLayer = getLayer(result.layout, "shift", "tablet")!;
      expect(defaultLayer.rows).toHaveLength(5);
      expect(shiftLayer.rows).toHaveLength(5);
    });

    it("rightalt and rightalt-shift layers now also have 5 rows (geometry-consistent with default/shift)", () => {
      const ir = makeEwondoLikeIR();
      const result = scaffoldTouchLayoutWithDiagnostics(ir, "tablet");
      const rightaltLayer = getLayer(result.layout, "rightalt", "tablet")!;
      const rightaltShiftLayer = getLayer(result.layout, "rightalt-shift", "tablet")!;
      expect(rightaltLayer.rows).toHaveLength(5);
      expect(rightaltShiftLayer.rows).toHaveLength(5);
    });

    it("rightalt/rightalt-shift row 0 is the SAME digit row as default/shift: same slot count, same digits, trailing K_BKSP", () => {
      const ir = makeEwondoLikeIR();
      const result = scaffoldTouchLayoutWithDiagnostics(ir, "tablet");
      const defaultLayer = getLayer(result.layout, "default", "tablet")!;
      const rightaltLayer = getLayer(result.layout, "rightalt", "tablet")!;
      const rightaltShiftLayer = getLayer(result.layout, "rightalt-shift", "tablet")!;

      const defaultRow0 = defaultLayer.rows[0]!;
      const rightaltRow0 = rightaltLayer.rows[0]!;
      const rightaltShiftRow0 = rightaltShiftLayer.rows[0]!;

      // Same slot count as the default/shift number row.
      expect(rightaltRow0.keys.length).toBe(defaultRow0.keys.length);
      expect(rightaltShiftRow0.keys.length).toBe(defaultRow0.keys.length);

      // Same digit content — column-identical to default/shift's row 0,
      // reusing TABLET_NUMBER_ROW_DIGITS via buildTabletNumberRow (no forked
      // digit list). Spot-check the "1" and "0" keys land on both layers.
      for (const row0 of [rightaltRow0, rightaltShiftRow0]) {
        const digitTexts = row0.keys.slice(0, -1).map((k) => k.text);
        expect(digitTexts).toEqual(defaultRow0.keys.slice(0, -1).map((k) => k.text));
        expect(digitTexts).toContain("1");
        expect(digitTexts).toContain("0");

        // Each digit key auto-returns to "default" after a tap — consistent
        // with the rest of the rightalt/rightalt-shift layer's letter keys
        // (see buildTabletRightAltLetterKey), unlike the default/shift
        // layers' OWN number row (no nextlayer needed there — those keys
        // already ARE on "default"/"shift").
        for (const key of row0.keys.slice(0, -1)) {
          expect(key.nextlayer).toBe("default");
        }

        // Trailing key is (a duplicate) K_BKSP, matching the number row shape.
        // Backspace has no layer semantics — it must NOT auto-return.
        const trailing = row0.keys[row0.keys.length - 1]!;
        expect(trailing.id).toBe("K_BKSP");
        expect(trailing.nextlayer).toBeUndefined();
      }

      // The default/shift number row itself carries no nextlayer — unchanged.
      for (const key of defaultRow0.keys.slice(0, -1)) {
        expect(key.nextlayer).toBeUndefined();
      }
    });

    it("rightalt/rightalt-shift keep all their pre-existing letter/K_SHIFT/K_BKSP content after gaining the shared digit row", () => {
      const ir = makeEwondoLikeIR();
      const result = scaffoldTouchLayoutWithDiagnostics(ir, "tablet");
      const rightaltLayer = getLayer(result.layout, "rightalt", "tablet")!;
      const rightaltShiftLayer = getLayer(result.layout, "rightalt-shift", "tablet")!;

      const rightaltAllKeys = rightaltLayer.rows.flatMap((r) => r.keys);
      const rightaltShiftAllKeys = rightaltShiftLayer.rows.flatMap((r) => r.keys);

      // Special-char letter keys are still present and reachable.
      expect(rightaltAllKeys.find((k) => k.id === "K_E")?.output).toBe("ə");
      expect(rightaltAllKeys.find((k) => k.id === "K_O")?.output).toBe("ɔ");
      expect(rightaltShiftAllKeys.find((k) => k.id === "K_N")?.output).toBe("Ŋ");

      // Exactly two reachable K_BKSP per layer: the pre-existing one on the
      // Z-row, plus the duplicate on the digit top row (corpus idiom).
      expect(rightaltAllKeys.filter((k) => k.id === "K_BKSP").length).toBe(2);
      expect(rightaltShiftAllKeys.filter((k) => k.id === "K_BKSP").length).toBe(2);

      // K_SHIFT toggles are unaffected — still reachable in both directions.
      expect(rightaltAllKeys.find((k) => k.id === "K_SHIFT")?.nextlayer).toBe("rightalt-shift");
      expect(rightaltShiftAllKeys.find((k) => k.id === "K_SHIFT")?.nextlayer).toBe("rightalt");
    });
  });

  it("unplacedChars is reachability-based: a produced special char reachable via the rightalt layer is not reported unplaced", () => {
    const ir = makeEwondoLikeIR();
    const result = scaffoldTouchLayoutWithDiagnostics(ir, "tablet");

    expect(result.unplacedChars).not.toContain("ə");
    expect(result.unplacedChars).not.toContain("ɔ");
    expect(result.unplacedChars).not.toContain("Ŋ");
    expect(result.unplacedChars.length).toBe(0);
  });

  it("an IR with no RAlt mappings at all emits no T_ks_specials key and no rightalt/rightalt-shift layers", () => {
    const ir = makeMinimalIR({
      groups: [makeGroup([makeCharRule("K_A", [], "a")])],
    });
    const result = scaffoldTouchLayoutWithDiagnostics(ir, "tablet");
    const platform = result.layout.platforms.find((p) => p.id === "tablet")!;

    expect(platform.layers.map((l) => l.id)).toEqual(["default", "shift", "numeric"]);
    const defaultLayer = getLayer(result.layout, "default", "tablet")!;
    const row3 = defaultLayer.rows[2]!;
    expect(row3.keys.find((k) => k.id === "T_ks_specials")).toBeUndefined();
  });

  it("scaffoldTouchLayoutWithDiagnostics without platformStyle still defaults to 'phone' (phone path unaffected)", () => {
    const ir = makeEwondoLikeIR();
    const result = scaffoldTouchLayoutWithDiagnostics(ir);
    expect(result.layout.platforms.map((p) => p.id)).toEqual(["phone"]);
  });
});
