// Browser-side pattern library: loads YAML via Vite import.meta.glob (no
// node:fs). Used in the SPA only — the engine's loadPatterns() uses node:fs
// and is not called from the browser.
//
// Glob path: from the Vite root (packages/studio), the content tree is at
// ../../content/patterns/**/*.yaml  →  resolves to keyboard-studio/content/patterns.
//
// RawPattern -> Pattern mapping (toPattern) lives in
// @keyboard-studio/contracts (schemas.ts, next to RawPatternSchema) — the
// single source of truth shared with the engine's node loader
// (packages/engine/src/pattern-library/loader.ts). Strategy-partition
// ranking (rankPatterns) is shared with the engine (filterFor.ts),
// re-exported from the engine's main entry. Both are pure (no
// node:fs/node:path), so importing them here does not pull Node-only code
// into the browser bundle — the studio already statically imports the
// engine's entry point elsewhere (e.g. workingCopyStore, services.ts)
// without issue.
//
// PatternSchema is imported from "@keyboard-studio/engine/pattern-schema"
// via the dedicated "./pattern-schema" export added to the engine's package.json.
// This closes the drift window: the schema is now a single source of truth.

import { devLog } from "@keyboard-studio/contracts/dev-log";
import { parse } from "yaml";
import { toPattern } from "@keyboard-studio/contracts";
import { rankPatterns } from "@keyboard-studio/engine";
import { PatternSchema } from "@keyboard-studio/engine/pattern-schema";
import type {
  Pattern,
  BaseKeyboard,
  DiscoveryAxisVector,
  PatternMatch,
  PatternLibraryService,
} from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Vite glob — eager, raw text. import.meta.glob resolves relative to THIS
// module file (packages/studio/src/lib/), so reaching the repo-root content/
// tree is four levels up: lib -> src -> studio -> packages -> <repo root>.
//   packages/studio/src/lib/../../../../content/patterns = <repo root>/content/patterns
//
// The glob (and the load it feeds) runs on FIRST USE, not at module import:
// import.meta.glob only exists under Vite, and Node-side tooling that loads
// this module's import graph without calling the service (e.g. the
// i18n-content-extract CLI walking the question registry under tsx) must not
// crash at import time. In the browser the patterns are still loaded exactly
// once, memoized below — the same one-shot semantics the eager top-level
// load had, deferred to the first getPatternLibraryService()/getPatternByIdSync()
// call, which is where every consumer already enters.
// ---------------------------------------------------------------------------

function globPatternModules(): Record<string, string> {
  return import.meta.glob("../../../../content/patterns/**/*.yaml", {
    eager: true,
    query: "?raw",
    import: "default",
  }) as Record<string, string>;
}

// ---------------------------------------------------------------------------
// Load + validate all YAML modules (runs once, on first use)
// ---------------------------------------------------------------------------

function loadAll(): Pattern[] {
  const patterns: Pattern[] = [];
  for (const [path, raw] of Object.entries(globPatternModules())) {
    if (typeof raw !== "string") {
      devLog.warn(`[browserPatternLibrary] skipping ${path}: not a string`);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = parse(raw);
    } catch (e) {
      devLog.warn(`[browserPatternLibrary] YAML parse error in ${path}: ${String(e)}`);
      continue;
    }
    const result = PatternSchema.safeParse(parsed);
    if (!result.success) {
      const reason = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      devLog.warn(`[browserPatternLibrary] schema error in ${path}: ${reason}`);
      continue;
    }
    patterns.push(toPattern(result.data));
  }
  // Sort by id for deterministic listAll() ordering.
  patterns.sort((a, b) => a.id.localeCompare(b.id));
  return patterns;
}

interface PatternIndex {
  all: Pattern[];
  // O(1) id lookup — built once alongside `all`.
  byId: Map<string, Pattern>;
}

let _patternIndex: PatternIndex | null = null;

function patternIndex(): PatternIndex {
  if (_patternIndex === null) {
    const all = loadAll();
    _patternIndex = { all, byId: new Map(all.map((p) => [p.id, p])) };
  }
  return _patternIndex;
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

class BrowserPatternLibraryService implements PatternLibraryService {
  listAll(): Promise<Pattern[]> {
    return Promise.resolve([...patternIndex().all]);
  }

  getById(id: string): Promise<Pattern | undefined> {
    return Promise.resolve(patternIndex().byId.get(id));
  }

  filterFor(base: BaseKeyboard, axes?: DiscoveryAxisVector): Promise<PatternMatch[]> {
    return Promise.resolve(rankPatterns(patternIndex().all, base, axes));
  }
}

let _instance: BrowserPatternLibraryService | null = null;

/**
 * Return the singleton browser pattern library service.
 * Patterns are loaded once via import.meta.glob, on first use.
 */
export function getPatternLibraryService(): PatternLibraryService {
  if (_instance === null) {
    _instance = new BrowserPatternLibraryService();
  }
  return _instance;
}

/**
 * Synchronous pattern-by-id lookup over the same memoized
 * pattern index `getById()` wraps in a resolved Promise. Needed by
 * pure/non-async call sites (e.g. `buildSessionProducedSet` callers in
 * `useInventoryDiff`/galleries) that must resolve a `MechanismRef.patternId`
 * to its `Pattern.kmnFragment` inside a `useMemo`, not an effect — see
 * `services.ts`'s `getPatternByIdSync`, which switches between this and the
 * mock fixture index the same way `getPatternLibraryService` does.
 */
export function getPatternByIdSync(id: string): Pattern | undefined {
  return patternIndex().byId.get(id);
}
