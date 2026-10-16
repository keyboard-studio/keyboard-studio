/**
 * Tests for the IR-native touch-layout cleanup (#313 goal 3).
 *
 * The centre of gravity is the TWIN test: the pre-conversion raw-JSON
 * algorithm is retained here as a reference implementation, and the new
 * parse → mutate → emit path must reproduce its output — deep-equal as
 * parsed JSON (member order is emitter-defined and intentionally not
 * compared) — over real shipped fixtures and a synthetic fixture covering
 * every branch. This is the gate the 2026-10-14 conversion attempt lacked:
 * the one pre-existing scaffolder test uses a fixture with no `sp`, no
 * rightalt, and no display fields, and would have passed under a lossy
 * conversion.
 *
 * #2215 DIVERGENCE: the reference below is the verbatim PRE-#2215
 * algorithm. The #2215 ruling changed the `sp` exemption to numeric
 * semantics, so on string-`sp` fixtures the IR path now differs from the
 * reference BY RULING, on exactly the string-encoded special keys. That
 * divergence is enumerated separately below ("Enumerated #2215 semantics
 * divergence") — it is NOT a conversion loss, and the reference must not
 * be updated to absorb it.
 *
 * Fixtures:
 *   - basic_kbdus / basic_kbdru — shipped layouts (trimmed copies under
 *     studio/tests/fixtures/walkBases, the same files the #2083 fidelity
 *     suite uses): displayUnderlying, per-key fontsize, mixed string /
 *     numeric sp/width/pad, multitap.
 *   - arabic_izza — vendored verbatim from the keyboards corpus
 *     (release/a/arabic_izza). The string-`sp` demonstrator: tablet shift
 *     layer frame keys (K_BKSP, K_ENTER, K_LOPT) carry `sp: "1"` with no
 *     nextlayer — defaulted under the pre-#2215 wire semantics (and by
 *     the twin reference below), exempt under the ruled numeric
 *     semantics, so the #2215 divergence is observable on this fixture.
 *   - bambara — vendored verbatim from the corpus (release/b/bambara):
 *     phone-only, the pure phone-deletion case.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import { parseTouchLayout, emitTouchLayout } from "../codec/parse-touch.js";
import { mutateCleanTouchLayout } from "./cleanTouchLayout.js";

// ---------------------------------------------------------------------------
// Reference implementation — the pre-conversion raw-JSON cleanup, verbatim
// (was `applyTouchLayoutCleanup` in ./index.ts before #313). Kept test-local
// so the twin comparison pins BEHAVIOUR, not the old code's survival.
//
// VERBATIM PRE-#2215 ALGORITHM — DO NOT UPDATE. Its strict wire-value `sp`
// test encodes the pre-#2215 semantics on purpose. The divergence #2215
// introduces against it is enumerated separately below (see "Enumerated
// #2215 semantics divergence"), so this reference keeps pinning exactly
// what the #313 conversion itself proved.
// ---------------------------------------------------------------------------

function referenceRawCleanup(content: string): string {
  const data = JSON.parse(content) as Record<string, unknown>;

  delete data["phone"];

  for (const device of ["tablet"] as const) {
    const deviceData = data[device] as { layer?: Array<Record<string, unknown>> } | undefined;
    if (deviceData?.layer == null) continue;
    const layers = deviceData.layer;

    const shiftLayer = layers.find((l) => l["id"] === "shift");
    const capsLayer = layers.find((l) => l["id"] === "caps");
    if (shiftLayer !== undefined && capsLayer === undefined) {
      const cloned = JSON.parse(JSON.stringify(shiftLayer)) as Record<string, unknown>;
      cloned["id"] = "caps";
      layers.push(cloned);
    }

    const rightaltShiftLayer = layers.find((l) => l["id"] === "rightalt-shift");
    const rightaltCapsLayer = layers.find((l) => l["id"] === "rightalt-caps");
    if (rightaltShiftLayer !== undefined && rightaltCapsLayer === undefined) {
      const cloned = JSON.parse(JSON.stringify(rightaltShiftLayer)) as Record<string, unknown>;
      cloned["id"] = "rightalt-caps";
      layers.push(cloned);
    }

    for (const layer of layers) {
      const layerId = layer["id"] as string | undefined;
      if (layerId === "default" || (layerId != null && layerId.includes("caps"))) continue;
      const rows = layer["row"] as
        | Array<{ key?: Array<{ sp?: number; nextlayer?: string | null }> }>
        | undefined;
      if (rows == null) continue;
      for (const row of rows) {
        if (row.key == null) continue;
        for (const key of row.key) {
          const sp = key.sp;
          if (![1, 2, 3, 4, 8, 9, 10].includes(sp ?? -1) && key.nextlayer == null) {
            key.nextlayer = "default";
          }
        }
      }
    }
  }

  return JSON.stringify(data, null, 2);
}

function irCleanup(content: string): string {
  const ir = parseTouchLayout(content);
  mutateCleanTouchLayout(ir);
  return emitTouchLayout(ir);
}

/** Twin assertion: both paths produce the same layout, compared as parsed JSON. */
function expectTwinEqual(content: string, normalize?: (v: unknown) => unknown): void {
  const norm = normalize ?? ((v: unknown) => v);
  expect(norm(JSON.parse(irCleanup(content)))).toEqual(norm(JSON.parse(referenceRawCleanup(content))));
}

