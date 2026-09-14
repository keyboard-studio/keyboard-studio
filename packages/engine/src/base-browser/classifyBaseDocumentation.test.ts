// classifyBaseDocumentation / extractUsableBaseDescription (spec 076 T032).
//
// `ahom_star`-shaped fixtures are the corpus's real full-documentation shape
// (folder convention, welcome images, a real description before the
// "Keyboard Layout" section, a help.php with the standard header). The
// `basic_kbdfr`-shaped fixture stands in for a minimal, flat-convention base
// whose welcome page is still the tool's own placeholder.

import { describe, it, expect } from "vitest";
import { classifyBaseDocumentation, extractUsableBaseDescription } from "./classifyBaseDocumentation.js";
import type { KpsFileEntry } from "./kps-parser.js";
import { welcomeHtm, helpPhpStub } from "../shared/packageDocs.js";

function file(name: string, fileType = ""): KpsFileEntry {
  return { name, fileType };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AHOM_STAR_FILES: KpsFileEntry[] = [
  file("..\\build\\ahom_star.kvk", ".kvk"),
  file("..\\build\\ahom_star.kmx", ".kmx"),
  file("..\\build\\ahom_star.js", ".js"),
  file("welcome\\welcome.htm", ".htm"),
  file("welcome\\desktop_layout_default.png", ".png"),
  file("welcome\\desktop_layout_shift.png", ".png"),
  file("welcome\\phone_default.png", ".png"),
  file("readme.htm", ".htm"),
  file("..\\..\\..\\shared\\fonts\\noto\\Ahom\\NotoSerifAhom-Regular.ttf", ".ttf"),
  file("..\\LICENSE.md", ".md"),
];

const AHOM_STAR_WELCOME_HTM = `<!DOCTYPE html>
<html lang="en">
<head><title>Start Using Ahom Star</title></head>
<body>
<h1>Start Using Ahom Star</h1>
<p>
    Ahom Star keyboard is designed for Ahom language which is a part of the Tai Kadai language family spoken by the Tai Ahom people of Assam and Northeast India.
</p>
<p>In order to type the arabic numeral (i.e. 1, 2, 3 etc), press the hash key (<kbd>Shift</kbd> + <kbd>3</kbd>) and then any corresponding Ahom numeral.</p>
<h1>Keyboard Layout</h1>
<h2>Desktop</h2>
<p><a href="desktop_layout_default.png"><img width="100%" class="keyboard" src="desktop_layout_default.png" alt="Default (unshifted) state" /></a></p>
<p>&copy; HemantaGogoi Ngi Mon</p>
</body>
</html>`;

const AHOM_STAR_HELP_PHP = `<?php
  $pagename = 'Ahom Star Keyboard Help';
  $pagetitle = $pagename;
  require_once('header.php');
?>

<p>
    Ahom Star keyboard is designed for Ahom language which is a part of the Tai Kadai language family spoken by the Tai Ahom people of Assam and Northeast India.
</p>

<h2>Desktop / Tablet</h2>
<div id='osk' data-states='default shift'></div>`;

// A minimal, flat-convention manifest (basic_kbdfr-shaped): declares the
// documentation members but the welcome page is still the tool's own
// placeholder (no author description has ever been supplied).
const BASIC_KBDFR_FILES: KpsFileEntry[] = [
  file("..\\build\\basic_kbdfr.kmx", ".kmx"),
  file("welcome.htm", ".htm"),
  file("readme.htm", ".htm"),
  file("README.md", ".md"),
  file("HISTORY.md", ".md"),
  file("..\\LICENSE.md", ".md"),
];

// A manifest with nothing beyond the license.
const NONE_FILES: KpsFileEntry[] = [
  file("..\\build\\plain_kbd.kmx", ".kmx"),
  file("..\\build\\plain_kbd.js", ".js"),
  file("..\\LICENSE.md", ".md"),
];

describe("classifyBaseDocumentation", () => {
  it("classifies a fully-documented folder-convention base as full", () => {
    const profile = classifyBaseDocumentation(AHOM_STAR_FILES, AHOM_STAR_WELCOME_HTM, AHOM_STAR_HELP_PHP);
    expect(profile.level).toBe("full");
    expect(profile.welcomeConvention).toBe("folder");
    expect(profile.members).toEqual(
      expect.arrayContaining(["welcome-htm", "readme-htm", "license-md"]),
    );
    expect(profile.welcomeImages).toEqual(
      expect.arrayContaining([
        "welcome/desktop_layout_default.png",
        "welcome/desktop_layout_shift.png",
        "welcome/phone_default.png",
      ]),
    );
    expect(profile.hasUsableDescription).toBe(true);
  });

  it("classifies a minimal base (members present, only the placeholder welcome page) as minimal, flat convention", () => {
    const placeholderWelcome = welcomeHtm("Basic KBDFR");
    const profile = classifyBaseDocumentation(BASIC_KBDFR_FILES, placeholderWelcome, null);
    expect(profile.level).toBe("minimal");
    expect(profile.welcomeConvention).toBe("flat");
    expect(profile.hasUsableDescription).toBe(false);
    expect(profile.members).toEqual(
      expect.arrayContaining(["welcome-htm", "readme-htm", "readme-md", "history-md", "license-md"]),
    );
  });

  it("classifies a manifest with nothing beyond LICENSE as none", () => {
    const profile = classifyBaseDocumentation(NONE_FILES, null, null);
    expect(profile.level).toBe("none");
    expect(profile.welcomeConvention).toBe("absent");
    expect(profile.hasUsableDescription).toBe(false);
    expect(profile.members).toEqual(["license-md"]);
  });

  it("classifies an empty/unparseable manifest as unknown", () => {
    expect(classifyBaseDocumentation([], null, null).level).toBe("unknown");
  });

  it("folder wins over flat when a manifest lists both", () => {
    const files: KpsFileEntry[] = [
      file("welcome.htm", ".htm"),
      file("welcome\\welcome.htm", ".htm"),
      file("welcome\\desktop_layout_default.png", ".png"),
      file("..\\LICENSE.md", ".md"),
    ];
    const profile = classifyBaseDocumentation(files, AHOM_STAR_WELCOME_HTM, null);
    expect(profile.welcomeConvention).toBe("folder");
  });

  it("degrades a ghost descriptor entry (declared but unreachable) to absent, not full", () => {
    const files: KpsFileEntry[] = [
      file("welcome\\welcome.htm", ".htm"),
      file("..\\LICENSE.md", ".md"),
    ];
    const profile = classifyBaseDocumentation(files, null, null);
    expect(profile.welcomeConvention).toBe("absent");
    expect(profile.level).not.toBe("full");
    expect(profile.hasUsableDescription).toBe(false);
  });

  it("never throws on malformed input and always satisfies full => hasUsableDescription", () => {
    const calls: Array<() => ReturnType<typeof classifyBaseDocumentation>> = [
      () => classifyBaseDocumentation(null as unknown as KpsFileEntry[], null, null),
      () => classifyBaseDocumentation(undefined as unknown as KpsFileEntry[], "not html", null),
      () => classifyBaseDocumentation([{ name: 42 } as unknown as KpsFileEntry], null, null),
      () => classifyBaseDocumentation([{} as unknown as KpsFileEntry], null, null),
      () => classifyBaseDocumentation([file("")], null, null),
    ];
    for (const call of calls) {
      let profile: ReturnType<typeof classifyBaseDocumentation> | undefined;
      expect(() => {
        profile = call();
      }).not.toThrow();
      expect(profile).toBeDefined();
      expect(["none", "minimal", "full", "unknown"]).toContain(profile!.level);
      if (profile!.level === "full") expect(profile!.hasUsableDescription).toBe(true);
    }
  });

  it("full always implies hasUsableDescription (invariant)", () => {
    const profile = classifyBaseDocumentation(AHOM_STAR_FILES, AHOM_STAR_WELCOME_HTM, AHOM_STAR_HELP_PHP);
    if (profile.level === "full") {
      expect(profile.hasUsableDescription).toBe(true);
    }
  });
});

describe("extractUsableBaseDescription", () => {
  it("extracts the base's real description, stripping the Keyboard Layout section", () => {
    const description = extractUsableBaseDescription(AHOM_STAR_WELCOME_HTM, null);
    expect(description).toBe(
      "Ahom Star keyboard is designed for Ahom language which is a part of the Tai Kadai language family spoken by the Tai Ahom people of Assam and Northeast India.",
    );
  });

  it("falls back to the help page when the welcome page has no usable paragraph", () => {
    const chartOnlyWelcome = `<html><body><h1>Keyboard Layout</h1><p><img src="x.png" alt="x"></p></body></html>`;
    const description = extractUsableBaseDescription(chartOnlyWelcome, AHOM_STAR_HELP_PHP);
    expect(description).toBe(
      "Ahom Star keyboard is designed for Ahom language which is a part of the Tai Kadai language family spoken by the Tai Ahom people of Assam and Northeast India.",
    );
  });

  it("rejects the tool's own welcome placeholder text", () => {
    const placeholder = welcomeHtm("Some Base Keyboard");
    expect(extractUsableBaseDescription(placeholder, null)).toBeNull();
  });

  it("rejects a help.php stub (header + bare placeholder comment, no paragraph)", () => {
    const stub = helpPhpStub("Some Base Keyboard");
    expect(extractUsableBaseDescription(null, stub)).toBeNull();
  });

  it("rejects a paragraph that is solely a chart/image reference", () => {
    const html = `<html><body><p><a href="x.png"><img src="x.png" alt="chart" /></a></p></body></html>`;
    expect(extractUsableBaseDescription(html, null)).toBeNull();
  });

  it("returns null when both pages are null or have no usable paragraph", () => {
    expect(extractUsableBaseDescription(null, null)).toBeNull();
    expect(extractUsableBaseDescription("<html><body></body></html>", "<html><body></body></html>")).toBeNull();
  });
});
