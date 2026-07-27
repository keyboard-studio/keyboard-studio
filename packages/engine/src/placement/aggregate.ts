/**
 * Independence-weighted aggregation of per-keyboard placement reports.
 *
 * Aggregation pipeline:
 *   1. Fork-collapse + anti-pattern discard — group reports by
 *      placementFingerprint (one vote per fork tree), and drop any whole
 *      keyboard matching the "fill left-to-right" anti-pattern (its assigned
 *      vkeys form a monotone QWERTY run of ≥5 consecutive keys with no
 *      phonetic/decomposition basis) from the consensus pool. Both are
 *      per-keyboard properties (spec §7.6).
 *   2. Aggregate by codepoint — collect all (vkey, modifiers, mechanism) tuples
 *      across surviving votes; sort by occurrence count descending.
 *   3. Standards-body bonus — multiply priorCount by caller-supplied multiplier
 *      for designated keyboards (content-team curated set).
 *   4. Confidence normalization — confidence = priorCount / maxPriorCount.
 *
 * NOTE: This module uses Node crypto (SHA-256) and MUST NOT be imported from
 * the SPA.  It is offline-only (supportability scanner, kbgen, CI pipelines).
 *
 * @see spec.md §7.6 (corpus-derived placement priors, blending / ranking)
 */

import { createHash } from "node:crypto";
import type { PlacementCandidate } from "@keyboard-studio/contracts";
import type {
  KeyboardPlacementReport,
  AggregatedEntry,
  PlacementPriorsJSON,
} from "./model.js";

// ---------------------------------------------------------------------------
// QWERTY column order for anti-pattern detection
// ---------------------------------------------------------------------------

/**
 * Standard QWERTY left-to-right key order for the top three letter rows.
 * Used to detect "fill left-to-right" keyboards (anti-pattern discard).
 */
const QWERTY_ORDER: string[] = [
  "K_Q", "K_W", "K_E", "K_R", "K_T", "K_Y", "K_U", "K_I", "K_O", "K_P",
  "K_A", "K_S", "K_D", "K_F", "K_G", "K_H", "K_J", "K_K", "K_L",
  "K_Z", "K_X", "K_C", "K_V", "K_B", "K_N", "K_M",
];

const QWERTY_INDEX = new Map<string, number>(
  QWERTY_ORDER.map((k, i) => [k, i]),
);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Stable string key for a (vkey, modifiers, mechanism) placement slot. */
function slotKey(c: PlacementCandidate): string {
  return `${c.vkey}|${[...c.modifiers].sort().join(",")}|${c.mechanism}`;
}

/**
 * Return true when the vkeys in `keys` form a run of ≥5 consecutive positions
 * in QWERTY_ORDER with no gaps.  This identifies "fill keys left-to-right"
 * keyboards that carry no phonetic signal.
 */
function isMonotoneQwertyRun(keys: string[]): boolean {
  if (keys.length < 5) return false;
  const indices = keys
    .map((k) => QWERTY_INDEX.get(k))
    .filter((i): i is number => i !== undefined)
    .sort((a, b) => a - b);
  if (indices.length < 5) return false;
  // Check for a consecutive run of ≥5.
  let runLength = 1;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === (indices[i - 1] ?? 0) + 1) {
      runLength++;
      if (runLength >= 5) return true;
    } else {
      runLength = 1;
    }
  }
  return false;
}

/**
 * A keyboard exhibits the "free keys filled left-to-right" anti-pattern
 * (spec §7.6) when the distinct vkeys it assigns across all target codepoints
 * form a monotone consecutive QWERTY run of ≥5 keys — i.e. characters were
 * dropped onto free keys in QWERTY order with no phonetic/decomposition basis.
 * Such a keyboard carries no placement signal and is excluded from the
 * consensus pool as a whole (per-keyboard), rather than per-codepoint.
 */
function isFillLeftToRightKeyboard(report: KeyboardPlacementReport): boolean {
  const vkeys = new Set<string>();
  for (const candidates of report.candidatesByCodepoint.values()) {
    for (const c of candidates) vkeys.add(c.vkey);
  }
  return isMonotoneQwertyRun([...vkeys]);
}

// ---------------------------------------------------------------------------
// Fingerprint computation (exported for the scanner's computeFingerprint)
// ---------------------------------------------------------------------------

/**
 * Compute a SHA-256 fingerprint of a list of placement candidates.
 *
 * The fingerprint is used for fork-collapse: keyboards that produce the same
 * (codepoint → vkey+modifiers) map are the same fork tree and get one vote.
 *
 * The input candidates must carry the codepoint somehow; since PlacementCandidate
 * has no `codepoint` field (it lives as the PlacementEntry key), the scanner
 * provides a tagged list.  Here we accept the plain candidates list and hash
 * the slot keys sorted — this is used by the scanner after building the report.
 */
