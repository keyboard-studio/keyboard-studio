// Layer A check-group taxonomy for the kmcmplib WASM oracle.
// See spec.md §10 (validator layering) and the Issue #16 design cycles.
//
// The 14 Layer A checks split across 4 groups:
//   lexical     — stateless token-level (checks #1, #4, #7)            TS-only
//   reference   — symbol-table integrity (#2, #3, #5, #6, #8, #9, #13, #14)  mixed
//   behavior    — whole-program / cross-rule (#10, #11, #12)            WASM-only
//   passthrough — unmapped KMCMP_* diagnostics                          WASM-only
//
// Issue #16 ships the lexical group fully (checks #1-#4 already implemented;
// check #7 to follow under its own issue) plus the WASM oracle plumbing that
// drives the behavior + passthrough groups. The reference-group TS-side
// (checks #5, #6, #8, #9) is staged for follow-up issues; its WASM-side
// members (#13, #14) flow through the oracle today.

export type GroupName = "lexical" | "reference" | "behavior" | "passthrough";

export const ALL_GROUPS: readonly GroupName[] = [
  "lexical",
  "reference",
  "behavior",
  "passthrough",
];

/** Groups whose findings can come from the WASM oracle. */
export const WASM_GROUPS: ReadonlySet<GroupName> = new Set<GroupName>([
  "reference",
  "behavior",
  "passthrough",
]);

/** Groups whose findings have a TS-portable implementation. */
export const TS_GROUPS: ReadonlySet<GroupName> = new Set<GroupName>([
  "lexical",
  "reference",
]);

export interface LintOptions {
  /**
   * Restrict the oracle to the named groups. Order is irrelevant; duplicates
   * are deduplicated. `undefined` means "run every group".
   *
   * Unknown group names cause `validateWithOracle` to throw `TypeError`.
   */
  groups?: readonly GroupName[];
}
