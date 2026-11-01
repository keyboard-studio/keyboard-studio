// Tests for the Group A2 .kps-listing twins
// (8.1b–8.6b / 8.8b–8.11b).

import { describe, expect, it } from "vitest";
import {
  checkKpsHelpListed,
  checkKpsJsAbsent,
  checkKpsJsonListed,
  checkKpsKmxAbsent,
  checkKpsLicenseAbsent,
  checkKpsListing,
  checkKpsPhpListed,
  checkKpsReadmeAbsent,
  checkKpsSourceListed,
  checkKpsWelcomeAbsent,
  type KpsListingFacts,
} from "./check-kps-listing.js";

const KPS = "source/gff_amharic.kps";

// A realistic .kps <File> list: backslash separators, ..\-relative refs.
const GOOD: KpsListingFacts = {
  fileNames: [
    "..\\build\\gff_amharic.kmx",
    "..\\build\\gff_amharic.kvk",
    "..\\build\\gff_amharic.js",
    "..\\LICENSE.md",
    "..\\..\\..\\shared\\gff\\readme.htm",
    "welcome\\welcome.htm",
    "..\\..\\..\\shared\\gff\\sideimage.bmp",
    "..\\..\\..\\shared\\fonts\\sil\\abyssinica\\AbyssinicaSIL-Regular.ttf",
  ],
  hasTouchLayout: true,
  kpsPath: KPS,
};

function codes(facts: KpsListingFacts): string[] {
  return checkKpsListing(facts).findings.map((f) => f.code);
}

describe("kps-listing twins", () => {
  it("passes a complete .kps listing", () => {
    expect(checkKpsListing(GOOD).findings).toEqual([]);
  });

  it("passes without .js when there is no touch layout", () => {
    const noJs: KpsListingFacts = {
      ...GOOD,
      hasTouchLayout: false,
      fileNames: GOOD.fileNames.filter((n) => !n.endsWith(".js")),
    };
    expect(checkKpsJsAbsent(noJs).findings).toEqual([]);
  });

  it("8.1b flags a missing .kmx", () => {
    const facts: KpsListingFacts = {
      ...GOOD,
      fileNames: GOOD.fileNames.filter((n) => !n.endsWith(".kmx")),
    };
    const { findings } = checkKpsKmxAbsent(facts);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_KPS_KMX_ABSENT");
    expect(findings[0]!.location.file).toBe(KPS);
  });

  it("8.3b flags a missing .js when a touch layout exists", () => {
    const facts: KpsListingFacts = {
      ...GOOD,
      fileNames: GOOD.fileNames.filter((n) => !n.endsWith(".js")),
    };
    expect(checkKpsJsAbsent(facts).findings[0]!.code).toBe("KM_LINT_KPS_JS_ABSENT");
  });

  it("8.3b is moot without a touch layout, naming why", () => {
    const facts: KpsListingFacts = { ...GOOD, hasTouchLayout: false };
    const { findings, verified } = checkKpsJsAbsent(facts);
    expect(findings).toEqual([]);
    expect(verified).toEqual(["No touch layout; no .js required."]);
  });

  it("8.4b/8.5b flag missing LICENSE.md / readme.htm", () => {
    const facts: KpsListingFacts = {
      ...GOOD,
      fileNames: GOOD.fileNames.filter(
        (n) => !/license\.md$/i.test(n) && !/readme\.htm$/i.test(n),
      ),
    };
    expect(checkKpsLicenseAbsent(facts).findings[0]!.code).toBe(
      "KM_LINT_KPS_LICENSE_ABSENT",
    );
    expect(checkKpsReadmeAbsent(facts).findings[0]!.code).toBe(
      "KM_LINT_KPS_README_ABSENT",
    );
  });

  it("8.6b flags missing welcome.htm and missing graphics", () => {
    const facts: KpsListingFacts = {
      ...GOOD,
      fileNames: GOOD.fileNames.filter(
        (n) => !/welcome\.htm$/i.test(n) && !/\.bmp$/i.test(n),
      ),
    };
    const { findings } = checkKpsWelcomeAbsent(facts);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_KPS_WELCOME_ABSENT");
    expect(findings[0]!.message).toContain("welcome.htm");
    expect(findings[0]!.message).toContain("graphics");
  });

  it("8.8b flags a listed .php", () => {
    const facts: KpsListingFacts = {
      ...GOOD,
      fileNames: [...GOOD.fileNames, "help\\gff_amharic.php"],
    };
    expect(checkKpsPhpListed(facts).findings[0]!.code).toBe("KM_LINT_KPS_PHP_LISTED");
  });

  it("8.9b flags listed help/ files", () => {
    const facts: KpsListingFacts = {
      ...GOOD,
      fileNames: [...GOOD.fileNames, "help\\index.html"],
    };
    expect(checkKpsHelpListed(facts).findings[0]!.code).toBe("KM_LINT_KPS_HELP_LISTED");
  });

  it("8.9b does not flag welcome/ files", () => {
    expect(checkKpsHelpListed(GOOD).findings).toEqual([]);
  });

  it("8.10b flags listed uncompiled sources", () => {
    for (const ext of [".kmn", ".kvks", ".keyman-touch-layout", ".kps"]) {
      const facts: KpsListingFacts = {
        ...GOOD,
        fileNames: [...GOOD.fileNames, `source\\gff_amharic${ext}`],
      };
      expect(checkKpsSourceListed(facts).findings[0]!.code).toBe(
        "KM_LINT_KPS_SOURCE_LISTED",
      );
    }
  });

  it("8.11b flags a listed .json display map", () => {
    const facts: KpsListingFacts = {
      ...GOOD,
      fileNames: [...GOOD.fileNames, "fonts\\displaymap.json"],
    };
    expect(checkKpsJsonListed(facts).findings[0]!.code).toBe("KM_LINT_KPS_JSON_LISTED");
  });

  it("reports every violation code through the aggregate", () => {
    const facts: KpsListingFacts = {
      fileNames: ["help\\x.php", "src\\y.kmn", "z.json"],
      hasTouchLayout: true,
      kpsPath: KPS,
    };
    expect(codes(facts).sort()).toEqual(
      [
        "KM_LINT_KPS_KMX_ABSENT",
        "KM_LINT_KPS_KVK_ABSENT",
        "KM_LINT_KPS_JS_ABSENT",
        "KM_LINT_KPS_LICENSE_ABSENT",
        "KM_LINT_KPS_README_ABSENT",
        "KM_LINT_KPS_WELCOME_ABSENT",
        "KM_LINT_KPS_PHP_LISTED",
        "KM_LINT_KPS_HELP_LISTED",
        "KM_LINT_KPS_SOURCE_LISTED",
        "KM_LINT_KPS_JSON_LISTED",
      ].sort(),
    );
  });
});

describe("8.6b graphics requirement", () => {
  const noImages: KpsListingFacts = {
    ...GOOD,
    fileNames: GOOD.fileNames.filter((n) => !/\.bmp$/i.test(n)),
  };

  it("does not require graphics when the welcome page references no images", () => {
    expect(
      checkKpsWelcomeAbsent({ ...noImages, welcomeHasImages: false }).findings,
    ).toEqual([]);
  });

  it("requires graphics when the welcome page references images", () => {
    const { findings } = checkKpsWelcomeAbsent({
      ...noImages,
      welcomeHasImages: true,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("graphics");
  });
});
