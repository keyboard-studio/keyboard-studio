import { describe, expect, it } from "vitest";
import { AZERTY_BASE } from "../__fixtures__/azerty-base.js";
import { lowerRules } from "../__fixtures__/helpers.js";
import { loadLdml, type LdmlKeystroke } from "../__testing__/ldmlInterpreter.js";
import { findStore } from "../classify/ruleElements.js";
import { casedKeys } from "./capsExpand.js";
import { computeGrid } from "./baseFill.js";
import { cellKey, partsKey, planTriggers, type TriggerPlan } from "./triggers.js";
import { US_BASE } from "../__fixtures__/us-base.js";

const k = (vkey: string, modifiers: readonly string[] = [], caps = false): LdmlKeystroke => ({ vkey, modifiers, caps });

function plan(rules: string, base = US_BASE, extra = ""): { trig: TriggerPlan; xml: string } {
  const { input, detail, xml } = lowerRules(rules, base, extra);
  const grid = computeGrid({ plans: detail.plans, baseLayout: base, form: detail.form, cased: casedKeys(input.ir, base), ir: input.ir });
  return { trig: planTriggers(grid, (n) => findStore(input.ir, n)), xml };
}

describe("trigger text and markers (section 3)", () => {
  it("a context-free character rule becomes the key's output and needs no marker", () => {
    const { trig } = plan("+ [K_A] > 'x'\n");
    expect(trig.triggerSources).toEqual([]);
    const c = trig.cells.get(cellKey({ modifiers: "none", components: [], caps: false, cells: [] }, "K_A"));
    expect(c).toMatchObject({ kind: "text" });
    if (c?.kind === "text") expect(partsKey(c.parts)).toBe("Tx");
  });

  it("a key with context rules gets a marker when another layer types the same character without those rules", () => {
    const { xml } = plan("'a' + [K_C] > 'x'\n", US_BASE);
    expect(xml).toMatch(/from="a\\m\{trigger/);
  });

  it("two keys with the same trigger text but different context rules get distinct markers", () => {
    const { trig, xml } = plan("+ [K_A] > 'x'\n+ [K_B] > 'x'\n'p' + [K_A] > 'q'\n'r' + [K_B] > 's'\n");
    expect(trig.triggerSources).toHaveLength(2);
    const ldml = loadLdml(xml);
    expect(ldml.type([k("K_A")])).toBe("x");
    expect(ldml.type([k("K_B")])).toBe("x");
    expect(ldml.type([k("K_P"), k("K_A")])).toBe("q");
    expect(ldml.type([k("K_P"), k("K_B")])).toBe("px");
  });

  it("emits one catch-all per marker, last in its group, mapping the marker to the key's default output", () => {
    const { trig, xml } = plan("+ [K_A] > 'x'\n+ [K_B] > 'x'\n'p' + [K_A] > 'q'\n'r' + [K_B] > 's'\n");
    expect(trig.catchAlls).toHaveLength(2);
    const ts = [...xml.matchAll(/<transform from="([^"]*)"(?: to="([^"]*)")?\/>/g)].map((m) => m[1] as string);
    const catchIdx = ts.map((f, i) => (/^\\m\{[^}]*\}$/.test(f) ? i : -1)).filter((i) => i >= 0);
    expect(catchIdx).toHaveLength(2);
    expect(Math.min(...catchIdx)).toBe(ts.length - 2);
  });

  it("does not use a marker when the same rules sit on every position that types the text", () => {
    // K_X caps expansion: with &CasedKeys the shift-less rule reaches `shift caps`, which types the
    // same letter with the same rules, so the contextual key needs no marker there.
    const { trig } = plan("'a' + [K_X] > 'q'\n", US_BASE, "store(&CasedKeys) [K_A]..[K_Z]\n");
    expect(trig.triggerSources).toEqual([]);
  });

  it("gives a key whose base position is a dead key a marker-only trigger", () => {
    const { trig, xml } = plan("'a' + [K_LBRKT] > 'x'\n", AZERTY_BASE);
    expect(trig.triggerSources.length).toBeGreaterThan(0);
    // The key types nothing by default: the catch-all maps the marker to an empty text.
    expect(xml).toMatch(/<transform from="\\m\{[^}]+\}"\/>/);
  });

  it("leaves no marker in the typed text (FR-024)", () => {
    const { xml } = plan("+ [K_A] > 'x'\n+ [K_B] > 'x'\n'p' + [K_A] > 'q'\n");
    const ldml = loadLdml(xml);
    for (const key of [k("K_A"), k("K_B")]) {
      const out = ldml.type([key]);
      expect([...out].some((c) => c.codePointAt(0)! >= 0xe000 && c.codePointAt(0)! <= 0xf8ff)).toBe(false);
    }
  });

  it("is deterministic across runs", () => {
    const a = plan("+ [K_A] > 'x'\n+ [K_B] > 'x'\n'p' + [K_A] > 'q'\n'r' + [K_B] > 's'\n").xml;
    const b = plan("+ [K_A] > 'x'\n+ [K_B] > 'x'\n'p' + [K_A] > 'q'\n'r' + [K_B] > 's'\n").xml;
    expect(a).toBe(b);
  });
});
