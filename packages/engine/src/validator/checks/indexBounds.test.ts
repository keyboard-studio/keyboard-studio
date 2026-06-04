import { describe, it, expect } from "vitest";
import { checkIndexBounds } from "./indexBounds.js";

// lint.md check #13 (warn-only)
// index(store, N): store must exist, offset >= 1, store length >= any() count.
// All findings are warnings, not errors.

describe("checkIndexBounds", () => {
  // Passing cases
  it("accepts a valid index() with a declared store and offset 1", () => {
    const source = 'store(s) "abc"\nany(s) + "x" > index(s, 1)';
    expect(checkIndexBounds(source)).toEqual([]);
  });

  it("accepts index() with offset equal to the number of any() tokens", () => {
    const source = 'store(s) "abc"\nany(s) any(s) + "x" > index(s, 2)';
    expect(checkIndexBounds(source)).toEqual([]);
  });

  it("accepts when the store has more entries than any() count", () => {
    const source = 'store(s) "abcde"\nany(s) + "x" > index(s, 1)';
    expect(checkIndexBounds(source)).toEqual([]);
  });

  it("returns empty when there are no index() calls", () => {
    const source = 'store(s) "abc"\n+ "a" > "b"';
    expect(checkIndexBounds(source)).toEqual([]);
  });

  // Failing cases — undeclared store
  it("warns when the store referenced in index() is not declared", () => {
    const source = 'any(s) + "x" > index(missing, 1)';
    const findings = checkIndexBounds(source);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_INDEX_STORE_UNDECLARED");
    expect(findings[0]?.severity).toBe("warning");
  });

  it("includes the store name in the undeclared-store message", () => {
    const source = 'index(ghostStore, 1)';
    const findings = checkIndexBounds(source);
    expect(findings[0]?.message).toContain("ghostStore");
  });

  // Failing cases — invalid offset
  it("warns when offset is 0 (offsets are 1-based)", () => {
    const source = 'store(s) "abc"\nany(s) + "x" > index(s, 0)';
    const findings = checkIndexBounds(source);
    expect(findings.some((f) => f.code === "KM_WARN_INDEX_OFFSET_INVALID")).toBe(true);
    expect(findings.every((f) => f.severity === "warning")).toBe(true);
  });

  // Failing cases — store too short vs any() count
  it("warns when store has fewer entries than any() count on the line", () => {
    // store has 2 chars but there are 3 any() tokens
    const source = 'store(s) "ab"\nany(s) any(s) any(s) + "x" > index(s, 1)';
    const findings = checkIndexBounds(source);
    expect(findings.some((f) => f.code === "KM_WARN_INDEX_STORE_TOO_SHORT")).toBe(true);
  });

  it("does not warn when store length exactly equals any() count", () => {
    const source = 'store(s) "abc"\nany(s) any(s) any(s) + "x" > index(s, 1)';
    const storeShortFindings = checkIndexBounds(source).filter(
      (f) => f.code === "KM_WARN_INDEX_STORE_TOO_SHORT"
    );
    expect(storeShortFindings).toHaveLength(0);
  });

  // Regression — P0-2: single-quoted store bodies must be bounds-checked
  it("accepts a valid index() whose store is declared with single quotes", () => {
    const source = "store(s) 'abc'\nany(s) + \"x\" > index(s, 1)";
    expect(checkIndexBounds(source)).toEqual([]);
  });

  it("warns when a single-quoted store has fewer entries than any() count", () => {
    // store has 2 chars but 3 any() tokens — should still produce KM_WARN_INDEX_STORE_TOO_SHORT
    const source = "store(s) 'ab'\nany(s) any(s) any(s) + \"x\" > index(s, 1)";
    const findings = checkIndexBounds(source);
    expect(findings.some((f) => f.code === "KM_WARN_INDEX_STORE_TOO_SHORT")).toBe(true);
  });

  // Location accuracy
  it("reports the correct line number", () => {
    const source = 'store(s) "abc"\nindex(missing, 1)';
    const findings = checkIndexBounds(source);
    expect(findings[0]?.location?.line).toBe(2);
  });

  it("reports a column greater than 0", () => {
    const source = 'index(missing, 1)';
    const findings = checkIndexBounds(source);
    expect(findings[0]?.location?.column).toBeGreaterThan(0);
  });

  it("all findings are warnings, never errors", () => {
    const source = [
      'store(s) "a"',
      'any(s) any(s) + "x" > index(s, 0)',
      'index(ghost, 1)',
    ].join("\n");
    const findings = checkIndexBounds(source);
    expect(findings.length).toBeGreaterThan(0);
    findings.forEach((f) => expect(f.severity).toBe("warning"));
  });
});
