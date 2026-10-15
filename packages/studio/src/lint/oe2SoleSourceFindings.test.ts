// buildOe2SoleSourceFindings — the studio-side finding builder for the
// sole-source oe2 warning. Called bare (no i18n instance) the descriptors
// resolve to their English source text, per the resolveMessage contract.

import { describe, it, expect } from "vitest";
import {
  buildOe2SoleSourceFindings,
  OE2_SOLE_SOURCE_LINT_CODE,
} from "./oe2SoleSourceFindings";

describe("buildOe2SoleSourceFindings", () => {
  it("returns no findings for an empty glyph list", () => {
    expect(buildOe2SoleSourceFindings([])).toEqual([]);
  });

  it("builds one warning Layer C finding per glyph, naming the glyph and its codepoint", () => {
    const findings = buildOe2SoleSourceFindings(["§", "±"]);
    expect(findings).toHaveLength(2);
    for (const finding of findings) {
      expect(finding.code).toBe("KM_LINT_OE2_SOLE_SOURCE_GLYPH");
      expect(finding.code).toBe(OE2_SOLE_SOURCE_LINT_CODE);
      expect(finding.severity).toBe("warning");
      expect(finding.layer).toBe("C");
      expect(finding.hint).toContain("US do not have this key");
      expect(finding.hint).toContain("deadkey sequence");
    }
    expect(findings[0]!.message).toContain('"§"');
    expect(findings[0]!.message).toContain("U+00A7");
    expect(findings[0]!.message).toContain("key next to the left Shift key");
    expect(findings[1]!.message).toContain('"±"');
    expect(findings[1]!.message).toContain("U+00B1");
  });
});
