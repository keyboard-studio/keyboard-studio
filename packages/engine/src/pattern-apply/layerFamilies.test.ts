/**
 * Unit tests for layerFamilies (spec 063 T062, T107; contract:
 * specs/063-touch-key-editor/contracts/layer-families.md).
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
 *   3. `findFamilyParallelismBreaks` (T107, FR-064) — the four break kinds
 *      (added/removed/moved/resized) plus the negative case, over a
 *      synthetic alphabetic family built from the real sil_cameroon_qwerty
 *      6-member alphabetic-plane layer-id set (contract §6 bullet 3).
 *   4. The FR-068 property-scoped exemption for frame/layer-switch keys
 *      (T110, contract §4/§6 bullet 3) — the four exempt properties, each
 *      varied across the family on its own, yield NO finding; the same key
 *      moved or resized still does.
 *   5. The FR-066 plane classification and severity scoping (T109,
 *      contract §5).
 *   6. `keyEditAffectsFamilyParallelism` — the same FR-068 property split read
 *      FORWARDS, over one operation about to be applied. Its whole job is to
 *      agree with group 4 above: an edit to a property group 4 proves is exempt
 *      must not be reported as a family concern, and an edit to one group 4
 *      still flags must be.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import type { TouchKeyIR } from "@keyboard-studio/contracts";
import {
  classifyPlane,
  decomposeLayerId,
  findFamilyParallelismBreaks,
  groupLayerFamilies,
  keyEditAffectsFamilyParallelism,
  severityForPlane,
} from "./layerFamilies.js";
import type { UnsequencedKeyEditOperation } from "./keyEditOps.js";

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

// ---------------------------------------------------------------------------
// 3. findFamilyParallelismBreaks (T107, FR-064)
// ---------------------------------------------------------------------------

/** Mirrors the shape `TouchLayoutIR.platforms[number].layers[number]` — see layerFamilies.ts's own `TouchLayoutLayer` alias — without importing that internal type. */
interface FixtureLayer {
  id: string;
  rows: Array<{ keys: TouchKeyIR[] }>;
}

/** The real sil_cameroon_qwerty 6-member alphabetic-plane layer-id set (contract §6 bullet 3 / the worked example the task briefing points at), minus the two symbol-plane ids. */
const ALPHABETIC_LAYER_IDS = ["default", "shift", "rightalt", "rightalt-shift", "caps", "rightalt-caps"];

function key(id: string, width = 100): TouchKeyIR {
  return { nodeId: `node-${id}`, id, width };
}

function alphabeticFamily() {
  const grouping = groupLayerFamilies(ALPHABETIC_LAYER_IDS);
  const family = grouping.families.find((f) => f.plane === undefined);
  if (family === undefined) throw new Error("test setup: expected a resolvable alphabetic family");
  return family;
}

/**
 * Every alphabetic-family layer with the SAME two-row, three-plus-two-key
 * shape — the parallel baseline every divergence test below starts from and
 * then perturbs exactly one layer of, so each test isolates exactly one
 * break kind.
 */
function baselineLayers(): Map<string, FixtureLayer> {
  const map = new Map<string, FixtureLayer>();
  for (const layerId of ALPHABETIC_LAYER_IDS) {
    map.set(layerId, {
      id: layerId,
      rows: [{ keys: [key("K_Q"), key("K_W"), key("K_E")] }, { keys: [key("K_A"), key("K_S")] }],
    });
  }
  return map;
}

describe("findFamilyParallelismBreaks — the negative case", () => {
  it("a correctly parallel alphabetic family (Cameroon's 6-layer set) yields no findings", () => {
    const layersById = baselineLayers();
    expect(findFamilyParallelismBreaks("tablet", alphabeticFamily(), layersById)).toEqual([]);
  });

  it("a family with fewer than two resolvable layers yields no findings -- nothing to be non-parallel with", () => {
    const layersById = new Map<string, FixtureLayer>([
      ["default", { id: "default", rows: [{ keys: [key("K_Q")] }] }],
    ]);
    // "shift" is not in layersById -- unresolvable, so only one member resolves.
    const family = { plane: undefined, layerIds: ["default", "shift"] };
    expect(findFamilyParallelismBreaks("tablet", family, layersById)).toEqual([]);
  });
});

