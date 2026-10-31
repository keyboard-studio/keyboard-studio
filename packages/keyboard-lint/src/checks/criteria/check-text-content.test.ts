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
    expect(checkTextContent(GOOD).findings).toEqual([]);
  });

  it("4.1b flags a LICENSE.md without a copyright year", () => {
    const { findings: f } = checkCopyrightAbsent({ ...GOOD, licenseMd: "The MIT License\n" });
    expect(f[0]!.code).toBe("KM_LINT_COPYRIGHT_ABSENT");
  });

  it("4.1b passes on an absent LICENSE.md (assembly contextMissing)", () => {
    expect(checkCopyrightAbsent({ ...GOOD, licenseMd: undefined }).findings).toEqual([]);
  });

  it("4.5b flags a malformed copyright line", () => {
    const { findings: f } = checkCopyrightSyntax({
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
      }).findings,
    ).toEqual([]);
  });

  it("4.6b flags a year in the .kmn copyright", () => {
    const { findings: f } = checkCopyrightYearEmbedded({
      ...GOOD,
      kmn: "store(&Copyright) 'Copyright 2025 X'\n",
    });
    expect(f[0]!.code).toBe("KM_LINT_COPYRIGHT_YEAR_EMBEDDED");
  });

  it("4.6b flags a year in the .kps Copyright element", () => {
    const { findings: f } = checkCopyrightYearEmbedded({
      ...GOOD,
      kps: "<Info><Copyright>© 2025 Someone</Copyright></Info>",
    });
    expect(f[0]!.code).toBe("KM_LINT_COPYRIGHT_YEAR_EMBEDDED");
  });

  it("5.2b flags a version in the docs", () => {
    const { findings: f } = checkVersionInDocs({
      ...GOOD,
      readmeMd: "Version 2.1 is out.\n",
    });
    expect(f[0]!.code).toBe("KM_LINT_VERSION_IN_DOCS");
  });

  it("5.3b flags a copyright in readme.htm", () => {
    const { findings: f } = checkCopyrightInDocs({
      ...GOOD,
      readmeHtm: "<p>Copyright 2025 Someone</p>",
    });
    expect(f[0]!.code).toBe("KM_LINT_COPYRIGHT_IN_DOCS");
  });

  it("5.5b flags a README.md without the keyman.com link", () => {
    const { findings: f } = checkReadmeKeymanLinkAbsent({
      ...GOOD,
      readmeMd: "# Title\n\nNo links here.\n",
    });
    expect(f[0]!.code).toBe("KM_LINT_README_KEYMAN_LINK_ABSENT");
  });

  it("5.6b flags a README.md without the help link", () => {
    const { findings: f } = checkReadmeHelpLinkAbsent({
      ...GOOD,
      readmeMd: "See https://keyman.com/keyboards/gff_amharic.\n",
    });
    expect(f[0]!.code).toBe("KM_LINT_README_HELP_LINK_ABSENT");
  });

  it("6.6b flags a welcome.htm lang mismatch", () => {
    const { findings: f } = checkWelcomeLangMismatch({
      ...GOOD,
      welcomeHtm: '<html lang="fr"><body></body></html>',
    });
    expect(f[0]!.code).toBe("KM_LINT_WELCOME_LANG_MISMATCH");
  });

  it("6.6b flags a missing lang attribute", () => {
    const { findings: f } = checkWelcomeLangMismatch({
      ...GOOD,
      welcomeHtm: "<html><body></body></html>",
    });
    expect(f[0]!.code).toBe("KM_LINT_WELCOME_LANG_MISMATCH");
    expect(f[0]!.message).toContain("no <html lang>");
  });

  it("7.11b flags store(&Author) in the .kmn", () => {
    const { findings: f } = checkAuthorInKmn({
      ...GOOD,
      kmn: "store(&Author) 'Someone'\n",
    });
    expect(f[0]!.code).toBe("KM_LINT_AUTHOR_IN_KMN");
  });

  it("11.1b flags an absent .php", () => {
    const { findings: f } = checkPhpHeaderBad({ ...GOOD, php: undefined, phpPath: undefined });
    expect(f[0]!.code).toBe("KM_LINT_PHP_HEADER_BAD");
    expect(f[0]!.message).toContain("No <name>.php");
  });

  it("11.1b flags a .php without the header block", () => {
    const { findings: f } = checkPhpHeaderBad({ ...GOOD, php: "<?php\necho 'hi';\n?>\n" });
    expect(f[0]!.code).toBe("KM_LINT_PHP_HEADER_BAD");
  });

  it("11.3b flags a <style> tag outside the PHP block", () => {
    const { findings: f } = checkPhpStyleOutside({
      ...GOOD,
      php: "<?php\n/*\n  Name: x\n*/\n?>\n<style>p{}</style>\n",
    });
    expect(f[0]!.code).toBe("KM_LINT_PHP_STYLE_OUTSIDE");
  });

  it("11.4b flags closing body/html tags", () => {
    const { findings: f } = checkPhpClosingTags({
      ...GOOD,
      php: "<?php\n/*\n  Name: x\n*/\n?>\n<p>Hi</p></body></html>\n",
    });
    expect(f[0]!.code).toBe("KM_LINT_PHP_CLOSING_TAGS");
  });

  it("11.3b/11.4b are moot without a .php file, naming why", () => {
    const noPhp = { ...GOOD, php: undefined };
    expect(checkPhpStyleOutside(noPhp).verified).toEqual([
      "No .php file to check.",
    ]);
    expect(checkPhpClosingTags(noPhp).verified).toEqual([
      "No .php file to check.",
    ]);
  });

  it("names the moot reason when source files are absent", () => {
    const bare = {
      ...GOOD,
      licenseMd: undefined,
      readmeMd: undefined,
      readmeHtm: undefined,
      kmn: undefined,
      kps: undefined,
      welcomeHtm: undefined,
      php: undefined,
    };
    expect(checkCopyrightAbsent(bare).verified).toEqual([
      "No LICENSE.md to check.",
    ]);
    expect(checkCopyrightSyntax(bare).verified).toEqual([
      "No LICENSE.md to check.",
    ]);
    expect(checkCopyrightYearEmbedded(bare).verified).toEqual([
      "No .kmn or .kps to check.",
    ]);
    expect(checkVersionInDocs(bare).verified).toEqual([
      "No documentation files to check.",
    ]);
    expect(checkReadmeKeymanLinkAbsent(bare).verified).toEqual([
      "No README.md to check.",
    ]);
    expect(checkWelcomeLangMismatch(bare).verified).toEqual([
      "No welcome.htm to check.",
    ]);
    expect(checkAuthorInKmn(bare).verified).toEqual(["No .kmn to check."]);
  });

  it("4.5b is moot when LICENSE.md has no copyright line at all", () => {
    const { verified } = checkCopyrightSyntax({
      ...GOOD,
      licenseMd: "The MIT License\n",
    });
    expect(verified).toEqual([
      "No copyright line in LICENSE.md (absence is 4.1b's check).",
    ]);
  });
});

