// Unit tests for the placement modal's op planner.
import { describe, expect, it } from "vitest";
import type { TouchKeyIR } from "@keyboard-studio/contracts";
import {
  buildPanelDropOps,
  buildPlacementOps,
  buildSubkeyMoveOps,
  isPreservableText,
  parsePanelDropSpec,
  placementOccupant,
  serializePanelDropSpec,
  touchGestureIntent,
} from "./placementOps.ts";

const ADDR = "phone:default:K_A#0";

function key(overrides: Partial<TouchKeyIR> = {}): TouchKeyIR {
  return { nodeId: "n1", id: "K_A", ...overrides };
}

describe("isPreservableText", () => {
  it("rejects empty, undefined, and *Special* aliases", () => {
    expect(isPreservableText(undefined)).toBe(false);
    expect(isPreservableText("")).toBe(false);
    expect(isPreservableText("*Shift*")).toBe(false);
    expect(isPreservableText("*Backspace*")).toBe(false);
  });
  it("accepts real glyphs", () => {
    expect(isPreservableText("a")).toBe(true);
    expect(isPreservableText("ɓ")).toBe(true);
  });
});

describe("buildPlacementOps", () => {
  it("surface on an empty key: single set of text+output", () => {
    const plan = buildPlacementOps(ADDR, key(), "ɓ", { slot: "surface", displaced: null }, "T_new_1");
    expect(plan.ops).toEqual([
      { address: ADDR, kind: "set", fields: { text: "ɓ", output: "ɓ" } },
    ]);
    expect(plan.displacedBackToTray).toBeNull();
  });

  it("surface replacing a glyph with demote: set + longpress", () => {
    const plan = buildPlacementOps(
      ADDR, key({ text: "a" }), "ɓ",
      { slot: "surface", displaced: "demote" }, "T_new_1",
    );
    expect(plan.ops).toEqual([
      { address: ADDR, kind: "set", fields: { text: "ɓ", output: "ɓ" } },
      {
        address: ADDR, kind: "setSubKey",
        sub: { kind: "sk", id: "T_new_1" },
        fields: { id: "T_new_1", text: "a", sp: 0 },
      },
    ]);
    expect(plan.displacedBackToTray).toBeNull();
  });

  it("surface replacing a glyph with sendBack: set + tray return", () => {
    const plan = buildPlacementOps(
      ADDR, key({ text: "a" }), "ɓ",
      { slot: "surface", displaced: "sendBack" }, "T_new_1",
    );
    expect(plan.ops).toEqual([
      { address: ADDR, kind: "set", fields: { text: "ɓ", output: "ɓ" } },
    ]);
    expect(plan.displacedBackToTray).toBe("a");
  });

  it("surface replacing a *Special* alias: no occupant, plain set", () => {
    const plan = buildPlacementOps(
      ADDR, key({ text: "*Shift*", sp: 1 }), "ɓ",
      { slot: "surface", displaced: "demote" }, "T_new_1",
    );
    expect(plan.ops).toEqual([
      { address: ADDR, kind: "set", fields: { text: "ɓ", output: "ɓ" } },
    ]);
    expect(plan.displacedBackToTray).toBeNull();
  });

  it("longpress: single upsert, never displaces", () => {
    const plan = buildPlacementOps(ADDR, key({ text: "a" }), "ɓ", { slot: "longpress" }, "T_new_7");
    expect(plan.ops).toEqual([
      {
        address: ADDR, kind: "setSubKey",
        sub: { kind: "sk", id: "T_new_7" },
        fields: { id: "T_new_7", text: "ɓ", sp: 0 },
      },
    ]);
  });

  it("flick into an empty direction: single upsert", () => {
    const plan = buildPlacementOps(
      ADDR, key({ text: "a" }), "ɓ",
      { slot: "flick", direction: "ne", displaced: null }, "T_new_1",
    );
    expect(plan.ops).toEqual([
      {
        address: ADDR, kind: "setSubKey",
        sub: { kind: "flick", id: "ne" },
        fields: { id: "ne", text: "ɓ", sp: 0 },
      },
    ]);
  });

  it("flick replacing an occupied direction with demote", () => {
    const target = key({
      text: "a",
      flick: { ne: { nodeId: "n2", id: "ne", text: "x" } },
    });
    const plan = buildPlacementOps(
      ADDR, target, "ɓ",
      { slot: "flick", direction: "ne", displaced: "demote" }, "T_new_1",
    );
    expect(plan.ops).toEqual([
      {
        address: ADDR, kind: "setSubKey",
        sub: { kind: "flick", id: "ne" },
        fields: { id: "ne", text: "ɓ", sp: 0 },
      },
      {
        address: ADDR, kind: "setSubKey",
        sub: { kind: "sk", id: "T_new_1" },
        fields: { id: "T_new_1", text: "x", sp: 0 },
      },
    ]);
  });

  it("multitap 2x on an empty key: single entry", () => {
    const plan = buildPlacementOps(
      ADDR, key({ text: "a" }), "ɓ", { slot: "multitap", tap: 2 }, "T_new_1",
    );
    expect(plan.ops).toEqual([
      {
        address: ADDR, kind: "setSubKey",
        sub: { kind: "multitap", id: "T_new_1" },
        fields: { id: "T_new_1", text: "ɓ", sp: 0 },
      },
    ]);
  });

  it("multitap 3x with one existing entry: appends second", () => {
    const target = key({
      text: "a",
      multitap: [{ nodeId: "n2", id: "T_new_9", text: "x", sp: 0 }],
    });
    const plan = buildPlacementOps(
      ADDR, target, "ɓ", { slot: "multitap", tap: 3 }, "T_new_1",
    );
    expect(plan.ops.map((o) => o.kind)).toEqual(["removeSubKey", "setSubKey", "setSubKey"]);
    const sets = plan.ops.filter((o) => o.kind === "setSubKey");
    expect(sets.map((o) => (o.kind === "setSubKey" ? o.sub.id : null))).toEqual([
      "T_new_9",
      "T_new_1",
    ]);
    expect(sets[1]).toMatchObject({ fields: { id: "T_new_1", text: "ɓ" } });
  });

  it("multitap 2x with two existing entries: reorders newcomer first", () => {
    const target = key({
      text: "a",
      multitap: [
        { nodeId: "n2", id: "T_new_8", text: "x", sp: 0 },
        { nodeId: "n3", id: "T_new_9", text: "y", sp: 0 },
      ],
    });
    const plan = buildPlacementOps(
      ADDR, target, "ɓ", { slot: "multitap", tap: 2 }, "T_new_1",
    );
    expect(plan.ops.map((o) => o.kind)).toEqual([
      "removeSubKey",
      "removeSubKey",
      "setSubKey",
      "setSubKey",
      "setSubKey",
    ]);
    const sets = plan.ops.filter((o) => o.kind === "setSubKey");
    expect(sets.map((o) => (o.kind === "setSubKey" ? o.fields.text : null))).toEqual([
      "ɓ",
      "x",
      "y",
    ]);
  });
});

