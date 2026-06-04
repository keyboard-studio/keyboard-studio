import { describe, it, expect } from "vitest";
import { checkIdentifiers } from "./identifiers.js";

describe("checkIdentifiers", () => {
  // Passing cases — derived from lint.md example: dk(003b) is a valid identifier
  it("accepts a valid deadkey identifier", () => {
    expect(checkIdentifiers("+ dk(003b) > U+003b")).toEqual([]);
  });

  it("accepts a valid group name", () => {
    expect(checkIdentifiers("group(main) using keys")).toEqual([]);
  });

  it("accepts a valid store name", () => {
    expect(checkIdentifiers('store(MyStore) "hello"')).toEqual([]);
  });

  it("accepts a valid use() identifier", () => {
    expect(checkIdentifiers("use(mainGroup)")).toEqual([]);
  });

  it("accepts a valid call() identifier", () => {
    expect(checkIdentifiers("call(myFunc)")).toEqual([]);
  });

  it("accepts a valid index() store reference", () => {
    expect(checkIdentifiers("index(myStore, 1)")).toEqual([]);
  });

  it("skips system stores (& prefix)", () => {
    expect(checkIdentifiers("store(&BITMAP) using keys")).toEqual([]);
  });

  it("accepts a user-store if() condition (if(storeName = 'val'))", () => {
    expect(checkIdentifiers("if(option_toneplace = '') 'oa' > 'óa'")).toEqual([]);
  });

  // Failing cases
  it("rejects an identifier containing a space", () => {
    const findings = checkIdentifiers("group(bad name) using keys");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_INVALID_IDENTIFIER");
  });

  it("rejects an identifier containing a comma", () => {
    const findings = checkIdentifiers("store(a,b) using keys");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_INVALID_IDENTIFIER");
  });

  it("rejects an empty identifier", () => {
    const findings = checkIdentifiers("group() using keys");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_INVALID_IDENTIFIER");
  });

  it("rejects an identifier longer than 255 characters", () => {
    const longName = "a".repeat(256);
    const findings = checkIdentifiers(`store(${longName}) "x"`);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_INVALID_IDENTIFIER");
  });

  it("rejects an invalid identifier in index()", () => {
    const findings = checkIdentifiers("index(bad name, 1)");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_INVALID_IDENTIFIER");
  });

  it("rejects an identifier containing a Unicode non-character (U+FDD0)", () => {
    const findings = checkIdentifiers("store(bad﷐name) \"x\"");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_INVALID_IDENTIFIER");
  });

  it("reports correct line number", () => {
    const source = "group(main) using keys\nstore(bad name) using keys";
    const findings = checkIdentifiers(source);
    expect(findings[0]?.location?.line).toBe(2);
  });
});
