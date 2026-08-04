/**
 * Unit tests for layerFamilies (spec 058 T062; contract:
 * specs/058-touch-key-editor/contracts/layer-families.md).
 *
 * Grouped:
 *   1. Decomposition over the standard combo vocabulary (contract §6 bullet
 *      1) — all corpus-attested against the real sil_cameroon_qwerty fixture
 *      (default/shift/symbol/rightalt/rightalt-shift/caps/rightalt-caps/
 *      symbol-caps — its verbatim 8 tablet layer ids), plus a synthetic
 *      chiral-ctrl combo (leftctrl-leftalt — attested in the vendored KMW
 *      engine's own AltGr-emulation fallback, defaultLayouts.ts).
 *   2. The freeform fallback (FR-067) as a silence guarantee — the two
 *      corpus regression locks (gff_amharic, fv_southern_carrier), each
 *      skip-if-absent, plus a synthetic all-freeform layout.
 *
 * NOT covered here (out of scope for T061/T062 — see the task briefing):
 * the property-scoped exemption tests and the FR-065 family-wide-apply
 * enumeration tests belong to the parallelism-findings work itself
 * (Phase 8, T107-T110), which does not exist yet.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { decomposeLayerId, groupLayerFamilies } from "./layerFamilies.js";

// ---------------------------------------------------------------------------
// Corpus fixture paths — mirrors the KEYBOARDS_ROOT skip-if-absent idiom in
// applyTouchAssignmentsToRawJson.test.ts (5 levels up from this file's
// directory to the sibling ../../../../../keyboards checkout).
// ---------------------------------------------------------------------------

const KEYBOARDS_ROOT = path.resolve(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  "../../../../../keyboards",
);

const GFF_AMHARIC_TOUCH_LAYOUT = path.join(
  KEYBOARDS_ROOT,
  "release/gff/gff_amharic/source/gff_amharic.keyman-touch-layout",
);
const FV_SOUTHERN_CARRIER_TOUCH_LAYOUT = path.join(
  KEYBOARDS_ROOT,
  "release/fv/fv_southern_carrier/source/fv_southern_carrier.keyman-touch-layout",
);

const gffAmharicExists = fs.existsSync(GFF_AMHARIC_TOUCH_LAYOUT);
const fvSouthernCarrierExists = fs.existsSync(FV_SOUTHERN_CARRIER_TOUCH_LAYOUT);

/** Layer ids of one named platform (e.g. "phone"/"tablet") in a raw `.keyman-touch-layout` JSON file. */
function readPlatformLayerIds(filePath: string, platform: string): string[] {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<
    string,
    { layer?: Array<{ id?: unknown }> } | undefined
  >;
  const layers = parsed[platform]?.layer ?? [];
  return layers.map((layer) => layer.id).filter((id): id is string => typeof id === "string");
}

// ---------------------------------------------------------------------------
// 1. Standard combo vocabulary
// ---------------------------------------------------------------------------

