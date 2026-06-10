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
} as const;

export type OpaqueReason = (typeof OPAQUE_REASONS)[keyof typeof OPAQUE_REASONS];