/**
 * The enumerated intentional-loss list for the twin comparison (the #313
 * ruling's disclosed tolerance trade, made executable): an empty-string
 * `sp`/`width`/`pad` is not a number, so the parser's numeric coercion
 * drops it where the raw cleanup preserved the empty member verbatim. It
 * is semantically nil (Keyman types all three as numbers), and it occurs
 * exactly once in the shipped fixtures: basic_kbdru's K_BKQUOTE carries
 * `"pad": ""`. Any OTHER difference still fails the twin.
 */
/**
 * Second enumerated normalization, scoped to the feature-poor scaffolder
 * fixture: its rows carry no `id` at all. The emitter materialises 1-based
 * row ids (deliberate since #2083 — kmc-kmn's TouchLayoutFileWriter calls
 * `row.id.toString()`, so an absent id breaks the writer, and the Keyman
 * schema requires the member); the raw cleanup preserved the absence.
 * Real shipped files all carry row ids, so this class is confined to
 * synthetic/minimal fixtures. Stripping row `id` from both outputs makes
 * the twin compare everything else.
 */
function stripRowIds(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripRowIds);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = stripRowIds(val);
    }
    if (Array.isArray(out["key"])) delete out["id"];
    return out;
  }
  return v;
}

function stripEmptyWireNumerics(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripEmptyWireNumerics);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if ((k === "sp" || k === "width" || k === "pad") && val === "") continue;
      out[k] = stripEmptyWireNumerics(val);
    }
    return out;
  }
  return v;
}

// ---------------------------------------------------------------------------
// Enumerated #2215 semantics divergence (NOT a conversion loss — kept
// textually separate from the conversion intentional-loss list above).
//
// The #2215 ruling adopted numeric `sp` semantics: a string-encoded
// special key (`sp: "1"`) is exempt from nextlayer defaulting exactly as
// numeric `sp: 1` is. The reference above is the verbatim pre-#2215
// algorithm, whose strict wire-value test defaults those keys, so on
// fixtures containing string-encoded special keys the two paths now
// differ BY RULING, on exactly those keys.
//
// This normaliser factory reads the SOURCE layout and deletes
// `nextlayer` from both outputs for every top-level row key whose source
// `sp` is a string in the exclusion set AND whose source carries no
// `nextlayer` — precisely the keys whose `nextlayer` could only have
// come from the reference's defaulting, and nothing else. Keys with an
// authored `nextlayer` are never masked (their value is still compared
// strictly), keys on skipped layers have nothing to mask, and the direct
// semantics suite below pins the new behaviour positively — the twin is
// not the only place the delta is visible. Scoped to the arabic_izza
// and synthetic twin cases, the only fixtures with such keys on
// defaulting-eligible layers.
// ---------------------------------------------------------------------------

