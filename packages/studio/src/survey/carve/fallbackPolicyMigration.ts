// Legacy-state migration for the keyboard-wide fallback policy.
//
// Before the fallback policy, the working copy carried a closed-keyboard card
// decision plus per-combination carve dispositions (persisted in drafts and in
// the carved-layout decision value). Both are folded into one policy. This is
// a leaf module: no store or engine imports, so every reader of a legacy
// shape (draft restore, the carve decision fold) can share it.
//
// Loads must never throw: anything unrecognised yields the default.

import { DEFAULT_FALLBACK_POLICY, uniformFallbackPolicy } from "@keyboard-studio/contracts";
import type { Disposition, FallbackPolicy } from "@keyboard-studio/contracts";

/** The legacy fields, as they appear (untyped) in old drafts and decision values. */
export interface LegacyFallbackFields {
  /** A per-class object (current), or a legacy single `"swallow"` / `"pass-through"` string. */
  fallbackPolicy?: unknown;
  /** Whether the author confirmed the policy on the surface; absent reads as false. */
  fallbackPolicyConfirmed?: unknown;
  closedKeyboardCard?: unknown;
  /** Draft snapshots call it `carveDispositions`; the decision value calls it `dispositions`. */
  carveDispositions?: unknown;
  dispositions?: unknown;
}

function isDisposition(v: unknown): v is Disposition {
  return v === "swallow" || v === "pass-through";
}

function isPerClassPolicy(v: unknown): v is FallbackPolicy {
  if (v === null || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return isDisposition(p["letters"]) && isDisposition(p["digits"]) && isDisposition(p["punctuation"]);
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
 * 1. A valid per-class `fallbackPolicy` wins as is.
 * 2. A legacy single `fallbackPolicy` value is widened to all three classes.
 * 3. Closed-keyboard card: accepted -> swallow, declined -> pass-through.
 * 4. No card, but dispositions present: if every non-deadkey disposition is
 *    `allow-host` -> pass-through (deadkey rows were forced to block, so they
 *    carry no author signal); otherwise swallow.
 * 5. Otherwise the default (swallow).
 *
 * Every legacy single value (2-4) is widened to all three classes.
 */
export function migrateFallbackPolicy(src: LegacyFallbackFields | null | undefined): FallbackPolicy {
  if (src === null || src === undefined || typeof src !== "object") {
    return { ...DEFAULT_FALLBACK_POLICY };
  }
  if (isPerClassPolicy(src.fallbackPolicy)) {
    const { letters, digits, punctuation } = src.fallbackPolicy;
    return { letters, digits, punctuation };
  }
  return uniformFallbackPolicy(migrateLegacyDisposition(src));
}

/**
 * The policy plus whether the author has confirmed it. Only a record that
 * already carries a per-class policy and `fallbackPolicyConfirmed === true`
 * reads as confirmed; every widened legacy value and every default reads as
 * unconfirmed so the surface can ask once (FR-021).
 */
export function migrateFallbackPolicyState(
  src: LegacyFallbackFields | null | undefined,
): { policy: FallbackPolicy; confirmed: boolean } {
  const policy = migrateFallbackPolicy(src);
  const confirmed =
    src !== null &&
    src !== undefined &&
    typeof src === "object" &&
    isPerClassPolicy(src.fallbackPolicy) &&
    src.fallbackPolicyConfirmed === true;
  return { policy, confirmed };
}

function migrateLegacyDisposition(src: LegacyFallbackFields): Disposition {
  if (isDisposition(src.fallbackPolicy)) return src.fallbackPolicy;
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
  return DEFAULT_FALLBACK_POLICY.letters;
}
