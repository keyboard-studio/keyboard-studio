// Tests for conformTouchLayoutToKeymanSchema — the output-boundary pass that
// keeps Keyman Developer's strict touch-layout loader (KM04000) happy.

import { describe, it, expect } from "vitest";
import { conformTouchLayoutToKeymanSchema } from "./touch-layout-conform.js";
import { TOUCH_LAYOUT_JSON_INDENT } from "./parse-touch.js";

function layoutWith(key: Record<string, unknown>): string {
  return JSON.stringify(
    { tablet: { layer: [{ id: "shift", row: [{ id: 1, key: [key] }] }] } },
    null,
    TOUCH_LAYOUT_JSON_INDENT,
  );
}

function firstKey(json: string): Record<string, unknown> {
  return JSON.parse(json).tablet.layer[0].row[0].key[0];
}

describe("conformTouchLayoutToKeymanSchema", () => {
  it("strips `output` from a key and names what it removed", () => {
    const { json, removed } = conformTouchLayoutToKeymanSchema(
      layoutWith({ id: "K_Q", text: "Q", pad: 55, nextlayer: "default", output: "Q" }),
    );
    expect(firstKey(json)).toEqual({ id: "K_Q", text: "Q", pad: 55, nextlayer: "default" });
    expect(removed).toEqual(["tablet.shift.K_Q.output"]);
  });

  it("strips the studio's provenance tag `p`", () => {
    const { json } = conformTouchLayoutToKeymanSchema(layoutWith({ id: "K_A", p: "base-derived", text: "a" }));
    expect(firstKey(json)).toEqual({ id: "K_A", text: "a" });
  });

  it("strips non-schema members from sk, multitap and flick sub-keys", () => {
    const { json } = conformTouchLayoutToKeymanSchema(
      layoutWith({
        id: "K_E",
        text: "e",
        sk: [{ id: "U_00E9", text: "é", output: "é", hint: "x", default: true }],
        multitap: [{ id: "U_00E8", text: "è", p: "hand-set" }],
        flick: { n: { id: "U_00EA", text: "ê", output: "ê" }, up: { id: "U_00EB" } },
      }),
    );
    const key = firstKey(json);
    // `hint` is a key member but not a sub-key member; `default` is the reverse.
    expect(key["sk"]).toEqual([{ id: "U_00E9", text: "é", default: true }]);
    expect(key["multitap"]).toEqual([{ id: "U_00E8", text: "è" }]);
    expect(key["flick"]).toEqual({ n: { id: "U_00EA", text: "ê" } });
  });

  it("strips non-schema members from platforms, layers and rows but not the top level", () => {
    const input = JSON.stringify({
      tablet: {
        defaultHint: "dot",
        extra: 1,
        layer: [{ id: "default", extra: 1, row: [{ id: 1, extra: 1, key: [{ id: "K_A" }] }] }],
      },
      topLevelExtra: true,
    });
    const out = JSON.parse(conformTouchLayoutToKeymanSchema(input).json);
    expect(out.tablet).toEqual({
      defaultHint: "dot",
      layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A" }] }] }],
    });
    expect(out.topLevelExtra).toBe(true);
  });

  it("returns an already-conforming file byte-for-byte", () => {
    const input = `{"tablet":{"layer":[{"id":"default","row":[{"id":1,"key":[{"id":"K_A","text":"a","sp":"0"}]}]}]}}`;
    expect(conformTouchLayoutToKeymanSchema(input)).toEqual({ json: input, removed: [] });
  });

  it("leaves malformed input alone", () => {
    expect(conformTouchLayoutToKeymanSchema("{not json")).toEqual({ json: "{not json", removed: [] });
    expect(conformTouchLayoutToKeymanSchema("[]")).toEqual({ json: "[]", removed: [] });
  });
});
