// facet-transform — the value-transition matrix (spec 039, central owned artifact).
//
// Every requestable (facetId, fromValue, toValue) pair has a row: supported pairs
// carry a `migrationRuleId`; unsupported pairs carry a `declineReason`. A pair
// with neither is a build error — the decline path is never "silently absent"
// (FR-004, contract invariant #1). Gate facets produce NO rows (invariant #4):
// they are refused upstream in propose.ts.
//
// Keyed at the SUB-PROFILE level for `source.encoding` (data-model Sub-profile
// rule): output/within-kind spelling is behavior-preserving; the input match-kind
// axis is ux-changing/semantic and is declined — pointing a "safe" transform at
// the whole facet must never silently sweep in match-kind (falsifies FR-007).

import type { FacetTransition, TransformImpactClass } from "./types.js";

// ---------------------------------------------------------------------------
// Gate facets — refused upstream, never produce a matrix row (invariant #4)
// ---------------------------------------------------------------------------

/** Gate facets: measured & surfaced, never transformed (spec Edge Cases). */
export const GATE_FACETS: ReadonlyMap<string, string> = new Map([
  [
    "source.mnemonic-vs-positional",
    "Mnemonic-vs-positional is a portability gate (mnemonic is Windows-only), not a switchable mechanism.",
  ],
  [
    "source.casing",
    "Casing is a fact about the target script, not a construction choice that can be switched.",
  ],
]);

// ---------------------------------------------------------------------------
// Declared impact class per facet/sub-profile (invariant #3 drift guard)
// ---------------------------------------------------------------------------

/**
 * The impact class each facet/sub-profile declares. A matrix row's denormalized
 * `transformImpactClass` MUST equal its facet's entry here (asserted at build
 * time by the matrix test). Gate facets are absent (they produce no rows).
 */
export const FACET_IMPACT_CLASS: Readonly<Record<string, TransformImpactClass>> = {
  "source.encoding.output-spelling": "behavior-preserving",
  "source.encoding.input-within-kind": "behavior-preserving",
  "source.encoding.input-match-kind": "ux-changing",
  "source.touch-combo-mechanism": "ux-changing",
  "source.normalization-posture": "output-changing",
  "source.desktop-combo-mechanism": "ux-changing",
  "source.fallback-posture": "output-changing",
  "source.reordering-rules": "output-changing",
};

// ---------------------------------------------------------------------------
// v1 supported rows (research D10, contract "v1 supported rows")
// ---------------------------------------------------------------------------

