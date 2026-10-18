/**
 * §7.5 seed regression gate (issue #297 acceptance criterion): all 13 rows
 * of the §7.5 hand table reproduce their documented results — the tree's
 * pick for the documented axis vector, AND the documented agreement
 * verdict against the keyboard's actual dominant strategy, including the
 * one remaining intentional EuroLatin mismatch.
 */

import { describe, expect, it } from "vitest";

import { selectStrategy } from "../../packages/engine/src/strategy-selector/index.js";
import { SEED_ROWS } from "./seed-fixtures.js";

describe("§7.5 seed fixture set", () => {
  it.each(SEED_ROWS.map((r) => [r.name, r] as const))(
    "%s: tree reproduces the documented pick",
    (_name, row) => {
      const rec = selectStrategy(row.axes);
      expect(rec.triggeredRule).toBe(row.expectRule);
      expect(rec.primary).toBe(row.expectPrimary);
      expect(rec.secondaries).toEqual(row.expectSecondaries);
    },
  );

  it.each(SEED_ROWS.map((r) => [r.name, r] as const))(
    "%s: agreement verdict matches the documented ✓/✗",
    (_name, row) => {
      const rec = selectStrategy(row.axes);
      const agrees =
        row.actualPrimary === rec.primary || rec.secondaries.includes(row.actualPrimary);
      expect(agrees).toBe(row.expectAgreement);
    },
  );

  it("exactly one seed row is a documented intentional mismatch (EuroLatin)", () => {
    const mismatches = SEED_ROWS.filter((r) => !r.expectAgreement);
    expect(mismatches.map((r) => r.name)).toEqual(["sil_euro_latin"]);
  });
});
