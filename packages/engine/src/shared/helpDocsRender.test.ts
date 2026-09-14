import { describe, it, expect } from "vitest";
import type { HelpDocsAnswers } from "@keyboard-studio/contracts";
import {
  buildDocSections,
  renderReadmeMd,
  renderReadmeHtm,
  renderWelcomeHtm,
  renderHelpPhp,
  helpSiteHeader,
  helpSitePageName,
  helpPhpStub,
  renderWelcomeLayoutSection,
  extractWelcomeImageRefs,
  type HelpDocsRenderInput,
} from "./helpDocsRender.js";
import { welcomeHtm, readmeHtm } from "./packageDocs.js";

const HAUSA_HEADER =
  "<?php\n  $pagename = 'Hausa Basic Keyboard Help';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n";

function baseInput(overrides: Partial<HelpDocsRenderInput> = {}): HelpDocsRenderInput {
  return {
    answers: null,
    displayName: "Piaroa",
    platforms: [],
    ...overrides,
  };
}

function answersWith(overrides: Partial<HelpDocsAnswers> = {}): HelpDocsAnswers {
  return { description: "A keyboard for Piaroa.", usageTips: [], ...overrides };
}

describe("helpDocsRender — FR-002 placeholder fallback", () => {
  it("renderReadmeMd falls back to the bare heading when answers is null", () => {
    expect(renderReadmeMd(baseInput())).toBe("# Piaroa\n");
  });

  it("renderReadmeMd falls back when description is blank", () => {
    const input = baseInput({ answers: answersWith({ description: "   " }) });
    expect(renderReadmeMd(input)).toBe("# Piaroa\n");
  });

  it("renderReadmeHtm is byte-identical to today's packageDocs stub when answers is null", () => {
    expect(renderReadmeHtm(baseInput())).toBe(readmeHtm("Piaroa"));
  });

  it("renderWelcomeHtm is byte-identical to today's packageDocs stub when answers is null", () => {
    expect(renderWelcomeHtm(baseInput(), null)).toBe(welcomeHtm("Piaroa"));
  });

  it("renderWelcomeHtm inherits a fetched base verbatim when nothing is authored yet (spec 076 FR-006)", () => {
    const base = "<html><body>base</body></html>";
    expect(renderWelcomeHtm(baseInput(), base)).toBe(base);
  });

  it("renderHelpPhp is byte-identical to the scaffolder stub when answers is null (header + placeholder comment)", () => {
    const rendered = renderHelpPhp(baseInput(), null);
    expect(rendered).toBe(helpPhpStub("Piaroa"));
    expect(rendered).toBe(`${helpSiteHeader("Piaroa")}<?php /* Piaroa help */ ?>`);
  });

  it("renderHelpPhp defuses a PHP comment terminator in the display name, same as the scaffolder stub", () => {
    const input = baseInput({ displayName: "A*/B" });
    expect(renderHelpPhp(input, null)).toBe(`${helpSiteHeader("A*/B")}<?php /* A* /B help */ ?>`);
    expect(renderHelpPhp(input, null)).not.toContain("A*/B help");
  });
});

