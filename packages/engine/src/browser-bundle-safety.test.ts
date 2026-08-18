// Browser-bundle-safety invariant for the engine package's public barrel
// (`src/index.ts`).
//
// WHY THIS EXISTS (spec 062 regression)
//
// `packages/studio` imports `@keyboard-studio/engine` for its browser-run
// client bundle (Rollup, via Vite). Rollup resolves every module a static
// `import`/`export ... from` statement reaches — including named-export
// re-exports nobody actually calls — BEFORE it tree-shakes unused exports
// away. So a barrel file only needs one stray `export { x } from "./y.js"`
// line, where `y.ts` transitively imports a Node builtin, to break the
// studio build: Rollup fails to resolve that Node-only chain's own
// unresolvable specifiers (e.g. a vendored module whose import only
// resolves via a `tsconfig.json` `paths` alias tsc reads but Vite never
// does), well before "is this export used" is even asked.
//
// This shipped once: `facet-transform/migrations/index.ts` re-exported
// `createContextToleranceMigrationRule` from `context-tolerance.ts`, which
// imports `pattern-apply/context-variants.ts`, which imports
// `simulator/index.ts` — a Node-`vm`-sandbox module ("Designed for
// Node/vitest use only", per its own doc) — even though every real caller
// already imports that function via the deep path
// `facet-transform/migrations/context-tolerance.js`, never through the
// barrel. Nothing caught it until the studio's CI `build` step failed.
//
// This test walks the same static import graph Rollup would, starting from
// `index.ts`, and fails if any *value* import (never `import type`, which is
// erased and always safe) reachable from it is a Node builtin (`node:*`).
// It only follows this package's own relative imports — bare specifiers
// (`@keyboard-studio/*`, `zod`, etc.) are registry/workspace dependencies
// with their own resolution story and are out of scope here.

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(SRC_DIR, "index.ts");

const IMPORT_RE =
  /(?:^|\n)[ \t]*(?<kind>import|export)[ \t]+(?<typeKeyword>type[ \t]+)?(?<clause>[\s\S]*?)from[ \t]*["'](?<specifier>[^"']+)["']/g;

/**
 * True when the whole statement is erased at compile time — either
 * `import type { X }` or a clause whose every named binding is `type`-prefixed.
 * A mixed clause (`{ type A, B }`) keeps a runtime edge and is NOT type-only.
 */
function isTypeOnly(typeKeyword: string | undefined, clause: string): boolean {
  if (typeKeyword !== undefined) return true;
  const named = clause.match(/\{([\s\S]*)\}/);
  if (named === null) return false;
  const bindings = named[1]!
    .split(",")
    .map((b) => b.trim())
    .filter((b) => b !== "");
  return bindings.length > 0 && bindings.every((b) => /^type[ \t]/.test(b));
}

/** Resolve a relative specifier (always written with an explicit `.js` suffix
 * in this codebase's TS source) against its importing file's directory. */
function resolveRelativeSpecifier(importerFile: string, specifier: string): string {
  const resolved = resolve(dirname(importerFile), specifier);
  return resolved.endsWith(".js") ? resolved.slice(0, -3) + ".ts" : resolved;
}

interface Violation {
  file: string;
  specifier: string;
}

describe("engine index.ts stays reachable-safe for the studio browser bundle (spec 062 regression)", () => {
  // Walks every file transitively reachable from the barrel with synchronous
  // reads — hundreds of files under contention from the rest of the suite,
  // well past vitest's 5s default under load.
  it("never statically reaches a Node-builtin (node:*) value import from the public barrel", () => {
    const visited = new Set<string>();
    const queue: string[] = [ENTRY];
    const violations: Violation[] = [];

    while (queue.length > 0) {
      const file = queue.shift()!;
      if (visited.has(file) || !existsSync(file)) continue;
      visited.add(file);

      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(IMPORT_RE)) {
        const { typeKeyword, clause, specifier } = match.groups as {
          typeKeyword: string | undefined;
          clause: string;
          specifier: string;
        };
        if (isTypeOnly(typeKeyword, clause)) continue;

        if (specifier.startsWith("node:")) {
          violations.push({ file: relative(SRC_DIR, file), specifier });
          continue;
        }
        if (specifier.startsWith(".")) {
          const resolved = resolveRelativeSpecifier(file, specifier);
          if (!visited.has(resolved)) queue.push(resolved);
        }
        // Bare package specifiers are registry/workspace dependencies with
        // their own resolution story — out of scope for this package-internal
        // reachability walk.
      }
    }

    expect(violations).toEqual([]);
  }, 30000);
});