describe("findFamilyParallelismBreaks — the four FR-064 break kinds", () => {
  it("a key added on shift without the corresponding key on default (or the rest) is reported as 'added'", () => {
    const layersById = baselineLayers();
    const shift = layersById.get("shift")!;
    layersById.set("shift", { ...shift, rows: [{ keys: [...shift.rows[0]!.keys, key("K_EXTRA")] }, shift.rows[1]!] });

    const findings = findFamilyParallelismBreaks("tablet", alphabeticFamily(), layersById);
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.code).toBe("TOUCH_KEY_FAMILY_PARALLELISM_BREAK");
    expect(finding.severity).toBe("warning");
    expect(finding.address).toBe("tablet:shift:K_EXTRA");
    expect(finding.fields).toMatchObject({ kind: "added", keyId: "K_EXTRA", presentOnLayerIds: ["shift"] });
    expect(finding.fields.missingFromLayerIds).toEqual(ALPHABETIC_LAYER_IDS.filter((id) => id !== "shift"));
    expect(finding.fixes).toEqual([{ kind: "reviewFamilyMember", address: "tablet:shift:K_EXTRA" }]);
  });

  it("a key removed from caps without the corresponding removal on default (or the rest) is reported as 'removed'", () => {
    const layersById = baselineLayers();
    const caps = layersById.get("caps")!;
    // Drop K_S -- the LAST key of row1 -- so no sibling's own columnIndex
    // shifts as a side effect (removing a non-trailing key would itself
    // move every key after it, which is a real but separate break this
    // test is not about).
    layersById.set("caps", {
      ...caps,
      rows: [caps.rows[0]!, { keys: caps.rows[1]!.keys.filter((k) => k.id !== "K_S") }],
    });

    const findings = findFamilyParallelismBreaks("tablet", alphabeticFamily(), layersById);
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    // Anchored on the first layer where the key still exists (default), not on caps -- see the function doc.
    expect(finding.address).toBe("tablet:default:K_S");
    expect(finding.fields).toMatchObject({ kind: "removed", keyId: "K_S", missingFromLayerIds: ["caps"] });
  });

  it("a key present everywhere but at a different grid position on rightalt is reported as 'moved'", () => {
    const layersById = baselineLayers();
    const rightalt = layersById.get("rightalt")!;
    // K_E -- the LAST key of row0 -- moves to the end of row1, so no
    // sibling's own columnIndex shifts as a side effect of the move itself.
    layersById.set("rightalt", {
      ...rightalt,
      rows: [
        { keys: rightalt.rows[0]!.keys.filter((k) => k.id !== "K_E") },
        { keys: [...rightalt.rows[1]!.keys, key("K_E")] },
      ],
    });

    const findings = findFamilyParallelismBreaks("tablet", alphabeticFamily(), layersById);
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.address).toBe("tablet:default:K_E");
    expect(finding.fields).toMatchObject({ kind: "moved", keyId: "K_E" });
    expect(finding.fields.positionsByLayerId).toMatchObject({
      default: { rowIndex: 0, columnIndex: 2 },
      rightalt: { rowIndex: 1, columnIndex: 2 },
    });
  });

  it("a key present everywhere at the same position but a different width on caps is reported as 'resized'", () => {
    const layersById = baselineLayers();
    const caps = layersById.get("caps")!;
    layersById.set("caps", { ...caps, rows: [{ keys: [key("K_Q"), key("K_W", 150), key("K_E")] }, caps.rows[1]!] });

    const findings = findFamilyParallelismBreaks("tablet", alphabeticFamily(), layersById);
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.address).toBe("tablet:default:K_W");
    expect(finding.fields).toMatchObject({ kind: "resized", keyId: "K_W" });
    expect(finding.fields.widthsByLayerId).toMatchObject({ default: 100, caps: 150 });
  });
});

