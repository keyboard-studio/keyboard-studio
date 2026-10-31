// Tests for the Group A2 .kps-metadata twins
// (10.1b / 10.2b / 10.7b / 10.8b / 10.9b).

import { describe, expect, it } from "vitest";
import {
  checkKpsDescriptionEmpty,
  checkKpsDetailsUnselected,
  checkKpsFollowVersionUnset,
  checkKpsFontUnselected,
  checkKpsLanguagesUnselected,
  checkKpsMetadata,
  type KpsMetadataFacts,
} from "./check-kps-metadata.js";

const KPS = "source/gff_amharic.kps";

const GOOD: KpsMetadataFacts = {
  kpsPath: KPS,
  fontSelected: "..\\..\\..\\shared\\fonts\\sil\\abyssinica\\AbyssinicaSIL-Regular.ttf",
  fontsInFiles: true,
  languages: ["am"],
  detailsReadme: "..\\..\\..\\shared\\gff\\readme.htm",
  detailsWelcome: "welcome\\welcome.htm",
  detailsLicense: "..\\LICENSE.md",
  followKeyboardVersion: true,
  description: "An Amharic mnemonic input method.",
};

describe("kps-metadata twins", () => {
  it("passes a complete .kps", () => {
    expect(checkKpsMetadata(GOOD).findings).toEqual([]);
  });

  it("10.1b flags an unselected font when fonts are in the files", () => {
    const { findings } = checkKpsFontUnselected({ ...GOOD, fontSelected: "" });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_KPS_FONT_UNSELECTED");
  });

  it("10.1b passes when no fonts are in the files", () => {
    expect(
      checkKpsFontUnselected({ ...GOOD, fontSelected: "", fontsInFiles: false }).findings,
    ).toEqual([]);
  });

  it("10.2b flags missing language tags", () => {
    const { findings } = checkKpsLanguagesUnselected({ ...GOOD, languages: [] });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_KPS_LANGUAGES_UNSELECTED");
  });

  it("10.7b names each unselected details file", () => {
    const { findings } = checkKpsDetailsUnselected({
      ...GOOD,
      detailsWelcome: "",
      detailsLicense: "",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_KPS_DETAILS_UNSELECTED");
    expect(findings[0]!.message).toContain("welcome.htm");
    expect(findings[0]!.message).toContain("LICENSE.md");
    expect(findings[0]!.message).not.toContain("readme.htm");
  });

  it("10.8b flags an unset follow-version", () => {
    const { findings } = checkKpsFollowVersionUnset({
      ...GOOD,
      followKeyboardVersion: false,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_KPS_FOLLOW_VERSION_UNSET");
  });

  it("10.9b flags an empty description", () => {
    const { findings } = checkKpsDescriptionEmpty({ ...GOOD, description: "  " });
    // Whitespace-only is not empty at the check level (the parser trims);
    // an actually-empty description fails.
    expect(findings).toEqual([]);
    const { findings: empty } = checkKpsDescriptionEmpty({ ...GOOD, description: "" });
    expect(empty).toHaveLength(1);
    expect(empty[0]!.code).toBe("KM_LINT_KPS_DESCRIPTION_EMPTY");
  });

  it("reports every violation code through the aggregate", () => {
    const facts: KpsMetadataFacts = {
      kpsPath: KPS,
      fontSelected: "",
      fontsInFiles: true,
      languages: [],
      detailsReadme: "",
      detailsWelcome: "",
      detailsLicense: "",
      followKeyboardVersion: false,
      description: "",
    };
    expect(checkKpsMetadata(facts).findings.map((f) => f.code).sort()).toEqual(
      [
        "KM_LINT_KPS_FONT_UNSELECTED",
        "KM_LINT_KPS_LANGUAGES_UNSELECTED",
        "KM_LINT_KPS_DETAILS_UNSELECTED",
        "KM_LINT_KPS_FOLLOW_VERSION_UNSET",
        "KM_LINT_KPS_DESCRIPTION_EMPTY",
      ].sort(),
    );
  });
});
