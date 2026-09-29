// Breakpoint drift guard (mobile adaptation, Phase 0).
//
// CSS custom properties cannot drive media-query conditions, so the px
// values in index.css's @media rules are restated by hand — each restatement
// cites its BREAKPOINTS entry in a comment. This test keeps the two in sync:
// every `@media (max-width: NNNpx)` in index.css must equal a BREAKPOINTS
// width, so a breakpoint change that forgets the CSS fails here instead of
// silently splitting the narrow-viewport behavior in two.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BREAKPOINTS } from "./breakpoints.ts";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "..", "index.css"), "utf8");

describe("breakpoints — CSS/TS drift guard", () => {
  it("every max-width media query in index.css matches a BREAKPOINTS width", () => {
    const widths = new Set<number>(Object.values(BREAKPOINTS));
    const found: number[] = [];
    const re = /@media\s*\(\s*max-width:\s*(\d+)px\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css)) !== null) {
      found.push(Number(m[1]));
    }
    expect(found.length).toBeGreaterThan(0);
    for (const px of found) {
      expect(
        widths.has(px),
        `@media (max-width: ${px}px) in index.css has no matching BREAKPOINTS entry — update one or the other`,
      ).toBe(true);
    }
  });
});
