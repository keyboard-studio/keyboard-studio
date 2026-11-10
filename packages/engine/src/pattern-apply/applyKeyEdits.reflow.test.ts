/**
 * applyKeyEdits.reflow.test — issue #2360 "Long keys".
 *
 * The defect: `remove` + `"reflow"` spliced the key out and wrote nothing,
 * so the row's total width dropped by the removed key's `width + pad` —
 * and every renderer (KeyGrid per FR-012 / ADR 0002, the touch-builder
 * canvas on narrow viewports, Keyman Web itself) stretches the row's last
 * key to fill the gap. Deleting one key from a 10-key row made its last
 * key ~2x wide (declared 100, rendered 215).
 *
 * The fix (ruling: ~/workspace/keyboard-studio-notes/2360-ruling.md —
 * the filed note's third option, "leave some padding at the end"):
 * `reflow` leaves the freed width as trailing padding — a `T_SPACER`
 * (`sp: 10`) key at the end of the row carrying the removed key's
 * `width`/`pad` (growing the existing trailing spacer when one is
 * already there). The row keeps its total width, so no remaining key
 * stretches. Both appliers implement it identically; the twin
 * comparison below holds them to that.
 *
 * PR #2583 follow-up (Matthew's ruling: "When the last button is a
 * modifier key, it can be larger, as long as it's less than 3x a regular
 * key"): when the row's last remaining key is a modifier key, it may
 * absorb freed width up to — but not reaching — 3x a regular key's width,
 * and only the excess beyond that cap goes into the trailing spacer (as
 * `width` with an explicit `pad: 0`); when the freed width fits under the
 * cap, no spacer is left at all. The cap is measured against the layer
 * maximum from the layer's other rows, so it holds across repeated
 * reflows in one overlay. Non-modifier-last rows are unchanged.
 */

import { describe, expect, it } from "vitest";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import { parseTouchLayout } from "../codec/parse-touch.js";
import { applyKeyEditsToLayout } from "./applyKeyEditsToLayout.js";
import { applyKeyEditsToRawJson } from "./applyKeyEditsToRawJson.js";
import { computeRowMetrics } from "./rowMetrics.js";
import type { KeyEditOperation } from "./keyEditOps.js";
import { touchKeyAddress } from "./touchKeyAddress.js";

// Two rows of ten keys, every key `width: 100, pad: 15` — each row totals
// 10 × 115 = 1150, so the layer max is 1150 and no row has slack.
function rowJson(prefix: string): string {
  const keys = Array.from(
    { length: 10 },
    (_, i) =>
      `{ "id": "${prefix}${i}", "text": "${prefix}${i}", "width": "100", "pad": "15" }`,
  ).join(",\n");
  return `{ "id": 1, "key": [${keys}] }`;
}

const LAYOUT_JSON = `{
  "phone": { "layer": [
    { "id": "default", "row": [ ${rowJson("A")}, ${rowJson("B")} ] }
  ] }
}`;

const layout = (): TouchLayoutIR => parseTouchLayout(LAYOUT_JSON);

// --- PR #2583 follow-up fixtures: rows ending in a modifier key. ---

const SHIFT_KEY_JSON = `{ "id": "K_SHIFT", "text": "*Shift*", "sp": "1", "width": "100", "pad": "15", "nextlayer": "shift" }`;
// A T_ modifier: no modifier id, but its nextlayer opens a modifier layer.
const RALT_TOGGLE_KEY_JSON = `{ "id": "T_ks_rightalt_toggle", "text": "*RAlt*", "sp": "1", "width": "100", "pad": "15", "nextlayer": "rightalt" }`;
// A frame key, NOT a modifier — rows ordinarily end in one of these.
const BKSP_KEY_JSON = `{ "id": "K_BKSP", "text": "*BkSp*", "sp": "1", "width": "100", "pad": "15" }`;

/** Nine regular keys plus the given last key — still 10 × 115 = 1150 total. */
function rowJsonWithLastKey(prefix: string, lastKeyJson: string): string {
  const keys = Array.from(
    { length: 9 },
    (_, i) =>
      `{ "id": "${prefix}${i}", "text": "${prefix}${i}", "width": "100", "pad": "15" }`,
  ).join(",\n");
  return `{ "id": 1, "key": [${keys},\n${lastKeyJson}] }`;
}

const MODIFIER_LAYOUT_JSON = `{
  "phone": { "layer": [
    { "id": "default", "row": [ ${rowJsonWithLastKey("A", SHIFT_KEY_JSON)}, ${rowJson("B")} ] }
  ] }
}`;

