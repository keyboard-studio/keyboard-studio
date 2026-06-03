import { describe, it, expect } from "vitest";
import { checkDuplicateGroups } from "./duplicateGroups.js";

describe("checkDuplicateGroups", () => {
  // Passing cases
  it("accepts a single group declaration", () => {
    expect(checkDuplicateGroups("group(main) using keys")).toEqual([]);
  });

  it("accepts two groups with different names", () => {
    const source = "group(main) using keys\ngroup(deadkeys)";
    expect(checkDuplicateGroups(source)).toEqual([]);
  });

  // Failing cases — derived from CheckForDuplicates.cpp:13-29 (case-insensitive)
  it("rejects two groups with the same name", () => {
    const source = "group(main) using keys\ngroup(main)";
    const findings = checkDuplicateGroups(source);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_DUPLICATE_GROUP");
  });

  it("rejects duplicate group names that differ only in case", () => {
    const source = "group(Main) using keys\ngroup(MAIN)";
    const findings = checkDuplicateGroups(source);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_DUPLICATE_GROUP");
  });

  it("reports the duplicate on the second declaration's line", () => {
    const source = "group(main) using keys\n\ngroup(main)";
    const findings = checkDuplicateGroups(source);
    expect(findings[0]?.location?.line).toBe(3);
  });

  it("includes the first-declared line number in the message", () => {
    const source = "group(main) using keys\ngroup(main)";
    const findings = checkDuplicateGroups(source);
    expect(findings[0]?.message).toContain("line 1");
  });

  it("reports a column on the duplicate finding", () => {
    const source = "group(main) using keys\ngroup(main)";
    const findings = checkDuplicateGroups(source);
    expect(findings[0]?.location?.column).toBeGreaterThan(0);
  });

  it("ignores group() appearing mid-line (e.g. inside a string value)", () => {
    const source = 'store(labels) "group(main)"\ngroup(main) using keys';
    expect(checkDuplicateGroups(source)).toEqual([]);
  });
});
