// The 32 harness cases, headless (spec 107 US3, FR-030). Opt-in: set
// KS_AUTHOR_HARNESS=1. KS_AUTHOR_CASES_FILE may name a same-shape file in
// place of the canonical cases/harness-cases.json. Never a PR gate.
//
// Each case reports its gates, placeholders and displacements. A gap spec
// 106 KNOWN_GAPS owns is printed as expected with its owner; any other
// failure fails the case and prints the reproduce command.

import { afterAll, describe, expect, it } from "vitest";
import { sc004GatesEnabled } from "../sc004Harness.ts";
import { ownerOf } from "../decisionPointKnownGaps.fixture.ts";
import { classifyRun, formatCaseBlock, DECISION_POINT } from "./corpusReport.ts";
import { CANONICAL_CASES_PATH, loadCases } from "./loadCases.ts";
import { runAuthorCase } from "./runAuthorCase.ts";

const enabled = process.env.KS_AUTHOR_HARNESS === "1";
const casesFile = process.env.KS_AUTHOR_CASES_FILE;

if (!enabled) {
  console.warn("[WARN] headless author harness suite skipped: set KS_AUTHOR_HARNESS=1 to run the harness cases");
}

const cases = enabled && sc004GatesEnabled ? loadCases(casesFile ?? CANONICAL_CASES_PATH) : [];
const baseOf = new Map(cases.map((c) => [c.id, c.base]));
const ownerOfFailedRun = (caseId: string): string | undefined => {
  const base = baseOf.get(caseId);
  return base === undefined ? undefined : ownerOf(base, DECISION_POINT, "G2");
};

// Skipped, never silently passed, when the variable is unset.
describe.skipIf(!enabled || !sc004GatesEnabled)("headless author: harness cases", () => {
  // vitest fails a file whose suites are all skipped-empty only when nothing is
  // registered; keep one placeholder test so the skip is visible in the report.
  if (cases.length === 0) it.skip("harness cases (KS_AUTHOR_HARNESS not set)", () => {});
  // The per-case report (the T057 summary spec 106 reads), printed once after
  // the last case rather than interleaved with compiler logs. vitest hides
  // console output from passing tests: run with --silent=false --reporter=verbose to see it.
  const blocks: string[] = [];
  afterAll(() => {
    if (blocks.length > 0) console.log(blocks.join("\n"));
  });
  for (const c of cases) {
    it(
      c.id,
      async () => {
        const run = await runAuthorCase(c);
        // A named skip (not codec-clean, outside slice) is reported, not a failure.
        const verdict = classifyRun(run, ownerOfFailedRun);
        blocks.push(formatCaseBlock(run, verdict, casesFile));
        expect(verdict.unexpected, verdict.unexpected.join("\n")).toEqual([]);
      },
      180_000,
    );
  }
});
