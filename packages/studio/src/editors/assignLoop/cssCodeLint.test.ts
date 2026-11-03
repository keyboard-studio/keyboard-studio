/**
 * Tests for cssCodeLint — CSS syntax validation.
 */

import { describe, expect, it } from "vitest";
import { lintCssText } from "./cssCodeLint.ts";

describe("lintCssText", () => {
  it("returns no markers for valid CSS", () => {
    const css = `.kmw-key { background: red; color: white; }`;
    expect(lintCssText(css)).toEqual([]);
  });

  it("returns no markers for empty CSS", () => {
    expect(lintCssText("")).toEqual([]);
    expect(lintCssText("   ")).toEqual([]);
  });

  it("detects unclosed braces", () => {
    const css = `.kmw-key { background: red;`;
    const markers = lintCssText(css);
    expect(markers.length).toBeGreaterThan(0);
    expect(markers[0]?.severity).toBe("error");
    expect(markers[0]?.message).toContain("Unclosed");
  });

  it("detects unmatched closing braces", () => {
    const css = `.kmw-key { background: red; } }`;
    const markers = lintCssText(css);
    expect(markers.length).toBeGreaterThan(0);
    expect(markers[0]?.severity).toBe("error");
    expect(markers[0]?.message).toContain("Unmatched");
  });

  it("detects mismatched brackets", () => {
    const css = `.kmw-key { background: red; ]`;
    const markers = lintCssText(css);
    expect(markers.length).toBeGreaterThan(0);
    expect(markers[0]?.severity).toBe("error");
  });

  it("ignores brackets inside strings", () => {
    const css = `.kmw-key::after { content: "{"; }`;
    expect(lintCssText(css)).toEqual([]);
  });

  it("ignores brackets inside comments", () => {
    const css = `/* { */ .kmw-key { color: red; }`;
    expect(lintCssText(css)).toEqual([]);
  });

  it("detects unterminated strings", () => {
    const css = `.kmw-key::after { content: "unclosed; }`;
    const markers = lintCssText(css);
    expect(markers.some((m) => m.message.includes("Unterminated string"))).toBe(true);
  });

  it("detects unterminated comments", () => {
    const css = `/* unclosed comment .kmw-key { color: red; }`;
    const markers = lintCssText(css);
    expect(markers.some((m) => m.message.includes("Unterminated comment"))).toBe(true);
  });

  it("handles nested rules", () => {
    const css = `@media (max-width: 600px) { .kmw-key { font-size: 12px; } }`;
    expect(lintCssText(css)).toEqual([]);
  });
});
