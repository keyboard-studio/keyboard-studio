// Lazy loader for the pinned Unicode data table.
//
// The table (`@keyboard-studio/contracts/unicode`, ~1.5 MB generated) is the
// single authoritative source of Unicode names, General_Category, and
// canonical combining class — and this popover is the table's only studio
// consumer through this seam.
//
// Perf note (verified against the production bundle, 2026-09-29): the
// pinned table is already statically in the studio's initial bundle via
// spec-082 engine code (`marks/mark-classes.ts`, `kmAssist/unicodeAdapter.ts`
// — base commits 3b00d88a/e7c0351f), so this dynamic import resolves to the
// already-loaded module: it adds no new chunk and no duplicate bytes.
// The dynamic import is deliberate anyway: this helper must not introduce
// its OWN static dependency on the table, so if the engine ever stops
// pulling it into the initial bundle, the popover's table falls back to a
// lazily-loaded async chunk instead of dragging 1.5 MB into first paint.
//
// This module is the single seam: one cached promise behind a dynamic
// import, so the first hover/focus pays the load cost at most once and
// every later activation is synchronous-ish. Callers pair it with the
// engine's pure `describeCharacter(char, lookups)` helper, which takes
// these exact three functions — nothing else about the table leaks into
// the UI layer.

import type { UnicodeCharacterLookups } from "@keyboard-studio/engine";

let cached: Promise<UnicodeCharacterLookups> | undefined;

/** The pinned table's lookups, loaded on first use and cached thereafter.
 * A failed import clears the cache so the next activation retries (same
 * pattern as the engine's charNames loader) — a transient chunk-load
 * failure must not wedge the popover on "Loading character details…" for
 * the rest of the session. */
export function loadUnicodeTable(): Promise<UnicodeCharacterLookups> {
  cached ??= import("@keyboard-studio/contracts/unicode")
    .then((m) => ({
      getName: m.getName,
      getCategory: m.getCategory,
      getCCC: m.getCCC,
    }))
    .catch((err: unknown) => {
      cached = undefined;
      throw err;
    });
  return cached;
}

/** Test seam — resets the cached promise (tests only). */
export function resetUnicodeTableForTests(): void {
  cached = undefined;
}
