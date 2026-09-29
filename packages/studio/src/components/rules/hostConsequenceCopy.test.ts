// hostConsequenceCopy.test.ts — FR-003 / 1802 amendments A2 + A3.
//
// The "Allow means unpredictable; Block means predictable" slogan is RETIRED.
// This test asserts it — and every close variant of its one-sided framing —
// is absent from ALL rendered strings in the demo pane's allow/block +
// host-consequence area: the A2 tradeoff copy, the likely-hosts honesty
// caption, every host layout's label/blurb, and every branch of the per-row
// host-consequence label. The exact retired wording plus the bare
// "allow unpredictable" / "block predictable" variants are checked
// explicitly; the strongest assertion is on the bare words themselves — the
// retired framing IS the predictable/unpredictable dichotomy, so neither
// word may appear anywhere in this copy.

import { describe, expect, it } from "vitest";
import {
  ALLOW_BLOCK_QUESTION,
  ALLOW_RISK_COPY,
  BLOCK_RISK_COPY,
  HOST_LAYOUTS,
  LIKELY_HOSTS_NOTE,
  hostLayoutById,
} from "./hostLayouts.ts";
import { hostConsequenceFor } from "./demoTrace.ts";

const RETIRED_SLOGAN = "Allow means unpredictable; Block means predictable";

/** Every user-facing string the demo pane renders for allow/block + host consequence. */
function allRenderedStrings(): string[] {
  const strings: string[] = [
    ALLOW_BLOCK_QUESTION,
    ALLOW_RISK_COPY,
    BLOCK_RISK_COPY,
    LIKELY_HOSTS_NOTE,
  ];
  for (const layout of HOST_LAYOUTS) {
    strings.push(layout.label, layout.blurb);
  }
  // Every branch of the per-row host-consequence label (demoTrace.ts):
  const usLabel = hostLayoutById("us").label;
  strings.push(
    hostConsequenceFor({ hostLayout: "blocked", layoutLabel: "Blocked", vkey: "K_A", hostChar: "a" }),
    hostConsequenceFor({ hostLayout: "us", layoutLabel: usLabel, vkey: "K_QUOTE", hostChar: "" }),
    hostConsequenceFor({ hostLayout: "us", layoutLabel: usLabel, vkey: "K_A", hostChar: "a" }),
    hostConsequenceFor({ hostLayout: "us", layoutLabel: usLabel, vkey: "K_UNKNOWN", hostChar: null }),
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
    expect(rendered).not.toMatch(/allow means unpredictable/i);
    expect(rendered).not.toMatch(/block means predictable/i);
    expect(rendered).not.toMatch(/allow unpredictable/i);
    expect(rendered).not.toMatch(/block predictable/i);
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
    expect(LIKELY_HOSTS_NOTE).toMatch(/best guess/i);
    expect(LIKELY_HOSTS_NOTE).toMatch(/not sight/i);
  });
});
