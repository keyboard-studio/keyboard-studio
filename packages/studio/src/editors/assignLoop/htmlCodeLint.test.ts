/**
 * Tests for htmlCodeLint — HTML validation.
 */

import { describe, expect, it } from "vitest";
import { lintHtmlText } from "./htmlCodeLint.ts";

const VALID_DOC = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body><h1>Hello</h1><p>World</p></body>
</html>
`;

describe("lintHtmlText", () => {
  it("returns no markers for a valid HTML document", () => {
    expect(lintHtmlText(VALID_DOC)).toEqual([]);
  });

  it("returns no markers for empty text", () => {
    expect(lintHtmlText("")).toEqual([]);
    expect(lintHtmlText("   ")).toEqual([]);
  });

  it("detects unclosed tags", () => {
    const markers = lintHtmlText("<!DOCTYPE html><html><head></head><body><p>oops</body></html>");
    expect(markers.some((m) => m.message.includes("Unclosed tag <p>"))).toBe(true);
    expect(markers.find((m) => m.message.includes("Unclosed tag"))?.severity).toBe("error");
  });

  it("reports the unclosed tag at its open position", () => {
    const markers = lintHtmlText("<!DOCTYPE html>\n<html>\n<head></head>\n<body>\n<div>\n</body>\n</html>");
    const unclosed = markers.find((m) => m.message.includes("Unclosed tag <div>"));
    expect(unclosed).toBeDefined();
    expect(unclosed?.line).toBe(5);
  });

  it("detects unexpected closing tags", () => {
    const markers = lintHtmlText("<!DOCTYPE html><html><head></head><body></p></body></html>");
    expect(markers.some((m) => m.message.includes("Unexpected closing tag </p>"))).toBe(true);
    expect(markers.find((m) => m.message.includes("Unexpected closing"))?.severity).toBe("error");
  });

  it("detects mismatched nesting", () => {
    // </b> closes <b>, leaving <i> unclosed
    const markers = lintHtmlText("<!DOCTYPE html><html><head></head><body><b><i>text</b></i></body></html>");
    expect(markers.some((m) => m.message.includes("Unclosed tag <i>"))).toBe(true);
  });

  it("accepts void elements without closing tags", () => {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>T</title></head>
<body><p>Line<br>break</p><img src="x.png" alt="x"><hr></body>
</html>
`;
    expect(lintHtmlText(html)).toEqual([]);
  });

  it("accepts self-closing tags", () => {
    const html = `<!DOCTYPE html>
<html><head><title>T</title></head><body><div><span/></div></body></html>`;
    expect(lintHtmlText(html)).toEqual([]);
  });

  it("ignores comments", () => {
    const html = `<!DOCTYPE html>
<html><head><title>T</title></head><body><!-- <p>not a tag</p> --><p>real</p></body></html>`;
    expect(lintHtmlText(html)).toEqual([]);
  });

  it("warns on missing doctype", () => {
    const markers = lintHtmlText("<html><head><title>T</title></head><body><p>x</p></body></html>");
    const w = markers.find((m) => m.message.includes("<!DOCTYPE html>"));
    expect(w).toBeDefined();
    expect(w?.severity).toBe("warning");
  });

  it("warns on missing html/head/body structure", () => {
    const markers = lintHtmlText("<!DOCTYPE html><p>just a paragraph</p>");
    expect(markers.some((m) => m.message === "Missing <html> element")).toBe(true);
    expect(markers.some((m) => m.message === "Missing <head> element")).toBe(true);
    expect(markers.some((m) => m.message === "Missing <body> element")).toBe(true);
    expect(markers.every((m) => m.severity === "warning")).toBe(true);
  });

  it("accepts tags with attributes", () => {
    const html = `<!DOCTYPE html>
<html lang="en"><head><title>T</title></head><body class="main"><a href="https://example.com" target="_blank">link</a></body></html>`;
    expect(lintHtmlText(html)).toEqual([]);
  });

  it("is case-insensitive for tag names and doctype", () => {
    const html = `<!doctype HTML>
<HTML><HEAD><TITLE>T</TITLE></HEAD><BODY><P>x</P></BODY></HTML>`;
    expect(lintHtmlText(html)).toEqual([]);
  });
});