describe("helpDocsRender — spec 076 FR-003 standard help-site header (US1)", () => {
  it("emits the exact corpus header block for a plain display name", () => {
    expect(helpSiteHeader("Hausa Basic")).toBe(HAUSA_HEADER);
    expect(helpSitePageName("Hausa Basic")).toBe("Hausa Basic Keyboard Help");
  });

  it("does not double the word Keyboard when the display name already ends with it", () => {
    expect(helpSitePageName("Foo Keyboard")).toBe("Foo Keyboard Help");
    expect(helpSitePageName("Foo KEYBOARD")).toBe("Foo KEYBOARD Help");
    // "Keyboardist" is not the word "Keyboard".
    expect(helpSitePageName("Keyboardist")).toBe("Keyboardist Keyboard Help");
  });

  it("PHP-single-quote-escapes the display name and collapses line breaks", () => {
    expect(helpSiteHeader("O'Neil \\ Co")).toContain("$pagename = 'O\\'Neil \\\\ Co Keyboard Help';");
    expect(helpSiteHeader("Two\nLines")).toContain("$pagename = 'Two Lines Keyboard Help';");
  });

  it("a fresh help page begins with the header, then the same body as the welcome page (US1-1)", () => {
    const input = baseInput({ displayName: "Hausa Basic", answers: answersWith(), primaryBcp47: "ha" });
    const help = renderHelpPhp(input, null);
    expect(help.startsWith(HAUSA_HEADER)).toBe(true);
    expect(help.slice(HAUSA_HEADER.length)).toBe(renderWelcomeHtm(input, null));
    expect(help.match(/\$pagename =/g)).toHaveLength(1);
  });

  it("a placeholder production still carries the header above the stub body (US1-3)", () => {
    const help = renderHelpPhp(baseInput({ displayName: "Hausa Basic" }), null);
    expect(help.startsWith(HAUSA_HEADER)).toBe(true);
    expect(help.endsWith("<?php /* Hausa Basic help */ ?>")).toBe(true);
  });

  it("an inherited help page keeps its own header and never gets a second one (US1-2)", () => {
    const baseHelp =
      "<?php\n  $pagename = 'French Basic Keyboard Help';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n<html><body><p>Base prose.</p></body></html>";
    const input = baseInput({ displayName: "Hausa Basic", answers: answersWith() });
    const help = renderHelpPhp(input, baseHelp);
    expect(help.startsWith("<?php\n  $pagename = 'French Basic Keyboard Help';")).toBe(true);
    expect(help.match(/\$pagename =/g)).toHaveLength(1);
    expect(help).not.toContain("Hausa Basic Keyboard Help");
    expect(help).toContain("<p>Base prose.</p>");
    expect(help).toContain("<!-- Keyboard Studio additions -->");
  });

  it("is a pure function of the display name (SC-004 determinism)", () => {
    expect(helpSiteHeader("Piaroa")).toBe(helpSiteHeader("Piaroa"));
  });
});

describe("helpDocsRender — FR-001/SC-001 required description", () => {
  it("reaches all four files when only the description is answered", () => {
    const input = baseInput({ answers: answersWith() });
    expect(renderReadmeMd(input)).toContain("A keyboard for Piaroa.");
    expect(renderReadmeHtm(input)).toContain("A keyboard for Piaroa.");
    expect(renderWelcomeHtm(input, null)).toContain("A keyboard for Piaroa.");
    expect(renderHelpPhp(input, null)).toContain("A keyboard for Piaroa.");
  });

  it("HTML-escapes the description in the .htm/.php outputs (FR-009)", () => {
    const input = baseInput({ answers: answersWith({ description: "<b>bold</b> & fancy" }) });
    for (const rendered of [renderReadmeHtm(input), renderWelcomeHtm(input, null), renderHelpPhp(input, null)]) {
      expect(rendered).not.toContain("<b>bold</b>");
      expect(rendered).toContain("&lt;b&gt;bold&lt;/b&gt; &amp; fancy");
    }
  });
});

describe("helpDocsRender — buildDocSections (FR-003/FR-011/SC-003)", () => {
  it("returns nothing for null answers", () => {
    expect(buildDocSections(null)).toEqual([]);
  });

  it("omits every section when only the description is answered", () => {
    expect(buildDocSections(answersWith())).toEqual([]);
  });

  it("renders usage tips, credits, and contact when present; omits each when blank", () => {
    const sections = buildDocSections(
      answersWith({ usageTips: ["Type slowly at first."], credits: "Jane Doe" }),
    );
    expect(sections).toEqual([
      { heading: "Usage Tips", body: "Type slowly at first." },
      { heading: "Credits", body: "Jane Doe" },
    ]);
  });

  it("joins multiple usage tips into one section, one per line", () => {
    const sections = buildDocSections(answersWith({ usageTips: ["Tip one.", "Tip two."] }));
    expect(sections).toEqual([{ heading: "Usage Tips", body: "Tip one.\nTip two." }]);
  });

  it("filters blank usage tips without producing an empty section", () => {
    expect(buildDocSections(answersWith({ usageTips: ["  ", ""] }))).toEqual([]);
  });

  it("renders the opt-in battery in research D-10's fixed order, each independently omitted", () => {
    const sections = buildDocSections(
      answersWith({
        furtherReading: "See also https://example.com",
        designRationale: "Chosen for ergonomics.",
        knownLimitations: "No support for X.",
      }),
    );
    expect(sections.map((s) => s.heading)).toEqual([
      "Design Rationale",
      "Known Limitations",
      "Further Reading",
    ]);
  });

  it("renders all eleven opt-in fields when every one is answered (FR-014)", () => {
    const sections = buildDocSections(
      answersWith({
        designRationale: "a",
        fontGuidance: "b",
        canonicalOrder: "c",
        scriptGlossary: "d",
        exampleWords: "e",
        scopeVariety: "f",
        provenanceBasis: "g",
        troubleshooting: "h",
        knownLimitations: "i",
        relatedKeyboards: "j",
        furtherReading: "k",
      }),
    );
    expect(sections.map((s) => s.heading)).toEqual([
      "Design Rationale",
      "Font Guidance",
      "Canonical Order",
      "Script Glossary",
      "Example Words",
      "Scope & Variety",
      "Provenance",
      "Troubleshooting",
      "Known Limitations",
      "Related Keyboards",
      "Further Reading",
    ]);
  });
});

