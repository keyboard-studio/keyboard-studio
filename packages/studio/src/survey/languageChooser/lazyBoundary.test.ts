// Spec 115 T028 (FR-037, G2): the language chooser, EthnoLib's search and its
// embedded data (about 770 KB gzipped, not tree-shakeable) load with the language
// step, never on first page load. Walks the STATIC import graph from the app's
// entry module (dynamic `import()` is a chunk boundary and is not followed) and
// asserts it never reaches `@ethnolib/find-language`, the chooser, or the Glottolog
// dialect rows. The real chunk split is checked by the studio build (see the
// phase checkpoint); this guards the cause, in a unit test that runs in seconds.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENTRY = join(SRC, "main.tsx");

// `import x from "m"`, `import "m"`, `export ... from "m"`; type-only forms are erased.
const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/g;

function resolveRelative(from: string, spec: string): string | undefined {
  const base = resolve(dirname(from), spec);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
  return candidates.find((c) => existsSync(c) && /\.(ts|tsx)$/.test(c));
}

function staticGraph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const m of text.matchAll(STATIC_IMPORT)) {
      const spec = m[1]!;
      if (spec.startsWith(".")) {
        const next = resolveRelative(file, spec);
        if (next !== undefined) stack.push(next);
      } else {
        packages.add(spec);
      }
    }
  }
  return { files, packages };
}

describe("the language chooser stays behind a dynamic import (FR-037)", () => {
  const { files, packages } = staticGraph(ENTRY);
  const rel = (f: string): string => f.slice(SRC.length + 1).replace(/\\/g, "/");

  it("walked a real graph", () => {
    expect(files.size).toBeGreaterThan(100);
    expect(files.has(join(SRC, "survey", "QuestionField.tsx")) || [...files].some((f) => rel(f).startsWith("survey/"))).toBe(true);
  });

  it("control: the walker does see @ethnolib/find-language from the chooser itself", () => {
    const chooser = staticGraph(join(SRC, "survey", "languageChooser", "LanguageChooser.tsx"));
    expect(chooser.packages.has("@ethnolib/find-language")).toBe(true);
  });

  it("the entry chunk's static imports never reach @ethnolib/find-language", () => {
    expect([...packages].filter((p) => p.startsWith("@ethnolib/"))).toEqual([]);
  });

  it("nor the chooser, its search environment or the vendored hook", () => {
    expect([...files].map(rel).filter((f) => f.startsWith("survey/languageChooser/"))).toEqual([]);
  });

  it("nor the Glottolog dialect rows", () => {
    expect([...packages].filter((p) => p === "@keyboard-studio/glottolog/dialects")).toEqual([]);
  });

  it("the chooser is imported dynamically by the language field", () => {
    const field = readFileSync(join(SRC, "survey", "QuestionField.tsx"), "utf8");
    expect(field).toMatch(/import\(\s*["']\.\/languageChooser\/LanguageChooser\.tsx["']\s*\)/);
  });
});