describe("placementOccupant", () => {
  it("reads the surface and flick slots", () => {
    expect(placementOccupant(key({ text: "a" }), { slot: "surface", displaced: null })).toBe("a");
    expect(
      placementOccupant(key({ flick: { s: { nodeId: "n2", id: "s", text: "z" } } }), {
        slot: "flick",
        direction: "s",
        displaced: null,
      }),
    ).toBe("z");
    expect(placementOccupant(key(), { slot: "surface", displaced: null })).toBeNull();
    expect(placementOccupant(key({ text: "a" }), { slot: "longpress" })).toBeNull();
  });
});

describe("touchGestureIntent", () => {
  it("is undecided inside the slop (a tap in the making)", () => {
    expect(touchGestureIntent(0, 0)).toBe("undecided");
    expect(touchGestureIntent(6, 6)).toBe("undecided");
    expect(touchGestureIntent(-9, 0)).toBe("undecided");
  });
  it("calls a vertical-dominant move a drag (no longpress needed)", () => {
    expect(touchGestureIntent(2, -40)).toBe("drag");
    expect(touchGestureIntent(-3, 25)).toBe("drag");
  });
  it("calls a horizontal-dominant move a scroll (tray keeps it)", () => {
    expect(touchGestureIntent(40, 2)).toBe("scroll");
    expect(touchGestureIntent(-30, -5)).toBe("scroll");
  });
  it("breaks exact ties toward drag", () => {
    expect(touchGestureIntent(20, 20)).toBe("drag");
  });
});

