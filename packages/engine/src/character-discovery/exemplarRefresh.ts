/**
 * Opt-in live refresh of exemplar data (#1367, spec 044 follow-up R3).
 *
 * The pinned offline index remains the default and the fallback: authoring
 * succeeds with no network at all (FR-011). This module is invoked ONLY from
 * an explicit author action ("check for newer exemplar data for this
 * language") — never on mount, never in the background, never on a timer.
 *
 * Design (km-lead ruling, queue-1367-ruling.md):
 *  - The fetch targets a NAMED stable cldr-json release tag, resolved from
 *    the upstream tag list with pre-releases excluded. `refs/heads/main` is
 *    never used: an unnameable moving target cannot be stamped as provenance.
 *  - A version guard refuses anything ≤ the pinned release — a refresh must
 *    never become a downgrade (the legacy loaders' hard-coded 46.1.0 tag is
 *    older than the 48.2.0 pin).
 *  - On success the fetched tiers are installed as a session-scoped override
 *    INSIDE the single sourcing path (`exemplarIndex.lookup`), so
 *    characterMap, suggestMissing, the Phase B prefill and the criteria
 *    inventory all read the same refreshed inventory (FR-015). The pinned
 *    entry's SLDR side is retained under the refreshed CLDR side.
 *  - CLDR only. There is no live SLDR route; an SLDR-sourced inventory is
 *    never displaced by a CLDR absence or failure.
 *  - Outcomes are discriminated, never collapsed into one null: the author
 *    who clicked the button is owed a distinct answer for network failure,
 *    not-covered, already-current, and unreadable data.
 */

import {
  compareCldrVersions,
  exemplarLocaleCandidates,
  extractExemplarPair,
  latestStableCldrVersion,
  parseUnicodeSet,
} from "./cldr.js";
import {
  installExemplarOverride,
  loadExemplarIndex,
  lookup,
  pinnedIndexVersion,
  removeExemplarOverride,
  type IndexLocaleEntry,
  type IndexTierSets,
} from "./exemplarIndex.js";
import { loadExemplarSource, sourceExemplars } from "./exemplarSource.js";
import type { ExemplarInventory } from "./exemplarTypes.js";

export type ExemplarRefreshResult =
  /** Newer data fetched and installed; `inventory` is the refreshed sourcing result. */
  | { kind: "updated"; version: string; resolvedTag: string; inventory: ExemplarInventory }
  /** The newest stable CLDR is not newer than the pinned index; nothing changed. */
  | { kind: "already-current"; version: string }
  /** The fetched release has no characters.json for this language; pinned data stands. */
  | { kind: "not-covered"; version: string }
  /** The version check or a fetch failed at the network level; pinned data stands. */
  | { kind: "network-error" }
  /** Data arrived but could not be read (shape drift / unparseable set); pinned data stands. */
  | { kind: "unreadable"; version: string };

function cldrJsonCharactersUrl(version: string, candidate: string): string {
  return `https://raw.githubusercontent.com/unicode-org/cldr-json/${version}/cldr-json/cldr-misc-full/main/${candidate}/characters.json`;
}

/**
 * Check for newer CLDR exemplar data for `bcp47` and, when it exists, install
 * it as the session's override for that language. Author-initiated only —
 * callers must wire this to an explicit action, never an effect or a timer.
 *
 * `fetchImpl` is the injection seam every test uses; production passes
 * nothing and gets the global fetch.
 */
export async function refreshExemplars(
  bcp47: string,
  fetchImpl?: typeof fetch,
): Promise<ExemplarRefreshResult> {
  const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis);

  await loadExemplarSource();
  const pinned = pinnedIndexVersion()?.cldr ?? null;

  const version = await latestStableCldrVersion(doFetch);
  if (version === null) return { kind: "network-error" };

  // Version guard: never fetch — let alone install — data that is not
  // strictly newer than the pin. An equal release is a truthful no-op.
  if (pinned !== null && compareCldrVersions(version, pinned) <= 0) {
    return { kind: "already-current", version: pinned };
  }

  for (const candidate of exemplarLocaleCandidates(bcp47)) {
    let response: Response;
    try {
      response = await doFetch(cldrJsonCharactersUrl(version, candidate));
    } catch {
      // A transport failure is not "the language is absent" — and per the
      // loader's established ladder semantics it aborts the probe rather
      // than silently trying a less specific candidate.
      return { kind: "network-error" };
    }
    if (!response.ok) continue;

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { kind: "unreadable", version };
    }
    const pair = extractExemplarPair(payload, candidate);
    if (pair === null) return { kind: "unreadable", version };

    // Validate every tier through the canonical parser BEFORE installing
    // anything: a set the parser rejects (new UnicodeSet syntax) must
    // surface as "unreadable", never as a partial inventory.
    const tiers: IndexTierSets = { m: pair.main };
    if (pair.auxiliary !== null) tiers.a = pair.auxiliary;
    if (pair.punctuation !== null) tiers.p = pair.punctuation;
    if (pair.numbers !== null) tiers.n = pair.numbers;
    try {
      for (const raw of [tiers.m, tiers.a, tiers.p, tiers.n]) {
        if (raw !== undefined) parseUnicodeSet(raw);
      }
    } catch {
      return { kind: "unreadable", version };
    }

    // Retain the pinned SLDR side: the override replaces only the CLDR side
    // of the entry, so SLDR coverage and the #1369 union survive a refresh.
    const pinnedEntry = lookup(candidate);
    const entry: IndexLocaleEntry = {
      c: tiers,
      ...(pinnedEntry?.s !== undefined ? { s: pinnedEntry.s } : {}),
    };
    installExemplarOverride(candidate, entry, version);

    const inventory = sourceExemplars(bcp47);
    if (inventory === null || inventory.live !== true) {
      // The gate rejected the refreshed CLDR side (or it extracted empty):
      // uninstall, so the pinned behaviour stands exactly as before, and
      // the honest answer is "no usable newer data", not a silent success.
      removeExemplarOverride(candidate);
      return { kind: "not-covered", version };
    }
    return { kind: "updated", version, resolvedTag: inventory.resolvedTag, inventory };
  }

  return { kind: "not-covered", version };
}

/** The pinned CLDR release the session was built against (null until loaded). */
export async function pinnedCldrRelease(): Promise<string | null> {
  await loadExemplarIndex();
  return pinnedIndexVersion()?.cldr ?? null;
}