const RALT_LAYOUT_JSON = `{
  "phone": { "layer": [
    { "id": "default", "row": [ ${rowJsonWithLastKey("A", RALT_TOGGLE_KEY_JSON)}, ${rowJson("B")} ] }
  ] }
}`;

const BKSP_LAYOUT_JSON = `{
  "phone": { "layer": [
    { "id": "default", "row": [ ${rowJsonWithLastKey("A", BKSP_KEY_JSON)}, ${rowJson("B")} ] }
  ] }
}`;

const SINGLE_MODIFIER_ROW_JSON = `{
  "phone": { "layer": [
    { "id": "default", "row": [ ${rowJsonWithLastKey("A", SHIFT_KEY_JSON)} ] }
  ] }
}`;

function rowTotal(row: { keys: readonly { width?: number; pad?: number; sp?: number }[] }): number {
  return computeRowMetrics(row.keys, "phone").rowTotal;
}

/** Layer max − this row's total: what the renderers add to the last key. */
function slackOf(result: TouchLayoutIR, rowIndex: number): number {
  const rows = result.platforms[0]!.layers[0]!.rows;
  const max = Math.max(...rows.map(rowTotal));
  return max - rowTotal(rows[rowIndex]!);
}

function reflowOp(address: string, seq = 0): KeyEditOperation {
  return { seq, kind: "remove", address, outcome: "reflow" };
}

/** The first row of `json` after running `ops` through Case B (raw JSON), re-parsed. */
function caseBFirstRow(json: string, ops: KeyEditOperation[]) {
  const caseB = applyKeyEditsToRawJson(json, ops);
  expect(caseB.warnings).toEqual([]);
  return parseTouchLayout(caseB.json).platforms[0]!.layers[0]!.rows[0]!;
}

/** A row's keys stripped to the fields the twins must agree on. */
function stripRow(row: {
  keys: readonly { id: string; sp?: number; width?: number; pad?: number; text?: string }[];
}) {
  return row.keys.map(({ id, sp, width, pad, text }) => ({ id, sp, width, pad, text }));
}

