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
 * O(1) lookup of one locale-directory id. `localeId` must already be
 * canonical (lowercase language, Titlecase script, UPPERCASE region) — use
 * `exemplarLocaleCandidates` to produce it.
 */
export function lookup(localeId: string): IndexLocaleEntry | undefined {
  return loaded?.locales[localeId];
}

/** Test hook: drop the cached chunk so a test can assert the load path. */
export function __resetExemplarIndexForTest(): void {
  cached = null;
  loaded = null;
}
