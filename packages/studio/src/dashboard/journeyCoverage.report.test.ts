// journeyCoverage.report.test.ts — spec 032 FR-012's standalone report command.
//
// WHY A TEST FILE, NOT A BARE `tsx scripts/coverage-report.ts` (plan.md's own
// "location TBD, resolved here"): computeCoverageReport() reaches
// buildManifestStepGraph() -> steps/manifest.ts, which imports the real
// editor-step React components (CharactersStep.tsx, IdentityLiteAdapter, …).
// Those components import `content/flows/*.modular.yaml?raw` — a Vite asset
// transform, not a Node-resolvable module specifier. Empirically confirmed in
// this session: `tsx` (esbuild, no Vite) cannot resolve either the `?raw`
// suffix or this workspace's package `exports` map without a full `pnpm build`
// first (`ERR_PACKAGE_PATH_NOT_EXPORTED` on @keyboard-studio/contracts alone,
// before even reaching the `?raw` import). Vitest already runs on Vite's own
// transform pipeline — the SAME one the dashboard and every existing
// buildStepGraph.test.ts-style suite relies on — so running the report
// generator as a vitest spec is the one way to reuse the live manifest
// without introducing a second, Vite-unaware code path (or a bespoke Node
// loader this feature has no mandate to build). `pnpm run coverage:report`
// (package.json) invokes exactly this file.
//
// Also runs as part of the normal `pnpm --filter @keyboard-studio/studio test`
// suite (FR-011's "included in `pnpm test`" concern) — a useful side effect:
// it doubles as a regression check that report generation does not throw.

import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeCoverageReport, renderedNodeUniverseSize } from "./journeyCoverage.ts";
import { parseJourneyFixture } from "../survey/journeyFixture.ts";

import bafutRaw from "../../../../content/journeys/bafut-end-to-end.yaml?raw";
import bjCreeWoodsRaw from "../../../../content/journeys/bj-cree-woods-track2.yaml?raw";
import minimalDefaultsRaw from "../../../../content/journeys/minimal-defaults.yaml?raw";
import backtrackRaw from "../../../../content/journeys/backtrack-journey.yaml?raw";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// packages/studio/src/dashboard -> repo root docs/journey-coverage.json
const REPORT_PATH = join(__dirname, "..", "..", "..", "..", "docs", "journey-coverage.json");

describe("journey coverage report (spec 032 FR-006/FR-012, US2)", () => {
  it("computes the coverage report and writes docs/journey-coverage.json", () => {
    const fixtures = [bafutRaw, bjCreeWoodsRaw, minimalDefaultsRaw, backtrackRaw].map(
      parseJourneyFixture,
    );
    const report = computeCoverageReport(fixtures);

    // Report-only mode (research R6, FR-007): this command never fails CI —
    // it always writes the report and exits 0, regardless of gaps.
    expect(report.totalSteps).toBeGreaterThan(0);
    expect(report.entries).toHaveLength(report.totalSteps);

    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(
      REPORT_PATH,
      JSON.stringify(
        {
          ...report,
          // Informational only — see journeyCoverage.ts's own doc comment on
          // why this is not folded into a per-fixture entry.
          renderedNodeUniverseSize: renderedNodeUniverseSize(),
          coveragePercent: Math.round((report.coveredSteps / report.totalSteps) * 100),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
  });
});
