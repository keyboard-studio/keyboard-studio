// Bundle-safety invariant for the context-tolerance engine subpath (spec 078).
//
// WHY THIS EXISTS
//
// The studio lazy-imports `@keyboard-studio/engine/context-tolerance` into its
// browser bundle. That subpath reaches the headless simulator and its vendored
// Keyman engine, which until spec 078 was Node-only in two ways: it loaded
// keyboards through `node:vm`, and the vendored sources addressed each other by
// bare specifiers (`keyman/engine/keyboard`, `@keymanapp/keyman-version`, …)
// that only a tsconfig `paths` alias or a vitest alias could resolve. tsc
// copies such specifiers into `dist/` verbatim, so Vite's production build
// either fails to resolve them or ships a chunk that throws at load.
//
// The studio consumes the engine through its emitted `dist/`, so this test
// walks exactly what Rollup would walk: the static import graph of the emitted
// JS, starting at each package entry the studio imports, following relative
// specifiers. Modelled on api/bundle-safety.test.ts.
//
// It asserts:
//   - nothing reachable from the subpath imports `node:vm`;
//   - nothing reachable from the subpath or the root entry names an
//     alias-only vendored specifier;
//   - the root `@keyboard-studio/engine` entry reaches no simulator code, so
//     the main chunk does not grow the simulator.

import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ENGINE_DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../../engine/dist");
const SUBPATH_ENTRY = resolve(ENGINE_DIST, "context-tolerance/index.js");
const ROOT_ENTRY = resolve(ENGINE_DIST, "index.js");

// Static `import … from "x"`, `export … from "x"`, bare `import "x"`, and
// dynamic `import("x")` with a literal specifier.
const SPECIFIER_RE =
  /(?:^|[\s;])(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

const ALIAS_ONLY_RE = /^(?:keyman\/(?:engine|common)\/|@keymanapp\/(?:keyman-version|common-types)$)/;

interface Graph {
  files: Set<string>;
  bare: { file: string; specifier: string }[];
}

function walk(entry: string): Graph {
  const files = new Set<string>();
  const bare: Graph["bare"] = [];
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    const text = readFileSync(file, "utf-8");
    for (const m of text.matchAll(SPECIFIER_RE)) {
      const specifier = m[1] ?? m[2]!;
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(file), specifier);
        // JSON data modules (`with { type: "json" }`) are leaves.
        if (target.endsWith(".js") && existsSync(target)) queue.push(target);
      } else {
        bare.push({ file: relative(ENGINE_DIST, file), specifier });
      }
    }
  }
  return { files, bare };
}

describe("context-tolerance subpath is safe for the studio browser bundle (spec 078)", () => {
  it.skipIf(!existsSync(SUBPATH_ENTRY))("the subpath never reaches node:vm", () => {
    const { bare } = walk(SUBPATH_ENTRY);
    expect(bare.filter((b) => b.specifier === "node:vm" || b.specifier === "vm")).toEqual([]);
  });

  it.skipIf(!existsSync(SUBPATH_ENTRY))("the subpath names no alias-only vendored specifier", () => {
    const { bare } = walk(SUBPATH_ENTRY);
    expect(bare.filter((b) => ALIAS_ONLY_RE.test(b.specifier))).toEqual([]);
  });

  it.skipIf(!existsSync(SUBPATH_ENTRY))("the subpath does reach the simulator (the walk is not vacuous)", () => {
    const { files } = walk(SUBPATH_ENTRY);
    const rel = [...files].map((f) => relative(ENGINE_DIST, f).replaceAll("\\", "/"));
    expect(rel).toContain("simulator/index.js");
    expect(rel).toContain("simulator/browserKeyboardLoader.js");
    expect(rel).not.toContain("simulator/nodeKeyboardLoader.js");
  });

  it.skipIf(!existsSync(ROOT_ENTRY))("the root engine entry reaches no simulator code", () => {
    const { files, bare } = walk(ROOT_ENTRY);
    const simulatorFiles = [...files]
      .map((f) => relative(ENGINE_DIST, f).replaceAll("\\", "/"))
      .filter((f) => f.startsWith("simulator/"));
    expect(simulatorFiles).toEqual([]);
    expect(bare.filter((b) => ALIAS_ONLY_RE.test(b.specifier))).toEqual([]);
  });
});
