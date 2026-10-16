/**
 * #2216 — per-mutator wire-hint clearing (pattern-apply layer).
 *
 * A `*Wire` hint records the source encoding of the value it was parsed
 * with. When a mutator changes `sp`/`width`/`pad`, the matching hint must
 * be dropped (per field, change-gated) so neither the emitter nor any other
 * IR consumer can resurrect the old value; when the numeric is unchanged,
 * the hint must survive untouched (#2083 fidelity — a text-only edit must
 * not re-encode a single key). The emitter-side invariant itself is pinned
 * in codec/touch-layout-wire-staleness.test.ts.
 */

import { describe, it, expect } from "vitest";
import type { TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import { touchKey } from "@keyboard-studio/contracts/fixtures";
import { parseTouchLayout } from "../codec/parse-touch.js";
import { applyKeyEditsToLayout } from "./applyKeyEditsToLayout.js";
import { applyDesktopModifications } from "./applyDesktopModifications.js";
import { BLANK_KEY_ID, BLANK_KEY_SP } from "./touch-mechanism-shared.js";
import type { KeyEditOperation } from "./keyEditOps.js";
import { touchKeyAddress } from "./touchKeyAddress.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type WireKey = Record<string, unknown>;

/** Parse a one-row phone layout from wire JSON so every key carries hints. */
function parsedLayout(keys: WireKey[]): TouchLayoutIR {
  return parseTouchLayout(
    JSON.stringify({
      phone: { layer: [{ id: "default", row: [{ id: 1, key: keys }] }] },
    }),
  );
}

function keyById(layout: TouchLayoutIR, id: string): TouchKeyIR {
  const key = layout.platforms[0]!.layers[0]!.rows[0]!.keys.find((k) => k.id === id);
  expect(key, `key ${id} present`).toBeDefined();
  return key!;
}

const addr = (id: string) => touchKeyAddress("phone", "default", id);

/** Recursively assert no key carries a hint that disagrees with its numeric. */
function expectWireConsistent(key: TouchKeyIR): void {
  for (const [numeric, wire] of [
    ["sp", "spWire"],
    ["width", "widthWire"],
    ["pad", "padWire"],
  ] as const) {
    const hint = key[wire];
    if (hint !== undefined) {
      expect(
        Number(hint),
        `${key.id}.${wire} must denote ${numeric}=${String(key[numeric])}`,
      ).toBe(key[numeric]);
    }
  }
  for (const sub of key.sk ?? []) expectWireConsistent(sub);
  for (const sub of key.multitap ?? []) expectWireConsistent(sub);
  for (const sub of Object.values(key.flick ?? {})) {
    if (sub !== undefined) expectWireConsistent(sub);
  }
}

function expectLayoutWireConsistent(layout: TouchLayoutIR): void {
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) expectWireConsistent(key);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// mergeFieldsIntoKey paths: set / suppress / setSubKey
// ---------------------------------------------------------------------------

describe("#2216 mergeFieldsIntoKey: change-gated per-field hint clearing", () => {
  const base = () =>
    parsedLayout([
      { id: "K_A", text: "a", sp: "1", width: "100", pad: "50" },
      { id: "K_B", text: "b", sp: 0 },
    ]);

  it("set {sp} drops spWire only — width/pad hints survive", () => {
    const { layout } = applyKeyEditsToLayout(base(), [
      { seq: 1, kind: "set", address: addr("K_A"), fields: { sp: 2 } },
    ]);
    const key = keyById(layout, "K_A");
    expect(key.sp).toBe(2);
    expect(key.spWire).toBeUndefined();
    expect(key.widthWire).toBe("100");
    expect(key.padWire).toBe("50");
  });

  it("set {width} drops widthWire only; set {pad} drops padWire only", () => {
    const { layout: byWidth } = applyKeyEditsToLayout(base(), [
      { seq: 1, kind: "set", address: addr("K_A"), fields: { width: 140 } },
    ]);
    const w = keyById(byWidth, "K_A");
    expect(w.width).toBe(140);
    expect(w.widthWire).toBeUndefined();
    expect(w.spWire).toBe("1");
    expect(w.padWire).toBe("50");

    const { layout: byPad } = applyKeyEditsToLayout(base(), [
      { seq: 1, kind: "set", address: addr("K_A"), fields: { pad: 20 } },
    ]);
    const p = keyById(byPad, "K_A");
    expect(p.pad).toBe(20);
    expect(p.padWire).toBeUndefined();
    expect(p.spWire).toBe("1");
    expect(p.widthWire).toBe("100");
  });

  it("text-only set retains every hint (no re-encoding of an unedited geometry)", () => {
    const { layout } = applyKeyEditsToLayout(base(), [
      { seq: 1, kind: "set", address: addr("K_A"), fields: { text: "A" } },
    ]);
    const key = keyById(layout, "K_A");
    expect(key.text).toBe("A");
    expect(key.spWire).toBe("1");
    expect(key.widthWire).toBe("100");
    expect(key.padWire).toBe("50");
  });

  it("set {sp} to the SAME numeric retains spWire (the hint still denotes the value)", () => {
    const { layout } = applyKeyEditsToLayout(base(), [
      { seq: 1, kind: "set", address: addr("K_A"), fields: { sp: 1 } },
    ]);
    const key = keyById(layout, "K_A");
    expect(key.sp).toBe(1);
    expect(key.spWire).toBe("1");
  });

  it("suppress (sp → 9) drops spWire", () => {
    const { layout } = applyKeyEditsToLayout(base(), [
      {
        seq: 1,
        kind: "suppress",
        address: addr("K_A"),
        spClass: 9,
        sentinelId: "T_BLANK",
      },
    ]);
    const key = keyById(layout, "T_BLANK");
    expect(key.sp).toBe(9);
    expect(key.spWire).toBeUndefined();
  });

  it("setSubKey changing a sub-key's sp drops the sub-key's spWire", () => {
    const layout0 = parsedLayout([
      { id: "K_P", text: "p", sk: [{ id: "U_00E7", text: "ç", sp: "1" }] },
    ]);
    const { layout } = applyKeyEditsToLayout(layout0, [
      {
        seq: 1,
        kind: "setSubKey",
        address: addr("K_P"),
        sub: { kind: "sk", id: "U_00E7" },
        fields: { sp: 2 },
      },
    ]);
    const sub = keyById(layout, "K_P").sk![0]!;
    expect(sub.sp).toBe(2);
    expect(sub.spWire).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// redistributeFreedWidth
// ---------------------------------------------------------------------------

describe("#2216 redistributeFreedWidth: moved widths drop widthWire", () => {
  it("remove + redistribute clears widthWire on every sibling whose width moved", () => {
    const layout0 = parsedLayout([
      { id: "K_GONE", text: "g", width: "60" },
      { id: "K_B", text: "b", width: 100 },
      { id: "K_C", text: "c", width: "100" },
    ]);
    const { layout } = applyKeyEditsToLayout(layout0, [
      { seq: 1, kind: "remove", address: addr("K_GONE"), outcome: "redistribute" },
    ]);
    // 60 freed across 2 remaining keys: +30 each.
    const b = keyById(layout, "K_B");
    expect(b.width).toBe(130);
    expect(b.widthWire).toBeUndefined();
    const c = keyById(layout, "K_C");
    expect(c.width).toBe(130);
    expect(c.widthWire).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// applyDesktopModifications placeholder (stripRemovedFromKey)
// ---------------------------------------------------------------------------

describe("#2216 applyDesktopModifications: blanking a key drops its stale spWire", () => {
  it("a parsed sp:\"0\" key carved to a blank emits/holds sp 10 with no spWire", () => {
    const carved = touchKey({
      id: "K_A",
      text: "a",
      output: "a",
      sp: 0,
      spWire: "0",
    });
    const layout: TouchLayoutIR = {
      platforms: [
        { id: "phone", layers: [{ id: "default", rows: [{ keys: [carved] }] }] },
      ],
      nodeIds: [],
    };
    const { layout: out } = applyDesktopModifications(layout, {
      removals: ["a"],
      placements: [],
    });
    const blank = out.platforms[0]!.layers[0]!.rows[0]!.keys.find(
      (k) => k.id === BLANK_KEY_ID,
    )!;
    expect(blank.sp).toBe(BLANK_KEY_SP);
    expect(blank.spWire).toBeUndefined();
  });

  it("a key already at the blank class keeps its hint (value unchanged)", () => {
    const alreadyBlankClass = touchKey({
      id: "K_A",
      text: "a",
      output: "a",
      sp: BLANK_KEY_SP,
      spWire: BLANK_KEY_SP,
    });
    const layout: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [{ id: "default", rows: [{ keys: [alreadyBlankClass] }] }],
        },
      ],
      nodeIds: [],
    };
    const { layout: out } = applyDesktopModifications(layout, {
      removals: ["a"],
      placements: [],
    });
    const blank = out.platforms[0]!.layers[0]!.rows[0]!.keys.find(
      (k) => k.id === BLANK_KEY_ID,
    )!;
    expect(blank.sp).toBe(BLANK_KEY_SP);
    expect(blank.spWire).toBe(BLANK_KEY_SP);
  });
});

// ---------------------------------------------------------------------------
// Whole-result consistency (the twin-strip companion assertion)
// ---------------------------------------------------------------------------

describe("#2216 Case A results are wire-consistent after a mixed op list", () => {
  it("no key in the result carries a hint that disagrees with its numeric", () => {
    const layout0 = parsedLayout([
      { id: "K_A", text: "a", sp: "1", width: "100", pad: "50" },
      { id: "K_B", text: "b", sp: 0, width: 100 },
      { id: "K_C", text: "c", width: "80" },
    ]);
    const ops: KeyEditOperation[] = [
      { seq: 1, kind: "set", address: addr("K_A"), fields: { sp: 2, width: 140 } },
      { seq: 2, kind: "set", address: addr("K_B"), fields: { text: "B" } },
      { seq: 3, kind: "remove", address: addr("K_C"), outcome: "redistribute" },
    ];
    const { layout } = applyKeyEditsToLayout(layout0, ops);
    expectLayoutWireConsistent(layout);
  });
});