export function computeFingerprintFromCandidates(
  candidates: PlacementCandidate[],
): string {
  const tuples = candidates
    .map((c) => slotKey(c))
    .sort()
    .join("\n");
  return createHash("sha256").update(tuples).digest("hex");
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Aggregate per-keyboard placement reports into a PlacementPriorsJSON snapshot.
 *
 * @param reports       - Array of per-keyboard reports from emitPlacementMap.
 * @param opts.supplementBonus  - Map from keyboardId → multiplier; applied
 *   as a standards-body bonus to the priorCount of any matching keyboard's
 *   candidates before deduplication (default: none).
 * @param opts.generatedFrom    - Provenance string written into the output
 *   JSON (e.g. "keymanapp/keyboards@<sha>"). Defaults to
 *   "keymanapp/keyboards@unknown" when omitted.
 *
 * @see spec.md §7.6
 */
export function aggregatePlacements(
  reports: KeyboardPlacementReport[],
  opts?: { supplementBonus?: Record<string, number>; generatedFrom?: string },
): PlacementPriorsJSON {
  const bonus = opts?.supplementBonus ?? {};

  // -------------------------------------------------------------------------
  // Step 1 — Build the consensus pool:
  //   (a) Fork-collapse — one vote per unique placementFingerprint (fork-copy
  //       trees collapse to a single vote).
  //   (b) Anti-pattern discard (spec §7.6) — a whole keyboard matching the
  //       "free keys filled left-to-right" anti-pattern is excluded from the
  //       pool. This is a per-KEYBOARD property, not per-codepoint.
  // -------------------------------------------------------------------------
  const seenFingerprints = new Set<string>();
  const survivingReports: KeyboardPlacementReport[] = [];
  for (const report of reports) {
    if (seenFingerprints.has(report.placementFingerprint)) continue;
    seenFingerprints.add(report.placementFingerprint);
    if (isFillLeftToRightKeyboard(report)) continue;
    survivingReports.push(report);
  }

  // -------------------------------------------------------------------------
  // Step 2 — Aggregate by codepoint.
  //
  // Each report now carries candidatesByCodepoint: Map<hexKey, PlacementCandidate[]>.
  // The codepoint is the map key — no _codepoint tag needed.
  // -------------------------------------------------------------------------

  // Map from hex-codepoint key → Map<slotKey, { count, bcp47Set, layoutSet, candidate }>
  const cpMap = new Map<
    string,
    Map<string, { count: number; bcp47Set: Set<string>; layoutSet: Set<string>; candidate: PlacementCandidate }>
  >();

  for (const report of survivingReports) {
    const multiplier = bonus[report.keyboardId] ?? 1;
    for (const [hexKey, candidates] of report.candidatesByCodepoint) {
      let slotMap = cpMap.get(hexKey);
      if (slotMap === undefined) {
        slotMap = new Map();
        cpMap.set(hexKey, slotMap);
      }
      for (const cand of candidates) {
        const sk = slotKey(cand);
        const existing = slotMap.get(sk);
        if (existing !== undefined) {
          existing.count += multiplier;
          for (const tag of report.bcp47) existing.bcp47Set.add(tag);
          existing.layoutSet.add(report.baseLayoutFamily);
        } else {
          slotMap.set(sk, {
            count: multiplier,
            bcp47Set: new Set(report.bcp47),
            layoutSet: new Set([report.baseLayoutFamily]),
            candidate: {
              vkey: cand.vkey,
              modifiers: cand.modifiers,
              mechanism: cand.mechanism,
              priorSource: cand.priorSource,
              priorCount: multiplier,
              confidence: 0, // filled in after normalization
            },
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 3 — Apply standards-body bonus to surviving entries.
  //          (Already applied per-candidate above via multiplier.)
  //
  // The "fill left-to-right" anti-pattern is handled per-keyboard in Step 1
  // (spec §7.6), so there is deliberately no per-codepoint discard here — a
  // codepoint that several keyboards happen to place on consecutive keys is a
  // legitimate consensus signal, not an anti-pattern, and must be kept.
  // -------------------------------------------------------------------------

  const entries: Record<string, AggregatedEntry> = {};
  let maxPriorCount = 0;

  for (const [hexKey, slotMap] of cpMap.entries()) {
    // Build the sorted placement list for this codepoint.
    const placements: PlacementCandidate[] = [...slotMap.values()]
      .sort((a, b) => b.count - a.count)
      .map((v) => ({
        ...v.candidate,
        priorCount: Math.round(v.count),
      }));

    const bcp47Context: string[] = [];
    const layoutSet = new Set<string>();
    for (const v of slotMap.values()) {
      for (const tag of v.bcp47Set) bcp47Context.push(tag);
      for (const layout of v.layoutSet) layoutSet.add(layout);
    }
    const baseLayoutFamily = layoutSet.size === 1 ? ([...layoutSet][0] ?? "other") : "other";

    entries[hexKey] = {
      codepoint: hexKey,
      placements,
      bcp47Context: [...new Set(bcp47Context)].sort(),
      baseLayoutFamily,
    };

    const topCount = placements[0]?.priorCount ?? 0;
    if (topCount > maxPriorCount) maxPriorCount = topCount;
  }

  // -------------------------------------------------------------------------
  // Step 5 — Confidence normalisation: confidence = priorCount / maxPriorCount.
  // -------------------------------------------------------------------------
  if (maxPriorCount > 0) {
    for (const entry of Object.values(entries)) {
      for (const p of entry.placements) {
        p.confidence = p.priorCount / maxPriorCount;
      }
    }
  }

  return {
    version: "1.0.0",
    generatedFrom: opts?.generatedFrom ?? "keymanapp/keyboards@unknown",
    priorCount: survivingReports.length,
    entries,
  };
}
