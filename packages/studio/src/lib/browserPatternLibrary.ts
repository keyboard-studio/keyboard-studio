// Browser-side pattern library: loads YAML via Vite import.meta.glob (no
// node:fs). Used in the SPA only — the engine's loadPatterns() uses node:fs
// and is not called from the browser.
//
// Glob path: from the Vite root (packages/studio), the content tree is at
// ../../content/patterns/**/*.yaml  →  resolves to keyboard-studio/content/patterns.
//
// RawPattern -> Pattern mapping and strategy-partition ranking are shared
// with the engine (packages/engine/src/pattern-library/loader.ts's
// toPattern, filterFor.ts's rankPatterns), re-exported from the engine's
// main entry. Both are pure (no node:fs/node:path), so importing them here
// does not pull Node-only code into the browser bundle — the studio already
// statically imports this same entry point elsewhere (e.g. workingCopyStore,
// services.ts) without issue.
//
// PatternSchema is imported from "@keyboard-studio/engine/pattern-schema"
// via the dedicated "./pattern-schema" export added to the engine's package.json.
// This closes the drift window: the schema is now a single source of truth.

import { parse } from "yaml";
import { toPattern, rankPatterns } from "@keyboard-studio/engine";
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
// ---------------------------------------------------------------------------

const YAML_MODULES = import.meta.glob(
  "../../../../content/patterns/**/*.yaml",
  { eager: true, query: "?raw", import: "default" },
) as Record<string, string>;

// ---------------------------------------------------------------------------
// Load + validate all YAML modules at import time (eager glob runs once)
// ---------------------------------------------------------------------------

function loadAll(): Pattern[] {
  const patterns: Pattern[] = [];
  for (const [path, raw] of Object.entries(YAML_MODULES)) {
    if (typeof raw !== "string") {
      console.warn(`[browserPatternLibrary] skipping ${path}: not a string`);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = parse(raw);
    } catch (e) {
      console.warn(`[browserPatternLibrary] YAML parse error in ${path}: ${String(e)}`);
      continue;
    }
    const result = PatternSchema.safeParse(parsed);
    if (!result.success) {
      const reason = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      console.warn(`[browserPatternLibrary] schema error in ${path}: ${reason}`);
      continue;
    }
    patterns.push(toPattern(result.data));
  }
  // Sort by id for deterministic listAll() ordering.
  patterns.sort((a, b) => a.id.localeCompare(b.id));
  return patterns;
}

const _allPatterns: Pattern[] = loadAll();

// O(1) id lookup — built once alongside _allPatterns.
const _patternById: Map<string, Pattern> = new Map(
  _allPatterns.map((p) => [p.id, p]),
);

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

class BrowserPatternLibraryService implements PatternLibraryService {
  listAll(): Promise<Pattern[]> {
    return Promise.resolve([..._allPatterns]);
  }

  getById(id: string): Promise<Pattern | undefined> {
    return Promise.resolve(_patternById.get(id));
  }

  filterFor(base: BaseKeyboard, axes?: DiscoveryAxisVector): Promise<PatternMatch[]> {
    return Promise.resolve(rankPatterns(_allPatterns, base, axes));
  }
}

let _instance: BrowserPatternLibraryService | null = null;

/**
 * Return the singleton browser pattern library service.
 * Patterns are loaded once via import.meta.glob at module-init time.
 */
export function getPatternLibraryService(): PatternLibraryService {
  if (_instance === null) {
    _instance = new BrowserPatternLibraryService();
  }
  return _instance;
}
