// baseConsequenceCopy.test.ts — FR-003 / 1802 amendments A2 + A3.
//
// The one-sided allow/block slogan (see editors/fallback/retiredSlogan.test.ts) is RETIRED.
// This test asserts it — and every close variant of its one-sided framing —
// is absent from ALL rendered strings in the demo pane's allow/block +
// host-consequence area: the A2 tradeoff copy, the likely-hosts honesty
// caption, every host layout's label/blurb, and every branch of the per-row
// host-consequence label. The exact retired wording plus the two bare
// variants are checked explicitly (built from parts so this file never
// quotes them); the strongest assertion is on the bare words themselves —
// the retired framing IS the predictable/unpredictable dichotomy, so
// neither word may appear anywhere in this copy.

import { describe, expect, it } from "vitest";
import {
  ALLOW_BLOCK_QUESTION,
  ALLOW_RISK_COPY,
  BLOCK_RISK_COPY,
  BASE_LAYOUTS,
  LIKELY_BASES_NOTE,
  baseLayoutById,
} from "./baseLayouts.ts";
import { baseConsequenceFor } from "./demoTrace.ts";

const UNP = ["un", "predictable"].join("");
const PRED = "predict" + "able";
const RETIRED_SLOGAN = `Allow means ${UNP}; Block means ${PRED}`;

/** Every user-facing string the demo pane renders for allow/block + host consequence. */
function allRenderedStrings(): string[] {
  const strings: string[] = [
    ALLOW_BLOCK_QUESTION,
    ALLOW_RISK_COPY,
    BLOCK_RISK_COPY,
    LIKELY_BASES_NOTE,
  ];
  for (const layout of BASE_LAYOUTS) {
    strings.push(layout.label, layout.blurb);
  }
  // Every branch of the per-row host-consequence label (demoTrace.ts):
  const usLabel = baseLayoutById("us").label;
  strings.push(
    baseConsequenceFor({ baseLayout: "blocked", layoutLabel: "Blocked", vkey: "K_A", baseLayoutChar: "a" }),
    baseConsequenceFor({ baseLayout: "us", layoutLabel: usLabel, vkey: "K_QUOTE", baseLayoutChar: "" }),
    baseConsequenceFor({ baseLayout: "us", layoutLabel: usLabel, vkey: "K_A", baseLayoutChar: "a" }),
    baseConsequenceFor({ baseLayout: "us", layoutLabel: usLabel, vkey: "K_UNKNOWN", baseLayoutChar: null }),
  );
  return strings;
}

describe("retired slogan is absent from demo-pane host-consequence copy", () => {
  it("contains neither the exact retired wording nor any close variant", () => {
    const rendered = allRenderedStrings().join("\n");
    // Exact retired wording, with and without the trailing period.
    expect(rendered).not.toContain(RETIRED_SLOGAN);
    expect(rendered).not.toContain(`${RETIRED_SLOGAN}.`);
    // Obvious variants of the one-sided framing.
    expect(rendered).not.toMatch(new RegExp(`allow means ${UNP}`, "i"));
    expect(rendered).not.toMatch(new RegExp(`block means ${PRED}`, "i"));
    expect(rendered).not.toMatch(new RegExp(`allow ${UNP}`, "i"));
    expect(rendered).not.toMatch(new RegExp(`block ${PRED}`, "i"));
    // Strongest form: the retired framing IS the predictable/unpredictable
    // dichotomy — neither word appears anywhere in this copy.
    expect(rendered).not.toMatch(/unpredictable/i);
    expect(rendered).not.toMatch(/predictable/i);
  });

  it("still states each option's own risk (A2 symmetric copy intact)", () => {
    expect(ALLOW_RISK_COPY).toContain("always does something");
    expect(BLOCK_RISK_COPY).toContain("does nothing");
  });

  it("still labels likely hosts as a best guess (A3 honesty caption intact)", () => {
    expect(LIKELY_BASES_NOTE).toMatch(/best guess/i);
    expect(LIKELY_BASES_NOTE).toMatch(/not sight/i);
  });
});
