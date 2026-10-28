// Legacy-state migration for the keyboard-wide fallback policy.
//
// Before the fallback policy, the working copy carried a closed-keyboard card
// decision plus per-combination carve dispositions (persisted in drafts and in
// the carved-layout decision value). Both are folded into one policy. This is
// a leaf module: no store or engine imports, so every reader of a legacy
// shape (draft restore, the carve decision fold) can share it.
//
// Loads must never throw: anything unrecognised yields the default.

import { DEFAULT_FALLBACK_POLICY } from "@keyboard-studio/contracts";
import type { FallbackPolicy } from "@keyboard-studio/contracts";

/** The legacy fields, as they appear (untyped) in old drafts and decision values. */
export interface LegacyFallbackFields {
  fallbackPolicy?: unknown;
  closedKeyboardCard?: unknown;
  /** Draft snapshots call it `carveDispositions`; the decision value calls it `dispositions`. */
  carveDispositions?: unknown;
  dispositions?: unknown;
}

function isFallbackPolicy(v: unknown): v is FallbackPolicy {
  return v === "swallow" || v === "pass-through";
}

/** True when the record carries any pre-policy field (or the policy itself). */
export function hasFallbackFields(src: LegacyFallbackFields): boolean {
  return (
    src.fallbackPolicy !== undefined ||
    src.closedKeyboardCard !== undefined ||
    src.carveDispositions !== undefined ||
    src.dispositions !== undefined
  );
}

/**
 * Resolve the policy from a (possibly legacy) record.
 *
 * 1. A valid `fallbackPolicy` wins.
 * 2. Closed-keyboard card: accepted -> swallow, declined -> pass-through.
 * 3. No card, but dispositions present: if every non-deadkey disposition is
 *    `allow-host` -> pass-through (deadkey rows were forced to block, so they
 *    carry no author signal); otherwise swallow.
 * 4. Otherwise the default (swallow).
 */
export function migrateFallbackPolicy(src: LegacyFallbackFields | null | undefined): FallbackPolicy {
  if (src === null || src === undefined || typeof src !== "object") {
    return DEFAULT_FALLBACK_POLICY;
  }
  if (isFallbackPolicy(src.fallbackPolicy)) return src.fallbackPolicy;
  if (src.closedKeyboardCard === "accepted") return "swallow";
  if (src.closedKeyboardCard === "declined") return "pass-through";

  const list = Array.isArray(src.carveDispositions)
    ? src.carveDispositions
    : Array.isArray(src.dispositions)
      ? src.dispositions
      : [];
  const authorRows = list.filter(
    (d): d is { disposition: unknown; provenance?: unknown } =>
      d !== null &&
      typeof d === "object" &&
      (d as { provenance?: unknown }).provenance !== "deadkey-requirement",
  );
  if (authorRows.length > 0 && authorRows.every((d) => d.disposition === "allow-host")) {
    return "pass-through";
  }
  return DEFAULT_FALLBACK_POLICY;
}
