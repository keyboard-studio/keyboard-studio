import { describe, expect, it } from "vitest";
import { addOpenKpsFile } from "./patch.js";

const FILE = (eol: string, name: string, ext: string, description = ""): string =>
  ["    <File>", `      <Name>${name}</Name>`, `      <Description>${description}</Description>`, "      <CopyLocation>0</CopyLocation>", `      <FileType>${ext}</FileType>`, "    </File>"].join(eol) + eol;

function kps(eol: string, opts: { welcome?: string | null; files?: boolean; bom?: boolean } = {}): string {
  const welcome = opts.welcome === undefined ? null : opts.welcome;
  return (
    (opts.bom === true ? "﻿" : "") +
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      "<Package>",
      "  <Options>",
      "    <ReadMeFile>readme.htm</ReadMeFile>",
      "    <LicenseFile>..\\LICENSE.md</LicenseFile>",
      ...(welcome === null ? [] : [`    <WelcomeFile>${welcome}</WelcomeFile>`]),
      "    <FollowKeyboardVersion/>",
      "  </Options>",
      "  <Info>",
      '    <Name URL="">T</Name>',
      "  </Info>",
      ...(opts.files === false ? [] : ["  <Files>"]),
    ].join(eol) +
    (opts.files === false ? "" : eol + FILE(eol, "..\\build\\t.kmx", ".kmx") + "  </Files>" + eol) +
    ["</Package>", ""].join(eol)
  );
}

describe("addOpenKpsFile (spec 111 live descriptor write)", () => {
  for (const eol of ["\n", "\r\n"]) {
    const label = eol === "\n" ? "LF" : "CRLF";

    it(`${label}: appends a <File> in the descriptor's own shape after the last entry; nothing else changes`, () => {
      const before = kps(eol, { bom: true });
      const { text, unwritable } = addOpenKpsFile(before, { name: "readme.htm" });
      expect(unwritable).toEqual([]);
      const entry = FILE(eol, "readme.htm", ".htm", "File readme.htm");
      expect(text).toBe(before.replace(`  </Files>`, `${entry}  </Files>`));
      expect(text.startsWith("﻿")).toBe(true);
    });

    it(`${label}: a listed member (other case, other slash) leaves the text byte-identical`, () => {
      const once = addOpenKpsFile(kps(eol), { name: "welcome\\welcome.htm" }).text;
      expect(addOpenKpsFile(once, { name: "welcome\\welcome.htm" }).text).toBe(once);
      expect(addOpenKpsFile(once, { name: "Welcome/Welcome.htm" }).text).toBe(once);
    });

    it(`${label}: welcome declares <WelcomeFile> after <LicenseFile>, once`, () => {
      const before = kps(eol);
      const { text } = addOpenKpsFile(before, { name: "welcome\\welcome.htm", declareAs: "WelcomeFile" });
      expect(text).toContain(`<LicenseFile>..\\LICENSE.md</LicenseFile>${eol}    <WelcomeFile>welcome\\welcome.htm</WelcomeFile>${eol}    <FollowKeyboardVersion/>`);
      expect(addOpenKpsFile(text, { name: "welcome\\welcome.htm", declareAs: "WelcomeFile" }).text).toBe(text);
    });
  }

  it("a blank <WelcomeFile> is filled; one naming another file is left and reported", () => {
    const blank = kps("\n", { welcome: "" });
    expect(addOpenKpsFile(blank, { name: "welcome.htm", declareAs: "WelcomeFile" }).text).toContain("<WelcomeFile>welcome.htm</WelcomeFile>");
    const other = kps("\n", { welcome: "other.htm" });
    const r = addOpenKpsFile(other, { name: "welcome.htm", declareAs: "WelcomeFile" });
    expect(r.text).toContain("<WelcomeFile>other.htm</WelcomeFile>");
    expect(r.text).toContain("<Name>welcome.htm</Name>");
    expect(r.unwritable).toEqual(["<WelcomeFile> already names other.htm"]);
  });

  it("ReadMeFile: filled when absent or blank, placed before <LicenseFile>, never overriding another file", () => {
    const before = kps("\n");
    const added = addOpenKpsFile(before, { name: "readme.htm", declareAs: "ReadMeFile" }).text;
    expect(added).toContain("<Options>\n    <ReadMeFile>readme.htm</ReadMeFile>\n    <LicenseFile>");
    expect(addOpenKpsFile(added, { name: "readme.htm", declareAs: "ReadMeFile" }).text).toBe(added);
    const other = "<Package>\n  <Options>\n    <ReadMeFile>x.htm</ReadMeFile>\n  </Options>\n  <Files/>\n</Package>\n";
    const r = addOpenKpsFile(other, { name: "readme.htm", declareAs: "ReadMeFile" });
    expect(r.unwritable).toEqual(["<ReadMeFile> already names x.htm"]);
    expect(r.text).toContain("<ReadMeFile>x.htm</ReadMeFile>");
  });

  it("<WelcomeFile> goes before <MSIFileName> when no other anchor exists, else at the end of <Options>", () => {
    const msi = "<Package>\r\n  <Options>\r\n    <ExecuteProgram></ExecuteProgram>\r\n    <MSIFileName></MSIFileName>\r\n  </Options>\r\n  <Files/>\r\n</Package>\r\n";
    expect(addOpenKpsFile(msi, { name: "welcome.htm", declareAs: "WelcomeFile" }).text).toContain(
      "<ExecuteProgram></ExecuteProgram>\r\n    <WelcomeFile>welcome.htm</WelcomeFile>\r\n    <MSIFileName>",
    );
    const bare = "<Package>\n  <Options>\n    <FollowKeyboardVersion/>\n  </Options>\n  <Files/>\n</Package>\n";
    expect(addOpenKpsFile(bare, { name: "welcome.htm", declareAs: "WelcomeFile" }).text).toContain(
      "<FollowKeyboardVersion/>\n    <WelcomeFile>welcome.htm</WelcomeFile>\n  </Options>",
    );
  });

  it("no <Files> block: nothing is invented", () => {
    const before = kps("\n", { files: false });
    const r = addOpenKpsFile(before, { name: "readme.htm" });
    expect(r.text).toBe(before);
    expect(r.unwritable).toEqual(["no <Files> block"]);
  });

  it("an empty self-closing <Files/> is expanded", () => {
    const before = "<Package>\n  <Files/>\n</Package>\n";
    const r = addOpenKpsFile(before, { name: "..\\README.md" });
    expect(r.text).toContain("<Name>..\\README.md</Name>");
    expect(r.text).toContain("<FileType>.md</FileType>");
    expect(r.text).not.toContain("<Files/>");
  });

  it("welcome with no <Options> block reports it and still lists the file", () => {
    const r = addOpenKpsFile("<Package>\n  <Files>\n  </Files>\n</Package>\n", { name: "welcome.htm", declareAs: "WelcomeFile" });
    expect(r.unwritable).toEqual(["no <Options> block"]);
    expect(r.text).toContain("<Name>welcome.htm</Name>");
  });
});