describe("parsePanelDropSpec", () => {
  it("round-trips specs through serialize", () => {
    const specs = [
      { area: "lp" },
      { area: "lp", beforeId: "T_1" },
      { area: "flick", direction: "ne" },
      { area: "mt" },
      { area: "mt", index: 1 },
    ] as const;
    for (const s of specs) {
      expect(parsePanelDropSpec(serializePanelDropSpec(s))).toEqual(s);
    }
  });
  it("rejects malformed specs", () => {
    expect(parsePanelDropSpec(null)).toBeNull();
    expect(parsePanelDropSpec("")).toBeNull();
    expect(parsePanelDropSpec("bogus")).toBeNull();
    expect(parsePanelDropSpec("flick:up")).toBeNull();
    expect(parsePanelDropSpec("mt:x")).toBeNull();
  });
});

function subkeyKey(): TouchKeyIR {
  return key({
    sk: [
      { id: "T_1", text: "a", sp: 0 },
      { id: "T_2", text: "b", sp: 0 },
    ],
    flick: { n: { id: "n", text: "x", sp: 0 } },
    multitap: [{ id: "T_m1", text: "c", sp: 0 }],
  } as Partial<TouchKeyIR>);
}

describe("buildPanelDropOps", () => {
  it("appends a tray letter to longpress without displacing", () => {
    const plan = buildPanelDropOps(ADDR, subkeyKey(), "z", { area: "lp" }, "T_new");
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0]).toMatchObject({
      kind: "setSubKey",
      sub: { kind: "sk", id: "T_new" },
      fields: { text: "z" },
    });
    expect(plan.displacedBackToTray).toBeNull();
  });
  it("sets an empty flick direction directly", () => {
    const plan = buildPanelDropOps(ADDR, subkeyKey(), "z", { area: "flick", direction: "ne" }, "T_new");
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0]).toMatchObject({
      kind: "setSubKey",
      sub: { kind: "flick", id: "ne" },
      fields: { text: "z" },
    });
    expect(plan.displacedBackToTray).toBeNull();
  });
  it("replaces an occupied flick and sends the glyph back to the tray", () => {
    const plan = buildPanelDropOps(ADDR, subkeyKey(), "z", { area: "flick", direction: "n" }, "T_new");
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0]).toMatchObject({
      kind: "setSubKey",
      sub: { kind: "flick", id: "n" },
      fields: { text: "z" },
    });
    expect(plan.displacedBackToTray).toBe("x");
  });
  it("appends multitap while a tap is free", () => {
    const plan = buildPanelDropOps(ADDR, subkeyKey(), "z", { area: "mt" }, "T_new");
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0]).toMatchObject({
      kind: "setSubKey",
      sub: { kind: "multitap", id: "T_new" },
    });
    expect(plan.displacedBackToTray).toBeNull();
  });
  it("replaces the 3x entry when multitap is full", () => {
    const k = subkeyKey();
    k.multitap = [
      { id: "T_m1", text: "c", sp: 0 },
      { id: "T_m2", text: "d", sp: 0 },
    ];
    const plan = buildPanelDropOps(ADDR, k, "z", { area: "mt" }, "T_new");
    expect(plan.displacedBackToTray).toBe("d");
    const texts = plan.ops
      .filter((o) => o.kind === "setSubKey")
      .map((o) => (o as { fields: { text: string } }).fields.text);
    expect(texts).toEqual(["c", "z"]);
  });
  it("replaces a specific multitap index", () => {
    const plan = buildPanelDropOps(ADDR, subkeyKey(), "z", { area: "mt", index: 0 }, "T_new");
    expect(plan.displacedBackToTray).toBe("c");
    const texts = plan.ops
      .filter((o) => o.kind === "setSubKey")
      .map((o) => (o as { fields: { text: string } }).fields.text);
    expect(texts).toEqual(["z"]);
  });
});

