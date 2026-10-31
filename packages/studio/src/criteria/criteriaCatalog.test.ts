// Catalog counts tests for the criteria resolver (spec 084, Phase 1).
//
// The resolver's honesty rests on two pinned numbers: the real catalog is
// 188 criteria in the 40/106/32/10 band split, and exactly 99 of its
// layer-c lintRuleIds have a real mechanism behind them (the original
// 19 — §18 touch/inventory + the doc band — plus spec 084 Batch 1's 20
// criteria checks in keyboard-lint's checks/criteria/ and docs/, plus
// the 2 compile-result mappings synthesized in the criteria assembly,
// plus Batch 2's 7 cross-file reconciliation checks, plus the 10.6
// catch-up, plus Batch 3's 4 checks and 4 assembly verdicts, plus the
// KPJ pair's 2 checks — 1.10b/2.7 landed once Matthew's 2026-10-14
// ruling re-pinned criterion 1.10's current .kpj format to 2.0 — plus
// the /review Group A2 file-inventory twins' 7 checks, plus the
// .kps-listing twins' 10 checks, plus the
// .kps-metadata twins' 5 checks, plus the
// text-content twins' 12 checks, plus the
// repo-context twins' 5 checks and the Group C
// extraneous-files check (1.1, no twin needed)).
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
 * codes. Mirrors test/gateCoverage.test.ts's registeredLintCodes().
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
  it("has 188 rows in the 40/106/32/10 band split, with unique ids", () => {
    expect(ALL_CRITERIA).toHaveLength(188);

    const perBand = new Map<string, number>();
    for (const criterion of ALL_CRITERIA) {
      perBand.set(criterion.band, (perBand.get(criterion.band) ?? 0) + 1);
    }
    expect(perBand.get("scaffolder-bake")).toBe(40);
    expect(perBand.get("layer-c-enforce")).toBe(106);
    expect(perBand.get("yellow-survey")).toBe(32);
    expect(perBand.get("red-checklist")).toBe(10);

    expect(new Set(ALL_CRITERIA.map((c) => c.id)).size).toBe(188);
  });
});

describe("IMPLEMENTED_LINT_CODES", () => {
  it("has exactly 59 codes, every one a lintRuleId present in the catalog", () => {
    expect(IMPLEMENTED_LINT_CODES.size).toBe(99);
    const catalogIds = catalogLintRuleIds();
    for (const code of IMPLEMENTED_LINT_CODES) {
      expect(catalogIds.has(code)).toBe(true);
    }
  });

  it("names its assembly-synthesized codes exactly: the compile mappings + the Batch 3 verdicts", () => {
    expect([...ASSEMBLY_SYNTHESIZED_CODES].sort()).toEqual([
      "KM_LINT_COMPILE_ERRORS",
      "KM_LINT_COMPILE_HAS_WARNINGS",
      "KM_LINT_SPURIOUS_VERSION_BUMP",
      "KM_LINT_VERSION_NOT_BUMPED",
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