describe("issue #2360: remove + reflow leaves padding at the end", () => {
  it("reproduces the defect's shape: row total and last-key width are unchanged", () => {
    const op = reflowOp(touchKeyAddress("phone", "default", "A4"));
    const { layout: out, orphaned } = applyKeyEditsToLayout(layout(), [op]);
    expect(orphaned).toEqual([]);

    const row = out.platforms[0]!.layers[0]!.rows[0]!;
    // The key is gone…
    expect(row.keys.map((k) => k.id)).not.toContain("A4");
    // …but the row keeps its total width: the freed 115 units stay in the
    // row as trailing padding instead of stretching the last key.
    expect(rowTotal(row)).toBe(1150);
    expect(slackOf(out, 0)).toBe(0);
    // The last REAL key keeps its declared width…
    const lastReal = row.keys.filter((k) => k.id !== "T_SPACER").at(-1)!;
    expect(lastReal.id).toBe("A9");
    expect(lastReal.width).toBe(100);
    // …and the padding is a trailing spacer carrying the removed key's geometry.
    const pad = row.keys.at(-1)!;
    expect(pad.id).toBe("T_SPACER");
    expect(pad.sp).toBe(10);
    expect(pad.width).toBe(100);
    expect(pad.pad).toBe(15);
  });

  it("a second reflow grows the existing trailing spacer instead of adding another", () => {
    const ops = [
      reflowOp(touchKeyAddress("phone", "default", "A4"), 0),
      reflowOp(touchKeyAddress("phone", "default", "A5"), 1),
    ];
    const { layout: out, orphaned } = applyKeyEditsToLayout(layout(), ops);
    expect(orphaned).toEqual([]);

    const row = out.platforms[0]!.layers[0]!.rows[0]!;
    expect(row.keys.map((k) => k.id)).toEqual([
      "A0", "A1", "A2", "A3", "A6", "A7", "A8", "A9", "T_SPACER",
    ]);
    expect(rowTotal(row)).toBe(1150);
    const pad = row.keys.at(-1)!;
    expect(pad.width).toBe(200);
    expect(pad.pad).toBe(30);
  });

  it("reflowing the last key leaves the pad in its place; the new last real key is untouched", () => {
    const op = reflowOp(touchKeyAddress("phone", "default", "A9"));
    const { layout: out } = applyKeyEditsToLayout(layout(), [op]);
    const row = out.platforms[0]!.layers[0]!.rows[0]!;
    expect(row.keys.map((k) => k.id)).toEqual([
      "A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "T_SPACER",
    ]);
    expect(rowTotal(row)).toBe(1150);
    expect(row.keys.at(-2)!.width).toBe(100);
  });

  it("reflowing the only key in a row leaves the row empty (unchanged behaviour)", () => {
    const singleJson = `{
      "phone": { "layer": [
        { "id": "default", "row": [ { "id": 1, "key": [
          { "id": "K_ONLY", "text": "x", "width": "100", "pad": "15" }
        ] } ] }
      ] }
    }`;
    const { layout: out } = applyKeyEditsToLayout(parseTouchLayout(singleJson), [
      reflowOp(touchKeyAddress("phone", "default", "K_ONLY")),
    ]);
    expect(out.platforms[0]!.layers[0]!.rows[0]!.keys).toEqual([]);
  });

  it("redistribute is unchanged: freed width is shared, no spacer appears", () => {    const op: KeyEditOperation = {
      seq: 0,
      kind: "remove",
      address: touchKeyAddress("phone", "default", "A4"),
      outcome: "redistribute",
    };
    const { layout: out } = applyKeyEditsToLayout(layout(), [op]);
    const row = out.platforms[0]!.layers[0]!.rows[0]!;
    expect(row.keys.map((k) => k.id)).not.toContain("T_SPACER");
    expect(row.keys).toHaveLength(9);
    // 100 freed over 9 keys: each grows by 100/9 (pad untouched — the
    // removed key's pad is NOT redistributed, so the row total drops by
    // that 15; pre-existing behaviour, out of #2360's scope).
    expect(row.keys[0]!.width).toBeCloseTo(100 + 100 / 9, 10);
    expect(rowTotal(row)).toBe(1135);
  });

  it('"drop" removes the key and its width: the row closes up, no spacer', () => {
    const op: KeyEditOperation = {
      seq: 0,
      kind: "remove",
      address: touchKeyAddress("phone", "default", "A4"),
      outcome: "drop",
    };
    const { layout: out, orphaned } = applyKeyEditsToLayout(layout(), [op]);
    expect(orphaned).toEqual([]);
    const row = out.platforms[0]!.layers[0]!.rows[0]!;
    expect(row.keys.map((k) => k.id)).toEqual([
      "A0", "A1", "A2", "A3", "A5", "A6", "A7", "A8", "A9",
    ]);
    expect(rowTotal(row)).toBe(1035);
    // The row closed up, so the last key now carries the 115 slack at
    // render time — that is what "drop" means, and why no author-facing
    // surface offers it (see RemoveKeyOp).
    expect(slackOf(out, 0)).toBe(115);

    // Case B agrees.
    const caseB = applyKeyEditsToRawJson(LAYOUT_JSON, [op]);
    expect(caseB.warnings).toEqual([]);
    const caseBRow = parseTouchLayout(caseB.json).platforms[0]!.layers[0]!.rows[0]!;
    expect(caseBRow.keys.map((k) => k.id)).toEqual(row.keys.map((k) => k.id));
    expect(rowTotal(caseBRow)).toBe(1035);
  });

  it("Case B (raw JSON) agrees with Case A, byte-for-byte after re-parse", () => {
    const ops = [
      reflowOp(touchKeyAddress("phone", "default", "A4"), 0),
      reflowOp(touchKeyAddress("phone", "default", "A5"), 1),
    ];
    const caseA = applyKeyEditsToLayout(layout(), ops);
    const caseB = applyKeyEditsToRawJson(LAYOUT_JSON, ops);
    expect(caseB.warnings).toEqual([]);
    const caseBAsIR = parseTouchLayout(caseB.json);

    const strip = (l: TouchLayoutIR) =>
      l.platforms[0]!.layers[0]!.rows.map((row) =>
        row.keys.map(({ id, sp, width, pad, text }) => ({ id, sp, width, pad, text })),
      );
    expect(strip(caseBAsIR)).toEqual(strip(caseA.layout));
  });
});

