// Self-containment gate for the crash module (spec 060, FR-013 / FR-132).
//
// WHY THIS EXISTS
//
// The crash reporter must survive what it reports. One of the crash classes it
// exists to file is "the lazy @keyboard-studio/engine chunk failed to load" —
// so if the reporter's own module graph reaches the engine, the reporter goes
// down with the thing it was supposed to report and the bug is never filed.
//
// The hazard is TRANSITIVE, not direct. Nobody is going to write
// `import { compile } from "@keyboard-studio/engine"` inside src/crash/. What
// they will write is `import { useDecisionLogStore } from "../decisions/
// decisionLogStore.ts"` to grab the decision tail — and decisionLogStore.ts
// value-imports the engine at its line 37. One innocuous-looking relative
// import is all it takes. That is why this walks the whole reachable graph out
// of src/crash/ and into the rest of src/, rather than eyeballing the imports
// at the top of each crash file.
//
// The same reasoning forbids reusing `computeSha256Hex` from
// packages/engine/src/codec/hash.ts (FR-011): it is functionally identical to
// what src/crash/fingerprint.ts needs, and importing it would pull in the very
// package this gate exists to keep out. fingerprint.ts calls
// `crypto.subtle.digest("SHA-256", ...)` directly instead. This gate is what
// makes that duplication load-bearing rather than an oversight.
//
// Structural context (keyboard id, BCP47 tags, decision tail) is therefore read
// by the CALLER — src/crash/callerContext.ts and the surfaces that use it — and
// passed into the payload builder as plain data (FR-012, FR-042).
//
// DEMONSTRATED RED. Per FR-013, an assertion that has never failed is not
// evidence. This gate was run against a deliberately-violating fixture
// (a file under src/crash/ importing ../decisions/decisionLogStore.ts) and
// observed to fail, naming the full import path, before being trusted green.

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CRASH_DIR = dirname(fileURLToPath(import.meta.url));
const STUDIO_ROOT = resolve(CRASH_DIR, "../..");

/** The package this module's graph must never reach, directly or transitively. */
const FORBIDDEN_PACKAGE = "@keyboard-studio/engine";

/**
 * Extensions the walker resolves. `.tsx` matters as much as `.ts`: a crash
 * surface that pulled in a component would reach the engine through it, and a
 * `.ts`-only walker would silently skip that edge and pass vacuously.
 */
const EXTENSIONS = [".ts", ".tsx"];

const IMPORT_RE =
  /(?:^|\n)[ \t]*(?<kind>import|export)[ \t]+(?<typeKeyword>type[ \t]+)?(?<clause>[\s\S]*?)from[ \t]*["'](?<specifier>[^"']+)["']/g;

/** Bare side-effect imports (`import "./index.css"`) carry a real runtime edge. */
const SIDE_EFFECT_IMPORT_RE = /(?:^|\n)[ \t]*import[ \t]*["'](?<specifier>[^"']+)["']/g;

