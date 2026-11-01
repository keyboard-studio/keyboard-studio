import { describe, expect, it } from "vitest";
import { ALL_CRITERIA } from "@keyboard-studio/contracts";

import { PRECERTIFIED_LINT_CODES, PRECERTIFY_EVIDENCE } from "./precertify.ts";

describe("PRECERTIFIED_LINT_CODES", () => {
  it("settles the three repository-placement rows at generation time (1.2b, 1.3b, 1.4b)", () => {
    for (const code of [
      "KM_LINT_REPO_PLACEMENT_BAD",
      "KM_LINT_REPO_NO_ORGANIZING_FOLDER",
      "KM_LINT_REPO_ROOT_SOURCE",
    ]) {
      expect(PRECERTIFIED_LINT_CODES.has(code)).toBe(true);
    }
  });

  it("states the generation invariant for every precertified code, and each names a real criterion", () => {
    const ruleIds = new Set(ALL_CRITERIA.map((c) => c.lintRuleId));
    for (const code of PRECERTIFIED_LINT_CODES) {
      expect(PRECERTIFY_EVIDENCE[code], code).toBeTruthy();
      expect(ruleIds.has(code), code).toBe(true);
    }
  });
});