const SUPPORTED: FacetTransition[] = [
  // 1. output base/combining spelling — behavior-preserving, lossless.
  {
    facetId: "source.encoding.output-spelling",
    fromValue: "quoted-literal",
    toValue: "u-notation",
    supported: true,
    lossProfile: "lossless",
    namedLosses: [],
    transformImpactClass: "behavior-preserving",
    migrationRuleId: "encoding-spelling",
  },
  {
    facetId: "source.encoding.output-spelling",
    fromValue: "u-notation",
    toValue: "quoted-literal",
    supported: true,
    lossProfile: "lossless",
    namedLosses: [],
    transformImpactClass: "behavior-preserving",
    migrationRuleId: "encoding-spelling",
  },
  // `mixed → house-style` is US1's common request — a first-class row (invariant #5).
  {
    facetId: "source.encoding.output-spelling",
    fromValue: "mixed",
    toValue: "house-style",
    supported: true,
    lossProfile: "lossless",
    namedLosses: [],
    transformImpactClass: "behavior-preserving",
    migrationRuleId: "encoding-spelling",
  },
  // 2. within-kind input spelling — behavior-preserving, lossless*.
  //    char-ref quoted-literal ↔ u-notation.
  {
    facetId: "source.encoding.input-within-kind",
    fromValue: "quoted-literal",
    toValue: "u-notation",
    supported: true,
    lossProfile: "lossless",
    namedLosses: [],
    transformImpactClass: "behavior-preserving",
    migrationRuleId: "encoding-spelling",
  },
  {
    facetId: "source.encoding.input-within-kind",
    fromValue: "u-notation",
    toValue: "quoted-literal",
    supported: true,
    lossProfile: "lossless",
    namedLosses: [],
    transformImpactClass: "behavior-preserving",
    migrationRuleId: "encoding-spelling",
  },
  // modifier folds — lossless only with a per-site precondition (checked in the
  // migration; sites failing it are refused per-site, not silently collapsed).
  {
    facetId: "source.encoding.input-within-kind",
    fromValue: "named-modifier",
    toValue: "split-modifier",
    supported: true,
    lossProfile: "lossless",
    namedLosses: [],
    transformImpactClass: "behavior-preserving",
    migrationRuleId: "encoding-spelling",
  },
  {
    facetId: "source.encoding.input-within-kind",
    fromValue: "split-modifier",
    toValue: "named-modifier",
    supported: true,
    lossProfile: "lossless",
    namedLosses: [],
    transformImpactClass: "behavior-preserving",
    migrationRuleId: "encoding-spelling",
  },
  {
    facetId: "source.encoding.input-within-kind",
    fromValue: "mixed",
    toValue: "house-style",
    supported: true,
    lossProfile: "lossless",
    namedLosses: [],
    transformImpactClass: "behavior-preserving",
    migrationRuleId: "encoding-spelling",
  },
  // 3. longpress → flick — ux-changing, lossy-with-named-loss.
  {
    facetId: "source.touch-combo-mechanism",
    fromValue: "longpress",
    toValue: "flick",
    supported: true,
    lossProfile: "lossy-with-named-loss",
    namedLosses: [
      "Discoverability: a longpress opens a browsable menu; a flick is a memorized blind gesture with no visible affordance.",
    ],
    transformImpactClass: "ux-changing",
    migrationRuleId: "longpress-to-flick",
  },
  // 4. nfd → nfc — output-changing, lossy-with-named-loss.
  {
    facetId: "source.normalization-posture",
    fromValue: "nfd",
    toValue: "nfc",
    supported: true,
    lossProfile: "lossy-with-named-loss",
    namedLosses: [
      "Emitted bytes change: consumers expecting decomposed (NFD) output will see precomposed (NFC) codepoints.",
    ],
    transformImpactClass: "output-changing",
    migrationRuleId: "nfd-to-nfc",
  },
];

// ---------------------------------------------------------------------------
// v1 declined-with-reason rows (research D10, contract "v1 declined-with-reason")
// ---------------------------------------------------------------------------

function declined(
  facetId: string,
  fromValue: string,
  toValue: string,
  declineKind: "permanent" | "deferred",
  declineReason: string,
): FacetTransition {
  return {
    facetId,
    fromValue,
    toValue,
    supported: false,
    lossProfile: "one-way",
    namedLosses: [],
    transformImpactClass: FACET_IMPACT_CLASS[facetId] ?? "ux-changing",
    migrationRuleId: null,
    declineReason,
    declineKind,
  };
}

