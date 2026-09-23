// il_script_not_supported (identity-lite): terminal notice for scripts the studio
// cannot build yet. Definition shape and the generic invariants run in
// src/survey/questions/questionModules.test.ts.

import { describe, it, expect } from "vitest";
import { definition } from "../../../../src/survey/questions/a/il_script_not_supported.ts";

describe("il_script_not_supported — notice", () => {
  it("prompt describes the not-yet-supported state honestly", () => {
    expect(definition.prompt).toMatch(/not supported/i);
  });
});
