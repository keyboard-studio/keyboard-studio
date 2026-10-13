// Catalog counts tests for the criteria resolver (spec 084, Phase 1).
//
// The resolver's honesty rests on two pinned numbers: the real catalog is
// 149 criteria in the 40/67/32/10 band split, and exactly 41 of its
// layer-c lintRuleIds have a real mechanism behind them (the original
// 19 — §18 touch/inventory + the doc band — plus spec 084 Batch 1's 20
// criteria checks in keyboard-lint's checks/criteria/ and docs/, plus
// the 2 compile-result mappings synthesized in the criteria assembly).
// The implemented set is re-derived here from its two named sources —
// the keyboard-lint producer scan (the gateCoverage.test.ts method) and
// ASSEMBLY_SYNTHESIZED_CODES — so adding a lint check fails this test
// until implementedChecks.ts learns the new code in the same change.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ALL_CRITERIA } from "@keyboard-studio/contracts";

import {
  ASSEMBLY_SYNTHESIZED_CODES,
  IMPLEMENTED_LINT_CODES,
} from "./implementedChecks.ts";

const here = dirname(fileURLToPath(import.meta.url));
const LINT_CHECKS = resolve(here, "../../../keyboard-lint/src/checks");

/**
 * Every code emitted by a keyboard-lint check module, derived from source
 * (the lint package has no runtime registry). Only codes emitted as a
 * finding's `code:` field count; header comments may mention neighbouring
 * codes. Mirrors decisions/gateCoverage.test.ts's registeredLintCodes().
 */
function registeredLintCodes(): string[] {
  const out = new Set<string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) {
        if (name !== "fixtures") walk(abs);
        continue;
      }
      if (
        !name.endsWith(".ts") ||
        name.endsWith(".test.ts") ||
        name.startsWith("_shared")
      )
        continue;
      const text = readFileSync(abs, "utf-8");
      for (const m of text.matchAll(
        /code:\s*"(KM_(?:LINT|WARN|HINT|ERROR)_[A-Z0-9_]+)"/g,
      ))
        out.add(m[1]!);
    }
  };
  walk(LINT_CHECKS);
  return [...out].sort();
}

function catalogLintRuleIds(): Set<string> {
  return new Set(
    ALL_CRITERIA.filter((c) => c.band === "layer-c-enforce").map(
      (c) => c.lintRuleId,
    ),
  );
}

describe("criteria catalog", () => {
  it("has 149 rows in the 40/67/32/10 band split, with unique ids", () => {
    expect(ALL_CRITERIA).toHaveLength(149);

    const perBand = new Map<string, number>();
    for (const criterion of ALL_CRITERIA) {
      perBand.set(criterion.band, (perBand.get(criterion.band) ?? 0) + 1);
    }
    expect(perBand.get("scaffolder-bake")).toBe(40);
    expect(perBand.get("layer-c-enforce")).toBe(67);
    expect(perBand.get("yellow-survey")).toBe(32);
    expect(perBand.get("red-checklist")).toBe(10);

    expect(new Set(ALL_CRITERIA.map((c) => c.id)).size).toBe(149);
  });
});

describe("IMPLEMENTED_LINT_CODES", () => {
  it("has exactly 41 codes, every one a lintRuleId present in the catalog", () => {
    expect(IMPLEMENTED_LINT_CODES.size).toBe(41);
    const catalogIds = catalogLintRuleIds();
    for (const code of IMPLEMENTED_LINT_CODES) {
      expect(catalogIds.has(code)).toBe(true);
    }
  });

  it("names its assembly-synthesized codes exactly: the two compile mappings", () => {
    expect([...ASSEMBLY_SYNTHESIZED_CODES].sort()).toEqual([
      "KM_LINT_COMPILE_ERRORS",
      "KM_LINT_COMPILE_HAS_WARNINGS",
    ]);
    for (const code of ASSEMBLY_SYNTHESIZED_CODES) {
      expect(IMPLEMENTED_LINT_CODES.has(code)).toBe(true);
    }
  });

  it("equals the scanned lint codes that map to catalog criteria, plus the named synthesized set", () => {
    const registered = registeredLintCodes();
    // Guard the scanner itself: it must find the known checks, not return [].
    expect(registered.length).toBeGreaterThanOrEqual(20);
    expect(registered).toContain("KM_LINT_INVENTORY_UNCOVERED");
    // The synthesized codes must NOT come from the scan — they have no
    // lint producer, and claiming one would be a false derivation.
    for (const code of ASSEMBLY_SYNTHESIZED_CODES) {
      expect(registered).not.toContain(code);
    }

    const catalogIds = catalogLintRuleIds();
    const scannedAndMapped = registered.filter((code) => catalogIds.has(code));
    const expected = [
      ...new Set([...scannedAndMapped, ...ASSEMBLY_SYNTHESIZED_CODES]),
    ].sort();
    expect(expected).toEqual([...IMPLEMENTED_LINT_CODES].sort());
  });
});