const SP_EXCLUSION_SET: readonly number[] = [1, 2, 3, 4, 8, 9, 10];

function stripStringSpNextlayerDefault(content: string): (v: unknown) => unknown {
  const source = JSON.parse(content) as Record<string, unknown>;
  const masked = new Set<string>();
  for (const [platform, data] of Object.entries(source)) {
    if (data === null || typeof data !== "object" || Array.isArray(data)) continue;
    const layers = (data as Record<string, unknown>)["layer"];
    if (!Array.isArray(layers)) continue;
    for (const layer of layers as Array<Record<string, unknown>>) {
      const rows = layer["row"] as Array<{ key?: Array<Record<string, unknown>> }> | undefined;
      for (const row of rows ?? []) {
        for (const key of row.key ?? []) {
          const sp = key["sp"];
          if (typeof sp === "string" && SP_EXCLUSION_SET.includes(Number(sp)) && key["nextlayer"] == null) {
            masked.add(`${platform}:${String(layer["id"])}:${String(key["id"])}`);
          }
        }
      }
    }
  }
  return (v: unknown): unknown => {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return v;
    const out: Record<string, unknown> = {};
    for (const [platform, data] of Object.entries(v as Record<string, unknown>)) {
      if (data === null || typeof data !== "object" || Array.isArray(data)) {
        out[platform] = data;
        continue;
      }
      const pdata = data as Record<string, unknown>;
      const pout: Record<string, unknown> = { ...pdata };
      const layers = pdata["layer"];
      if (Array.isArray(layers)) {
        pout["layer"] = (layers as Array<Record<string, unknown>>).map((layer) => {
          const rows = layer["row"] as Array<Record<string, unknown>> | undefined;
          if (!Array.isArray(rows)) return layer;
          return {
            ...layer,
            row: rows.map((row) => {
              const keys = row["key"] as Array<Record<string, unknown>> | undefined;
              if (!Array.isArray(keys)) return row;
              return {
                ...row,
                key: keys.map((key) => {
                  if (!masked.has(`${platform}:${String(layer["id"])}:${String(key["id"])}`)) return key;
                  const { nextlayer: _dropped, ...rest } = key;
                  return rest;
                }),
              };
            }),
          };
        });
      }
      out[platform] = pout;
    }
    return out;
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const KBDUS = new URL(
  "../../../studio/tests/fixtures/walkBases/release/basic/basic_kbdus/source/basic_kbdus.keyman-touch-layout",
  import.meta.url,
);
const KBDRU = new URL(
  "../../../studio/tests/fixtures/walkBases/release/basic/basic_kbdru/source/basic_kbdru.keyman-touch-layout",
  import.meta.url,
);
const ARABIC_IZZA = new URL("./__fixtures__/arabic_izza.keyman-touch-layout", import.meta.url);
const BAMBARA = new URL("./__fixtures__/bambara.keyman-touch-layout", import.meta.url);

/** The pre-existing scaffolder test's fixture (feature-poor regression anchor). */
const SCAFFOLDER_FIXTURE = JSON.stringify({
  phone: { layer: [{ id: "default", row: [] }] },
  tablet: {
    layer: [
      { id: "default", row: [{ key: [{ id: "K_A", text: "a" }] }] },
      { id: "shift", row: [{ key: [{ id: "K_A", text: "A" }] }] },
    ],
  },
});

/**
 * Synthetic full-surface tablet layout: both clone branches, the caps-skip
 * branch, the whole `sp` matrix in both encodings, nextlayer present /
 * absent / explicit null, non-sequential row ids, per-key display fields,
 * platform display fields, an `sk` child, and untouched desktop + phone
 * platforms. Everything here is inside the codec's modelled surface, so the
 * twin comparison is strict.
 */
const SYNTHETIC = JSON.stringify({
  desktop: {
    layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a", sp: "1" }] }] }],
  },
  phone: {
    layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }],
  },
  tablet: {
    displayUnderlying: true,
    fontsize: "1.1em",
    defaultHint: "custom",
    font: "Tahoma",
    layer: [
      { id: "default", row: [{ id: 5, key: [{ id: "K_A", text: "a", sp: "1" }] }] },
      {
        id: "shift",
        row: [
          {
            id: 7,
            key: [
              { id: "K_A", text: "A" },
              { id: "K_BKSP", text: "⌫", sp: 1 },
              { id: "K_ENTER", text: "⏎", sp: "1" },
              { id: "K_DK", text: "´", sp: 8 },
              { id: "K_DKS", text: "¨", sp: "8" },
              { id: "K_Z", text: "Z", sp: 0 },
              { id: "K_Y", text: "Y", nextlayer: "shift" },
              { id: "K_X", text: "X", nextlayer: null },
              {
                id: "K_W",
                text: "W",
                font: "Arial",
                fontsize: ".6em",
                dk: "dk1",
                hint: "w",
                p: "base-derived",
                width: "100",
                pad: 50,
              },
            ],
          },
          { id: 3, key: [{ id: "K_Q", text: "Q", sk: [{ id: "K_QS", text: "q", sp: 2 }] }] },
        ],
      },
      { id: "rightalt-shift", row: [{ id: 1, key: [{ id: "K_E", text: "€" }] }] },
      { id: "symbol-caps", row: [{ id: 1, key: [{ id: "K_1", text: "1" }] }] },
      { id: "numeric", row: [{ id: 1, key: [{ id: "K_2", text: "2", default: true }] }] },
    ],
  },
});

