import { describe, it, expect } from "vitest";
import {
  checkNumericRegionTag,
  regionSubtagOf,
  tagUsesNumericRegion,
} from "./check-bcp47.js";

describe("regionSubtagOf", () => {
  it("reads alpha-2 and 3-digit regions, skipping a script subtag", () => {
    expect(regionSubtagOf("ewo")).toBeUndefined();
    expect(regionSubtagOf("ewo-CM")).toBe("CM");
    expect(regionSubtagOf("es-419")).toBe("419");
    expect(regionSubtagOf("sr-Latn-RS")).toBe("RS");
    expect(regionSubtagOf("zh-Hans-001")).toBe("001");
  });

  it("does not mistake variants or extensions for a region", () => {
    expect(regionSubtagOf("de-CH-1901")).toBe("CH");
    expect(regionSubtagOf("sl-rozaj-biske")).toBeUndefined();
    expect(regionSubtagOf("en-US-u-co-emoji")).toBe("US");
  });
});

describe("checkNumericRegionTag (10.6)", () => {
  it("flags a 3-digit region subtag in either tag source", () => {
    expect(tagUsesNumericRegion("es-419")).toBe(true);
    const { findings } = checkNumericRegionTag(["ewo-CM", "es-419"], "demo");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_KPS_NUMERIC_REGION_TAG");
    expect(findings[0]!.message).toContain("es-419");
    expect(findings[0]!.message).not.toContain("ewo-CM");
  });

  it("passes alpha-2 regions and regionless tags", () => {
    expect(checkNumericRegionTag(["ewo-CM", "fr", "en-US"], "demo").findings).toEqual([]);
  });

  it("region 001 is a numeric region too (12.4 flags it separately)", () => {
    const { findings } = checkNumericRegionTag(["und-001"], "demo");
    expect(findings).toHaveLength(1);
  });
});
