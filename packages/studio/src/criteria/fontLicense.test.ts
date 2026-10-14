import { describe, it, expect } from "vitest";
import { ALL_CRITERIA } from "@keyboard-studio/contracts";

import {
  FONT_LICENSE_EMPTY_CODE,
  FONT_LICENSE_NOT_OPEN_CODE,
  licenseTextHints,
} from "./fontLicense.js";
import { resolveCriteria } from "./resolveCriteria.ts";
import type { CriteriaInput } from "./criteriaTypes.ts";

const FONT = "AndikaAfr-R.ttf";
const AT = "2026-10-14T00:00:00.000Z";

function input(over: Partial<CriteriaInput>): CriteriaInput {
  return {
    criteria: ALL_CRITERIA,
    mode: "authored",
    lintFindings: [],
    record: { attestations: {}, confirmations: {} },
    facts: {
      fontBundled: true,
      bundledFonts: [FONT],
      deprecated: true,
      partnerPackage: true,
    },
    ...over,
  };
}

function rowFor(result: ReturnType<typeof resolveCriteria>, code: string) {
  return result.rows.find((r) => r.criterion.lintRuleId === code);
}

describe("resolveFontLicenseRow via the resolver (9.1/9.2)", () => {
  it("fonts bundled + nothing attested → Needs human (authored), with the font editor offered", () => {
    const result = resolveCriteria(input({}));
    for (const code of [FONT_LICENSE_EMPTY_CODE, FONT_LICENSE_NOT_OPEN_CODE]) {
      const row = rowFor(result, code);
      expect(row?.status).toBe("needs-human");
      expect(row?.controls).toBe("font-attest");
      expect(row?.fontLicense?.bundledFonts).toEqual([FONT]);
      expect(row?.evidence().lines.join(" ")).toContain(FONT);
    }
  });

  it("foreign mode: Needs human too, never Not yet checkable, and no controls", () => {
    const result = resolveCriteria(input({ mode: "foreign" }));
    for (const code of [FONT_LICENSE_EMPTY_CODE, FONT_LICENSE_NOT_OPEN_CODE]) {
      const row = rowFor(result, code);
      expect(row?.status).toBe("needs-human");
      expect(row?.controls).toBeNull();
    }
  });

  it("a license asserted without the open confirmation: 9.1 Met, 9.2 still Needs human", () => {
    const result = resolveCriteria(
      input({
        record: {
          attestations: {},
          confirmations: {},
          fontLicenseAttestations: {
            [FONT]: { license: "OFL-1.1", openConfirmed: false, at: AT },
          },
        },
      }),
    );
    expect(rowFor(result, FONT_LICENSE_EMPTY_CODE)?.status).toBe("met");
    expect(rowFor(result, FONT_LICENSE_NOT_OPEN_CODE)?.status).toBe("needs-human");
  });

  it("all fonts attested + open confirmed → both Met, evidence names the attestation", () => {
    const result = resolveCriteria(
      input({
        record: {
          attestations: {},
          confirmations: {},
          fontLicenseAttestations: {
            [FONT]: { license: "OFL-1.1", openConfirmed: true, at: AT },
          },
        },
      }),
    );
    for (const code of [FONT_LICENSE_EMPTY_CODE, FONT_LICENSE_NOT_OPEN_CODE]) {
      const row = rowFor(result, code);
      expect(row?.status).toBe("met");
      expect(row?.evidence().kind).toBe("attested");
      expect(row?.evidence().lines.join(" ")).toContain("OFL-1.1");
    }
  });

  it("one of two fonts unattested → Needs human naming only the unattested one", () => {
    const result = resolveCriteria(
      input({
        facts: {
          fontBundled: true,
          bundledFonts: [FONT, "CharisSIL-R.ttf"],
          deprecated: true,
          partnerPackage: true,
        },
        record: {
          attestations: {},
          confirmations: {},
          fontLicenseAttestations: {
            [FONT]: { license: "OFL-1.1", openConfirmed: true, at: AT },
          },
        },
      }),
    );
    const row = rowFor(result, FONT_LICENSE_EMPTY_CODE);
    expect(row?.status).toBe("needs-human");
    expect(row?.evidence().lines.join(" ")).toContain("CharisSIL-R.ttf");
  });

  it("an empty license string does not count as attested for 9.1", () => {
    const result = resolveCriteria(
      input({
        record: {
          attestations: {},
          confirmations: {},
          fontLicenseAttestations: {
            [FONT]: { license: "  ", openConfirmed: true, at: AT },
          },
        },
      }),
    );
    expect(rowFor(result, FONT_LICENSE_EMPTY_CODE)?.status).toBe("needs-human");
  });

  it("no fonts bundled → Not applicable via the §9 predicate (existing behavior)", () => {
    const result = resolveCriteria(
      input({
        facts: {
          fontBundled: false,
          bundledFonts: [],
          deprecated: true,
          partnerPackage: true,
        },
      }),
    );
    expect(rowFor(result, FONT_LICENSE_EMPTY_CODE)?.status).toBe("not-applicable");
    expect(rowFor(result, FONT_LICENSE_NOT_OPEN_CODE)?.status).toBe("not-applicable");
  });

  it("LICENSE.md hints appear on 9.2 as supporting evidence but never decide it", () => {
    const withHint = resolveCriteria(
      input({ licenseTextHints: ["SIL Open Font License (OFL)"] }),
    );
    const row = rowFor(withHint, FONT_LICENSE_NOT_OPEN_CODE);
    // Still Needs human: the hint alone attests nothing.
    expect(row?.status).toBe("needs-human");
    expect(row?.evidence().lines.join(" ")).toContain("Supporting evidence only");
    // And 9.1 carries no hint line (hints are a 9.2 arm).
    const row91 = rowFor(withHint, FONT_LICENSE_EMPTY_CODE);
    expect(row91?.evidence().lines.join(" ")).not.toContain("Supporting evidence");
  });
});

describe("licenseTextHints", () => {
  it("detects the standard open-license mentions, deduplicated", () => {
    expect(
      licenseTextHints(
        "Licensed under the SIL Open Font License 1.1 (OFL). Some icons are CC BY 4.0 — Creative Commons.",
      ),
    ).toEqual(["SIL Open Font License (OFL)", "Creative Commons (CC)"]);
    expect(licenseTextHints("All rights reserved.")).toEqual([]);
    expect(licenseTextHints(undefined)).toEqual([]);
    expect(licenseTextHints("")).toEqual([]);
  });
});
