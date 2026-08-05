// Bundle-safety invariant for the co-located Vercel functions.
//
// WHY THIS EXISTS
//
// /api is deliberately outside the pnpm workspace (see api/vitest.config.ts),
// but its modules reach into `utilities/oauth-backend/src` by relative path to
// reuse the tested token-exchange core. That makes every module in that reachable
// set part of a serverless FUNCTION BUNDLE, not part of a workspace build — and
// the two have different resolution rules.
//
// A workspace package (`@keyboard-studio/*`) is published to consumers through
// its built `dist/` entry, and its runtime graph may load checked-in data from
// SIBLING directories outside that entry — `@keyboard-studio/contracts` re-exports
// data modules that `import ... with { type: "json" }` from
// `packages/contracts/data/`. Those paths do not survive being traced into a
// function bundle. Because the failure happens at ESM MODULE LOAD, the handler
// never executes: the route returns a platform-level FUNCTION_INVOCATION_FAILED
// with a text/plain body instead of any JSON error the handler could have
// produced. Every endpoint 500s at once and sign-in dies with no usable
// diagnostic. That regression shipped once and was not caught by any test.
//
// Ordinary registry dependencies (zod, @octokit/auth-app) are NOT the hazard and
// are not flagged here: they are self-contained inside node_modules and have
// always bundled correctly. The invariant is specifically about workspace
// packages, which is why this asserts on the `@keyboard-studio/*` scope.
//
// TYPE-ONLY IMPORTS ARE FINE. `import type { X } from "@keyboard-studio/contracts"`
// is erased before bundling and costs the function nothing. Only value imports
// are violations — which is what lets the shared wire contract still be enforced
// at compile time (see the drift guard in utilities/oauth-backend/src/schemas.ts).

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(API_DIR, "..");

/** Every deployed function entry, per the `rewrites` table in vercel.json. */
const FUNCTION_ENTRIES = [
  "api/oauth/exchange.ts",
  "api/oauth/refresh.ts",
  "api/oauth/health.ts",
  "api/oauth/google/exchange.ts",
  "api/drafts/index.ts",
  "api/drafts/content.ts",
  "api/submit/managed-pr.ts",
  "api/submit/managed-pr-selftest.ts",
];

/** The scope whose packages are workspace builds rather than registry tarballs. */
const WORKSPACE_SCOPE = "@keyboard-studio/";

interface ImportRef {
  specifier: string;
  /** Repo-relative path of the file containing the import. */
  importer: string;
}

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
  const bindings = named[1]
    .split(",")
    .map((b) => b.trim())
    .filter((b) => b !== "");
  return bindings.length > 0 && bindings.every((b) => /^type[ \t]/.test(b));
}

/** Resolve a relative specifier to an on-disk .ts file, honouring `.js` → `.ts`. */
function resolveRelative(fromFile: string, specifier: string): string | null {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base.replace(/\.js$/, ".ts"),
    base,
    `${base}.ts`,
    `${base}/index.ts`,
  ];
  return candidates.find((c) => c.endsWith(".ts") && existsSync(c)) ?? null;
}

/**
 * Walk the transitive relative-import graph from the given entries and collect
 * every value-level bare specifier, with the file that imports it.
 */
function collectValueImports(entries: string[]): {
  modules: Set<string>;
  refs: ImportRef[];
} {
  const modules = new Set<string>();
  const refs: ImportRef[] = [];
  const queue = entries.map((e) => resolve(REPO_ROOT, e));

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (modules.has(file) || !existsSync(file)) continue;
    modules.add(file);

    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT_RE)) {
      const { typeKeyword, clause, specifier } = match.groups as {
        typeKeyword?: string;
        clause: string;
        specifier: string;
      };

      if (specifier.startsWith(".")) {
        const next = resolveRelative(file, specifier);
        if (next !== null) queue.push(next);
        continue;
      }
      if (isTypeOnly(typeKeyword, clause)) continue;
      refs.push({ specifier, importer: relative(REPO_ROOT, file) });
    }
  }
  return { modules, refs };
}

describe("api function bundles", () => {
  it("every entry named in vercel.json exists on disk", () => {
    const missing = FUNCTION_ENTRIES.filter(
      (e) => !existsSync(resolve(REPO_ROOT, e)),
    );
    expect(missing).toEqual([]);
  });

  it("traverses a non-trivial module graph (guards against a vacuous pass)", () => {
    const { modules } = collectValueImports(FUNCTION_ENTRIES);
    // The graph reaches api/* plus the oauth-backend core it reuses. If a
    // refactor makes this collapse, the invariant below stops meaning anything.
    expect(modules.size).toBeGreaterThan(10);
  });

  it("imports no workspace package as a value", () => {
    const { refs } = collectValueImports(FUNCTION_ENTRIES);
    const violations = refs
      .filter((r) => r.specifier.startsWith(WORKSPACE_SCOPE))
      .map((r) => `${r.importer} imports ${r.specifier} as a value`);

    // A failure here means a serverless function will crash at module load and
    // return FUNCTION_INVOCATION_FAILED for every request. Fix it by making the
    // import `import type`, or by copying the needed literal locally behind a
    // compile-time drift guard — see utilities/oauth-backend/src/schemas.ts.
    expect(violations).toEqual([]);
  });
});
