// facet-transform migration — longpress-to-flick (US2, ux-changing).
//
// Scope: TouchLayoutIR ONLY (design brief §2 — touch mechanisms live in the
// touch-layout JSON, invisible to the KMN recognizer). Rewrites `TouchKeyIR.sk`
// (longpress sub-key menu) → `TouchKeyIR.flick` (directional gestures), sets
// `TouchKeyProvenance` explicitly on each rewritten key (never clobbers hand-set
// — research D3), and derives a compass direction per sub-key (position-order →
// nearest available direction) surfaced for user review (NOT authoritative).
//
// Bound: keys whose sub-key count exceeds the flick-direction budget (8 compass
// directions) are REFUSED per-site with a reason (character-coverage loss), never
// truncated silently. Output is unchanged — only the input UX changes.

import type { KeyboardIR, TouchKeyIR } from "@keyboard-studio/contracts";
import type {
  DerivedParameterReview,
  MigrationRule,
  RewriteResult,
  SiteLedgerEntry,
  SourceFacetMeasurement,
} from "../types.js";

/** The eight compass directions a flick can use — the direction budget. */
const FLICK_DIRECTIONS = ["e", "w", "n", "s", "se", "sw", "ne", "nw"] as const;
type FlickDir = (typeof FLICK_DIRECTIONS)[number];

/** Position-order → nearest available compass direction (derived, reviewable). */
function deriveDirections(count: number): FlickDir[] {
  return FLICK_DIRECTIONS.slice(0, count);
}

function cloneIr(ir: KeyboardIR): KeyboardIR {
  return structuredClone(ir);
}

export const LONGPRESS_TO_FLICK_RULE_ID = "longpress-to-flick";

export const longpressToFlickRule: MigrationRule = {
  id: LONGPRESS_TO_FLICK_RULE_ID,
  facetId: "source.touch-combo-mechanism",
  hasCompanionRewrites: false,
  derivesParameters: true,

  apply(
    workingCopyIr: KeyboardIR,
    acceptedSiteIds: string[],
    measurement: SourceFacetMeasurement,
  ): RewriteResult {
    const out = cloneIr(workingCopyIr);
    const ledger: SiteLedgerEntry[] = [];
    const reviewRows: DerivedParameterReview["rows"] = [];

    if (out.touchLayout === undefined) {
      return { candidateIr: out, ledger };
    }

    const accepted = new Set(acceptedSiteIds);
    const exceptionById = new Map(measurement.exceptionSites.map((s) => [s.siteId, s]));

    for (const platform of out.touchLayout.platforms) {
      for (const layer of platform.layers) {
        for (const row of layer.rows) {
          for (const key of row.keys) {
            convertKey(key, accepted, exceptionById, ledger, reviewRows);
          }
        }
      }
    }

    const derivedParameterReview: DerivedParameterReview | undefined =
      reviewRows.length > 0
        ? {
            kind: "flick-direction",
            rows: reviewRows,
            note: "Flick directions were derived from sub-key order — review and adjust before committing; the derivation is not authoritative.",
          }
        : undefined;

    return {
      candidateIr: out,
      ledger,
      ...(derivedParameterReview ? { derivedParameterReview } : {}),
    };
  },
};

function convertKey(
  key: TouchKeyIR,
  accepted: ReadonlySet<string>,
  exceptionById: ReadonlyMap<string, { causeTag: string }>,
  ledger: SiteLedgerEntry[],
  reviewRows: DerivedParameterReview["rows"],
): void {
  const sk = key.sk;
  if (sk === undefined || sk.length === 0) return;

  const siteId = key.nodeId;
  const exception = exceptionById.get(siteId);

  // Principled-split / any exception site not explicitly accepted → preserve.
  if (exception !== undefined && !accepted.has(siteId)) {
    ledger.push({
      siteId,
      outcome: "skipped",
      reason: `preserved (${exception.causeTag}) — not converted without opt-in.`,
    });
    return;
  }

  // Over-budget → refuse per-site with a reason (never truncate silently).
  if (sk.length > FLICK_DIRECTIONS.length) {
    ledger.push({
      siteId,
      outcome: "refused",
      reason: `${sk.length} sub-keys exceed the ${FLICK_DIRECTIONS.length}-direction flick budget — converting would drop ${sk.length - FLICK_DIRECTIONS.length} character(s).`,
    });
    return;
  }

  // Convert sk → flick, assigning derived directions in position order.
  const dirs = deriveDirections(sk.length);
  const flick: NonNullable<TouchKeyIR["flick"]> = {};
  sk.forEach((subKey, i) => {
    const dir = dirs[i]!;
    flick[dir] = { ...subKey, provenance: "physical-suggested" };
    reviewRows.push({
      siteId,
      label: `${key.id} · ${subKey.text ?? subKey.output ?? subKey.id}`,
      derivedValue: dir,
    });
  });

  key.flick = flick;
  delete key.sk;
  // Set provenance explicitly so re-propagation never silently clobbers this key.
  key.provenance = "physical-suggested";
  ledger.push({ siteId, outcome: "applied" });
}