describe("buildSubkeyMoveOps", () => {
  it("reorders a longpress before another", () => {
    const plan = buildSubkeyMoveOps(
      ADDR,
      subkeyKey(),
      { kind: "sk", id: "T_2" },
      { area: "lp", beforeId: "T_1" },
      "T_new",
    );
    const order = plan.ops
      .filter((o) => o.kind === "setSubKey")
      .map((o) => (o as { fields: { id: string } }).fields.id);
    expect(order).toEqual(["T_2", "T_1"]);
    expect(plan.ops.filter((o) => o.kind === "removeSubKey")).toHaveLength(2);
  });
  it("moves a longpress to the end on area drop", () => {
    const plan = buildSubkeyMoveOps(ADDR, subkeyKey(), { kind: "sk", id: "T_1" }, { area: "lp" }, "T_new");
    const order = plan.ops
      .filter((o) => o.kind === "setSubKey")
      .map((o) => (o as { fields: { id: string } }).fields.id);
    expect(order).toEqual(["T_2", "T_1"]);
  });
  it("moves a flick to an empty direction", () => {
    const plan = buildSubkeyMoveOps(
      ADDR,
      subkeyKey(),
      { kind: "flick", direction: "n" },
      { area: "flick", direction: "ne" },
      "T_new",
    );
    expect(plan.ops).toMatchObject([
      { kind: "removeSubKey", sub: { kind: "flick", id: "n" } },
      { kind: "setSubKey", sub: { kind: "flick", id: "ne" }, fields: { text: "x" } },
    ]);
  });
  it("swaps flicks when the target direction is occupied", () => {
    const k = subkeyKey();
    k.flick = { n: { id: "n", text: "x", sp: 0 }, ne: { id: "ne", text: "y", sp: 0 } };
    const plan = buildSubkeyMoveOps(
      ADDR,
      k,
      { kind: "flick", direction: "n" },
      { area: "flick", direction: "ne" },
      "T_new",
    );
    const sets = plan.ops.filter((o) => o.kind === "setSubKey");
    expect(sets).toMatchObject([
      { sub: { kind: "flick", id: "ne" }, fields: { text: "x" } },
      { sub: { kind: "flick", id: "n" }, fields: { text: "y" } },
    ]);
  });
  it("reorders multitap entries", () => {
    const k = subkeyKey();
    k.multitap = [
      { id: "T_m1", text: "c", sp: 0 },
      { id: "T_m2", text: "d", sp: 0 },
    ];
    const plan = buildSubkeyMoveOps(
      ADDR,
      k,
      { kind: "multitap", index: 1 },
      { area: "mt", index: 0 },
      "T_new",
    );
    const order = plan.ops
      .filter((o) => o.kind === "setSubKey")
      .map((o) => (o as { fields: { id: string } }).fields.id);
    expect(order).toEqual(["T_m2", "T_m1"]);
  });
});

