import { describe, it, expect } from "vitest";
import { checkDuplicateStores } from "./duplicateStores.js";

describe("checkDuplicateStores", () => {
  // Passing cases
  it("accepts a single store declaration", () => {
    expect(checkDuplicateStores('store(MyStore) "hello"')).toEqual([]);
  });

  it("accepts two stores with different names", () => {
    const source = 'store(StoreA) "a"\nstore(StoreB) "b"';
    expect(checkDuplicateStores(source)).toEqual([]);
  });

  it("accepts duplicate system store declarations (system stores are exempt)", () => {
    const source = "store(&BITMAP) using keys\nstore(&BITMAP) using keys";
    expect(checkDuplicateStores(source)).toEqual([]);
  });

  // Failing cases — derived from CheckForDuplicates.cpp:31-52 (case-insensitive)
  it("rejects two stores with the same name", () => {
    const source = 'store(MyStore) "hello"\nstore(MyStore) "world"';
    const findings = checkDuplicateStores(source);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_DUPLICATE_STORE");
  });

  it("rejects duplicate store names that differ only in case", () => {
    const source = 'store(mystore) "hello"\nstore(MYSTORE) "world"';
    const findings = checkDuplicateStores(source);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_DUPLICATE_STORE");
  });

  it("reports the duplicate on the second declaration's line", () => {
    const source = 'store(MyStore) "hello"\n\nstore(MyStore) "world"';
    const findings = checkDuplicateStores(source);
    expect(findings[0]?.location?.line).toBe(3);
  });

  it("includes the first-declared line number in the message", () => {
    const source = 'store(MyStore) "hello"\nstore(MyStore) "world"';
    const findings = checkDuplicateStores(source);
    expect(findings[0]?.message).toContain("line 1");
  });

  it("reports a column on the duplicate finding", () => {
    const source = 'store(MyStore) "hello"\nstore(MyStore) "world"';
    const findings = checkDuplicateStores(source);
    expect(findings[0]?.location?.column).toBeGreaterThan(0);
  });

  it("ignores store() appearing mid-line (e.g. inside a comment)", () => {
    const source = 'c see store(fake) for details\nstore(real) "hello"';
    expect(checkDuplicateStores(source)).toEqual([]);
  });
});