describe("helpDocsRender — welcome.htm / help.php sections (US3/US4)", () => {
  it("renders usage tips as a list and omits Credits/Contact when blank", () => {
    const input = baseInput({ answers: answersWith({ usageTips: ["Tip one.", "Tip two."] }) });
    const rendered = renderWelcomeHtm(input, null);
    expect(rendered).toContain("<h2>Usage Tips</h2>");
    expect(rendered).toContain("<li>Tip one.</li><li>Tip two.</li>");
    expect(rendered).not.toContain("Credits");
    expect(rendered).not.toContain("Contact");
  });

  it("groups the opt-in battery under one 'Additional Detail' heading, omitted when none answered", () => {
    const withOptIn = renderWelcomeHtm(
      baseInput({ answers: answersWith({ designRationale: "Chosen for ergonomics." }) }),
      null,
    );
    expect(withOptIn).toContain("<h2>Additional Detail</h2>");
    expect(withOptIn).toContain("<h2>Design Rationale</h2>");

    const withoutOptIn = renderWelcomeHtm(baseInput({ answers: answersWith() }), null);
    expect(withoutOptIn).not.toContain("Additional Detail");
  });

  it("sets <html lang> to the primary BCP47 tag (FR-006)", () => {
    const input = baseInput({ answers: answersWith(), primaryBcp47: "pid" });
    expect(renderWelcomeHtm(input, null)).toContain('<html lang="pid">');
    expect(renderHelpPhp(input, null)).toContain('<html lang="pid">');
  });

  it("never embeds a version number or copyright year (FR-007)", () => {
    const input = baseInput({ answers: answersWith() });
    for (const rendered of [renderReadmeMd(input), renderReadmeHtm(input), renderWelcomeHtm(input, null), renderHelpPhp(input, null)]) {
      expect(rendered).not.toMatch(/copyright/i);
      expect(rendered.toLowerCase()).not.toContain("version");
    }
  });

  it("the help page body after the header equals the welcome page (spec 076 FR-004)", () => {
    const input = baseInput({ answers: answersWith({ usageTips: ["Tip one."] }), primaryBcp47: "pid" });
    const help = renderHelpPhp(input, null);
    const header = helpSiteHeader("Piaroa");
    expect(help.startsWith(header)).toBe(true);
    expect(help.slice(header.length)).toBe(renderWelcomeHtm(input, null));
  });
});

describe("helpDocsRender — FR-013 merge with a fetched base", () => {
  const baseWelcome = "<html><body><h1>Hand-authored</h1><p>Original prose stays.</p></body></html>";

  it("preserves the base body verbatim and appends new content below a clear boundary", () => {
    const input = baseInput({ answers: answersWith({ description: "New answer content." }) });
    const rendered = renderWelcomeHtm(input, baseWelcome);

    expect(rendered).toContain("<h1>Hand-authored</h1><p>Original prose stays.</p>");
    expect(rendered).toContain("<!-- Keyboard Studio additions -->");
    expect(rendered).toContain("New answer content.");
    // The addition lands before the base's own closing </body>.
    expect(rendered.indexOf("Original prose stays.")).toBeLessThan(
      rendered.indexOf("New answer content."),
    );
    expect(rendered.trim().endsWith("</body></html>")).toBe(true);
  });

  it("inherits the base verbatim rather than merging when the author has no description yet (spec 076 FR-006)", () => {
    const rendered = renderWelcomeHtm(baseInput(), baseWelcome);
    expect(rendered).toBe(baseWelcome);
    expect(rendered).toContain("Hand-authored");
  });

  it("overwrites the base's own <html lang> rather than duplicating or leaving it stale", () => {
    const frenchBase = '<html lang="fr"><body><h1>Bonjour</h1></body></html>';
    const input = baseInput({
      answers: answersWith({ description: "New answer content." }),
      primaryBcp47: "pid",
    });
    const rendered = renderWelcomeHtm(input, frenchBase);

    expect(rendered).toContain('<html lang="pid">');
    expect(rendered).not.toContain('lang="fr"');
    expect(rendered.match(/lang=/g)).toHaveLength(1);
  });

  it("appends below the base when it has no </body> anchor at all", () => {
    const malformedBase = "<html><h1>Hand-authored</h1>"; // no closing tags
    const input = baseInput({ answers: answersWith({ description: "New answer content." }) });
    const rendered = renderWelcomeHtm(input, malformedBase);

    expect(rendered).toContain("<h1>Hand-authored</h1>");
    expect(rendered).toContain("<!-- Keyboard Studio additions -->");
    expect(rendered).toContain("New answer content.");
    expect(rendered.indexOf("Hand-authored")).toBeLessThan(rendered.indexOf("New answer content."));
  });
});