// Cross-kind subkey moves (#2596 item 3): a chip dragged to a different
// family moves there, text/sp/output preserved, the displaced occupant
// (if any) back to the tray.
describe("buildSubkeyMoveOps cross-kind", () => {
  it("moves a longpress into an empty flick direction", () => {
    const plan = buildSubkeyMoveOps(
      ADDR,
      subkeyKey(),
      { kind: "sk", id: "T_1" },
      { area: "flick", direction: "ne" },
      "T_new",
    );
    expect(plan.ops).toMatchObject([
      { kind: "removeSubKey", sub: { kind: "sk", id: "T_1" } },
      { kind: "setSubKey", sub: { kind: "flick", id: "ne" }, fields: { text: "a" } },
    ]);
    expect(plan.displacedBackToTray).toBeNull();
  });
  it("moves a longpress into an occupied flick direction, displacing its glyph to the tray", () => {
    const plan = buildSubkeyMoveOps(
      ADDR,
      subkeyKey(),
      { kind: "sk", id: "T_1" },
      { area: "flick", direction: "n" },
      "T_new",
    );
    expect(plan.ops).toMatchObject([
      { kind: "removeSubKey", sub: { kind: "sk", id: "T_1" } },
      { kind: "setSubKey", sub: { kind: "flick", id: "n" }, fields: { text: "a" } },
    ]);
    expect(plan.displacedBackToTray).toBe("x");
  });
  it("moves a longpress into multitap, keeping its id while a tap is free", () => {
    const plan = buildSubkeyMoveOps(
      ADDR,
      subkeyKey(),
      { kind: "sk", id: "T_1" },
      { area: "mt" },
      "T_new",
    );
    expect(plan.ops).toMatchObject([
      { kind: "removeSubKey", sub: { kind: "sk", id: "T_1" } },
      { kind: "setSubKey", sub: { kind: "multitap", id: "T_1" }, fields: { text: "a" } },
    ]);
    expect(plan.displacedBackToTray).toBeNull();
  });
  it("moves a longpress into a full multitap, replacing the 3x entry", () => {
    const k = subkeyKey();
    k.multitap = [
      { id: "T_m1", text: "c", sp: 0 },
      { id: "T_m2", text: "d", sp: 0 },
    ];
    const plan = buildSubkeyMoveOps(ADDR, k, { kind: "sk", id: "T_1" }, { area: "mt" }, "T_new");
    expect(plan.displacedBackToTray).toBe("d");
    const texts = plan.ops
      .filter((o) => o.kind === "setSubKey")
      .map((o) => (o as { fields: { text: string } }).fields.text);
    expect(texts).toEqual(["c", "a"]);
  });
  it("moves a flick into longpress under a fresh id", () => {
    const plan = buildSubkeyMoveOps(
      ADDR,
      subkeyKey(),
      { kind: "flick", direction: "n" },
      { area: "lp" },
      "T_new",
    );
    expect(plan.ops).toMatchObject([
      { kind: "removeSubKey", sub: { kind: "flick", id: "n" } },
      { kind: "setSubKey", sub: { kind: "sk", id: "T_new" }, fields: { text: "x" } },
    ]);
    expect(plan.displacedBackToTray).toBeNull();
  });
  it("moves a flick into multitap under a fresh id", () => {
    const plan = buildSubkeyMoveOps(
      ADDR,
      subkeyKey(),
      { kind: "flick", direction: "n" },
      { area: "mt" },
      "T_new",
    );
    expect(plan.ops).toMatchObject([
      { kind: "removeSubKey", sub: { kind: "flick", id: "n" } },
      { kind: "setSubKey", sub: { kind: "multitap", id: "T_new" }, fields: { text: "x" } },
    ]);
    expect(plan.displacedBackToTray).toBeNull();
  });
  it("moves a multitap entry into longpress, keeping its id", () => {
    const plan = buildSubkeyMoveOps(
      ADDR,
      subkeyKey(),
      { kind: "multitap", index: 0 },
      { area: "lp" },
      "T_new",
    );
    expect(plan.ops).toMatchObject([
      { kind: "removeSubKey", sub: { kind: "multitap", id: "T_m1" } },
      { kind: "setSubKey", sub: { kind: "sk", id: "T_m1" }, fields: { text: "c" } },
    ]);
    expect(plan.displacedBackToTray).toBeNull();
  });
  it("moves a multitap entry into a flick direction, displacing its glyph to the tray", () => {
    const plan = buildSubkeyMoveOps(
      ADDR,
      subkeyKey(),
      { kind: "multitap", index: 0 },
      { area: "flick", direction: "n" },
      "T_new",
    );
    expect(plan.ops).toMatchObject([
      { kind: "removeSubKey", sub: { kind: "multitap", id: "T_m1" } },
      { kind: "setSubKey", sub: { kind: "flick", id: "n" }, fields: { text: "c" } },
    ]);
    expect(plan.displacedBackToTray).toBe("x");
  });
  it("leaves the key untouched on an out-of-range multitap landing index", () => {
    expect(
      buildSubkeyMoveOps(ADDR, subkeyKey(), { kind: "sk", id: "T_1" }, { area: "mt", index: 5 }, "T_new")
        .ops,
    ).toHaveLength(0);
    expect(
      buildSubkeyMoveOps(
        ADDR,
        subkeyKey(),
        { kind: "flick", direction: "n" },
        { area: "mt", index: 5 },
        "T_new",
      ).ops,
    ).toHaveLength(0);
    expect(
      buildSubkeyMoveOps(ADDR, subkeyKey(), { kind: "multitap", index: 5 }, { area: "lp" }, "T_new")
        .ops,
    ).toHaveLength(0);
  });
  it("leaves the key untouched when the dragged entry does not exist", () => {
    expect(
      buildSubkeyMoveOps(ADDR, subkeyKey(), { kind: "sk", id: "T_nope" }, { area: "flick", direction: "ne" }, "T_new")
        .ops,
    ).toHaveLength(0);
    expect(
      buildSubkeyMoveOps(ADDR, subkeyKey(), { kind: "flick", direction: "sw" }, { area: "lp" }, "T_new")
        .ops,
    ).toHaveLength(0);
  });
});

describe("buildPanelDropOps longpress insert", () => {
  it("inserts before the chipped longpress on a chip drop", () => {
    const plan = buildPanelDropOps(ADDR, subkeyKey(), "z", { area: "lp", beforeId: "T_1" }, "T_new");
    const order = plan.ops
      .filter((o) => o.kind === "setSubKey")
      .map((o) => (o as { fields: { id: string } }).fields.id);
    expect(order).toEqual(["T_new", "T_1", "T_2"]);
    expect(plan.displacedBackToTray).toBeNull();
  });
  it("appends when beforeId is unknown", () => {
    const plan = buildPanelDropOps(ADDR, subkeyKey(), "z", { area: "lp", beforeId: "nope" }, "T_new");
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0]).toMatchObject({ kind: "setSubKey", sub: { kind: "sk", id: "T_new" } });
  });
});