describe("PR #2583 follow-up: a trailing modifier key may stretch, under 3x", () => {
  it("freed width under the cap: no spacer, the modifier absorbs it all", () => {
    const op = reflowOp(touchKeyAddress("phone", "default", "A4"));
    const { layout: out, orphaned } = applyKeyEditsToLayout(
      parseTouchLayout(MODIFIER_LAYOUT_JSON),
      [op],
    );
    expect(orphaned).toEqual([]);

    const row = out.platforms[0]!.layers[0]!.rows[0]!;
    expect(row.keys.map((k) => k.id)).toEqual([
      "A0", "A1", "A2", "A3", "A5", "A6", "A7", "A8", "K_SHIFT",
    ]);
    // The row total drops by the freed 115 — that slack now renders onto
    // the modifier: declared 100, rendered 215, under 3x a regular key.
    expect(rowTotal(row)).toBe(1035);
    expect(slackOf(out, 0)).toBe(115);
    const last = row.keys.at(-1)!;
    expect(last.id).toBe("K_SHIFT");
    expect(last.width).toBe(100);

    // Case B agrees.
    expect(stripRow(caseBFirstRow(MODIFIER_LAYOUT_JSON, [op]))).toEqual(stripRow(row));
  });

  it("freed width over the cap: a partial spacer caps absorption just under 3x", () => {
    const ops = [
      reflowOp(touchKeyAddress("phone", "default", "A4"), 0),
      reflowOp(touchKeyAddress("phone", "default", "A5"), 1),
    ];
    const { layout: out, orphaned } = applyKeyEditsToLayout(
      parseTouchLayout(MODIFIER_LAYOUT_JSON),
      ops,
    );
    expect(orphaned).toEqual([]);

    const row = out.platforms[0]!.layers[0]!.rows[0]!;
    expect(row.keys.map((k) => k.id)).toEqual([
      "A0", "A1", "A2", "A3", "A6", "A7", "A8", "K_SHIFT", "T_SPACER",
    ]);
    // The first reflow absorbed 115 (rendered 215); the second may absorb
    // only 84 more before the modifier would reach 3x — so a 31-wide
    // spacer carries the rest, capping the rendered width at 299.
    const pad = row.keys.at(-1)!;
    expect(pad.id).toBe("T_SPACER");
    expect(pad.sp).toBe(10);
    expect(pad.width).toBe(31);
    expect(pad.pad).toBe(0);
    expect(rowTotal(row)).toBe(951);
    expect(slackOf(out, 0)).toBe(199);

    // Case B agrees.
    expect(stripRow(caseBFirstRow(MODIFIER_LAYOUT_JSON, ops))).toEqual(stripRow(row));
  });

  it("a T_ modifier (nextlayer opens a modifier layer) narrows the same way", () => {
    const op = reflowOp(touchKeyAddress("phone", "default", "A4"));
    const { layout: out, orphaned } = applyKeyEditsToLayout(
      parseTouchLayout(RALT_LAYOUT_JSON),
      [op],
    );
    expect(orphaned).toEqual([]);

    const row = out.platforms[0]!.layers[0]!.rows[0]!;
    expect(row.keys.map((k) => k.id)).toEqual([
      "A0", "A1", "A2", "A3", "A5", "A6", "A7", "A8", "T_ks_rightalt_toggle",
    ]);
    expect(rowTotal(row)).toBe(1035);
    expect(slackOf(out, 0)).toBe(115);

    // Case B agrees.
    expect(stripRow(caseBFirstRow(RALT_LAYOUT_JSON, [op]))).toEqual(stripRow(row));
  });

  it("a trailing frame key (K_BKSP) is not a modifier: full spacer, unchanged", () => {
    const op = reflowOp(touchKeyAddress("phone", "default", "A4"));
    const { layout: out } = applyKeyEditsToLayout(parseTouchLayout(BKSP_LAYOUT_JSON), [op]);
    const row = out.platforms[0]!.layers[0]!.rows[0]!;
    expect(row.keys.map((k) => k.id)).toEqual([
      "A0", "A1", "A2", "A3", "A5", "A6", "A7", "A8", "K_BKSP", "T_SPACER",
    ]);
    expect(rowTotal(row)).toBe(1150);
    expect(slackOf(out, 0)).toBe(0);
    const pad = row.keys.at(-1)!;
    expect(pad.width).toBe(100);
    expect(pad.pad).toBe(15);

    // Case B agrees.
    expect(stripRow(caseBFirstRow(BKSP_LAYOUT_JSON, [op]))).toEqual(stripRow(row));
  });

  it("a modifier-last row that IS the layer maximum never needs a spacer", () => {
    const ops = [
      reflowOp(touchKeyAddress("phone", "default", "A4"), 0),
      reflowOp(touchKeyAddress("phone", "default", "A5"), 1),
    ];
    const { layout: out } = applyKeyEditsToLayout(
      parseTouchLayout(SINGLE_MODIFIER_ROW_JSON),
      ops,
    );
    const row = out.platforms[0]!.layers[0]!.rows[0]!;
    expect(row.keys.map((k) => k.id)).toEqual([
      "A0", "A1", "A2", "A3", "A6", "A7", "A8", "K_SHIFT",
    ]);
    expect(rowTotal(row)).toBe(920);
    // The row is the layer maximum, so its last key never stretches — the
    // modifier renders at its declared 100 whatever is reflowed out.
    expect(slackOf(out, 0)).toBe(0);

    // Case B agrees.
    expect(stripRow(caseBFirstRow(SINGLE_MODIFIER_ROW_JSON, ops))).toEqual(stripRow(row));
  });
});