describe("audit false-positive fixes", () => {
  it("11.1b accepts the $pagename + require_once('header.php') header", () => {
    const php =
      "<?php\n  $pagename = 'Demo Keyboard Help';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n<p>Help</p>\n";
    expect(checkPhpHeaderBad({ ...GOOD, php }).findings).toEqual([]);
  });

  it("11.1b still flags a .php with neither header form, citing the <?php line", () => {
    const { findings } = checkPhpHeaderBad({
      ...GOOD,
      php: "\n<?php\n$x = 1;\n?>\n<p>Help</p>\n",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.location!.line).toBe(2);
  });

  it("5.2b ignores CSS line-height, DOIs and URLs", () => {
    const welcomeHtm =
      '<html><head><style>p { line-height: 1.6; }</style></head><body>' +
      "<p>See doi 10.1080/00437956.2013.1 and https://example.org/v2.3.4/x</p></body></html>";
    expect(checkVersionInDocs({ ...GOOD, welcomeHtm }).findings).toEqual([]);
  });

  it("5.2b still flags a visible version, citing its line and the real welcome path", () => {
    const { findings } = checkVersionInDocs({
      ...GOOD,
      welcomeHtm: "<html>\n<body>\n<p>Version 2.3 is out</p>\n</body></html>",
      welcomePath: "source/welcome/welcome.htm",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.location).toEqual({
      file: "source/welcome/welcome.htm",
      line: 3,
    });
  });

  it("4.5b accepts the (c) symbol and cites the line when wrong", () => {
    expect(
      checkCopyrightSyntax({
        ...GOOD,
        licenseMd: "MIT\n\nCopyright \u00a9 2021-2026 SIL International\n",
      }).findings,
    ).toEqual([]);
    const { findings } = checkCopyrightSyntax({
      ...GOOD,
      licenseMd: "MIT\n\nCopyright 2021 SIL International\n",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.location!.line).toBe(3);
  });

  it("6.6b accepts lang=en and en-* on a non-English keyboard, citing the real path", () => {
    for (const lang of ["en", "en-US"]) {
      expect(
        checkWelcomeLangMismatch({
          ...GOOD,
          welcomeHtm: `<html lang="${lang}"><body></body></html>`,
        }).findings,
      ).toEqual([]);
    }
    const { findings } = checkWelcomeLangMismatch({
      ...GOOD,
      welcomeHtm: '<html lang="fr"><body></body></html>',
      welcomePath: "source/welcome/welcome.htm",
    });
    expect(findings[0]!.location!.file).toBe("source/welcome/welcome.htm");
  });

  it("findings default to line 0 (whole file) when no line is known", () => {
    const { findings } = checkCopyrightAbsent({ ...GOOD, licenseMd: "MIT\n" });
    expect(findings[0]!.location!.line).toBe(0);
  });

  it("7.11b and 4.6b cite the offending .kmn line", () => {
    const kmn = "store(&Name) 'x'\nstore(&Author) 'Someone'\n";
    expect(checkAuthorInKmn({ ...GOOD, kmn }).findings[0]!.location!.line).toBe(2);
    const y = checkCopyrightYearEmbedded({
      ...GOOD,
      kmn: "c\nstore(&Copyright) 'Copyright (C) 2020 X'\n",
    });
    expect(y.findings[0]!.location!.line).toBe(2);
  });
});