describe("findFamilyParallelismBreaks — severity split (contract §5)", () => {
  it("a divergence within a named-plane family (symbol vs symbol-caps) is reported at the softer 'hint' severity, not the alphabetic family's 'warning'", () => {
    const layersById = new Map<string, FixtureLayer>([
      ["symbol", { id: "symbol", rows: [{ keys: [key("T_1"), key("T_2")] }] }],
      ["symbol-caps", { id: "symbol-caps", rows: [{ keys: [key("T_1")] }] }],
    ]);
    const grouping = groupLayerFamilies(["symbol", "symbol-caps"]);
    const family = grouping.families.find((f) => f.plane === "symbol");
    if (family === undefined) throw new Error("test setup: expected a resolvable symbol family");

    const findings = findFamilyParallelismBreaks("tablet", family, layersById);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("hint");
  });
});

// ---------------------------------------------------------------------------
// 4. The FR-068 property split for frame / layer-switch keys (T110,
//    contract §4). The obligation in contract §6 bullet 3: "A Shift key
//    differing in `sp`, `nextlayer`, `id`, or keycap text across its family ->
//    no finding. The same key moved or resized across the family -> a finding,
//    at the severity in §5."
// ---------------------------------------------------------------------------

/** A frame/layer-switch key — `sp: 1` (frame, inactive) unless overridden, which is what makes it subject to FR-068's exemption. */
function frameKey(id: string, overrides: Partial<TouchKeyIR> = {}): TouchKeyIR {
  return { nodeId: `node-${id}`, id, width: 100, sp: 1, ...overrides };
}

/**
 * The baseline shape for the exemption tests: every alphabetic-family layer
 * with one ordinary row and a bottom frame row carrying a layer-switch key and
 * a space bar. Row 1's frame key is what each test below perturbs.
 */
function baselineLayersWithFrameRow(): Map<string, FixtureLayer> {
  const map = new Map<string, FixtureLayer>();
  for (const layerId of ALPHABETIC_LAYER_IDS) {
    map.set(layerId, {
      id: layerId,
      rows: [
        { keys: [key("K_Q"), key("K_W")] },
        { keys: [frameKey("K_SHIFT", { nextlayer: "shift" }), key("K_SPACE")] },
      ],
    });
  }
  return map;
}

