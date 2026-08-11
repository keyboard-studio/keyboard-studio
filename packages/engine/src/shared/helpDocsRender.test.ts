import { describe, it, expect } from "vitest";
import type { HelpDocsAnswers } from "@keyboard-studio/contracts";
import {
  buildDocSections,
  renderReadmeMd,
  renderReadmeHtm,
  renderWelcomeHtm,
  renderHelpPhp,
  type HelpDocsRenderInput,
} from "./helpDocsRender.js";
import { welcomeHtm, readmeHtm } from "./packageDocs.js";

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

  it("renderWelcomeHtm falls back even when a base welcome.htm was fetched (nothing authored yet)", () => {
    expect(renderWelcomeHtm(baseInput(), "<html><body>base</body></html>")).toBe(
      welcomeHtm("Piaroa"),
    );
  });

  it("renderHelpPhp is byte-identical to today's scaffolder stub when answers is null", () => {
    expect(renderHelpPhp(baseInput(), null)).toBe("<?php /* Piaroa help */ ?>");
  });

  it("renderHelpPhp defuses a PHP comment terminator in the display name, same as the scaffolder stub", () => {
    const input = baseInput({ displayName: "A*/B" });
    expect(renderHelpPhp(input, null)).toBe("<?php /* A* /B help */ ?>");
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

  it("does not merge when the author has no description yet (nothing to merge)", () => {
    const rendered = renderWelcomeHtm(baseInput(), baseWelcome);
    expect(rendered).toBe(welcomeHtm("Piaroa"));
    expect(rendered).not.toContain("Hand-authored");
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
  const stripDoc = (html: string): string =>
    html.replace(/^<html[^>]*><body>/, "").replace(/<\/body><\/html>$/, "");

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
