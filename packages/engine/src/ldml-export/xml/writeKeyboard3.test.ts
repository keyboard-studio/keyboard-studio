import { describe, expect, it } from "vitest";
import type { LdmlDocument } from "./model.js";
import { escapeAttr, sanitizeComment, writeKeyboard3 } from "./writeKeyboard3.js";

const full: LdmlDocument = {
  comment: "Header line one\nLine two",
  xmlns: "urn:test",
  locale: "en",
  conformsTo: "46",
  locales: [{ id: "en" }, { id: "fr" }],
  version: { number: "1.0.0" },
  info: { name: "N", author: "A", layout: "qwerty", indicator: "Q" },
  displays: { display: [{ output: "a", display: "b" }], displayOptions: { baseCharacter: "x" } },
  keys: [{ id: "a", output: "x", gap: true, width: 2 }],
  flicks: [{ id: "f", flickSegment: [{ directions: "n", keyId: "a" }] }],
  layers: [
    { formId: "us", layer: [{ id: "base", modifiers: "none", row: [{ keys: "a b" }] }] },
    { formId: "touch", minDeviceWidth: 150, layer: [{ id: "t", row: [{ keys: "a" }] }] },
  ],
  variables: { string: [{ id: "s", value: "v" }] },
  transforms: [
    {
      type: "simple",
      transformGroup: [
        { comment: "KMN group: main", transform: [{ comment: "source/k.kmn:3", from: "a", to: "b" }] },
      ],
    },
    { type: "backspace", transformGroup: [{ transform: [{ from: "b", to: "" }] }] },
  ],
  special: {
    namespaces: { ks: "urn:ks" },
    elements: [{ name: "ks:position", attributes: [["layer", "none"], ["key", "K_A"]] }],
  },
};

describe("writeKeyboard3", () => {
  it("emits elements in DTD order with fixed attribute order", () => {
    const xml = writeKeyboard3(full);
    const order = ["<locales>", "<version", "<info", "<displays>", "<keys>", "<flicks>",
      'formId="us"', 'formId="touch"', "<variables>", 'type="simple"', 'type="backspace"', "<special"];
    const idx = order.map((s) => xml.indexOf(s));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(xml).toContain('<keyboard3 xmlns="urn:test" locale="en" conformsTo="46">');
    expect(xml).toContain('<key id="a" output="x" gap="true" width="2"/>');
    expect(xml).toContain('<layers formId="touch" minDeviceWidth="150">');
    expect(xml.indexOf("<display ")).toBeLessThan(xml.indexOf("<displayOptions"));
    expect(xml).toContain('<ks:position layer="none" key="K_A"/>');
  });

  it("uses \\n, two-space indent, trailing newline, and comments in place", () => {
    const xml = writeKeyboard3(full);
    expect(xml).not.toContain("\r");
    expect(xml.endsWith("</keyboard3>\n")).toBe(true);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<!--\n  Header line one\n  Line two\n-->\n<keyboard3')).toBe(true);
    expect(xml).toContain("    <!-- KMN group: main -->\n    <transformGroup>\n      <!-- source/k.kmn:3 -->\n      <transform from=\"a\" to=\"b\"/>");
  });

  it("omits empty containers", () => {
    const xml = writeKeyboard3({
      info: { name: "N" },
      locales: [],
      keys: [],
      flicks: [],
      layers: [{ formId: "us", layer: [{ id: "base", row: [] }] }],
      variables: {},
      transforms: [{ type: "simple", transformGroup: [{ comment: "c", transform: [] }] }],
      special: { namespaces: { ks: "urn:ks" }, elements: [] },
    });
    expect(xml).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<keyboard3>\n  <info name="N"/>\n</keyboard3>\n');
  });

  it("escapes attributes", () => {
    expect(escapeAttr('a&b<c>"d\n\t\u0001e')).toBe("a&amp;b&lt;c&gt;&quot;d&#xA;&#x9;&#x1;e");
    const xml = writeKeyboard3({ info: { name: 'x"&' } });
    expect(xml).toContain('<info name="x&quot;&amp;"/>');
  });

  it("sanitises comment text", () => {
    expect(sanitizeComment("a--b")).toBe("a- -b");
    expect(sanitizeComment("a---b")).not.toContain("--");
    expect(sanitizeComment("end-")).toBe("end- ");
    expect(sanitizeComment("x\r\ny")).toBe("x\ny");
    const xml = writeKeyboard3({ comment: "a -- b-", info: {} });
    expect(xml).toContain("<!-- a - - b-  -->");
  });
});
