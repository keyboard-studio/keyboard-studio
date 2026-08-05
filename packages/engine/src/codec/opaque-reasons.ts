/**
 * Named opaque-feature reasons for RawKmnFragment.reason (decision D8, spec §14).
 *
 * Each construct that cannot be represented as a typed IR node is assigned one
 * of these reason strings. The carve gallery renders a deletable card per
 * RawKmnFragment; the reason string drives the card label.
 */

export const OPAQUE_REASONS = {
  OPTION_STORE_DIRECTIVE: "option-store-directive",
  IF_OPTION_STORE: "if-option-store",
  CALL_RETURN: "call-return",
  INDEXED_CONTEXT: "indexed-context",
  OUTS_EXPANSION: "outs-expansion",
  SMP_LITERAL: "smp-literal",
  NAMED_DEADKEY: "named-deadkey",
  UNKNOWN_PRE_BEGIN: "unknown-pre-begin",
  // Store-body range notation (`X .. Y`, spec 042). A well-formed range is
  // expanded eagerly into char items in parseStoreItems, but a range whose
  // endpoints run backwards or don't decode can't be modelled faithfully, so
  // the whole store is preserved opaque with one of these reasons rather than
  // fabricating a wrong-direction interior or dropping data silently.
  DESCENDING_RANGE: "descending-range",
  MALFORMED_RANGE: "malformed-range",
} as const;

export type OpaqueReason = (typeof OPAQUE_REASONS)[keyof typeof OPAQUE_REASONS];
