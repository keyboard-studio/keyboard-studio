/**
 * Lazily-loaded codepoint -> Unicode NAME lookup for the character map (search
 * by name, e.g. "LATIN SMALL LETTER A"). Backed by
 * `generated/charnames.generated.json` (codepoint 0x0020..0x2FFFF, algorithmic
 * range-marker names excluded — see scripts/codegen-charnames.mjs), which is
 * dynamically imported ONCE per process and cached, keeping the ~1.4 MB table
 * out of the initial bundle. buildCharacterMap() runs on language selection,
 * not inside the 300ms validator debounce cycle, so the one-time load cost is
 * not on that critical path.
 */

let cached: Promise<ReadonlyMap<number, string>> | null = null;

/** Returns the codepoint -> name lookup, loading + caching it on first call. */
export function loadCharNames(): Promise<ReadonlyMap<number, string>> {
  // Only a SUCCESSFUL load is cached. If the dynamic import (or the build
  // step below it) rejects, clear `cached` so the next call retries instead
  // of being stuck replaying the same rejected promise forever.
  cached ??= import("./generated/charnames.generated.json")
    .then((mod) => {
      const data = mod.default as Record<string, string>;
      const map = new Map<number, string>();
      for (const [cp, name] of Object.entries(data)) map.set(Number(cp), name);
      return map;
    })
    .catch((err: unknown) => {
      cached = null;
      throw err;
    });
  return cached;
}
