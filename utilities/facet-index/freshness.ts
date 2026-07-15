/**
 * Freshness plumbing for the per-keyboard facet index (spec 036 T010; FR-005).
 *
 * Two rescan gates:
 *   1. Per-keyboard content hash — incremental (`--incremental`, T030) re-analyzes
 *      only keyboards whose source bytes changed vs the prior committed index;
 *      the rest carry forward byte-for-byte.
 *   2. Version bump — when `scannerVersion` (tool+schema+classifier) or
 *      `unicodeVersion` (pinned UCD) changes, ALL content-derived records must be
 *      recomputed, so the whole corpus is treated as dirty.
 *
 * Deterministic by construction: SHA-256 content hashes (never mtimes, which are
 * not stable across checkouts/CI — research D6).
 */

import { createHash } from "node:crypto";

import { unicodeVersion } from "./ucd/generated/scriptLookup.ts";
import type { FacetIndex, IndexManifest } from "./types.ts";
import type { ScannedKeyboard } from "./scan.ts";

// ---------------------------------------------------------------------------
// scannerVersion — the combined tool+schema+classifier stamp
// ---------------------------------------------------------------------------
// Bumping ANY component invalidates every content-derived record (the version
// gate below). Kept separate from `unicodeVersion`, which the manifest tracks as
// its own axis — either changing forces a full recompute.

/** This build tool's own version. Bump on a change to how records are derived. */
export const TOOL_VERSION = "1";
/** The index-shell schema version (mirrors manifest.schemaVersion). */
export const INDEX_SCHEMA_VERSION = 1;
/**
 * Classifier stamp. 037 owns each classifier's internal algorithm; bump the
 * relevant token when a classifier's output could change for identical input.
 */
export const CLASSIFIER_VERSION = "script@1";

/** Combined stamp recorded in the manifest; a change forces full recompute. */
export const scannerVersion = `facet-index@${TOOL_VERSION};schema@${INDEX_SCHEMA_VERSION};${CLASSIFIER_VERSION}`;

/** The pinned Unicode release, surfaced here so the build reads one source. */
export { unicodeVersion };

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/** SHA-256 hex of a byte buffer. */
export function hashBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Per-keyboard source hashes: `{ corpusRelativePath → sha256 }`. Keys are
 * inserted sorted; the deterministic writer re-sorts anyway, but sorting here
 * keeps intermediate objects comparable. This is the value stored at
 * `keyboards[id].freshness.sourceHashes`.
 */
export function computeSourceHashes(kb: Pick<ScannedKeyboard, "sources">): Record<string, string> {
  const out: Record<string, string> = {};
  for (const src of [...kb.sources].sort((a, b) => a.path.localeCompare(b.path))) {
    out[src.path] = hashBytes(src.bytes);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Change detection
// ---------------------------------------------------------------------------

/** True when two source-hash maps differ (added/removed file, or changed bytes). */
export function sourceHashesEqual(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  if (!a || !b) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/**
 * True when a version bump forces a full content-derived recompute: the prior
 * index's `scannerVersion` or `unicodeVersion` differs from the current build's
 * (US3). A missing prior manifest also forces a full build.
 */
export function versionBumpForcesFullRescan(
  priorManifest: IndexManifest | undefined,
  current: { scannerVersion: string; unicodeVersion: string },
): boolean {
  if (!priorManifest) return true;
  return (
    priorManifest.scannerVersion !== current.scannerVersion ||
    priorManifest.unicodeVersion !== current.unicodeVersion
  );
}

/** The rescan decision for an incremental build (consumed by build-index in T030). */
export interface RescanPlan {
  /** Ids to re-analyze from source this build. */
  dirtyIds: string[];
  /** Ids whose prior records carry forward byte-for-byte. */
  carryForwardIds: string[];
  /** True when the whole corpus is being recomputed (no prior, or a version bump). */
  fullRescan: boolean;
}

/**
 * Decide which scanned keyboards need re-analysis vs carry-forward.
 *
 * - No prior index, or a `scannerVersion`/`unicodeVersion` bump ⇒ everything is
 *   dirty (full rescan).
 * - Otherwise a keyboard is dirty when it is new or its source hashes changed;
 *   an id present in the prior index but absent from the scan is simply dropped
 *   (not carried forward) — it left the corpus.
 */
export function planRescan(
  prior: FacetIndex | null,
  scanned: ReadonlyArray<{ id: string; sourceHashes: Record<string, string> }>,
  current: { scannerVersion: string; unicodeVersion: string },
): RescanPlan {
  const fullRescan = !prior || versionBumpForcesFullRescan(prior?.manifest, current);
  if (fullRescan) {
    return { dirtyIds: scanned.map((k) => k.id), carryForwardIds: [], fullRescan: true };
  }
  const dirtyIds: string[] = [];
  const carryForwardIds: string[] = [];
  for (const kb of scanned) {
    const priorHashes = prior!.keyboards[kb.id]?.freshness.sourceHashes;
    if (sourceHashesEqual(priorHashes, kb.sourceHashes)) {
      carryForwardIds.push(kb.id);
    } else {
      dirtyIds.push(kb.id);
    }
  }
  return { dirtyIds, carryForwardIds, fullRescan: false };
}
