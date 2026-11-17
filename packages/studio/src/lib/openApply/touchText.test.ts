import { describe, expect, it } from "vitest";
import { patchTouchText } from "./touchText.ts";

type Key = Record<string, unknown>;
const k = (id: string, text?: string): Key => (text === undefined ? { id } : { id, text });
const layout = (rows: Key[][], layers = ["default"]): Record<string, unknown> => ({
  phone: { layer: layers.map((id) => ({ id, row: rows.map((key, i) => ({ id: i + 1, key })) })) },
});
type L = { phone: { layer: { row: { key: Record<string, unknown>[] }[] }[] } };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function pretty(v: unknown, indent: string | number, eol = "\n"): string {
  return JSON.stringify(v, null, indent).replace(/\n/g, eol) + eol;
}

const base = layout([[k("K_Q", "q"), k("K_W", "w"), k("K_E", "e")], [k("K_A", "a"), k("K_S", "s")]]);

describe("patchTouchText", () => {
  it("returns the text itself when nothing differs", () => {
    const t = pretty(base, 2);
    expect(patchTouchText(t, clone(base))).toBe(t);
  });

  it("replaces a scalar, keeping the file's escaping", () => {
    const t = '{"phone":{"layer":[{"id":"default","row":[{"id":1,"key":[{"id":"K_A","text":"\\u00E9"},{"id":"K_E","text":"e"}]}]}]}}';
    const after = layout([[k("K_A", "é"), k("K_E", "ɛ")]]);
    const out = patchTouchText(t, after)!;
    expect(out).toBe(t.replace('"text":"e"', '"text":"\\u025B"'));
  });

  it("inserts and removes an object member", () => {
    const t = pretty(base, 2);
    const withMember = clone(base) as unknown as L;
    withMember.phone.layer[0]!.row[0]!.key[0]!.width = 150;
    const added = patchTouchText(t, withMember)!;
    expect(JSON.parse(added)).toEqual(withMember);
    expect(patchTouchText(added, clone(base))).toBe(t);
  });

  for (const [name, indent, eol] of [["2 spaces", 2, "\n"], ["tabs", "\t", "\n"], ["CRLF", 2, "\r\n"], ["4 spaces", 4, "\n"]] as const) {
    describe(name, () => {
      const t = pretty(base, indent, eol);
      const lines = (s: string): string[] => s.split(/(?<=\n)/);
      it("inserts a key mid-row, at the row start and at the row end; only added lines differ", () => {
        for (const at of [0, 1, 3]) {
          const after = clone(base) as unknown as L;
          after.phone.layer[0]!.row[0]!.key.splice(at, 0, k("K_NEW", "n"));
          const out = patchTouchText(t, after)!;
          expect(JSON.parse(out)).toEqual(after);
          expect(out.includes("\r\n")).toBe(eol === "\r\n");
          const before = new Set(lines(t));
          const added = lines(out).filter((l) => !before.has(l));
          // The new key object spans its own lines (a mid-row insert adds no others).
          expect(added.length).toBeGreaterThan(0);
          expect(added.length).toBeLessThanOrEqual(6);
          expect(lines(t).every((l) => lines(out).includes(l) || l.includes("}") || l.includes("]"))).toBe(true);
        }
      });
      it("removes a key mid-row, first and last and puts the rest back byte for byte", () => {
        for (const at of [0, 1, 2]) {
          const after = clone(base) as unknown as L;
          after.phone.layer[0]!.row[0]!.key.splice(at, 1);
          const out = patchTouchText(t, after)!;
          expect(JSON.parse(out)).toEqual(after);
          expect(patchTouchText(out, clone(base))).toBe(t);
        }
      });
      it("adds and removes a layer", () => {
        const after = layout([[k("K_Q", "q"), k("K_W", "w"), k("K_E", "e")], [k("K_A", "a"), k("K_S", "s")]], ["default", "shift"]);
        const out = patchTouchText(t, after)!;
        expect(JSON.parse(out)).toEqual(after);
        expect(out.startsWith(t.slice(0, 40))).toBe(true);
        expect(patchTouchText(out, clone(base))).toBe(t);
      });
    });
  }

  it("handles single-line arrays, with their separators", () => {
    const t = '{"phone":{"layer":[{"id":"default","row":[{"id":1,"key":[{"id":"K_Q"},{"id":"K_W"}]}]}]}}\n';
    const after = layout([[k("K_Q"), k("K_X"), k("K_W")]]);
    const out = patchTouchText(t, after)!;
    expect(out).toBe(t.replace('{"id":"K_W"}', '{"id":"K_X"},{"id":"K_W"}'));
  });

  it("fills an empty array and empties a full one", () => {
    const t = '{\n  "phone": {\n    "layer": [\n      {"id": "default", "row": [{"id": 1, "key": [{"id": "K_Q", "sk": []}]}]}\n    ]\n  }\n}\n';
    const after = layout([[{ id: "K_Q", sk: [k("U_0061", "a")] }]]);
    const out = patchTouchText(t, after)!;
    expect(JSON.parse(out)).toEqual(after);
    expect(patchTouchText(out, JSON.parse(t))).toBe(t);
  });

  it("keeps a BOM and the trailing newline", () => {
    const t = "﻿" + pretty(base, 2);
    const after = clone(base) as unknown as L;
    after.phone.layer[0]!.row[1]!.key.pop();
    const out = patchTouchText(t, after)!;
    expect(out.startsWith("﻿{")).toBe(true);
    expect(out.endsWith("}\n")).toBe(true);
    expect(JSON.parse(out.slice(1))).toEqual(after);
  });

  it("refuses a duplicated key and non-JSON", () => {
    expect(patchTouchText('{"a":1,"a":2}', { a: 3 })).toBeUndefined();
    expect(patchTouchText("not json", {})).toBeUndefined();
  });

  it("aligns arrays of different length by id, not by index", () => {
    const t = pretty(base, 2);
    const after = clone(base) as unknown as L;
    after.phone.layer[0]!.row[0]!.key.shift(); // every later key moves up an index
    const out = patchTouchText(t, after)!;
    const gone = out.split("\n").length;
    // Only the removed key's lines vanish; no key is rewritten.
    expect(t.split("\n").length - gone).toBe(4);
    expect(out).toContain('"text": "w"');
  });

  it("renames a key id in place", () => {
    const t = pretty(base, 2);
    const after = clone(base) as unknown as L;
    after.phone.layer[0]!.row[0]!.key[1]!.id = "K_X";
    expect(patchTouchText(t, after)).toBe(t.replace('"K_W"', '"K_X"'));
  });

  it("a new member in a tight single-member object follows its colon and comma style", () => {
    const t = '{"phone":{"layer":[{"id":"default","row":[{"id":1,"key":[{"id":"K_E"}]}]}]}}';
    const after = layout([[k("K_E", "x")]]);
    expect(patchTouchText(t, after)).toBe('{"phone":{"layer":[{"id":"default","row":[{"id":1,"key":[{"id":"K_E","text":"x"}]}]}]}}');
  });

  it("on a minified one-line file a new key matches its neighbours' spacing", () => {
    const t = JSON.stringify(layout([[k("U_0", "a")], [k("K_B", "b")]]));
    const out = patchTouchText(t, layout([[k("U_0", "a"), k("U_1", "x")], [k("K_B", "b")]]))!;
    expect(out).toBe(t.replace('{"id":"U_0","text":"a"}', '{"id":"U_0","text":"a"},{"id":"U_1","text":"x"}'));
    const spaced = JSON.stringify(layout([[k("U_0", "a"), k("U_9", "b")]])).replace(/,/g, ", ").replace(/":/g, '": ');
    const out2 = patchTouchText(spaced, layout([[k("U_0", "a"), k("U_1", "x"), k("U_9", "b")]]))!;
    expect(out2).toContain('{"id": "U_1", "text": "x"}');
  });

  it("a row edit next to a row insert does not rewrite the neighbouring rows", () => {
    const rows = [[k("K_Q", "q")], [k("K_A", "a")], [k("K_Z", "z")]];
    const t = pretty(layout(rows), 2);
    const after = layout([[k("K_Q", "\u0254")], [k("K_N", "n")], [k("K_A", "a")], [k("K_Z", "z")]]);
    const out = patchTouchText(t, after)!;
    expect(JSON.parse(out)).toEqual(after);
    const before = new Set(t.split("\n"));
    // Only row 1's label, the new row, and the renumbered ids differ; the K_A and K_Z keys are kept.
    expect(out.split("\n").filter((l) => before.has(l) && /K_A|K_Z/.test(l))).toHaveLength(2);
  });

  it("keys named __proto__ are ordinary members", () => {
    const t = '{"a":{"__proto__":1,"b":2}}';
    const target = JSON.parse('{"a":{"__proto__":1,"b":3}}');
    expect(patchTouchText(t, target)).toBe('{"a":{"__proto__":1,"b":3}}');
    expect(patchTouchText('{"a":{"b":2}}', JSON.parse('{"a":{"b":2,"__proto__":5}}'))).toContain('"__proto__"');
  });
});
