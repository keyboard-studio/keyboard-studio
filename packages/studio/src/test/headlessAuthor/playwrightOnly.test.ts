// The Playwright-only table (spec 107 FR-042): the data every run report
// reports as not covered, and the header comment table that documents it,
// name the same rules.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NOT_COVERED, PLAYWRIGHT_ONLY } from "./playwrightOnly.ts";
import { createRunReport } from "./runReport.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("Playwright-only table", () => {
  it("is reported as notCovered on every run report", () => {
    expect(createRunReport("store-default").report.notCovered).toEqual(NOT_COVERED);
  });

  it("has unique rules, each with a component and a reason", () => {
    expect(new Set(NOT_COVERED).size).toBe(PLAYWRIGHT_ONLY.length);
    for (const r of PLAYWRIGHT_ONLY) {
      expect(r.component, r.rule).not.toBe("");
      expect(r.reason, r.rule).not.toBe("");
    }
  });

  it("is repeated in the header comment of runAuthorCase.ts", () => {
    const header = readFileSync(join(HERE, "runAuthorCase.ts"), "utf8");
    const missing = NOT_COVERED.filter((rule) => !header.includes(`| ${rule} |`));
    expect(missing, "rules absent from the runAuthorCase.ts header table").toEqual([]);
  });
});