describe("decomposeLayerId — standard combo vocabulary", () => {
  // The real sil_cameroon_qwerty.keyman-touch-layout fixture's verbatim 8
  // tablet layer ids (confirmed against the corpus file directly) — every
  // one of the "standard combo vocabulary" strings the task calls out.
  it("default -> alphabetic plane, empty combo", () => {
    const d = decomposeLayerId("default");
    expect(d.kind).toBe("parsed");
    expect(d).toMatchObject({ plane: undefined, tokens: [] });
  });

  it("shift -> alphabetic plane, [SHIFT]", () => {
    const d = decomposeLayerId("shift");
    expect(d).toMatchObject({ kind: "parsed", plane: undefined, tokens: ["SHIFT"] });
  });

  it("caps -> alphabetic plane, [CAPS]", () => {
    const d = decomposeLayerId("caps");
    expect(d).toMatchObject({ kind: "parsed", plane: undefined, tokens: ["CAPS"] });
  });

  it("rightalt -> alphabetic plane, [RALT]", () => {
    const d = decomposeLayerId("rightalt");
    expect(d).toMatchObject({ kind: "parsed", plane: undefined, tokens: ["RALT"] });
  });

  it("rightalt-shift -> alphabetic plane, {RALT, SHIFT}", () => {
    const d = decomposeLayerId("rightalt-shift");
    expect(d.kind).toBe("parsed");
    if (d.kind !== "parsed") throw new Error("unreachable");
    expect(d.plane).toBeUndefined();
    expect(new Set(d.tokens)).toEqual(new Set(["RALT", "SHIFT"]));
  });

  it("rightalt-caps -> alphabetic plane, {RALT, CAPS}", () => {
    const d = decomposeLayerId("rightalt-caps");
    expect(d.kind).toBe("parsed");
    if (d.kind !== "parsed") throw new Error("unreachable");
    expect(d.plane).toBeUndefined();
    expect(new Set(d.tokens)).toEqual(new Set(["RALT", "CAPS"]));
  });

  it("symbol -> symbol plane, empty combo", () => {
    const d = decomposeLayerId("symbol");
    expect(d).toMatchObject({ kind: "parsed", plane: "symbol", tokens: [] });
  });

  it("symbol-caps -> symbol plane, [CAPS]", () => {
    const d = decomposeLayerId("symbol-caps");
    expect(d).toMatchObject({ kind: "parsed", plane: "symbol", tokens: ["CAPS"] });
  });

  // A chiral-ctrl combo. "leftctrl-leftalt" is a real navigable layer id the
  // vendored KMW engine itself emits as an AltGr-emulation fallback (see
  // simulator/vendor/keyman/engine/keyboard/keyboards/defaultLayouts.ts,
  // 'leftctrl-leftalt' / 'leftctrl-leftalt-shift') — not a string this
  // codebase's own comboToTouchLayerId would produce (LALT folds to the
  // shared "alt" fragment there), but one the decomposition grammar must
  // still recognize since it parses id strings in general (see module doc).
  it("leftctrl-leftalt (chiral ctrl+alt) -> alphabetic plane, {LCTRL, LALT}", () => {
    const d = decomposeLayerId("leftctrl-leftalt");
    expect(d.kind).toBe("parsed");
    if (d.kind !== "parsed") throw new Error("unreachable");
    expect(d.plane).toBeUndefined();
    expect(new Set(d.tokens)).toEqual(new Set(["LCTRL", "LALT"]));
  });

  it("groups the real sil_cameroon_qwerty 8-layer set into exactly two families (alphabetic x6, symbol x2)", () => {
    const cameroonLayerIds = [
      "default",
      "shift",
      "symbol",
      "rightalt",
      "rightalt-shift",
      "caps",
      "rightalt-caps",
      "symbol-caps",
    ];
    const grouping = groupLayerFamilies(cameroonLayerIds);
    expect(grouping.freeformLayerIds).toEqual([]);
    expect(grouping.families).toHaveLength(2);

    const alphabetic = grouping.families.find((f) => f.plane === undefined);
    const symbol = grouping.families.find((f) => f.plane === "symbol");
    expect(alphabetic?.layerIds).toHaveLength(6);
    expect(symbol?.layerIds).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 2. The freeform fallback — silence guarantee (FR-067)
// ---------------------------------------------------------------------------

describe("decomposeLayerId — freeform fallback (FR-067)", () => {
  it("a garden-variety unparseable id (punctuation) falls to freeform", () => {
    expect(decomposeLayerId("punctuation")).toEqual({ kind: "freeform", layerId: "punctuation" });
  });

  it("a hyphenated unparseable id (ethio-punct-layer) falls to freeform, not a spurious plane split", () => {
    expect(decomposeLayerId("ethio-punct-layer")).toEqual({
      kind: "freeform",
      layerId: "ethio-punct-layer",
    });
  });

  it("case matters: 'Shift' (capitalized) does not match the lowercase fragment vocabulary -> freeform", () => {
    expect(decomposeLayerId("Shift")).toEqual({ kind: "freeform", layerId: "Shift" });
  });

  it("an all-freeform layout yields zero families -- a later grammar extension cannot silently start emitting noise here without a deliberate decision", () => {
    const allFreeform = ["punctuation", "vowels", "Bars", "numeric", "gh", "ts_"];
    const grouping = groupLayerFamilies(allFreeform);
    expect(grouping.families).toEqual([]);
    expect(grouping.freeformLayerIds).toEqual(allFreeform);
  });
});

describe("decomposeLayerId — corpus regression lock: gff_amharic (Ethiopic-named layers)", () => {
  it.skipIf(!gffAmharicExists)(
    "every one of the 53 phone-platform layer ids falls to freeform (except the standard 'default' base layer), and grouping produces no multi-member family",
    () => {
      const layerIds = readPlatformLayerIds(GFF_AMHARIC_TOUCH_LAYOUT, "phone");

      // Regression lock on the corpus shape itself -- a future upstream edit
      // changing the layer count should be a deliberate, reviewed change to
      // this test, not a silent drift.
      expect(layerIds).toHaveLength(53);

      // "default" is the standard base-layer sentinel present in nearly
      // every touch layout (worked example row 1) -- it is not part of the
      // Ethiopic-named convention this test locks, and correctly parses to
      // the alphabetic plane. It stays a singleton family below since no
      // OTHER gff_amharic layer id also decomposes to the alphabetic plane,
      // so its presence still yields zero parallelism findings.
      const nonDefaultIds = layerIds.filter((id) => id !== "default");
      expect(nonDefaultIds).toHaveLength(52);
      for (const id of nonDefaultIds) {
        expect(decomposeLayerId(id)).toEqual({ kind: "freeform", layerId: id });
      }

      const grouping = groupLayerFamilies(layerIds);
      for (const family of grouping.families) {
        expect(family.layerIds.length).toBeLessThanOrEqual(1);
      }
      expect(grouping.freeformLayerIds).toHaveLength(52);
    },
  );
});

describe("decomposeLayerId — corpus regression lock: fv_southern_carrier (syllable-mnemonic layer names)", () => {
  it.skipIf(!fvSouthernCarrierExists)(
    "every one of the 35 tablet-platform layer ids falls to freeform (except the standard 'default' base layer), and grouping produces no multi-member family",
    () => {
      const layerIds = readPlatformLayerIds(FV_SOUTHERN_CARRIER_TOUCH_LAYOUT, "tablet");

      expect(layerIds).toHaveLength(35);

      // Same "default" carve-out as gff_amharic above -- see that test's
      // comment. fv_southern_carrier's own syllable-mnemonic/English-word
      // layer names (b, ch, k_, Shift, vowels, numeric, Bars, Bends, ...)
      // never decompose to a recognized modifier-combo suffix and are not
      // the "symbol" sentinel either, so they all fall to freeform.
      const nonDefaultIds = layerIds.filter((id) => id !== "default");
      expect(nonDefaultIds).toHaveLength(34);
      for (const id of nonDefaultIds) {
        expect(decomposeLayerId(id)).toEqual({ kind: "freeform", layerId: id });
      }

      const grouping = groupLayerFamilies(layerIds);
      for (const family of grouping.families) {
        expect(family.layerIds.length).toBeLessThanOrEqual(1);
      }
      expect(grouping.freeformLayerIds).toHaveLength(34);
    },
  );
});
