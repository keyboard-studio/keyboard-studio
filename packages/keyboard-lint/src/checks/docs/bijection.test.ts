// SC-007 bijection test (spec 076 contracts/lint-checks.md): every FR-019
// `lintRuleId` in criteria.json must be emitted by the registered documentation
// checks on its own broken fixture, and by none of them on the shared clean
// fixture. Closes the "nothing enforces code<->criterion" gap the research
// notes call out (spec 076 research R7).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runDocChecks } from "../../lintContext.js";
import { CLEAN_DOC_LINT_INPUT } from "./fixtures/clean.js";
import { BROKEN_DOC_LINT_FIXTURES } from "./fixtures/broken.js";

const CRITERIA_JSON_PATH = fileURLToPath(
  new URL("../../../../contracts/data/criteria.json", import.meta.url),
);

const FR_019_ROW_IDS = [
  "3.3-history-recent-change-at-top",
  "3.4-history-cumulative",
  "3.5-history-entry-format",
  "3.6-history-version-matches-kmn",
  "3.7-history-bullets-no-deleted-files",
  "4.7-copyright-holder-consistent-across-files",
  "5.7-readme-targets-match-kmn",
  "7.1-kmn-version-matches-history",
  "11.5-php-htm-html-wellformed",
  "11.6-php-osk-data-states-all-layers",
  "11.7-php-pagename-format",
  "11.9-php-htm-body-parity",
  "11.10-php-htm-style-parity",
];

interface CriterionRow {
  id: string;
  lintRuleId?: string;
}

function loadFr019LintRuleIds(): string[] {
  const raw = readFileSync(CRITERIA_JSON_PATH, "utf-8");
  const rows = JSON.parse(raw) as CriterionRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return FR_019_ROW_IDS.map((id) => {
    const row = byId.get(id);
    if (row === undefined) throw new Error(`criteria.json is missing row "${id}"`);
    const lintRuleId = row.lintRuleId;
    if (lintRuleId === undefined) throw new Error(`criteria.json row "${id}" has no lintRuleId`);
    return lintRuleId;
  });
}

describe("documentation check bijection (spec 076 SC-007 / FR-019)", () => {
  const lintRuleIds = loadFr019LintRuleIds();

  it("criteria.json carries exactly the thirteen FR-019 rows this test knows about", () => {
    expect(lintRuleIds).toHaveLength(13);
    expect(new Set(lintRuleIds).size).toBe(13);
  });

  it("the shared clean fixture produces zero documentation findings", () => {
    const findings = runDocChecks(CLEAN_DOC_LINT_INPUT);
    expect(findings).toEqual([]);
  });

  it.each(lintRuleIds)("%s is emitted exactly once on its broken fixture and never on the clean one", (code) => {
    const brokenFixture = BROKEN_DOC_LINT_FIXTURES[code];
    expect(brokenFixture, `no broken fixture registered for ${code}`).toBeDefined();

    const brokenFindings = runDocChecks(brokenFixture!).filter((f) => f.code === code);
    expect(brokenFindings).toHaveLength(1);

    const cleanFindings = runDocChecks(CLEAN_DOC_LINT_INPUT).filter((f) => f.code === code);
    expect(cleanFindings).toHaveLength(0);
  });
});
