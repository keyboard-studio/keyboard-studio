// Themed input placeholders (issue #1985).
//
// Before this fix no stylesheet set ::placeholder, so every input fell back
// to Chrome's fixed #757575 default grey — visibly dim on navy, but on light
// nearly as dark as label text, so an empty field (e.g. the rule builder's
// "Bundle name") read as filled in.
//
// This pins the three acceptance criteria:
//   1. a global ::placeholder rule paints var(--app-placeholder), defined in
//      both themes and meeting WCAG 1.4.3 (4.5:1) on every theme surface
//      while staying visibly dimmer than typed input text;
//   2. (follows from 1) the empty Bundle name field reads as empty;
//   3. the rule-builder placeholder is marked as an example ("e.g. ..."),
//      not a fixed name that reads as a suggestion.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const colorsCss = readFileSync(resolve(SRC_ROOT, "styles/colors.css"), "utf8");
const indexCss = readFileSync(resolve(SRC_ROOT, "index.css"), "utf8");
const enCatalog = JSON.parse(
  readFileSync(resolve(SRC_ROOT, "locales/en/messages.json"), "utf8"),
) as Record<string, string>;

/** Extract the declaration block of a top-level selector (no nested braces). */
function block(css: string, selector: RegExp): string {
  const m = selector.exec(css);
  expect(m, `expected ${selector} block in stylesheet`).toBeTruthy();
  return m![1];
}

/** Read a --token value (hex) out of a declaration block. */
function token(blockText: string, name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(blockText);
  expect(m, `expected ${name} in theme block`).toBeTruthy();
  return m![1].toUpperCase();
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i + 1, i + 3), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT = {
  name: "light",
  block: block(colorsCss, /:root\s*{([^}]*)}/),
  surfaces: { page: "#F3F5F7", surface: "#FFFFFF", surface2: "#F8FAFB" },
  inputText: "#18242E", // --app-text
};
const NAVY = {
  name: "navy",
  block: block(colorsCss, /\.sil-app\[data-theme="navy"\]\s*{([^}]*)}/),
  surfaces: { page: "#18243F", surface: "#1F2C49", surface2: "#27365A" },
  inputText: "#EAF1FB", // --app-text
};

describe("themed ::placeholder (issue #1985)", () => {
  it("defines --app-placeholder in both themes", () => {
    expect(token(LIGHT.block, "--app-placeholder")).toMatch(/^#[0-9A-F]{6}$/);
    expect(token(NAVY.block, "--app-placeholder")).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("sets a global ::placeholder rule on the placeholder token with full opacity", () => {
    const rules = indexCss.split("}").filter(chunk => chunk.includes("::placeholder"));
    expect(rules.length).toBeGreaterThan(0);
    const rule = rules.join(" ");
    // Covers both input and textarea selectors in the shared rule.
    expect(rule).toContain("input::placeholder");
    expect(rule).toContain("textarea::placeholder");
    expect(rule).toMatch(/color:\s*var\(--app-placeholder\)/);
    // Firefox dims placeholders to 0.54 opacity by default; the token value
    // must be what renders on every engine.
    expect(rule).toMatch(/opacity:\s*1/);
  });

  for (const theme of [LIGHT, NAVY]) {
    it(`${theme.name}: placeholder clears WCAG 1.4.3 (4.5:1) on every theme surface`, () => {
      const placeholder = token(theme.block, "--app-placeholder");
      for (const [surfaceName, bg] of Object.entries(theme.surfaces)) {
        const ratio = contrast(placeholder, bg);
        expect(
          ratio,
          `${theme.name} placeholder ${placeholder} on ${surfaceName} ${bg}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${theme.name}: placeholder is visibly dimmer than typed input text`, () => {
      const placeholder = token(theme.block, "--app-placeholder");
      for (const [surfaceName, bg] of Object.entries(theme.surfaces)) {
        expect(
          contrast(placeholder, bg),
          `${theme.name} placeholder vs input text on ${surfaceName}`,
        ).toBeLessThan(contrast(theme.inputText, bg));
      }
    });
  }

  it("marks the bundle-name placeholder as an example, not a suggested name", () => {
    const placeholder = enCatalog["ruleBuilder.name.placeholder"];
    expect(placeholder).toBeTruthy();
    expect(placeholder.startsWith("e.g.")).toBe(true);
    // Still carries a concrete example after the marker.
    expect(placeholder.length).toBeGreaterThan("e.g. ".length);
  });
});
