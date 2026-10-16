/**
 * Lazily-loaded accessor for the committed, pinned exemplar index
 * (`generated/exemplars.generated.json`, built by
 * `scripts/codegen-exemplars.mjs` from CLDR 48.2.0 + a SHA-pinned SLDR commit).
 *
 * The index is dynamically imported ONCE per process and cached, keeping the
 * ~1.3 MB table out of the studio's startup bundle — the same treatment
 * `charnames.generated.json` gets, and for the same reason: exemplar sourcing
 * runs on language selection, not inside the 300 ms validator debounce cycle.
 *
 * Lookup is O(1) and offline: no `fetch`, no network, no filesystem read at
 * authoring time (FR-011).
 */

/** Raw, unparsed exemplar sets for one source side of one locale. */
export interface IndexTierSets {
  /** main */
  m?: string;
  /** auxiliary */
  a?: string;
  /** punctuation */
  p?: string;
  /** numbers */
  n?: string;
  /** SLDR draft status — absent on the CLDR side, which is release-gated. */
  d?: string;
}

export interface IndexLocaleEntry {
  /** CLDR side. */
  c?: IndexTierSets;
  /** SLDR side. */
  s?: IndexTierSets;
}

export interface ExemplarIndex {
  version: { cldr: string; sldrCommit: string; generated: string };
  locales: Record<string, IndexLocaleEntry>;
}

let cached: Promise<ExemplarIndex> | null = null;
let loaded: ExemplarIndex | null = null;

/**
 * Loads (and caches) the index chunk. Only a SUCCESSFUL load is cached — a
 * rejected import clears the cache so the next call retries rather than
 * replaying the same rejection forever.
 */
export function loadExemplarIndex(): Promise<ExemplarIndex> {
  cached ??= import("./generated/exemplars.generated.json")
    .then((mod) => {
      const data = mod.default as unknown as ExemplarIndex;
      loaded = data;
      return data;
    })
    .catch((err: unknown) => {
      cached = null;
      throw err;
    });
  return cached;
}

/**
 * Session-scoped live-refresh overrides (#1367): per-locale entries installed
 * by an author-initiated CLDR refresh, consulted by `lookup()` ahead of the
 * pinned index so every consumer of the single sourcing path sees the same
 * refreshed data (FR-015). In-memory only — a page reload returns the session
 * to the pinned index; the per-character provenance recorded in the author's
 * draft is what persists, not the dataset.
 */
const overrides = new Map<string, IndexLocaleEntry>();
const overrideReleases = new Map<string, string>();

/**
 * Install (or replace) the refreshed entry for one canonical locale id,
 * stamped with the CLDR release it came from. The entry's SLDR side is the
 * caller's responsibility — refresh retains the pinned entry's `s` side so a
 * CLDR refresh never deletes SLDR coverage.
 */
export function installExemplarOverride(
  localeId: string,
  entry: IndexLocaleEntry,
  cldrRelease: string,
): void {
  overrides.set(localeId, entry);
  overrideReleases.set(localeId, cldrRelease);
}

/** Remove one locale's override (a refresh that proved unusable installs nothing). */
export function removeExemplarOverride(localeId: string): void {
  overrides.delete(localeId);
  overrideReleases.delete(localeId);
}

/** The CLDR release a locale's override was fetched from, if it has one. */
export function lookupOverrideRelease(localeId: string): string | undefined {
  return overrideReleases.get(localeId);
}

/** True when `localeId` is currently served by a live-refresh override. */
export function hasExemplarOverride(localeId: string): boolean {
  return overrides.has(localeId);
}

/** Drop every live-refresh override, returning lookups to the pinned index. */
export function clearExemplarOverrides(): void {
  overrides.clear();
  overrideReleases.clear();
}

/**
 * The pinned index's own version stamp (`{ cldr, sldrCommit, generated }`),
 * or null until the chunk has loaded. Used to stamp pinned inventories with
 * their release and to guard a refresh against fetching older data.
 */
export function pinnedIndexVersion(): ExemplarIndex["version"] | null {
  return loaded?.version ?? null;
}

/**
 * O(1) lookup of one locale-directory id. `localeId` must already be
 * canonical (lowercase language, Titlecase script, UPPERCASE region) — use
 * `exemplarLocaleCandidates` to produce it. A live-refresh override for the
 * id wins over the pinned entry.
 */
export function lookup(localeId: string): IndexLocaleEntry | undefined {
  return overrides.get(localeId) ?? loaded?.locales[localeId];
}

/** Test hook: drop the cached chunk so a test can assert the load path. */
export function __resetExemplarIndexForTest(): void {
  cached = null;
  loaded = null;
  clearExemplarOverrides();
}