const DECLINED: FacetTransition[] = [
  // Match-kind — permanent (semantic, char-ref may be unreachable).
  declined(
    "source.encoding.input-match-kind",
    "key-ref",
    "char-ref",
    "permanent",
    "Match-kind changes what the input matches (a keystroke vs a produced character that may be unreachable), not just its spelling — not a safe automatic transform.",
  ),
  declined(
    "source.encoding.input-match-kind",
    "char-ref",
    "key-ref",
    "permanent",
    "Match-kind changes what the input matches (a keystroke vs a produced character that may be unreachable), not just its spelling — not a safe automatic transform.",
  ),
  // os-compose — permanent (no KMN construct, no kmcmplib check surface).
  declined(
    "source.desktop-combo-mechanism",
    "deadkey",
    "os-compose",
    "permanent",
    "os-compose relies on OS-level behavior Keyman cannot represent or verify — no compiler check surface.",
  ),
  declined(
    "source.desktop-combo-mechanism",
    "context-match",
    "os-compose",
    "permanent",
    "os-compose relies on OS-level behavior Keyman cannot represent or verify — no compiler check surface.",
  ),
  // nfc → nfd — deferred (needs decomposition data + new backspace rules + offset re-audit).
  declined(
    "source.normalization-posture",
    "nfc",
    "nfd",
    "deferred",
    "Composing → decomposing needs Unicode decomposition data, newly-synthesized backspace rules, and a keyboard-wide context-offset re-audit — deferred.",
  ),
  // fallback-posture — deferred (needs full base-layout key-map; produced-set blast radius).
  declined(
    "source.fallback-posture",
    "relies-on",
    "blocks-comprehensively",
    "deferred",
    "Requires a full base-layout key-map (per the keyboard's own &baselayout) and changes the produced-character set — deferred to a dedicated hardening pass.",
  ),
  declined(
    "source.fallback-posture",
    "blocks-comprehensively",
    "relies-on",
    "deferred",
    "Requires a full base-layout key-map (per the keyboard's own &baselayout) and changes the produced-character set — deferred to a dedicated hardening pass.",
  ),
  // desktop mechanism switching — deferred (distinct KMN-rule evidence + fixtures).
  declined(
    "source.desktop-combo-mechanism",
    "deadkey",
    "context-match",
    "deferred",
    "Desktop mechanism switching reads distinct KMN-rule evidence and needs its own fixtures — deferred.",
  ),
  declined(
    "source.desktop-combo-mechanism",
    "context-match",
    "deadkey",
    "deferred",
    "Desktop mechanism switching reads distinct KMN-rule evidence and needs its own fixtures — deferred.",
  ),
  declined(
    "source.desktop-combo-mechanism",
    "modifier-key",
    "deadkey",
    "deferred",
    "Desktop mechanism switching reads distinct KMN-rule evidence and needs its own fixtures — deferred.",
  ),
  // touch layer ↔ per-key alternates — deferred (underdetermined host-key mapping).
  declined(
    "source.touch-combo-mechanism",
    "layer",
    "longpress",
    "deferred",
    "Converting a whole-keyset layer to per-key alternates is underdetermined (no principled host-key mapping) — deferred.",
  ),
  declined(
    "source.touch-combo-mechanism",
    "layer",
    "flick",
    "deferred",
    "Converting a whole-keyset layer to per-key alternates is underdetermined (no principled host-key mapping) — deferred.",
  ),
  declined(
    "source.touch-combo-mechanism",
    "layer",
    "multitap",
    "deferred",
    "Converting a whole-keyset layer to per-key alternates is underdetermined (no principled host-key mapping) — deferred.",
  ),
  // reordering-rules — deferred (structural convention, no fixture basis).
  declined(
    "source.reordering-rules",
    "group-use",
    "inline",
    "deferred",
    "Reordering is a structural convention (group + use), not a keyword; no fixture basis yet — deferred.",
  ),
];

// ---------------------------------------------------------------------------
// The matrix + lookup helpers
// ---------------------------------------------------------------------------

/** The full value-transition matrix (supported + declined-with-reason rows). */
export const TRANSITION_MATRIX: readonly FacetTransition[] = [
  ...SUPPORTED,
  ...DECLINED,
];

/** Look up a row by its natural key `(facetId, fromValue, toValue)`. */
export function findTransition(
  facetId: string,
  fromValue: string,
  toValue: string,
): FacetTransition | undefined {
  return TRANSITION_MATRIX.find(
    (t) => t.facetId === facetId && t.fromValue === fromValue && t.toValue === toValue,
  );
}

/** True when the facet is a gate facet (never transformed). */
export function isGateFacet(facetId: string): boolean {
  return GATE_FACETS.has(facetId);
}
