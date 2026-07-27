import { describe, it, expect } from "vitest";
import { checkDeprecatedStores } from "./deprecatedStores.js";

describe("checkDeprecatedStores", () => {
  // Passing cases
  it("returns no findings for source with no deprecated stores", () => {
    expect(checkDeprecatedStores('store(MyStore) "hello"')).toEqual([]);
  });

  it("does not flag non-deprecated system stores", () => {
    const source = 'store(&BITMAP) "mykeyboard.bmp"';
    expect(checkDeprecatedStores(source)).toEqual([]);
  });

  // Failing cases — derived from DeprecationChecks.cpp:16-50
  it("rejects &LANGUAGE (TSS_LANGUAGE, illegal since v10)", () => {
    const findings = checkDeprecatedStores("store(&LANGUAGE) using keys");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_DEPRECATED_STORE");
    expect(findings[0]?.message).toContain("TSS_LANGUAGE");
  });

  it("rejects &LAYOUT (TSS_LAYOUT)", () => {
    const findings = checkDeprecatedStores("store(&LAYOUT) using keys");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_DEPRECATED_STORE");
  });

  it("rejects &LANGUAGENAME (TSS_LANGUAGENAME)", () => {
    expect(checkDeprecatedStores("store(&LANGUAGENAME) using keys")).toHaveLength(1);
  });

  it("rejects &ETHNOLOGUECODE (TSS_ETHNOLOGUECODE)", () => {
    expect(checkDeprecatedStores("store(&ETHNOLOGUECODE) using keys")).toHaveLength(1);
  });

  it("rejects &WINDOWSLANGUAGES (TSS_WINDOWSLANGUAGES)", () => {
    expect(checkDeprecatedStores("store(&WINDOWSLANGUAGES) using keys")).toHaveLength(1);
  });

  it("is case-insensitive — &language matches TSS_LANGUAGE", () => {
    const findings = checkDeprecatedStores("store(&language) using keys");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_DEPRECATED_STORE");
  });

  it("reports correct line and column", () => {
    const source = "group(main) using keys\nstore(&LANGUAGE) using keys";
    const findings = checkDeprecatedStores(source);
    expect(findings[0]?.location?.line).toBe(2);
    expect(findings[0]?.location?.column).toBeGreaterThan(0);
  });

  // Regression — a deprecated &store name inside a comment or quoted value is
  // prose, not a store reference, and must not be flagged (false-positive guard).
  it("ignores a deprecated &store name inside a quoted value", () => {
    expect(checkDeprecatedStores(`store(&NAME) "see doc on &language usage"`)).toEqual([]);
  });

  it("ignores a deprecated &store name inside a trailing c comment", () => {
    expect(checkDeprecatedStores(`+ "a" > "b" c relates to &language handling`)).toEqual([]);
  });
});