describe("helpDocsRender — README (FR-004/FR-008)", () => {
  it("shows both a home-page and a help-page Links entry, correctly labeled", () => {
    const input = baseInput({
      answers: answersWith({
        projectHomeUrl: "https://example.com",
        projectHelpUrl: "https://example.com/help",
      }),
    });
    const readme = renderReadmeMd(input);
    expect(readme).toContain("- Keyboard homepage: https://example.com");
    expect(readme).toContain("- Online help: https://example.com/help");
  });

  it("omits the Links section entirely when no project URL was given", () => {
    const readme = renderReadmeMd(baseInput({ answers: answersWith() }));
    expect(readme).not.toContain("Links");
  });

  it("lists only the platforms actually supported", () => {
    const readme = renderReadmeMd(
      baseInput({ answers: answersWith(), platforms: ["windows", "mac"] }),
    );
    expect(readme).toContain("## Supported Platforms");
    expect(readme).toContain("- windows");
    expect(readme).toContain("- mac");
  });

  it("omits the Supported Platforms section when there are none", () => {
    const readme = renderReadmeMd(baseInput({ answers: answersWith(), platforms: [] }));
    expect(readme).not.toContain("Supported Platforms");
  });
});

describe("helpDocsRender — cross-file parity (FR-005/SC-005)", () => {
  // The help page's standard help-site header (spec 076 FR-003) is the one
  // permitted difference on the help side (spec 076 FR-004), so strip it too.
  const stripDoc = (html: string): string =>
    html
      .replace(/^<\?php\n[\s\S]*?\?>\n/, "")
      .replace(/^<html[^>]*><body>/, "")
      .replace(/<\/body><\/html>$/, "");

  // A sampled set of answer combinations, not just one — FR-005 is a
  // structural guarantee (buildDocSections shared by both callers), so this
  // is a regression net against a future edit that special-cases one caller.
  const SAMPLES: Array<{ name: string; answers: HelpDocsAnswers }> = [
    { name: "description only", answers: answersWith() },
    {
      name: "default-path extras",
      answers: answersWith({
        usageTips: ["Tip one.", "Tip two."],
        credits: "Jane Doe",
        contactInfo: "jane@example.com",
      }),
    },
    {
      name: "full opt-in battery",
      answers: answersWith({
        designRationale: "Chosen for ergonomics.",
        fontGuidance: "Use a Unicode font.",
        canonicalOrder: "Base then mark.",
        scriptGlossary: "Glossary text.",
        exampleWords: "kpá, mbá",
        scopeVariety: "Standard variety.",
        provenanceBasis: "Community-sourced.",
        troubleshooting: "Restart Keyman if keys stop responding.",
        knownLimitations: "No support for X.",
        relatedKeyboards: "See also Y.",
        furtherReading: "https://example.com/reading",
      }),
    },
    {
      name: "mixed: one usage tip, one opt-in field, no credits/contact",
      answers: answersWith({ usageTips: ["Tip one."], troubleshooting: "Check your layout." }),
    },
  ];

  for (const { name, answers } of SAMPLES) {
    it(`welcome.htm and help.php render an identical body — ${name}`, () => {
      const input = baseInput({ answers, primaryBcp47: "pid" });
      expect(stripDoc(renderWelcomeHtm(input, null))).toBe(stripDoc(renderHelpPhp(input, null)));
    });
  }
});

