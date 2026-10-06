// FR-009 regression (spec 087 T061): the question-management interface
// (the ?demo=decisions page) MUST be available only in local developer mode
// and MUST NOT be reachable in deployed builds.
//
// The gate lives in main.tsx (import.meta.env.DEV && query param). This test
// guards the gate statically: if someone removes the DEV check, the
// management UI would ship to production, and this test goes red.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mainTsx = readFileSync(resolve(here, "../main.tsx"), "utf-8");

describe("FR-009: decisions demo is DEV-gated", () => {
  it("main.tsx gates ?demo=decisions behind import.meta.env.DEV", () => {
    // The decisions demo gate must include the DEV check. We assert on the
    // source because the gate is evaluated at module load (build-time
    // constant); a runtime test cannot flip import.meta.env.DEV.
    const gateMatch = mainTsx.match(
      /const isDemoDecisions\s*=[\s\S]*?;/,
    );
    expect(gateMatch, "isDemoDecisions gate not found in main.tsx").toBeTruthy();
    expect(gateMatch![0]).toContain("import.meta.env.DEV");
    expect(gateMatch![0]).toContain("demo=decisions");
  });

  it("the DEV gate precedes the query-param check (fail-closed)", () => {
    // Fail-closed: if import.meta.env.DEV is false, the whole expression is
    // false regardless of the query param. The DEV check must come first so
    // a missing window/query param cannot accidentally enable the demo.
    const gateMatch = mainTsx.match(
      /const isDemoDecisions\s*=[\s\S]*?;/,
    )!;
    const devIndex = gateMatch[0].indexOf("import.meta.env.DEV");
    const queryIndex = gateMatch[0].indexOf("demo=decisions");
    expect(devIndex).toBeGreaterThanOrEqual(0);
    expect(queryIndex).toBeGreaterThanOrEqual(0);
    expect(devIndex).toBeLessThan(queryIndex);
  });
});
