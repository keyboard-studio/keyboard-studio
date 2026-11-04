import { describe, expect, it } from "vitest";
import { enumerateUnhandledPositions } from "../../base-fallback/unhandledPositions.js";
import { AZERTY_BASE } from "../__fixtures__/azerty-base.js";
import { lowerRules } from "../__fixtures__/helpers.js";
import { US_BASE } from "../__fixtures__/us-base.js";
import { compareCodePoints } from "./keyIds.js";
import { FORM_ROWS } from "./positions.js";
import { PROVENANCE_NAMESPACE, buildProvenance, provenanceCounts, toSpecialElement } from "./provenance.js";

const RULES = "+ [K_A] > 'x'\n+ [SHIFT K_A] > 'X'\n'a' + [K_E] > 'y'\n+ [K_Q] > nul\n+ [K_W] > beep\n";

describe("per-position provenance (FR-028)", () => {
  it("lists every main-block position of every hardware layer once, in sorted order", () => {
    const { low } = lowerRules(RULES, US_BASE);
    const rec = low.provenance;
    expect(rec.positions).toHaveLength(low.grid.layers.length * 48);
    const keys = rec.positions.map((p) => `${p.layer}|${p.vkey}`);
    expect(new Set(keys).size).toBe(keys.length);
    const cp = (a: string, b: string): number => compareCodePoints(a, b);
    const sorted = [...rec.positions].sort((a, b) => cp(a.layer, b.layer) || cp(a.vkey, b.vkey));
    expect(rec.positions).toEqual(sorted);
    expect(rec.baseKeyboard).toEqual({ id: "us", source: "en-US" });
  });

  it("filled = spec 109's unhandled positions minus suppressed (spec 109 SC-005)", () => {
    const { low, input } = lowerRules(RULES, US_BASE);
    const positions = FORM_ROWS[low.grid.form].flatMap((r) => r.map((c) => c.vkey));
    const unhandled = enumerateUnhandledPositions(input.ir, positions);
    const STATE_TO_LAYER: Record<string, string> = { none: "none", shift: "shift", altgr: "altR", shiftAltgr: "altR shift" };
    const expected = new Set(unhandled.map((p) => `${STATE_TO_LAYER[p.state]}|${p.vkey}`));
    // Non-caps layers carry the base states; a position is filled unless a rule suppresses it.
    const filled = new Set(
      low.provenance.positions.filter((p) => p.provenance === "filled" && !p.layer.includes("caps")).map((p) => `${p.layer}|${p.vkey}`),
    );
    const suppressed = new Set(
      low.provenance.positions.filter((p) => p.provenance === "suppressed" && !p.layer.includes("caps")).map((p) => `${p.layer}|${p.vkey}`),
    );
    const exported = new Set(low.provenance.positions.map((p) => p.layer));
    for (const e of expected) if (exported.has(e.split("|")[0] as string)) expect(filled.has(e) || suppressed.has(e), e).toBe(true);
    for (const f of filled) expect(expected.has(f), f).toBe(true);
    expect([...suppressed].sort()).toEqual(["none|K_Q", "none|K_W"]);
  });

  it("counts authored, filled and suppressed positions per layer", () => {
    const { low } = lowerRules(RULES, US_BASE);
    const none = provenanceCounts(low.provenance).find((r) => r.layer === "none");
    expect(none).toEqual({ layer: "none", authored: 2, filled: 44, suppressed: 2 });
  });

  it("does not depend on the base keyboard for which positions are unhandled", () => {
    const us = lowerRules(RULES, US_BASE).low.provenance.positions.filter((p) => p.layer === "none");
    const az = lowerRules(RULES, AZERTY_BASE).low.provenance.positions.filter((p) => p.layer === "none");
    const usKeys = new Set(us.map((p) => p.vkey));
    const common = az.filter((p) => usKeys.has(p.vkey));
    expect(common.map((p) => `${p.vkey}:${p.provenance}`).sort()).toEqual(us.map((p) => `${p.vkey}:${p.provenance}`).sort());
  });

  it("builds the extension element a later profile could write", () => {
    const { low } = lowerRules(RULES, US_BASE);
    const el = toSpecialElement(buildProvenance(low.grid, { id: "us", source: "en-US" }));
    expect(el.namespaces).toEqual({ ks: PROVENANCE_NAMESPACE });
    expect(el.elements[0]).toEqual({ name: "ks:baseKeyboard", attributes: [["id", "us"], ["source", "en-US"]] });
    expect(el.elements).toHaveLength(1 + low.provenance.positions.length);
  });

  it("is not written into the document: profiles 46 and 49 schemas reject a foreign child of special", () => {
    expect(lowerRules(RULES, US_BASE).xml).not.toContain("<special");
  });
});
