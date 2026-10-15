// Tests for parseKpjForm — the structural .kpj reader behind the
// spec 084 KPJ pair (criteria 1.10b / 2.7, ruling B: structural,
// no numeric pin). Specimens are modelled on real corpus files:
// sil_cameroon_qwerty (modern), chalchiteko (legacy, Options without
// a Version element), gff_amh_7 extra/old-source (legacy, no Options).

import { describe, expect, it } from "vitest";

import { parseKpjForm } from "./parseKpjForm.js";

const MODERN = `<?xml version="1.0" encoding="utf-8"?>
<KeymanDeveloperProject>
  <Options>
    <Version>2.0</Version>
    <CompilerWarningsAsErrors>True</CompilerWarningsAsErrors>
    <CheckFilenameConventions>True</CheckFilenameConventions>
    <SkipMetadataFiles>True</SkipMetadataFiles>
  </Options>
</KeymanDeveloperProject>
`;

const LEGACY_IMPLICIT = `<?xml version="1.0" encoding="utf-8"?>
<KeymanDeveloperProject>
  <Options>
    <BuildPath>$PROJECTPATH\\build</BuildPath>
    <CompilerWarningsAsErrors>True</CompilerWarningsAsErrors>
    <WarnDeprecatedCode>True</WarnDeprecatedCode>
    <ProjectType>keyboard</ProjectType>
  </Options>
  <Files>
    <File>
      <ID>id_7e4ef88dc842d394bc13f818742d3b95</ID>
      <Filename>chalchiteko.kmn</Filename>
      <Filepath>source\\chalchiteko.kmn</Filepath>
      <FileVersion>1.0</FileVersion>
      <FileType>.kmn</FileType>
    </File>
  </Files>
</KeymanDeveloperProject>
`;

const LEGACY_NO_OPTIONS = `<?xml version="1.0" encoding="utf-8"?>
<KeymanDeveloperProject><Modules/><Files><File><ID>id_X</ID><Filename>gff-amh-7.kmn</Filename><FileVersion></FileVersion><FileType>.kmn</FileType></File></Files></KeymanDeveloperProject>
`;

describe("parseKpjForm", () => {
  it("reads the modern form: Version marker present, value reported, no Files list", () => {
    const facts = parseKpjForm(MODERN);
    expect(facts.form).toBe("modern");
    expect(facts.versionElement).toBe("2.0");
    expect(facts.hasFilesList).toBe(false);
  });

  it("reads the legacy implicit form: Options without a Version element, Files-driven", () => {
    const facts = parseKpjForm(LEGACY_IMPLICIT);
    expect(facts.form).toBe("legacy");
    expect(facts.versionElement).toBeNull();
    expect(facts.hasFilesList).toBe(true);
  });

  it("does not mistake a per-file <FileVersion> for the project format marker", () => {
    // LEGACY_IMPLICIT carries <FileVersion>1.0</FileVersion> inside
    // <Files>; the marker is only <Options><Version>.
    expect(parseKpjForm(LEGACY_IMPLICIT).versionElement).toBeNull();
    expect(parseKpjForm(LEGACY_NO_OPTIONS).versionElement).toBeNull();
  });

  it("reads the pre-Options legacy form (no <Options> block at all)", () => {
    const facts = parseKpjForm(LEGACY_NO_OPTIONS);
    expect(facts.form).toBe("legacy");
    expect(facts.versionElement).toBeNull();
    expect(facts.hasFilesList).toBe(true);
  });

  it("trims whitespace inside the Version element", () => {
    const facts = parseKpjForm(
      "<KeymanDeveloperProject><Options><Version>  2.0\n</Version></Options></KeymanDeveloperProject>",
    );
    expect(facts.versionElement).toBe("2.0");
    expect(facts.form).toBe("modern");
  });

  it("empty input is the legacy form with no marker, never an invented one", () => {
    const facts = parseKpjForm("");
    expect(facts).toEqual({
      versionElement: null,
      hasFilesList: false,
      form: "legacy",
    });
  });
});