// ---------------------------------------------------------------------------
// spec 076 US2 (T018): the welcome page's "Keyboard Layout" section and the
// `<img src>` extractor the projection diffs carried images against.
// ---------------------------------------------------------------------------

describe("helpDocsRender — welcome layout section (spec 076 FR-004 / R9 / T051)", () => {
  // "desktop_layout_default.png" carries no reserved chart prefix, so it
  // groups as "Other"; "ks-layout-phone-shift.svg" is a generated chart, so
  // it groups as "Phone" — ahead of "Other" per the desktop/phone/tablet/other
  // group order, regardless of each file's position in the input array.
  const IMAGES = ["desktop_layout_default.png", "ks-layout-phone-shift.svg"];

  it("renders every carried file under a Keyboard Layout heading, grouped by platform with a programmatic alt", () => {
    expect(renderWelcomeLayoutSection(IMAGES)).toBe(
      "<h2>Keyboard Layout</h2>" +
        "<h3>Phone</h3>" +
        '<p><img src="ks-layout-phone-shift.svg" alt="phone shift"></p>' +
        "<h3>Other</h3>" +
        '<p><img src="desktop_layout_default.png" alt="desktop layout default"></p>',
    );
  });

  it("omits nothing regardless of how many files are supplied (no truncation for large layer counts)", () => {
    const many = Array.from({ length: 15 }, (_, i) => `ks-layout-phone-layer${String(i)}.svg`);
    const section = renderWelcomeLayoutSection(many);
    for (const f of many) expect(section).toContain(`src="${f}"`);
  });

  it("is empty when there is nothing to show, so an image-less page is byte-identical to before", () => {
    expect(renderWelcomeLayoutSection([])).toBe("");
    expect(renderWelcomeLayoutSection([" "])).toBe("");
    const input = baseInput({ answers: answersWith({ description: "Plain." }) });
    expect(renderWelcomeHtm(input, null, [])).toBe(renderWelcomeHtm(input, null));
  });

  it("a FRESH welcome page carries the section after the shared body; the help page never does (FR-004)", () => {
    const input = baseInput({ answers: answersWith({ description: "Plain." }) });
    const welcome = renderWelcomeHtm(input, null, IMAGES);
    expect(welcome).toContain("<p>Plain.</p>\n<h2>Keyboard Layout</h2>");
    expect(welcome).toContain('<img src="desktop_layout_default.png"');
    expect(renderHelpPhp(input, null)).not.toContain("Keyboard Layout");
    // The body BEFORE the section is still the one shared body (parity).
    expect(welcome.replace(/\n<h2>Keyboard Layout<\/h2>[\s\S]*?(?=<\/body>)/, "")).toBe(
      renderWelcomeHtm(input, null),
    );
  });

  it("the placeholder page (no description yet) still references carried images, so none is orphaned", () => {
    const input = baseInput({ answers: null, displayName: "Hausa Basic" });
    expect(renderWelcomeHtm(input, null, IMAGES)).toBe(
      "<html><body><p>Welcome to Hausa Basic</p><h2>Keyboard Layout</h2>" +
        "<h3>Phone</h3>" +
        '<p><img src="ks-layout-phone-shift.svg" alt="phone shift"></p>' +
        "<h3>Other</h3>" +
        '<p><img src="desktop_layout_default.png" alt="desktop layout default"></p>' +
        "</body></html>",
    );
    expect(renderWelcomeHtm(input, null, [])).toBe(welcomeHtm("Hausa Basic"));
  });

  it("a MERGED base page keeps its own layout reference and appends only the files it does not already reference (spec 076 T051)", () => {
    const base = '<html><body><h2>Keyboard Layout</h2><img src="old.png"></body></html>';
    const input = baseInput({ answers: answersWith({ description: "Plain." }) });
    const merged = renderWelcomeHtm(input, base, IMAGES);
    // The base's own heading/image survive untouched...
    expect(merged).toContain('<img src="old.png">');
    // ...and both supplied files — neither is "old.png" — are appended under
    // the "Keyboard Studio additions" boundary, so there are now two
    // "Keyboard Layout" headings: the base's own, and the appended one.
    expect(merged.match(/Keyboard Layout/g)).toHaveLength(2);
    expect(merged).toContain("<!-- Keyboard Studio additions -->");
    expect(merged).toContain('<img src="desktop_layout_default.png"');
    expect(merged).toContain('<img src="ks-layout-phone-shift.svg"');
  });

  it("does not append a layout section when the base already references every supplied file", () => {
    const baseWithBoth =
      '<html><body><img src="desktop_layout_default.png"><img src="ks-layout-phone-shift.svg"></body></html>';
    const input = baseInput({ answers: answersWith({ description: "Plain." }) });
    const merged = renderWelcomeHtm(input, baseWithBoth, IMAGES);
    expect(merged).not.toContain("Keyboard Layout");
    // The answered description still merges in under the boundary — only the
    // (now-empty) layout section is omitted.
    expect(merged).toContain("<!-- Keyboard Studio additions -->");
  });

  it("escapes file names in src and alt", () => {
    expect(renderWelcomeLayoutSection(['a"b.png'])).toContain('src="a&quot;b.png"');
  });
});

