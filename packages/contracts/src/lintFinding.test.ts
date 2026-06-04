// see lintFinding.ts — LintFindingOrigin field (#39 cycle 3 km-validator).

import { describe, it, expect } from "vitest";
import type { LintFinding, LintFindingOrigin } from "./lintFinding";

describe("LintFinding.origin", () => {
  it("omitting origin leaves the field absent", () => {
    const f: LintFinding = {
      code: "KM_WARN_DEPRECATED_STORE_ID",
      severity: "warning",
      layer: "A",
      message: "Store '&ETHNOLOGUECODE' is deprecated.",
    };
    expect("origin" in f).toBe(false);
    expect(f.origin).toBeUndefined();
  });

  it("accepts origin: 'upstream'", () => {
    const f: LintFinding = {
      code: "KM_ERROR_DUPLICATE_STORE",
      severity: "error",
      layer: "A",
      message: "Duplicate store name.",
      origin: "upstream",
    };
    expect(f.origin).toBe("upstream");
  });

  it("accepts origin: 'authored'", () => {
    const f: LintFinding = {
      code: "KM_LINT_MISSING_LICENSE",
      severity: "error",
      layer: "C",
      message: "LICENSE.md is missing.",
      origin: "authored",
    };
    expect(f.origin).toBe("authored");
  });

  it("LintFindingOrigin narrows exhaustively in a switch", () => {
    function label(o: LintFindingOrigin): string {
      switch (o) {
        case "authored":
          return "user";
        case "upstream":
          return "base";
        default: {
          const _exhaustive: never = o;
          return _exhaustive;
        }
      }
    }
    expect(label("authored")).toBe("user");
    expect(label("upstream")).toBe("base");
  });
});
