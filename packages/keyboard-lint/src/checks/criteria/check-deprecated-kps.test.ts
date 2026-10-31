import { describe, it, expect } from "vitest";
import {
  checkDeprecatedKpsLinkage,
  deprecatedRelatedPackageIds,
} from "./check-deprecated-kps.js";

const KPS_PATH = "source/demo.kps";

const KPS_WITH_DEPRECATES = [
  "<Package>",
  "  <RelatedPackages>",
  '    <RelatedPackage ID="us_int" Relationship="deprecates" />',
  '    <RelatedPackage ID="us" Relationship="deprecates" />',
  "  </RelatedPackages>",
  "</Package>",
].join("\n");

const KPS_WITHOUT = ["<Package>", "  <Files></Files>", "</Package>"].join("\n");

describe("deprecatedRelatedPackageIds", () => {
  it("extracts IDs whose Relationship is deprecates, whatever the attribute order", () => {
    expect(deprecatedRelatedPackageIds(KPS_WITH_DEPRECATES)).toEqual([
      "us_int",
      "us",
    ]);
    const reordered =
      '<RelatedPackage Relationship="deprecates" ID="legacy_one" />';
    expect(deprecatedRelatedPackageIds(reordered)).toEqual(["legacy_one"]);
  });

  it("ignores RelatedPackage entries with other relationships", () => {
    const kps = '<RelatedPackage ID="other" Relationship="related" />';
    expect(deprecatedRelatedPackageIds(kps)).toEqual([]);
  });
});

describe("checkDeprecatedKpsLinkage (15.3)", () => {
  it("passes when the .kps lists a legacy package as deprecated", () => {
    expect(
      checkDeprecatedKpsLinkage(KPS_WITH_DEPRECATES, true, KPS_PATH).findings,
    ).toEqual([]);
  });

  it("fires when a deprecation is in play but no linkage is listed", () => {
    const { findings } = checkDeprecatedKpsLinkage(KPS_WITHOUT, true, KPS_PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_DEPRECATED_KPS_LINKAGE_MISSING");
  });

  it("fires when a deprecation is in play and there is no .kps at all", () => {
    expect(checkDeprecatedKpsLinkage(undefined, true, KPS_PATH).findings).toHaveLength(
      1,
    );
  });

  it("stays silent when no deprecation is in play (§15 is Not applicable there)", () => {
    expect(checkDeprecatedKpsLinkage(KPS_WITHOUT, false, KPS_PATH).findings).toEqual([]);
    expect(checkDeprecatedKpsLinkage(undefined, false, KPS_PATH).findings).toEqual([]);
  });
});