// ---------------------------------------------------------------------------
// Twin tests — IR path ≡ raw reference, fixture by fixture
// ---------------------------------------------------------------------------

describe("mutateCleanTouchLayout — twin equivalence with the raw cleanup (#313)", () => {
  it("existing scaffolder fixture", () => {
    // Modulo the enumerated row-id materialisation (its rows carry no ids).
    expectTwinEqual(SCAFFOLDER_FIXTURE, stripRowIds);
  });

  it("basic_kbdus (shipped fixture)", () => {
    expectTwinEqual(readFileSync(KBDUS, "utf8"));
  });

  it("basic_kbdru (shipped fixture)", () => {
    // Modulo the one enumerated intentional loss: K_BKQUOTE's `"pad": ""`.
    expectTwinEqual(readFileSync(KBDRU, "utf8"), stripEmptyWireNumerics);
  });

  it("arabic_izza (corpus, string-sp flip case)", () => {
    // Modulo the enumerated #2215 semantics divergence: the reference's
    // wire-value `sp` test defaults the string-encoded frame keys that
    // the ruled numeric semantics exempts.
    const content = readFileSync(ARABIC_IZZA, "utf8");
    expectTwinEqual(content, stripStringSpNextlayerDefault(content));
  });

  it("bambara (corpus, phone-only)", () => {
    expectTwinEqual(readFileSync(BAMBARA, "utf8"));
  });

  it("synthetic full-surface fixture", () => {
    // Modulo the same enumerated #2215 divergence (its shift layer
    // carries K_ENTER `sp: "1"` and K_DKS `sp: "8"`).
    expectTwinEqual(SYNTHETIC, stripStringSpNextlayerDefault(SYNTHETIC));
  });
});

// ---------------------------------------------------------------------------
// Direct IR-level assertions — the branches the twin alone would leave
// implicit, plus the IR bookkeeping the raw form never had to maintain.
// ---------------------------------------------------------------------------

function allKeys(ir: TouchLayoutIR): TouchKeyIR[] {
  const out: TouchKeyIR[] = [];
  const visit = (k: TouchKeyIR): void => {
    out.push(k);
    for (const c of k.sk ?? []) visit(c);
    for (const c of k.multitap ?? []) visit(c);
    for (const c of Object.values(k.flick ?? {})) if (c !== undefined) visit(c);
  };
  for (const p of ir.platforms) {
    for (const l of p.layers) {
      for (const r of l.rows) {
        for (const k of r.keys) visit(k);
      }
    }
  }
  return out;
}

