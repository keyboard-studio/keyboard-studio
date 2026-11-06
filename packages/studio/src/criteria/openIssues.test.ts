// @vitest-environment node
import { describe, expect, it } from "vitest";

import { openIssuesOf, MISSING_LETTERS_RULE } from "./openIssues.ts";
import { CASEDKEYS_MISSING } from "./upgradePairs.ts";
import type { OpenBaseline } from "./openRatchet.ts";
import type { FindingKey } from "@keyboard-studio/contracts";

const baseline = (...keys: string[]): OpenBaseline => ({
  takenAt: "2026-11-05T00:00:00Z",
  failing: keys as FindingKey[],
  unresolvable: [],
});

describe("openIssuesOf", () => {
  it("is empty for a keyboard with no relevant failures and no documentation gaps", () => {
    expect(openIssuesOf(baseline("KM_LINT_OTHER:source/a.kmn"), new Set())).toEqual([]);
  });

  it("names missing letters from 18.6 findings", () => {
    expect(openIssuesOf(baseline(`${MISSING_LETTERS_RULE}:source/a.kmn#U+0259`), new Set())).toEqual(["missing-letters"]);
  });

  it("names upgrades when a rule with a registered fixer fails", () => {
    expect(openIssuesOf(baseline(`${CASEDKEYS_MISSING}:source/a.kmn`), new Set())).toEqual(["upgrades"]);
  });

  it("names docs from the documentation gaps, and all kinds together in walk order", () => {
    expect(
      openIssuesOf(
        baseline(`${MISSING_LETTERS_RULE}:source/a.kmn#U+0259`, `${CASEDKEYS_MISSING}:source/a.kmn`),
        new Set(["help-php"]),
      ),
    ).toEqual(["missing-letters", "upgrades", "docs"]);
  });
});
