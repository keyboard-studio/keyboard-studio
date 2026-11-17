import { describe, expect, it } from "vitest";
import { labelPatchedTouchText } from "./touchLabels.ts";

const layout = (keys: string, indent = "\t") =>
  `{\n${indent}"phone": {"layer":[{"id":"default","row":[{"id":1,"key":[${keys}]}]}]}\n}\n`;

describe("labelPatchedTouchText", () => {
  it("replaces only the label's literal and keeps every other byte", () => {
    const before = layout('{"id":"K_A","text":"a"},{"id":"K_E","text":"e"}');
    const after = JSON.stringify({ phone: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }, { id: "K_E", text: "ɛ" }] }] }] } });
    expect(labelPatchedTouchText(before, after)).toBe(before.replace('"text":"e"', '"text":"ɛ"'));
  });

  it("refuses a duplicated key: the patch must read back as the intended layout", () => {
    // JSON.parse reads the LAST "text"; a patch of the first would not read back.
    const before = layout('{"id":"K_E","text":"first","text":"e"}');
    const after = JSON.stringify({ phone: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_E", text: "ɛ" }] }] }] } });
    const out = labelPatchedTouchText(before, after);
    expect(out === undefined || JSON.parse(out).phone.layer[0].row[0].key[0].text === "ɛ").toBe(true);
  });

  it("refuses a change that is not a label", () => {
    const before = layout('{"id":"K_E","text":"e"}');
    const after = JSON.stringify({ phone: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_X", text: "e" }] }] }] } });
    expect(labelPatchedTouchText(before, after)).toBeUndefined();
  });

  it("an escaped backslash before u is not a unicode escape: the label stays raw", () => {
    const before = layout('{"id":"K_A","text":"\\\\u0041"},{"id":"K_E","text":"e"}');
    const after = JSON.stringify({ phone: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "\\u0041" }, { id: "K_E", text: "ɛ" }] }] }] } });
    const out = labelPatchedTouchText(before, after)!;
    expect(out).toContain('"text":"ɛ"');
    expect(out).not.toContain("\\u025b");
  });

  it("escapes the way the file does when it escapes non-ASCII", () => {
    const before = layout('{"id":"K_A","text":"\\u00E9"},{"id":"K_E","text":"e"}');
    const after = JSON.stringify({ phone: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "é" }, { id: "K_E", text: "ɛ" }] }] }] } });
    expect(labelPatchedTouchText(before, after)).toContain('"text":"\\u025B"');
  });

  it("adds the member to a key that had no label", () => {
    const before = layout('{"id":"K_E"}');
    const after = JSON.stringify({ phone: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_E", text: "ɛ" }] }] }] } });
    expect(labelPatchedTouchText(before, after)).toBe(before.replace('{"id":"K_E"}', '{"id":"K_E","text":"ɛ"}'));
  });
});
