import { describe, expect, it } from "vitest";
import {
  DOC_GENERATED_END,
  DOC_GENERATED_START,
  DOC_SLOT_IDS,
  escapeDocHtml,
  escapeDocMarkdown,
  stripGeneratedBlocks,
} from "./docSlots.js";

describe("stripGeneratedBlocks", () => {
  it("removes every marked block and leaves the other prose byte-identical", () => {
    const prose = [
      "<html><body><p>Original</p>",
      DOC_GENERATED_START,
      "<h2>Old</h2>",
      DOC_GENERATED_END,
      "<p>Middle</p>",
      DOC_GENERATED_START,
      "<h2>Older</h2>",
      DOC_GENERATED_END,
      "</body></html>",
    ].join("\n");
    expect(stripGeneratedBlocks(prose)).toBe("<html><body><p>Original</p>\n<p>Middle</p>\n</body></html>");
  });

  it("removes the legacy additions tail up to </body>", () => {
    const prose =
      "<html><body><p>Original</p><!-- Keyboard Studio additions -->\n<h2>Keyboard Studio Additions</h2>\n<p>x</p>\n</body></html>";
    expect(stripGeneratedBlocks(prose)).toBe("<html><body><p>Original</p></body></html>");
  });

  it("leaves prose with no generated block untouched", () => {
    const prose = "<p>a & b</p>\r\n<ul><li>x</li></ul>";
    expect(stripGeneratedBlocks(prose)).toBe(prose);
  });

  it("keeps an unterminated start marker rather than eating the rest of the page", () => {
    const prose = `<p>a</p>${DOC_GENERATED_START}<p>b</p>`;
    expect(stripGeneratedBlocks(prose)).toBe(prose);
  });
});

describe("escapers", () => {
  it("escapeDocHtml escapes <, & and quotes", () => {
    expect(escapeDocHtml(`<b> & "q" 'a'`)).toBe("&lt;b&gt; &amp; &quot;q&quot; &#39;a&#39;");
  });

  it("escapeDocMarkdown escapes Markdown metacharacters and a leading #", () => {
    expect(escapeDocMarkdown("a *b* _c_ [d](e) `f` <g> \\")).toBe(
      "a \\*b\\* \\_c\\_ \\[d\\](e) \\`f\\` \\<g\\> \\\\",
    );
    expect(escapeDocMarkdown("# not a heading\nplain #tag")).toBe("\\# not a heading\nplain #tag");
  });
});

describe("DOC_SLOT_IDS", () => {
  it("holds each slot id once", () => {
    expect(new Set(DOC_SLOT_IDS).size).toBe(DOC_SLOT_IDS.length);
    expect(DOC_SLOT_IDS).toContain("typingGuide");
    expect(DOC_SLOT_IDS).toContain("version");
  });
});