function tabletLayer(ir: TouchLayoutIR, id: string) {
  return ir.platforms
    .find((p) => p.id === "tablet")
    ?.layers.find((l) => l.id === id);
}

function keyById(ir: TouchLayoutIR, layerId: string, keyId: string): TouchKeyIR | undefined {
  return tabletLayer(ir, layerId)?.rows.flatMap((r) => r.keys).find((k) => k.id === keyId);
}

describe("mutateCleanTouchLayout — semantics", () => {
  it("numeric sp semantics (#2215): special keys are exempt in either encoding", () => {
    const ir = parseTouchLayout(SYNTHETIC);
    mutateCleanTouchLayout(ir);
    // Numeric sp in the exclusion set → exempt.
    expect(keyById(ir, "shift", "K_BKSP")?.nextlayer).toBeUndefined();
    expect(keyById(ir, "shift", "K_DK")?.nextlayer).toBeUndefined();
    // String-encoded sp — the same classes in the legacy encoding. The
    // pre-#2215 wire semantics defaulted these (the raw operation's
    // strict includes() missed string values); the #2215 ruling makes
    // the exemption follow the numeric class, not the source spelling.
    expect(keyById(ir, "shift", "K_ENTER")?.nextlayer).toBeUndefined();
    expect(keyById(ir, "shift", "K_DKS")?.nextlayer).toBeUndefined();
    // sp absent / 0 → default; explicit nextlayer (string or null rules).
    expect(keyById(ir, "shift", "K_A")?.nextlayer).toBe("default");
    expect(keyById(ir, "shift", "K_Z")?.nextlayer).toBe("default");
    expect(keyById(ir, "shift", "K_Y")?.nextlayer).toBe("shift");
    expect(keyById(ir, "shift", "K_X")?.nextlayer).toBe("default");
  });

  it("exempts every exclusion-set class in both encodings, and defaults non-set classes in both (#2215)", () => {
    const keys: Array<Record<string, unknown>> = [];
    for (const code of [1, 2, 3, 4, 8, 9, 10]) {
      keys.push({ id: `K_N${code}`, text: "n", sp: code });
      keys.push({ id: `K_S${code}`, text: "s", sp: String(code) });
    }
    keys.push({ id: "K_C5", text: "c", sp: 5 });
    keys.push({ id: "K_C5S", text: "c", sp: "5" });
    const ir = parseTouchLayout(
      JSON.stringify({
        tablet: { layer: [{ id: "shift", row: [{ id: 1, key: keys }] }] },
      }),
    );
    mutateCleanTouchLayout(ir);
    for (const code of [1, 2, 3, 4, 8, 9, 10]) {
      expect(keyById(ir, "shift", `K_N${code}`)?.nextlayer).toBeUndefined();
      expect(keyById(ir, "shift", `K_S${code}`)?.nextlayer).toBeUndefined();
    }
    // A class outside the set defaults in either encoding.
    expect(keyById(ir, "shift", "K_C5")?.nextlayer).toBe("default");
    expect(keyById(ir, "shift", "K_C5S")?.nextlayer).toBe("default");
  });

  it("arabic_izza live case (#2215): the string-sp frame keys gain no nextlayer", () => {
    const ir = parseTouchLayout(readFileSync(ARABIC_IZZA, "utf8"));
    mutateCleanTouchLayout(ir);
    // Tablet shift layer: K_BKSP, K_ENTER, K_LOPT carry `sp: "1"` with no
    // nextlayer in the source. Under the pre-#2215 wire semantics the
    // cleanup defaulted all three; under the ruled numeric semantics
    // they are exempt, as the special keys they are.
    for (const id of ["K_BKSP", "K_ENTER", "K_LOPT"]) {
      expect(keyById(ir, "shift", id)?.nextlayer).toBeUndefined();
    }
    // The author's own authored bounce survives untouched: shift-layer
    // K_SHIFT (`sp: "2"`) carries nextlayer:"default" in the source, and
    // the cleanup never overwrites an explicit nextlayer.
    expect(keyById(ir, "shift", "K_SHIFT")?.nextlayer).toBe("default");
  });

  it("clones shift→caps and rightalt-shift→rightalt-caps, appended, before defaulting", () => {
    const ir = parseTouchLayout(SYNTHETIC);
    mutateCleanTouchLayout(ir);
    const ids = ir.platforms.find((p) => p.id === "tablet")!.layers.map((l) => l.id);
    expect(ids).toEqual(["default", "shift", "rightalt-shift", "symbol-caps", "numeric", "caps", "rightalt-caps"]);
    // The caps clone kept shift's PRE-defaulting state: cloning happens
    // before the defaulting pass and *caps* layers are skipped by it, so
    // caps' plain K_A has no nextlayer even though shift's own copy
    // gained one. (The K_ENTER assertion beside it predates #2215; under
    // the ruled numeric semantics shift's string-sp copy is exempt too,
    // so K_A is now the discriminating key for this branch.)
    expect(keyById(ir, "caps", "K_A")?.nextlayer).toBeUndefined();
    expect(keyById(ir, "caps", "K_ENTER")?.nextlayer).toBeUndefined();
    expect(keyById(ir, "rightalt-caps", "K_E")?.nextlayer).toBeUndefined();
    // *caps* layers are skipped by the defaulting pass.
    expect(keyById(ir, "symbol-caps", "K_1")?.nextlayer).toBeUndefined();
  });

  it("does not clone when caps already exists", () => {
    const ir = parseTouchLayout(
      JSON.stringify({
        tablet: {
          layer: [
            { id: "shift", row: [{ id: 1, key: [{ id: "K_A", text: "A" }] }] },
            { id: "caps", row: [{ id: 1, key: [{ id: "K_A", text: "A" }] }] },
          ],
        },
      }),
    );
    mutateCleanTouchLayout(ir);
    const ids = ir.platforms[0]!.layers.map((l) => l.id);
    expect(ids).toEqual(["shift", "caps"]);
  });

  it("leaves desktop untouched and deletes phone", () => {
    const ir = parseTouchLayout(SYNTHETIC);
    const desktopBefore = JSON.parse(JSON.stringify(ir.platforms.find((p) => p.id === "desktop")));
    mutateCleanTouchLayout(ir);
    expect(ir.platforms.map((p) => p.id)).toEqual(["desktop", "tablet"]);
    expect(ir.platforms.find((p) => p.id === "desktop")).toEqual(desktopBefore);
    // The default layer is never defaulted, on any platform.
    expect(keyById(ir, "default", "K_A")?.nextlayer).toBeUndefined();
  });

  it("keeps nodeIds consistent: unique nodeIds, every index ref resolves, no phone entries", () => {
    const ir = parseTouchLayout(readFileSync(ARABIC_IZZA, "utf8"));
    mutateCleanTouchLayout(ir);
    const keys = allKeys(ir);
    const nodeIdSet = new Set(keys.map((k) => k.nodeId));
    expect(nodeIdSet.size).toBe(keys.length);
    const addresses = ir.nodeIds.map(([a]) => a);
    expect(new Set(addresses).size).toBe(addresses.length);
    for (const [address, ref] of ir.nodeIds) {
      expect(address.startsWith("phone:")).toBe(false);
      expect(nodeIdSet.has(ref.nodeId)).toBe(true);
    }
    // Cloned caps keys carry fresh nodeIds, distinct from their shift twins.
    const shiftIds = new Set(
      (tabletLayer(ir, "shift")?.rows.flatMap((r) => r.keys) ?? []).map((k) => k.nodeId),
    );
    for (const capsKey of tabletLayer(ir, "caps")?.rows.flatMap((r) => r.keys) ?? []) {
      expect(shiftIds.has(capsKey.nodeId)).toBe(false);
    }
  });

  it("a layout with no tablet is left structurally alone apart from phone deletion", () => {
    const ir = parseTouchLayout(
      JSON.stringify({
        desktop: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }] },
        phone: { layer: [{ id: "default", row: [] }] },
      }),
    );
    mutateCleanTouchLayout(ir);
    expect(ir.platforms.map((p) => p.id)).toEqual(["desktop"]);
  });
});