/** `import(` not preceded by a word char — i.e. a dynamic import, not `.import(`. */
const DYNAMIC_IMPORT_RE = /(?<![\w.$])import[ \t]*\(/g;

/**
 * True when the whole statement is erased at compile time — `import type { X }`
 * or a clause whose every named binding is `type`-prefixed. A mixed clause
 * (`{ type A, B }`) keeps a runtime edge and is NOT type-only.
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

/** Resolve a relative specifier to an on-disk source file, honouring `.js` → `.ts`/`.tsx`. */
function resolveRelative(fromFile: string, specifier: string): string | null {
  // Strip Vite query suffixes (`?raw`, `?lingui`) before resolving.
  const bare = specifier.replace(/\?.*$/, "");
  const base = resolve(dirname(fromFile), bare);
  const candidates = [
    ...EXTENSIONS.map((ext) => base.replace(/\.js$/, ext)),
    base,
    ...EXTENSIONS.map((ext) => `${base}${ext}`),
    ...EXTENSIONS.map((ext) => `${base}/index${ext}`),
  ];
  return (
    candidates.find(
      (c) => EXTENSIONS.some((ext) => c.endsWith(ext)) && existsSync(c),
    ) ?? null
  );
}

/** Every non-test source file directly under src/crash/ — the graph's entry points. */
function crashEntryPoints(): string[] {
  if (!existsSync(CRASH_DIR)) return [];
  return readdirSync(CRASH_DIR)
    .filter((name) => EXTENSIONS.some((ext) => name.endsWith(ext)))
    .filter((name) => !/\.test\.tsx?$/.test(name))
    .filter((name) => !/\.d\.ts$/.test(name))
    .map((name) => resolve(CRASH_DIR, name));
}

interface Violation {
  specifier: string;
  /** How the walker got here: entry point → … → importing file. */
  path: string[];
}

interface WalkResult {
  modules: Set<string>;
  violations: Violation[];
  dynamicImports: string[];
}

/**
 * Walk the transitive relative-import graph from the crash module's entry
 * points, recording every value-level edge into the forbidden package along
 * with the chain of files that reached it.
 */
function walkCrashGraph(entries: string[]): WalkResult {
  const modules = new Set<string>();
  const violations: Violation[] = [];
  const dynamicImports: string[] = [];
  const queue: Array<{ file: string; path: string[] }> = entries.map((file) => ({
    file,
    path: [relative(STUDIO_ROOT, file)],
  }));

  while (queue.length > 0) {
    const { file, path } = queue.pop() as { file: string; path: string[] };
    if (modules.has(file) || !existsSync(file)) continue;
    modules.add(file);

    const source = readFileSync(file, "utf8");

    // A dynamic import inside the crash module is its own violation: the whole
    // point is that the reporter is already resident when the crash happens.
    // (Only entry-point files are checked — a dynamic import elsewhere in src/
    // is ordinary code splitting and none of this gate's business.)
    if (entries.includes(file) && DYNAMIC_IMPORT_RE.test(source)) {
      dynamicImports.push(relative(STUDIO_ROOT, file));
    }
    DYNAMIC_IMPORT_RE.lastIndex = 0;

    const record = (specifier: string): void => {
      if (specifier === FORBIDDEN_PACKAGE || specifier.startsWith(`${FORBIDDEN_PACKAGE}/`)) {
        violations.push({ specifier, path });
      }
    };

    for (const match of source.matchAll(IMPORT_RE)) {
      const { typeKeyword, clause, specifier } = match.groups as {
        typeKeyword?: string;
        clause: string;
        specifier: string;
      };

      if (specifier.startsWith(".")) {
        const next = resolveRelative(file, specifier);
        if (next !== null) {
          queue.push({ file: next, path: [...path, relative(STUDIO_ROOT, next)] });
        }
        continue;
      }
      if (isTypeOnly(typeKeyword, clause)) continue;
      record(specifier);
    }

    for (const match of source.matchAll(SIDE_EFFECT_IMPORT_RE)) {
      const specifier = (match.groups as { specifier: string }).specifier;
      if (specifier.startsWith(".")) {
        const next = resolveRelative(file, specifier);
        if (next !== null) {
          queue.push({ file: next, path: [...path, relative(STUDIO_ROOT, next)] });
        }
        continue;
      }
      record(specifier);
    }
  }

  return { modules, violations, dynamicImports };
}

describe("crash module self-containment (FR-013)", () => {
  it("has entry points to walk (guards against a vacuous pass)", () => {
    // If src/crash/ is empty or the walker stops resolving its files, every
    // assertion below passes for the wrong reason. Fail loudly instead.
    expect(crashEntryPoints().length).toBeGreaterThan(0);
  });

  it("reaches no @keyboard-studio/engine edge, direct or transitive", () => {
    const { violations } = walkCrashGraph(crashEntryPoints());

    // Each violation prints the full chain, because the realistic failure is a
    // three-hop path through a store — not a direct import someone would have
    // noticed in review. Fix it by reading the value in the CALLER and passing
    // it into the crash module as plain data (FR-012, FR-042).
    const rendered = violations.map(
      (v) => `${v.path.join(" -> ")} imports ${v.specifier}`,
    );
    expect(rendered).toEqual([]);
  });

  it("uses no dynamic import() inside the crash module", () => {
    // A dynamic import is a network fetch at the worst possible moment. The
    // reporter must already be in memory when the page is falling over.
    const { dynamicImports } = walkCrashGraph(crashEntryPoints());
    expect(dynamicImports).toEqual([]);
  });

  it("never imports computeSha256Hex from the engine codec (FR-011)", () => {
    // Belt and braces over the graph walk: this names the specific helper the
    // spec calls out, so a failure reads as "you reused the engine's hash
    // helper" rather than the more abstract graph-edge message above.
    //
    // Matched inside an import statement only. fingerprint.ts names the helper
    // in prose to explain why it does NOT use it, and a bare substring scan
    // would flag that comment — turning the file that documents the constraint
    // into the file that violates it.
    const offenders = crashEntryPoints().filter((file) =>
      /(?:^|\n)[ \t]*(?:import|export)[\s\S]{0,400}?computeSha256Hex/.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(offenders.map((f) => relative(STUDIO_ROOT, f))).toEqual([]);
  });
});
