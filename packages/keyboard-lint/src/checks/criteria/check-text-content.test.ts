// Tests for the Group A2 text-content twins (Batch 4).

import { describe, expect, it } from "vitest";
import {
  checkAuthorInKmn,
  checkCopyrightAbsent,
  checkCopyrightInDocs,
  checkCopyrightSyntax,
  checkCopyrightYearEmbedded,
  checkPhpClosingTags,
  checkPhpHeaderBad,
  checkPhpStyleOutside,
  checkReadmeHelpLinkAbsent,
  checkReadmeKeymanLinkAbsent,
  checkTextContent,
  checkVersionInDocs,
  checkWelcomeLangMismatch,
  type TextContentFacts,
} from "./check-text-content.js";

const ID = "gff_amharic";

const GOOD: TextContentFacts = {
  keyboardId: ID,
  licenseMd: "The MIT License (MIT)\n\nCopyright (c) 1997-2025 Ge'ez Frontier Foundation\n",
  kmn: "store(&Name) 'GFF Amharic'\nstore(&Version) '1.0'\n",
  kps: '<Info><Copyright>© Ge\'ez Frontier Foundation</Copyright></Info>',
  readmeMd: "# GFF Amharic\n\nSee https://keyman.com/keyboards/gff_amharic and http://help.keyman.com/keyboard/gff_amharic.\n",
  readmeHtm: "<html><body><p>Readme</p></body></html>",
  welcomeHtm: '<html lang="am"><body><p>Welcome</p></body></html>',
  php: "<?php\n/*\n  Name: Keyboard_gff_amharic\n*/\n$pagetitle = 'x';\n?>\n<p>Help</p>\n",
  phpPath: "source/help/gff_amharic.php",
  primaryBcp47: "am",
};

describe("text-content twins", () => {
  it("passes a clean keyboard", () => {
    expect(checkTextContent(GOOD)).toEqual([]);
  });

  it("4.1b flags a LICENSE.md without a copyright year", () => {
    const f = checkCopyrightAbsent({ ...GOOD, licenseMd: "The MIT License\n" });
    expect(f[0]!.code).toBe("KM_LINT_COPYRIGHT_ABSENT");
  });

  it("4.1b passes on an absent LICENSE.md (assembly contextMissing)", () => {
    expect(checkCopyrightAbsent({ ...GOOD, licenseMd: undefined })).toEqual([]);
  });

  it("4.5b flags a malformed copyright line", () => {
    const f = checkCopyrightSyntax({
      ...GOOD,
      licenseMd: "Copyright 2025 Someone\n",
    });
    expect(f[0]!.code).toBe("KM_LINT_COPYRIGHT_SYNTAX");
  });

  it("4.5b accepts (c) and year ranges", () => {
    expect(
      checkCopyrightSyntax({
        ...GOOD,
        licenseMd: "Copyright (c) 1997-2025 Holder\n",
      }),
    ).toEqual([]);
  });

  it("4.6b flags a year in the .kmn copyright", () => {
    const f = checkCopyrightYearEmbedded({
      ...GOOD,
      kmn: "store(&Copyright) 'Copyright 2025 X'\n",
    });
    expect(f[0]!.code).toBe("KM_LINT_COPYRIGHT_YEAR_EMBEDDED");
  });

  it("4.6b flags a year in the .kps Copyright element", () => {
    const f = checkCopyrightYearEmbedded({
      ...GOOD,
      kps: "<Info><Copyright>© 2025 Someone</Copyright></Info>",
    });
    expect(f[0]!.code).toBe("KM_LINT_COPYRIGHT_YEAR_EMBEDDED");
  });

  it("5.2b flags a version in the docs", () => {
    const f = checkVersionInDocs({
      ...GOOD,
      readmeMd: "Version 2.1 is out.\n",
    });
    expect(f[0]!.code).toBe("KM_LINT_VERSION_IN_DOCS");
  });

  it("5.3b flags a copyright in readme.htm", () => {
    const f = checkCopyrightInDocs({
      ...GOOD,
      readmeHtm: "<p>Copyright 2025 Someone</p>",
    });
    expect(f[0]!.code).toBe("KM_LINT_COPYRIGHT_IN_DOCS");
  });

  it("5.5b flags a README.md without the keyman.com link", () => {
    const f = checkReadmeKeymanLinkAbsent({
      ...GOOD,
      readmeMd: "# Title\n\nNo links here.\n",
    });
    expect(f[0]!.code).toBe("KM_LINT_README_KEYMAN_LINK_ABSENT");
  });

  it("5.6b flags a README.md without the help link", () => {
    const f = checkReadmeHelpLinkAbsent({
      ...GOOD,
      readmeMd: "See https://keyman.com/keyboards/gff_amharic.\n",
    });
    expect(f[0]!.code).toBe("KM_LINT_README_HELP_LINK_ABSENT");
  });

  it("6.6b flags a welcome.htm lang mismatch", () => {
    const f = checkWelcomeLangMismatch({
      ...GOOD,
      welcomeHtm: '<html lang="en"><body></body></html>',
    });
    expect(f[0]!.code).toBe("KM_LINT_WELCOME_LANG_MISMATCH");
  });

  it("6.6b flags a missing lang attribute", () => {
    const f = checkWelcomeLangMismatch({
      ...GOOD,
      welcomeHtm: "<html><body></body></html>",
    });
    expect(f[0]!.code).toBe("KM_LINT_WELCOME_LANG_MISMATCH");
    expect(f[0]!.message).toContain("no <html lang>");
  });

  it("7.11b flags store(&Author) in the .kmn", () => {
    const f = checkAuthorInKmn({
      ...GOOD,
      kmn: "store(&Author) 'Someone'\n",
    });
    expect(f[0]!.code).toBe("KM_LINT_AUTHOR_IN_KMN");
  });

  it("11.1b flags an absent .php", () => {
    const f = checkPhpHeaderBad({ ...GOOD, php: undefined, phpPath: undefined });
    expect(f[0]!.code).toBe("KM_LINT_PHP_HEADER_BAD");
    expect(f[0]!.message).toContain("No <name>.php");
  });

  it("11.1b flags a .php without the header block", () => {
    const f = checkPhpHeaderBad({ ...GOOD, php: "<?php\necho 'hi';\n?>\n" });
    expect(f[0]!.code).toBe("KM_LINT_PHP_HEADER_BAD");
  });

  it("11.3b flags a <style> tag outside the PHP block", () => {
    const f = checkPhpStyleOutside({
      ...GOOD,
      php: "<?php\n/*\n  Name: x\n*/\n?>\n<style>p{}</style>\n",
    });
    expect(f[0]!.code).toBe("KM_LINT_PHP_STYLE_OUTSIDE");
  });

  it("11.4b flags closing body/html tags", () => {
    const f = checkPhpClosingTags({
      ...GOOD,
      php: "<?php\n/*\n  Name: x\n*/\n?>\n<p>Hi</p></body></html>\n",
    });
    expect(f[0]!.code).toBe("KM_LINT_PHP_CLOSING_TAGS");
  });
});
