// SC-004 guard (spec 117 T055): the Layout tab has one write spine. A static scan of the Layout
// tab, the kmn-edits module, and the commitKmnEdit path fails on a text write path (kmnFragment,
// parseKmn in a write path), a timer (decision D3), or a compile-service import.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../..");

function layoutFiles(): string[] {
  return readdirSync(here)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f))
    .map((f) => join(here, f));
}

/** The commitKmnEdit path inside the working-copy store, from its section banner to the next one. */
function commitPathSource(): string {
  const store = readFileSync(join(src, "stores/workingCopyStore.ts"), "utf-8");
  const start = store.indexOf("// Layout-tab edits (spec 117, research R12)");
  const end = store.indexOf("export const useWorkingCopyStore");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return store.slice(start, end);
}

const targets: Array<{ name: string; text: string }> = [
  ...layoutFiles().map((f) => ({ name: f, text: readFileSync(f, "utf-8") })),
  {
    name: "survey/questions/gallery/kmnEdits.ts",
    text: readFileSync(join(src, "survey/questions/gallery/kmnEdits.ts"), "utf-8"),
  },
  { name: "workingCopyStore commitKmnEdit path", text: commitPathSource() },
];

/** Comments are prose, not code. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const FORBIDDEN: Array<[string, RegExp]> = [
  ["a kmnFragment write", /kmnFragment/],
  ["parseKmn in a write path", /\bparseKmn\s*\(/],
  ["a timer", /\b(setTimeout|setInterval)\s*\(/],
  ["a compile-service import", /from\s+["'][^"']*(compiler|compile)[^"']*["']/i],
  ["a compile call", /\bcompileKeyboard\s*\(|\bcompileKmn\s*\(/],
];

describe("Layout tab: one write spine (SC-004)", () => {
  it("scans the Layout tab sources, not an empty set", () => {
    expect(targets.length).toBeGreaterThan(8);
  });

  for (const { name, text } of targets) {
    for (const [what, pattern] of FORBIDDEN) {
      it(`${name.replace(/^.*keyboard-studio-layoutstudio[\/]/, "")} has no ${what}`, () => {
        // The planted-violation self-test below proves each pattern can fail.
        expect(code(text)).not.toMatch(pattern);
      });
    }
  }

  it("self-test: every pattern fires on a planted violation", () => {
    const planted = [
      "node.kmnFragment = x;",
      "const ir = parseKmn(text);",
      "setTimeout(() => 1, 5);",
      'import { x } from "../../lib/compileService.ts";',
      "compileKeyboard(ir);",
    ].join("\n");
    for (const [what, pattern] of FORBIDDEN) expect(planted, what).toMatch(pattern);
  });
});
