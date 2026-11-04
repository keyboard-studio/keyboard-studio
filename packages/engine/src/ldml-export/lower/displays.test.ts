// `<displays>` for hardware keys (rows 4.8, 5.10; task T074).
import type { KvksIR } from "@keyboard-studio/contracts";
import { describe, expect, it } from "vitest";
import { classifyDetailed } from "../classify/classify.js";
import { inputFromRules } from "../__fixtures__/helpers.js";
import { resolveLdmlProfile } from "../profiles/resolve.js";
import { writeKeyboard3 } from "../xml/writeKeyboard3.js";
import { lowerDocument } from "./document.js";
import { DisplaySet, displayText } from "./displays.js";

function kvks(keys: Array<{ vkey: string; label: string }>, shift = ""): KvksIR {
  return { layers: [{ shift, keys }], usealtgr: false, nodeIds: [] } as KvksIR;
}

function lower(rules: string, visual: KvksIR | null) {
  const input = { ...inputFromRules(rules), visualKeyboard: visual };
  const profile = resolveLdmlProfile("46");
  const detail = classifyDetailed(input, profile, { languages: ["en"] });
  const low = lowerDocument(input, profile, detail);
  return { low, xml: writeKeyboard3(low.doc) };
}

describe("displayText", () => {
  it("is null when the label equals the output (NFC) or is empty", () => {
    expect(displayText("a", "a")).toBeNull();
    expect(displayText("", "a")).toBeNull();
    expect(displayText("e\u0301", "\u00E9")).toBeNull();
  });
  it("prepends U+25CC to a bare nonspacing mark and still never equals the output", () => {
    expect(displayText("\u0301", "x")).toBe("\u25CC\u0301");
    expect(displayText("\u25CC\u0301", "\u25CC\u0301")).toBeNull();
  });
});

describe("DisplaySet", () => {
  it("keeps the first label per key id and orders by key id", () => {
    const d = new DisplaySet();
    expect(d.add("b", "B1", "x")).toBe(true);
    expect(d.add("b", "B2", "x")).toBe(false);
    d.add("a", "A", "y");
    expect(d.toDisplays()?.display?.map((x) => x.keyId)).toEqual(["a", "b"]);
  });
});

describe("hardware displays from KvksIR", () => {
  it("writes a display for a label that differs from the output, keyed by key id", () => {
    const { xml } = lower("+ [K_A] > 'x'\n", kvks([{ vkey: "K_A", label: "\u0301" }, { vkey: "K_B", label: "b" }]));
    expect(xml).toContain('<display display="\u25CC\u0301" keyId="x"/>');
    expect(xml).not.toContain('keyId="b"');
  });

  it("writes no <displays> element without a visual keyboard", () => {
    expect(lower("+ [K_A] > 'x'\n", null).xml).not.toContain("<displays>");
  });

  it("never references a gap key", () => {
    const { xml } = lower("+ [K_A] > nul\n", kvks([{ vkey: "K_A", label: "Z" }]));
    expect(xml).not.toContain("<display ");
  });
});
