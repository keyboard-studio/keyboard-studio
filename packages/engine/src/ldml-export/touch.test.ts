// Story 4: the touch layout carries over, spec-perfect (task T077).
import { describe, expect, it } from "vitest";
import { inputFromRules } from "./__fixtures__/helpers.js";
import { key, layout, platform } from "./__fixtures__/touchLayouts.js";
import { loadLdml } from "./__testing__/ldmlInterpreter.js";
import { tr35Conformance } from "./__testing__/tr35Conformance.js";
import { validateAgainstCldr } from "./__testing__/xsdValidate.js";
import { buildLdmlExport } from "./package.js";
import type { LdmlExportResult } from "./types.js";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";

const PIPELINE = /ready for Keyman's touch pipeline/g;

async function run(touch: TouchLayoutIR, rules = "+ [K_A] > 'x'\n+ [K_B] > 'y'\n", extra = "") {
  const input = { ...inputFromRules(rules, undefined, extra), touchLayout: touch };
  const r: LdmlExportResult = await buildLdmlExport(input);
  if (!r.ok) throw new Error("export refused");
  const xml = r.files.get("source/t_ldml.xml") as string;
  const report = r.files.get("LDML-EXPORT-REPORT.md") as string;
  return { r, xml, report };
}

/** Key ids of a touch layer (first form) and each key's `layerId`. */
function layerKeys(xml: string, layerId: string): Array<{ id: string; layerId: string | undefined }> {
  const touch = xml.slice(xml.indexOf('formId="touch"'));
  const rowMatch = new RegExp(String.raw`<layer id="${layerId}">\s*((?:<row [^>]*/>\s*)+)`).exec(touch);
  const ids = [...(rowMatch?.[1] ?? "").matchAll(/keys="([^"]*)"/g)].flatMap((m) => (m[1] as string).split(" "));
  return ids.map((id) => {
    const def = new RegExp(`<key id="${id}"([^>]*)/>`).exec(xml);
    return { id, layerId: /layerId="([^"]*)"/.exec(def?.[1] ?? "")?.[1] };
  });
}

describe("Story 4 scenario 1: two touch forms", () => {
  it("writes the phone and tablet forms with distinct widths, and both pass H3 and H4", async () => {
    const { xml } = await run(
      layout(
        platform("phone", { default: [[key("K_A"), key("K_B")]], shift: [[key("K_A")]] }),
        platform("tablet", { default: [[key("K_A"), key("K_B"), key("K_Q")]] }),
      ),
    );
    const widths = [...xml.matchAll(/<layers formId="touch" minDeviceWidth="(\d+)"/g)].map((m) => m[1]);
    expect(widths).toEqual(["1", "150"]);
    expect(tr35Conformance(xml)).toEqual([]);
    expect(await validateAgainstCldr(xml, "46")).toEqual([]);
  });
});

describe("Story 4 scenario 2: a label that differs from the output", () => {
  it("becomes a display and the key still types the rule output", async () => {
    const { xml } = await run(layout(platform("phone", { default: [[key("K_A", { text: "Alpha" })]] })));
    expect(xml).toContain('<display display="Alpha" keyId="x"/>');
    expect(loadLdml(xml).tapTouch(1, "base", "x")).toBe("x");
  });

  it("never gives a display equal to its key's output, and a bare mark gets U+25CC", async () => {
    const { xml } = await run(layout(platform("phone", { default: [[key("K_A", { text: "x" }), key("K_B", { text: "\u0301" })]] })));
    expect(xml).not.toContain('display="x"');
    expect(xml).toContain('display="\u25CC\u0301"');
  });
});

describe("Story 4 scenario 3: the delivery note", () => {
  it("states the Keyman touch-pipeline note once", async () => {
    const { report } = await run(layout(platform("phone", { default: [[key("K_A")]] })));
    expect(report.match(PIPELINE)).toHaveLength(1);
    expect(report).toContain("Touch forms written to TR35");
  });
});

describe("Story 4 scenario 4: TR35-valid constructs Keyman ignores are still written", () => {
  it("writes flicks, long-press and multitap, and the K item is not a warning", async () => {
    const { xml, r } = await run(
      layout(platform("phone", { default: [[key("K_A", { sk: [key("U_00E0")], flick: { n: key("U_00E4") }, multitap: [key("U_0041")] })]] })),
    );
    expect(xml).toContain("<flicks>");
    expect(xml).toContain("longPressKeyIds=");
    expect(xml).toContain("multiTapKeyIds=");
    const k = r.classification.items.filter((i) => i.rowId === "5.15");
    expect(k).toHaveLength(1);
    expect(k[0]?.status).toBe("K");
    expect(k[0]?.severity === null || k[0]?.severity === "hint").toBe(true);
    expect(tr35Conformance(xml)).toEqual([]);
  });
});

describe("row 1.4a: layer behaviour that depends only on the layer and the key", () => {
  const extra = "begin Unicode > use(main)\nbegin PostKeystroke > use(PostKeystroke)\nstore(digit) '0123456789'\n";
  const rules = `+ [K_A] > 'x'
+ [K_1] > '1'
group(PostKeystroke) readonly
if(&layer = 'caps') > context
if(&layer = 'numeric') any(digit) > context
nomatch > layer('default')
`;
  const touch = layout(
    platform("phone", {
      default: [[key("K_A")]],
      shift: [[key("K_A")]],
      caps: [[key("K_A")]],
      numeric: [[key("K_1"), key("K_A")]],
    }),
  );

  it("one-shot shift: a key on shift switches back to base", async () => {
    const { xml } = await run(touch, rules, extra);
    const shift = layerKeys(xml, "shift");
    expect(shift.length).toBeGreaterThan(0);
    expect(shift.every((k) => k.layerId === "base")).toBe(true);
  });

  it("caps stays caps and numeric stays numeric after a digit: no layerId", async () => {
    const { xml } = await run(touch, rules, extra);
    const caps = layerKeys(xml, "caps");
    expect(caps.length).toBeGreaterThan(0);
    expect(caps.every((k) => k.layerId === undefined)).toBe(true);
    const numeric = layerKeys(xml, "numeric");
    expect(numeric[0]?.layerId).toBeUndefined(); // the digit
    expect(numeric[1]?.layerId).toBe("base"); // a letter leaves the numeric layer
  });

  it("the default layer stays on default", async () => {
    const { xml } = await run(touch, rules, extra);
    const base = layerKeys(xml, "base");
    expect(base.length).toBeGreaterThan(0);
    expect(base.every((k) => k.layerId === undefined)).toBe(true);
  });

  it("start-of-sentence shift is reported once and never emulated with transforms", async () => {
    const withSentence = rules.replace("nomatch >", "'.' ' ' > layer('shift')\nnomatch >");
    const { xml, r } = await run(touch, withSentence, extra);
    const items = r.classification.items.filter((i) => i.rowId === "1.4b");
    expect(items).toHaveLength(1);
    expect(items[0]?.nodeKey).toBe("behaviour:start-of-sentence-shift");
    expect(items[0]?.consequence).toContain("start-of-sentence auto-shift");
    expect(xml).not.toContain("<transforms");
  });
});
