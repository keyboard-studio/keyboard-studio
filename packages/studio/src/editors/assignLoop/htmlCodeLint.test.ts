/**
 * Tests for htmlCodeLint — Markdown validation.
 */

import { describe, expect, it } from "vitest";
import { lintHtmlText } from "./htmlCodeLint.ts";

describe("lintHtmlText", () => {
  it("returns no markers for valid Markdown", () => {
    const md = `# Title\n\nSome **bold** text and a [link](https://example.com).\n`;
    expect(lintHtmlText(md)).toEqual([]);
  });

  it("returns no markers for empty text", () => {
    expect(lintHtmlText("")).toEqual([]);
    expect(lintHtmlText("   ")).toEqual([]);
  });

  it("detects unclosed code fences", () => {
    const md = `# Title\n\n\`\`\`\ncode here\n`;
    const markers = lintHtmlText(md);
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.some((m) => m.message.includes("Unclosed code fence"))).toBe(true);
    expect(markers[0]?.severity).toBe("error");
  });

  it("accepts balanced code fences", () => {
    const md = `# Title\n\n\`\`\`\ncode here\n\`\`\`\n`;
    expect(lintHtmlText(md)).toEqual([]);
  });

  it("accepts tilde fences", () => {
    const md = `~~~\ncode\n~~~\n`;
    expect(lintHtmlText(md)).toEqual([]);
  });

  it("warns on heading level skips", () => {
    const md = `# Title\n\n### Skipped\n`;
    const markers = lintHtmlText(md);
    expect(markers.some((m) => m.message.includes("Heading level skipped"))).toBe(true);
    expect(markers[0]?.severity).toBe("warning");
  });

  it("accepts sequential heading levels", () => {
    const md = `# Title\n\n## Section\n\n### Subsection\n`;
    expect(lintHtmlText(md)).toEqual([]);
  });

  it("warns on unbalanced inline code", () => {
    const md = `Some \`unclosed code here.\n`;
    const markers = lintHtmlText(md);
    expect(markers.some((m) => m.message.includes("Unbalanced inline code"))).toBe(true);
  });

  it("accepts balanced inline code", () => {
    const md = "Some `code` here.\n";
    expect(lintHtmlText(md)).toEqual([]);
  });

  it("warns on unclosed link brackets", () => {
    const md = `See [the docs for more.\n`;
    const markers = lintHtmlText(md);
    expect(markers.some((m) => m.message.includes("Unclosed link bracket"))).toBe(true);
  });

  it("warns on images without alt text", () => {
    const md = `![](image.png)\n`;
    const markers = lintHtmlText(md);
    expect(markers.some((m) => m.message.includes("without alt text"))).toBe(true);
  });

  it("accepts images with alt text", () => {
    const md = `![A keyboard](image.png)\n`;
    expect(lintHtmlText(md)).toEqual([]);
  });

  it("ignores brackets inside code fences", () => {
    const md = "```\n[not a link\n```\n";
    expect(lintHtmlText(md)).toEqual([]);
  });
});
