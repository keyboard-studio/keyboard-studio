// Tests for gate→decision coverage (spec 087 T051, SC-005).

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGateCoverage } from "./gateCoverage.ts";

const here = dirname(fileURLToPath(import.meta.url));
const LINT_CHECKS = resolve(here, "../../../keyboard-lint/src/checks");

/**
 * Every code emitted by a keyboard-lint check module, derived from source (the
 * lint package has no runtime registry). Only codes emitted as a finding's
 * `code:` field count; header comments may mention neighbouring codes.
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
      if (!name.endsWith(".ts") || name.endsWith(".test.ts") || name.startsWith("_shared")) continue;
      const text = readFileSync(abs, "utf-8");
      for (const m of text.matchAll(/code:\s*"(KM_(?:LINT|WARN|HINT|ERROR)_[A-Z0-9_]+)"/g)) out.add(m[1]!);
    }
  };
  walk(LINT_CHECKS);
  return [...out].sort();
}

describe("buildGateCoverage", () => {
  it("accounts for every code the lint engine's check modules emit (mapped or on the gap list)", () => {
    const registered = registeredLintCodes();
    // Guard the scanner itself: it must find the known checks, not return [].
    expect(registered.length).toBeGreaterThanOrEqual(20);
    expect(registered).toContain("KM_LINT_INVENTORY_UNCOVERED");

    const { traces, gapList } = buildGateCoverage();
    const mappedCodes = traces.filter((t) => t.decisions.length > 0).map((t) => t.gate.code);
    const gapCodes = gapList.map((t) => t.gate.code);
    const accounted = new Set([...mappedCodes, ...gapCodes]);

    const unaccounted = registered.filter((c) => !accounted.has(c));
    expect(unaccounted, "lint codes in neither the mapped nor the gap list").toEqual([]);

    // And no stale entry: every listed code is still emitted by a check.
    const stale = [...accounted].filter((c) => !registered.includes(c));
    expect(stale, "listed codes no check emits").toEqual([]);
  });

  it("pins the current mapped/gap split and has no duplicate codes or ids", () => {
    const { traces, gapList } = buildGateCoverage();
    const mapped = traces.filter((t) => t.decisions.length > 0);
    expect(mapped.map((t) => t.gate.code).sort()).toEqual([
      "KM_LINT_COPYRIGHT_HOLDER_INCONSISTENT",
      "KM_LINT_INVENTORY_UNCOVERED",
      "KM_LINT_TOUCH_UNCOVERED",
    ]);
    expect(gapList.length).toBe(traces.length - mapped.length);
    expect(new Set(traces.map((t) => t.gate.code)).size).toBe(traces.length);
    expect(new Set(traces.map((t) => t.gate.id)).size).toBe(traces.length);
    for (const g of gapList) expect(traces).toContain(g);
  });

  it("reports coverage as mapped/total", () => {
    const { traces, gapList, coverage } = buildGateCoverage();
    expect(coverage).toBeCloseTo((traces.length - gapList.length) / traces.length, 10);
    expect(coverage).toBeGreaterThan(0);
    expect(coverage).toBeLessThan(1);
  });

  it("the inventory gates trace to the character-inventory decision", () => {
    const { traces } = buildGateCoverage();
    const inventory = traces.find((t) => t.gate.id === "18.6-inventory-coverage")!;
    expect(inventory.decisions).toEqual(["character-inventory"]);
    const touch = traces.find((t) => t.gate.id === "18.6-touch-coverage")!;
    expect(touch.decisions).toEqual(["character-inventory"]);
  });

  it("the gap list names the uncovered gates with rationale", () => {
    const { gapList } = buildGateCoverage();
    expect(gapList.length).toBeGreaterThan(0);
    for (const g of gapList) {
      expect(g.decisions).toEqual([]);
      expect(g.rationale.length).toBeGreaterThan(0);
    }
    const ids = gapList.map((g) => g.gate.id);
    expect(ids).toContain("18.2-touch-rows");
    expect(ids).toContain("3.6-history-version-match");
    expect(ids).toContain("18.6-touch-key-no-rule");
  });
});