describe("helpDocsRender — spec 076 FR-006 base inheritance before anything is authored", () => {
  it("renderWelcomeHtm returns the base page verbatim when nothing has been authored yet", () => {
    const base = "<html><body><h1>Hand-authored</h1></body></html>";
    expect(renderWelcomeHtm(baseInput(), base)).toBe(base);
  });

  it("renderWelcomeHtm appends only the carried images the base does not already reference", () => {
    const base = '<html><body><img src="old.png"></body></html>';
    const rendered = renderWelcomeHtm(baseInput(), base, ["new.png", "old.png"]);
    expect(rendered).toContain('<img src="new.png"');
    expect(rendered.match(/src="old\.png"/g)).toHaveLength(1);
  });

  it("renderHelpPhp returns the base help page verbatim when nothing has been authored yet", () => {
    const baseHelp =
      "<?php\n  $pagename = 'French Basic Keyboard Help';\n?>\n<html><body><p>Base.</p></body></html>";
    expect(renderHelpPhp(baseInput(), baseHelp)).toBe(baseHelp);
  });

  it("renderReadmeMd returns the base README verbatim (one trailing newline) when nothing has been authored yet", () => {
    expect(renderReadmeMd(baseInput(), "# Base\n\nBase description.")).toBe(
      "# Base\n\nBase description.\n",
    );
    expect(renderReadmeMd(baseInput(), "# Base\n\nBase description.\n\n\n")).toBe(
      "# Base\n\nBase description.\n",
    );
  });

  it("renderReadmeMd appends the tool's sections below the base text once a description is answered, without a second title", () => {
    const input = baseInput({
      answers: answersWith({ description: "New description." }),
      platforms: ["windows"],
    });
    const rendered = renderReadmeMd(input, "# Base\n\nBase description.");
    expect(rendered).toBe(
      "# Base\n\nBase description.\n\nNew description.\n\n## Supported Platforms\n- windows\n",
    );
    expect(rendered.match(/^# /gm)).toHaveLength(1);
  });

  it("keeps today's byte-identical behaviour when no base text is supplied", () => {
    expect(renderReadmeMd(baseInput())).toBe("# Piaroa\n");
    expect(renderWelcomeHtm(baseInput(), null)).toBe(welcomeHtm("Piaroa"));
    expect(renderHelpPhp(baseInput(), null)).toBe(helpPhpStub("Piaroa"));
  });
});

describe("extractWelcomeImageRefs (spec 076 contracts/engine-api.md)", () => {
  it("returns distinct relative <img src> targets in document order", () => {
    const html =
      '<html><body><img src="desktop.png"><p><IMG SRC=\'phone.png\' alt=x></p>' +
      '<img alt="first" src=welcome/desktop.png><img src="./phone.png"><img src="desktop.png"></body></html>';
    expect(extractWelcomeImageRefs(html)).toEqual(["desktop.png", "phone.png", "welcome/desktop.png"]);
  });

  it("skips scheme-qualified, protocol-relative, root-anchored and data: sources", () => {
    const html =
      '<img src="https://x.example/a.png"><img src="//cdn/b.png"><img src="/c.png">' +
      '<img src="data:image/png;base64,AAAA"><img src="local.png">';
    expect(extractWelcomeImageRefs(html)).toEqual(["local.png"]);
  });

  it("is empty for a page with no images, and ignores non-img tags", () => {
    expect(extractWelcomeImageRefs("<html><body><p>hi</p><a href=\"x.png\">x</a></body></html>")).toEqual([]);
    expect(extractWelcomeImageRefs("")).toEqual([]);
  });
});
