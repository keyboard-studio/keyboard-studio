/**
 * Build-time record validation (spec 036 T025; FR-008; contract X1/X2/X4).
 *
 * Invoked inside `build-index.ts` for every categorization BEFORE the artifact
 * is written. Any violation is a loud build failure (the caller throws / exits
 * non-zero) — a bad record is never recorded (US2 acceptance 2). The repo lint
 * (T032) re-runs the equivalent checks over the committed artifact as a second
 * gate; this is the first, at the point of production.
 *
 * Checks:
 *   X1 limits:  the `value` (and every `distribution` key) is within the facet
 *               definition's `limits`. A closed set (`open` unset/false) enforces
 *               membership; `open: true` skips the membership check but still
 *               validates shape. THE single most important check (FR-008).
 *   X2 sum:     a `distribution` sums to 1 ± ε when `residue` is absent; a
 *               `distribution` + `residue` sums to 1 ± ε when `residue` is present.
 *   X4 outcome↔tier: `analysisOutcome: 'fallback-only'` ⇒ `provenanceTier` is not
 *               `'content-derived'`.
 */

import type { Categorization, FacetDefinition } from "./types.js";

/** Distribution-sum tolerance — fractional shares are exact rationals but land in float. */
const SUM_EPSILON = 1e-6;

const CLOSED_SET_TYPES = ["enum", "set", "histogram"];

/**
 * Validate one categorization against its facet definition. Returns an array of
 * human-readable problems; empty means valid. `keyboardId` is threaded only for
 * message context.
 */
export function validateCategorization(
  keyboardId: string,
  def: FacetDefinition,
  cat: Categorization,
): string[] {
  const problems: string[] = [];
  const where = `keyboard "${keyboardId}" facet "${def.id}"`;

  const closedSet =
    CLOSED_SET_TYPES.includes(def.valueType) &&
    def.limits.open !== true &&
    Array.isArray(def.limits.values);
  const allowed = new Set(def.limits.values ?? []);

  // X1 — value + distribution keys within limits.
  if (closedSet) {
    const values = extractStringValues(cat.value);
    for (const v of values) {
      if (!allowed.has(v)) {
        problems.push(`X1: ${where} value "${v}" is outside limits.values`);
      }
    }
    if (cat.distribution) {
      for (const key of Object.keys(cat.distribution)) {
        if (!allowed.has(key)) {
          problems.push(`X1: ${where} distribution key "${key}" is outside limits.values`);
        }
      }
    }
  } else if (def.valueType === "scalar" && def.limits.domain) {
    const [min, max] = def.limits.domain;
    if (typeof cat.value === "number" && (cat.value < min || cat.value > max)) {
      problems.push(`X1: ${where} value ${cat.value} is outside limits.domain [${min}, ${max}]`);
    }
  }

  // X2 — distribution (+ residue) sums to ~1.
  if (cat.distribution) {
    let sum = 0;
    for (const v of Object.values(cat.distribution)) sum += v;
    if (cat.residue !== undefined) sum += cat.residue;
    if (Math.abs(sum - 1) > SUM_EPSILON) {
      const withResidue = cat.residue !== undefined ? " (+ residue)" : "";
      problems.push(`X2: ${where} distribution${withResidue} sums to ${sum}, expected 1 ± ${SUM_EPSILON}`);
    }
  }

  // X4 — a fallback-only outcome cannot claim content-derived provenance.
  if (cat.analysisOutcome === "fallback-only" && cat.provenanceTier === "content-derived") {
    problems.push(`X4: ${where} analysisOutcome 'fallback-only' is inconsistent with provenanceTier 'content-derived'`);
  }

  return problems;
}

/**
 * Normalize a categorization `value` to the string tokens X1 must membership-check:
 * a bare string ⇒ [string]; an array (set valueType) ⇒ its string members; a
 * number/other ⇒ [] (non-closed-set domains are checked elsewhere).
 */
function extractStringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}
