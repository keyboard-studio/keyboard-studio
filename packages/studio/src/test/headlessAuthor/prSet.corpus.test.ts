// The PR set, headless (spec 107 US4, FR-031). Every prSet.json entry runs in
// one vitest invocation; each reports its gates, placeholders and
// displacements. Failures only spec 106 KNOWN_GAPS owns are expected.
// Reads the sibling ../keyboards corpus, so it runs under vitest.corpus.config.ts.

import { describe, expect, it } from "vitest";
import { announceSc004Skip, sc004GatesEnabled } from "../sc004Harness.ts";
import { ownerOf } from "../decisionPointKnownGaps.fixture.ts";
import type { Case } from "./caseTypes.ts";
import { classifyRun, formatCaseBlock, DECISION_POINT } from "./corpusReport.ts";
import { loadPrSet } from "./loadCases.ts";
import { runAuthorCase } from "./runAuthorCase.ts";

announceSc004Skip("headless author PR set", (name) => it.skip(name, () => {}));

const entries = sc004GatesEnabled ? loadPrSet() : [];
const byId = new Map<string, Case>(entries.map((e) => [e.case.id, e.case]));
const ownerOfFailedRun = (caseId: string): string | undefined => {
  const base = byId.get(caseId)?.base;
  return base === undefined ? undefined : ownerOf(base, DECISION_POINT, "G2");
};

describe.skipIf(!sc004GatesEnabled)("headless author: PR set", () => {
  for (const { entry, case: c } of entries) {
    it(
      `${c.id} (${entry.shape.join(", ")})`,
      async () => {
        const run = await runAuthorCase(c);
        // A PR-set keyboard must be eligible: a skip is a failure here.
        const verdict = classifyRun(run, ownerOfFailedRun, { skipIsFailure: true });
        console.log(formatCaseBlock(run, verdict));
        expect(verdict.unexpected, verdict.unexpected.join("\n")).toEqual([]);
      },
      180_000,
    );
  }
});