describe("findFamilyParallelismBreaks — FR-068 property split for frame/layer-switch keys (T110)", () => {
  it("the parallel baseline (a frame row on every family member) yields no findings", () => {
    expect(
      findFamilyParallelismBreaks("tablet", alphabeticFamily(), baselineLayersWithFrameRow()),
    ).toEqual([]);
  });

  it("a frame key whose `sp` alternates active/inactive across the family yields NO finding -- the alternation is correct design, not drift (contract §4 row 1)", () => {
    const layersById = baselineLayersWithFrameRow();
    // On `shift`, the Shift key is the ACTIVE frame (sp:2) -- exactly what
    // FR-029d/T102 says it must be on the layer it switches to.
    const shift = layersById.get("shift")!;
    layersById.set("shift", {
      ...shift,
      rows: [
        shift.rows[0]!,
        { keys: [frameKey("K_SHIFT", { sp: 2, nextlayer: "shift" }), key("K_SPACE")] },
      ],
    });

    expect(findFamilyParallelismBreaks("tablet", alphabeticFamily(), layersById)).toEqual([]);
  });

  it("a frame key whose `nextlayer` targets differ across the family yields NO finding -- from `default` Shift goes to `shift`, from `shift` it comes back (contract §4 row 2)", () => {
    const layersById = baselineLayersWithFrameRow();
    const shift = layersById.get("shift")!;
    layersById.set("shift", {
      ...shift,
      rows: [
        shift.rows[0]!,
        { keys: [frameKey("K_SHIFT", { nextlayer: "default" }), key("K_SPACE")] },
      ],
    });

    expect(findFamilyParallelismBreaks("tablet", alphabeticFamily(), layersById)).toEqual([]);
  });

  it("a frame key whose `id` differs across the family yields NO finding -- Cameroon's T_LOWER/T_UPPER doing the equivalent job at the same position (contract §4 row 3)", () => {
    const layersById = baselineLayersWithFrameRow();
    const caps = layersById.get("caps")!;
    layersById.set("caps", {
      ...caps,
      rows: [
        caps.rows[0]!,
        // A DIFFERENT id at the SAME position -- id-correlation alone would
        // report this as one "removed" (K_SHIFT) plus one "added" (T_UPPER).
        { keys: [frameKey("T_UPPER", { nextlayer: "default" }), key("K_SPACE")] },
      ],
    });

    expect(findFamilyParallelismBreaks("tablet", alphabeticFamily(), layersById)).toEqual([]);
  });

  it("a frame key whose keycap `text` differs across the family yields NO finding -- the label reflects the destination, not a fixed identity (contract §4 row 4)", () => {
    const layersById = baselineLayersWithFrameRow();
    const caps = layersById.get("caps")!;
    layersById.set("caps", {
      ...caps,
      rows: [
        caps.rows[0]!,
        { keys: [frameKey("K_SHIFT", { nextlayer: "shift", text: "ABC" }), key("K_SPACE")] },
      ],
    });

    expect(findFamilyParallelismBreaks("tablet", alphabeticFamily(), layersById)).toEqual([]);
  });

  it("all four exempt properties varying AT ONCE still yields no finding -- the exemption is not order- or count-sensitive", () => {
    const layersById = baselineLayersWithFrameRow();
    const rightalt = layersById.get("rightalt")!;
    layersById.set("rightalt", {
      ...rightalt,
      rows: [
        rightalt.rows[0]!,
        { keys: [frameKey("T_LOWER", { sp: 2, nextlayer: "default", text: "abc" }), key("K_SPACE")] },
      ],
    });

    expect(findFamilyParallelismBreaks("tablet", alphabeticFamily(), layersById)).toEqual([]);
  });

  it("a frame key MOVED across the family IS still reported -- position stays parallel regardless of everything else that may vary (contract §4, last row)", () => {
    const layersById = baselineLayersWithFrameRow();
    const caps = layersById.get("caps")!;
    // Swap the frame key and the space bar: the frame key is now at column 1
    // rather than column 0, with its id and every other exempt property
    // unchanged.
    layersById.set("caps", {
      ...caps,
      rows: [
        caps.rows[0]!,
        { keys: [key("K_SPACE"), frameKey("K_SHIFT", { nextlayer: "shift" })] },
      ],
    });

    const findings = findFamilyParallelismBreaks("tablet", alphabeticFamily(), layersById);
    // Both keys of that row moved, so both are reported -- the frame key by
    // its ordinal correlation, the space bar by its id.
    const frameFinding = findings.find((f) => f.fields.keyId === "K_SHIFT");
    expect(frameFinding).toBeDefined();
    expect(frameFinding!.fields).toMatchObject({ kind: "moved", frameKey: true });
    expect(frameFinding!.address).toBe("tablet:default:K_SHIFT");
    expect(frameFinding!.fields.positionsByLayerId).toMatchObject({
      default: { rowIndex: 1, columnIndex: 0 },
      caps: { rowIndex: 1, columnIndex: 1 },
    });
  });

  it("a frame key RESIZED across the family IS still reported, at the family's own severity (contract §4 last row / §5)", () => {
    const layersById = baselineLayersWithFrameRow();
    const caps = layersById.get("caps")!;
    layersById.set("caps", {
      ...caps,
      rows: [
        caps.rows[0]!,
        { keys: [frameKey("K_SHIFT", { nextlayer: "shift", width: 200 }), key("K_SPACE")] },
      ],
    });

    const findings = findFamilyParallelismBreaks("tablet", alphabeticFamily(), layersById);
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.fields).toMatchObject({ kind: "resized", keyId: "K_SHIFT", frameKey: true });
    expect(finding.severity).toBe("warning");
    expect(finding.fields.widthsByLayerId).toMatchObject({ default: 100, caps: 200 });
  });

  it("a frame key resized across a family whose ids ALSO differ still anchors its address and reported id on a REAL key, never the internal ordinal correlation key", () => {
    const layersById = baselineLayersWithFrameRow();
    const caps = layersById.get("caps")!;
    layersById.set("caps", {
      ...caps,
      rows: [
        caps.rows[0]!,
        { keys: [frameKey("T_UPPER", { nextlayer: "default", width: 200 }), key("K_SPACE")] },
      ],
    });

    const findings = findFamilyParallelismBreaks("tablet", alphabeticFamily(), layersById);
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    // The address resolves against the BASELINE layer's real id...
    expect(finding.address).toBe("tablet:default:K_SHIFT");
    expect(finding.fields.keyId).toBe("K_SHIFT");
    // ...and the per-layer ids are reported in full, since FR-068 lets them
    // legitimately differ and no single one of them is "the" identity.
    expect(finding.fields.keyIdsByLayerId).toMatchObject({ default: "K_SHIFT", caps: "T_UPPER" });
    // Nothing synthetic escapes into the finding.
    expect(JSON.stringify(finding)).not.toContain("frame#");
  });

  it("an ORDINARY key differing only in id across the family is still reported -- the exemption is scoped to frame/layer-switch keys, not applied layout-wide", () => {
    const layersById = baselineLayersWithFrameRow();
    const caps = layersById.get("caps")!;
    // K_W -> K_Z at the same position, on an ordinary (non-frame) key.
    layersById.set("caps", {
      ...caps,
      rows: [{ keys: [key("K_Q"), key("K_Z")] }, caps.rows[1]!],
    });

    const findings = findFamilyParallelismBreaks("tablet", alphabeticFamily(), layersById);
    const kinds = findings.map((f) => f.fields.kind).sort();
    expect(kinds).toEqual(["added", "removed"]);
    for (const finding of findings) expect(finding.fields.frameKey).toBe(false);
  });

  it("a frame key present on some members and absent on others is still reported -- the exemption covers which PROPERTIES may vary, never whether the key exists", () => {
    const layersById = baselineLayersWithFrameRow();
    const caps = layersById.get("caps")!;
    layersById.set("caps", { ...caps, rows: [caps.rows[0]!, { keys: [key("K_SPACE")] }] });

    const findings = findFamilyParallelismBreaks("tablet", alphabeticFamily(), layersById);
    // The frame key vanished from `caps`, so `caps`'s only remaining row-1 key
    // (the space bar) slides into ordinal/column 0 -- both facts are real
    // breaks. What matters here is that the missing frame key is reported at
    // all rather than silently exempted.
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.fields.kind === "removed" || f.fields.kind === "moved")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Plane classification + severity scoping (T109, FR-066 / contract §5)
// ---------------------------------------------------------------------------

describe("classifyPlane — which planes are independent layouts (T109, FR-066)", () => {
  it("the absent plane is the base alphabetic plane", () => {
    expect(classifyPlane(undefined)).toBe("alphabetic");
  });

  it("the three FR-066-enumerated named planes are recognized as distinct, independent layouts", () => {
    expect(classifyPlane("symbol")).toBe("distinct");
    expect(classifyPlane("emoji")).toBe("distinct");
    expect(classifyPlane("numeric")).toBe("distinct");
  });

  it("an alt-script plane -- whose name is whatever the author chose, so it cannot be enumerated -- classifies as unrecognized, NOT as alphabetic", () => {
    // FR-066's fourth category. The point of the assertion is the negative:
    // an unrecognized plane must never fall through to the alphabetic
    // classification and pick up its loud severity.
    expect(classifyPlane("cherokee")).toBe("unrecognized");
    expect(classifyPlane("cherokee")).not.toBe("alphabetic");
  });
});

describe("severityForPlane — the loud/soft split stated once (T109, contract §5)", () => {
  it("the alphabetic family is loud", () => {
    expect(severityForPlane(undefined)).toBe("warning");
  });

  it("every non-alphabetic plane defaults to the softer severity -- recognized or not", () => {
    expect(severityForPlane("symbol")).toBe("hint");
    expect(severityForPlane("emoji")).toBe("hint");
    expect(severityForPlane("numeric")).toBe("hint");
    expect(severityForPlane("cherokee")).toBe("hint");
  });

  it("agrees with the severity findFamilyParallelismBreaks actually assigns -- the split has exactly one statement, not two that could drift", () => {
    const layersById = new Map<string, FixtureLayer>([
      ["symbol", { id: "symbol", rows: [{ keys: [key("T_1"), key("T_2")] }] }],
      ["symbol-caps", { id: "symbol-caps", rows: [{ keys: [key("T_1")] }] }],
    ]);
    const grouping = groupLayerFamilies(["symbol", "symbol-caps"]);
    const family = grouping.families.find((f) => f.plane === "symbol")!;

    const findings = findFamilyParallelismBreaks("tablet", family, layersById);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe(severityForPlane("symbol"));
    expect(findings[0]!.fields.planeClass).toBe("distinct");
  });

  it("an unrecognized-plane family is still CHECKED (FR-066's 'MAY be checked'), just softly", () => {
    // Both members carry an explicit modifier combo. A BARE `cherokee` would
    // fall to freeform instead — `PLANE_ONLY_SENTINELS` deliberately
    // recognizes only `default`/`symbol` as bare plane roots, so an
    // unattested bare word is never fabricated into a plane (contract §3).
    // That is why this fixture pairs `cherokee-shift` with `cherokee-caps`
    // rather than with a bare `cherokee`: the plane has to be recovered from
    // the ids for there to be a family at all.
    const layersById = new Map<string, FixtureLayer>([
      ["cherokee-shift", { id: "cherokee-shift", rows: [{ keys: [key("T_1"), key("T_2")] }] }],
      ["cherokee-caps", { id: "cherokee-caps", rows: [{ keys: [key("T_1")] }] }],
    ]);
    const grouping = groupLayerFamilies(["cherokee-shift", "cherokee-caps"]);
    const family = grouping.families.find((f) => f.plane === "cherokee");
    if (family === undefined) throw new Error("test setup: expected a resolvable cherokee family");

    const findings = findFamilyParallelismBreaks("tablet", family, layersById);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("hint");
    expect(findings[0]!.fields.planeClass).toBe("unrecognized");
  });
});

// ---------------------------------------------------------------------------
// 6. keyEditAffectsFamilyParallelism — the forward-looking twin (see the file
//    header, group 6)
// ---------------------------------------------------------------------------

describe("keyEditAffectsFamilyParallelism", () => {
  const AT = "phone:default:T_a";
  const setOp = (fields: Record<string, unknown>): UnsequencedKeyEditOperation =>
    ({ address: AT, kind: "set", fields } as UnsequencedKeyEditOperation);

  it("flags the two edits that change PRESENCE", () => {
    expect(
      keyEditAffectsFamilyParallelism({ address: AT, kind: "remove", outcome: "reflow" }, 0),
    ).toBe(true);
    expect(
      keyEditAffectsFamilyParallelism(
        { address: AT, kind: "suppress", spClass: 9, sentinelId: "T_BLANK" },
        0,
      ),
    ).toBe(true);
  });

  it("flags a GEOMETRY edit — the properties findFamilyParallelismBreaks compares", () => {
    expect(keyEditAffectsFamilyParallelism(setOp({ width: 150 }), 0)).toBe(true);
    expect(keyEditAffectsFamilyParallelism(setOp({ pad: 10 }), 0)).toBe(true);
  });

  it("does NOT flag the four properties FR-068 exempts", () => {
    // The same four the group-4 suite above proves yield no finding when they
    // vary across a family: sp (below), nextlayer, id, keycap text.
    expect(keyEditAffectsFamilyParallelism(setOp({ text: "A" }), 0)).toBe(false);
    expect(keyEditAffectsFamilyParallelism(setOp({ hint: "eps" }), 0)).toBe(false);
    expect(keyEditAffectsFamilyParallelism(setOp({ nextlayer: "shift" }), 0)).toBe(false);
    expect(keyEditAffectsFamilyParallelism(setOp({ layer: "shift" }), 0)).toBe(false);
    expect(keyEditAffectsFamilyParallelism(setOp({ id: "U_0041" }), 0)).toBe(false);
    expect(keyEditAffectsFamilyParallelism({ address: AT, kind: "rename", toId: "U_0041" }, 0)).toBe(
      false,
    );
  });

  it("does NOT flag a key-type change WITHIN the ordinary classes", () => {
    // character <-> deadkey-styled <-> blank <-> spacer, in both directions:
    // per-layer presentation, and the case that used to pop the fan-out dialog
    // on every single key-type change.
    for (const [before, after] of [
      [0, 8],
      [0, 9],
      [0, 10],
      [8, 0],
      [9, 10],
      [10, 0],
      [9, 0],
    ] as const) {
      expect(keyEditAffectsFamilyParallelism(setOp({ sp: after }), before)).toBe(false);
    }
    // `undefined` before is the wire default (character/0), not a frame class.
    expect(keyEditAffectsFamilyParallelism(setOp({ sp: 9 }), undefined)).toBe(false);
  });

  it("DOES flag a key-type change that crosses the frame boundary, in either direction", () => {
    expect(keyEditAffectsFamilyParallelism(setOp({ sp: 1 }), 0)).toBe(true);
    expect(keyEditAffectsFamilyParallelism(setOp({ sp: 2 }), 9)).toBe(true);
    expect(keyEditAffectsFamilyParallelism(setOp({ sp: 0 }), 1)).toBe(true);
    expect(keyEditAffectsFamilyParallelism(setOp({ sp: 10 }), 2)).toBe(true);
    expect(keyEditAffectsFamilyParallelism(setOp({ sp: 1 }), undefined)).toBe(true);
  });

  it("does NOT flag the frame classes ALTERNATING — contract §4's 'correct design, not drift'", () => {
    expect(keyEditAffectsFamilyParallelism(setOp({ sp: 2 }), 1)).toBe(false);
    expect(keyEditAffectsFamilyParallelism(setOp({ sp: 1 }), 2)).toBe(false);
  });

  it("reads a MIXED set through its most consequential field", () => {
    // An ordinary-class sp change is exempt and a width change is not; carried
    // in one op, the op is still a geometry change.
    expect(keyEditAffectsFamilyParallelism(setOp({ sp: 9, width: 150 }), 0)).toBe(true);
  });

  it("returns false for the kinds no fan-out can express", () => {
    // `add` and `move` DO affect parallelism, but neither is fannable — see the
    // function's own doc and FamilyApplyDialog's `isFamilyApplicableOp`. Both
    // gates apply at the call site; this one only says whether to ask.
    expect(
      keyEditAffectsFamilyParallelism({ address: AT, kind: "move", direction: "left" }, 0),
    ).toBe(false);
    expect(
      keyEditAffectsFamilyParallelism(
        { address: AT, kind: "removeSubKey", sub: { kind: "sk", id: "T_a_1" } },
        0,
      ),
    ).toBe(false);
  });
});
