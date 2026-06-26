// Layer A check-group taxonomy for the kmcmplib WASM oracle.
// See spec.md §10 (validator layering) and the oracle design.
//
// The 14 Layer A checks split across 4 groups:
//   lexical     — stateless token-level (checks #1–#4, #7)             TS-only
//   reference   — symbol-table integrity (#5, #6, #8, #9, #13, #14)    mixed
//   behavior    — whole-program / cross-rule (#10, #11, #12)            WASM-only
//   passthrough — unmapped KMCMP_* diagnostics                          WASM-only
//
// Implementation status (authoritative: validator/index.ts):
//   lexical TS-portable: fully implemented via runLexicalChecks
//     (#1 identifiers, #2 duplicateGroups, #3 duplicateStores,
//      #4 deprecatedStores, #7 codepointFormat).
//     NOTE: spec §10 lists #2/#3 under `reference`; the code places them in
//     `lexical` (stateless token scan). Reconcile with spec §10 before v1 lock.
//   reference TS-portable: fully implemented via runReferenceChecks
//     (#5 deadkeyResolution, #6 ifStoreResolution, #8 contextOrdering,
//      #9 indexBounds). WASM-side (#13, #14) flows through the oracle.
//   behavior + passthrough: WASM-only, flow through the kmcmplib oracle.

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
