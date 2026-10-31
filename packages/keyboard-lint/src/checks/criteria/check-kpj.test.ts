import { describe, it, expect } from "vitest";
import {
  KPJ_CURRENT_FORMAT_VERSION,
  checkKpjFormatOutdated,
  checkKpjVersionBumped,
  compareKpjVersions,
  parseKpjFormatVersion,
} from "./check-kpj.js";

const KPJ_PATH = "demo.kpj";

function kpj(versionElement: string): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<KeymanDeveloperProject>",
    "  <Options>",
    versionElement,
    "    <CompilerWarningsAsErrors>True</CompilerWarningsAsErrors>",
    "  </Options>",
    "</KeymanDeveloperProject>",
  ].join("\n");
}

const CURRENT = kpj(`    <Version>${KPJ_CURRENT_FORMAT_VERSION}</Version>`);
const OLDER = kpj("    <Version>1.0</Version>");
const BUMPED = kpj("    <Version>3.0</Version>");
// The pre-versioned project shape (the corpus's pid_piaroa.kpj):
// an <Options> block with no <Version> element at all.
const NO_VERSION = kpj("");

describe("parseKpjFormatVersion", () => {
  it("reads the <Version> element inside <Options>", () => {
    expect(parseKpjFormatVersion(CURRENT)).toBe("2.0");
    expect(parseKpjFormatVersion(OLDER)).toBe("1.0");
  });

  it("never mistakes <FileVersion> for the format version", () => {
    const withFiles = CURRENT.replace(
      "</KeymanDeveloperProject>",
      "  <Files><File><FileVersion>9.9</FileVersion></File></Files>\n</KeymanDeveloperProject>",
    );
    expect(parseKpjFormatVersion(withFiles)).toBe("2.0");
    expect(parseKpjFormatVersion(NO_VERSION.replace(
      "</KeymanDeveloperProject>",
      "  <Files><File><FileVersion>9.9</FileVersion></File></Files>\n</KeymanDeveloperProject>",
    ))).toBeUndefined();
  });

  it("returns undefined when the file carries no format version", () => {
    expect(parseKpjFormatVersion(NO_VERSION)).toBeUndefined();
    expect(parseKpjFormatVersion(kpj("    <Version>  </Version>"))).toBeUndefined();
  });
});

describe("compareKpjVersions", () => {
  it("orders numerically by component, missing components as 0", () => {
    expect(compareKpjVersions("1.0", "2.0")).toBeLessThan(0);
    expect(compareKpjVersions("2.0", "2.0")).toBe(0);
    expect(compareKpjVersions("2", "2.0")).toBe(0);
    expect(compareKpjVersions("2.0.1", "2.0")).toBeGreaterThan(0);
    expect(compareKpjVersions("3.0", "2.0")).toBeGreaterThan(0);
    // The catalog's old defective pin would read as bumped, not current.
    expect(compareKpjVersions("10.0", "2.0")).toBeGreaterThan(0);
  });
});

describe("checkKpjFormatOutdated (1.10b)", () => {
  it("flags an older format version, naming found vs current", () => {
    const { findings } = checkKpjFormatOutdated({ kpjText: OLDER, kpjPath: KPJ_PATH });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_KPJ_FORMAT_OUTDATED");
    expect(findings[0]!.message).toContain('"1.0"');
    expect(findings[0]!.message).toContain('"2.0"');
    expect(findings[0]!.location?.file).toBe(KPJ_PATH);
  });

  it("flags a present .kpj with no <Version> element as predating the format", () => {
    const { findings } = checkKpjFormatOutdated({ kpjText: NO_VERSION, kpjPath: KPJ_PATH });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_KPJ_FORMAT_OUTDATED");
    expect(findings[0]!.message).toContain("no <Options><Version> element");
  });

  it("passes the current format and a newer one", () => {
    expect(checkKpjFormatOutdated({ kpjText: CURRENT, kpjPath: KPJ_PATH }).findings).toEqual([]);
    expect(checkKpjFormatOutdated({ kpjText: BUMPED, kpjPath: KPJ_PATH }).findings).toEqual([]);
  });

  it("is silent without facts (the absent .kpj is the assembly's named missing input)", () => {
    expect(checkKpjFormatOutdated({}).findings).toEqual([]);
    expect(checkKpjFormatOutdated({ kpjPath: KPJ_PATH }).findings).toEqual([]);
    expect(checkKpjFormatOutdated({ kpjText: OLDER }).findings).toEqual([]);
  });
});

describe("checkKpjVersionBumped (2.7)", () => {
  it("flags a format version newer than the current format", () => {
    const { findings } = checkKpjVersionBumped({ kpjText: BUMPED, kpjPath: KPJ_PATH });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_KPJ_VERSION_BUMPED");
    expect(findings[0]!.message).toContain('"3.0"');
  });

  it("passes the current format, an older one, and a version-less file", () => {
    expect(checkKpjVersionBumped({ kpjText: CURRENT, kpjPath: KPJ_PATH }).findings).toEqual([]);
    expect(checkKpjVersionBumped({ kpjText: OLDER, kpjPath: KPJ_PATH }).findings).toEqual([]);
    expect(checkKpjVersionBumped({ kpjText: NO_VERSION, kpjPath: KPJ_PATH }).findings).toEqual([]);
  });

  it("is silent without facts", () => {
    expect(checkKpjVersionBumped({}).findings).toEqual([]);
  });
});

describe("the pair together", () => {
  it("pins equality: exactly one fires per direction, neither at 2.0", () => {
    const run = (text: string) => [
      ...checkKpjFormatOutdated({ kpjText: text, kpjPath: KPJ_PATH }).findings,
      ...checkKpjVersionBumped({ kpjText: text, kpjPath: KPJ_PATH }).findings,
    ].map((f) => f.code);
    expect(run(OLDER)).toEqual(["KM_LINT_KPJ_FORMAT_OUTDATED"]);
    expect(run(BUMPED)).toEqual(["KM_LINT_KPJ_VERSION_BUMPED"]);
    expect(run(CURRENT)).toEqual([]);
    expect(run(NO_VERSION)).toEqual(["KM_LINT_KPJ_FORMAT_OUTDATED"]);
  });
});
