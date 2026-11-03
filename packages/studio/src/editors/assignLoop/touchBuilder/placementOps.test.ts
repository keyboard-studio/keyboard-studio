// Unit tests for the placement modal's op planner.
import { describe, expect, it } from "vitest";
import type { TouchKeyIR } from "@keyboard-studio/contracts";
import {
  buildPlacementOps,
  isPreservableText,
  placementOccupant,
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
